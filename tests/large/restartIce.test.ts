import { describe, expect, it } from 'vitest';

import {
  type RemoteAudioStream,
  SkyWayContext,
  SkyWayRoom,
  SkyWayStreamFactory,
  type TransportConnectionState,
} from '../../packages/room/src';
import { gst, testTokenString } from './fixture';
import { waitForRtp } from './util';

/**
 * js-sdk v2 の再接続処理（ICE 切断検知 → Sender.restartIce() → メディア再開）が
 * Node.js 上で動作することを実接続で確認する。
 *
 * 障害の起こし方: 接続確立後、送信側 PeerConnection が持つ ICE のソケットを全て閉じて
 * 経路を壊す。nominated pair だけ閉じると ICE が別の候補ペアへ自力で切り替わってしまい
 * restartIce まで到達しないため、自己回復できない状態にする必要がある。
 * werift は RFC 7675 の consent freshness が切れた時点で ICE を failed にする
 * （CONSENT_TIMEOUT = 30 秒）ので、SDK 側の onPeerConnectionStateChanged ハンドラが
 * iceDisconnectBufferTimeout だけ復帰を待ち、復帰しなければ restartIce() を実行する。
 *
 * 検証範囲:
 * 1. RTP が流れていること
 * 2. 切断が検知され restartIce が実行されること
 *    （`reconnecting` は `Sender.restartIce()` の中でのみ発行される状態なので、
 *    この遷移が実行の証跡になる）
 * 3. 再接続後に新しい `nominated`（採用された candidate pair）が選出されていること
 * 4. RTP が実際に届くこと（`inbound-rtp.packetsReceived` の増加）
 *
 * 3 / 4 は werift 側の ICE restart 修正が必要だった。詳細は VERIFICATION.md の
 * restartIce の節を参照。
 */
describe('restartIce', () => {
  it(
    'reconnects and resumes RTP after the ICE path breaks',
    async () => {
      const context = await SkyWayContext.Create(testTokenString, {
        codecCapabilities: [{ mimeType: 'audio/opus' }],
        rtcConfig: {
          // TURN 経由だと経路を壊しても relay 側で復帰してしまうので STUN のみに寄せる
          turnPolicy: 'disable',
          // 切断検知から restartIce までの待ち時間を詰めてテストを短くする
          iceDisconnectBufferTimeout: 1_000,
        },
      });
      const room = await SkyWayRoom.Create(context, { type: 'p2p' });
      const sender = await room.join();
      const disposer = await SkyWayStreamFactory.registerAudioTestSrc({ gst });

      try {
        const publication = await sender.publish(
          await SkyWayStreamFactory.createMicrophoneAudioStream()
        );

        const receiver = await (
          await SkyWayRoom.Find(context, room, { type: 'p2p' })
        ).join();
        const { stream: remoteStream, subscription } =
          await receiver.subscribe<RemoteAudioStream>(publication);

        // 1. まず通常に RTP が流れることを確認する
        const firstRtp = await waitForRtp(remoteStream.track, () => true);
        expect(firstRtp.payload).toBeDefined();

        const pc = publication.getRTCPeerConnection(receiver)!;
        const [iceTransport] = pc.iceTransports;
        const connection = iceTransport.connection;
        expect(connection.nominated).toBeDefined();

        const states: TransportConnectionState[] = [];
        publication.onConnectionStateChanged.add(({ state }) => {
          states.push(state);
        });
        // restartIce() の中だけで発行される状態なので、これが実行の証跡になる
        const reconnecting = publication.onConnectionStateChanged.watch(
          ({ state }) => state === 'reconnecting',
          120_000
        );

        // 2. 経路を実際に壊す。自己回復させないため、この PeerConnection が持つ
        //    ソケットを全て閉じる（protocols は private なのでテストからのみ触る）
        const protocols: { close(): Promise<void> }[] =
          (connection as unknown as { protocols: { close(): Promise<void> }[] })
            .protocols ?? [];
        expect(protocols.length).toBeGreaterThan(0);
        await Promise.all(protocols.map((protocol) => protocol.close()));

        // 3. 切断が検知され restartIce が走る
        await reconnecting;
        expect(states).toContain('reconnecting');

        // 4. 再接続が完了する（nominated pair が選び直されている）
        await publication.onConnectionStateChanged.watch(
          ({ state }) => state === 'connected',
          120_000
        );
        expect(states).toContain('connected');
        expect(pc.iceTransports[0].connection.nominated).toBeDefined();

        // 5. 再接続後に RTP が実際に届く（メディア到達性）
        const before = (await subscription.getStats()).find(
          (s) => s.type === 'inbound-rtp'
        );
        const resumedRtp = await waitForRtp(remoteStream.track, () => true, {
          timeoutMs: 60_000,
        });
        expect(resumedRtp.payload).toBeDefined();
        const after = (await subscription.getStats()).find(
          (s) => s.type === 'inbound-rtp'
        );
        expect(after.packetsReceived).toBeGreaterThan(before.packetsReceived);

        await room.close();
      } finally {
        context.dispose();
        disposer();
      }
    },
    180_000
  );
});
