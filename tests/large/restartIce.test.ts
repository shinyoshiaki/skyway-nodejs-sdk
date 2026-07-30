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
 * js-sdk v2 の再接続処理（ICE 切断検知 → Sender.restartIce()）が Node.js 上で
 * 実際に動作することを実接続で確認する。
 *
 * 障害の起こし方: 接続確立後、送信側 PeerConnection が持つ ICE のソケットを全て閉じて
 * 経路を壊す。nominated pair だけ閉じると ICE が別の候補ペアへ自力で切り替わってしまい
 * restartIce まで到達しないため、自己回復できない状態にする必要がある。
 * werift は RFC 7675 の consent freshness が切れた時点で ICE を failed にする
 * （CONSENT_TIMEOUT = 30 秒）ので、SDK 側の onPeerConnectionStateChanged ハンドラが
 * iceDisconnectBufferTimeout だけ復帰を待ち、復帰しなければ restartIce() を実行する。
 *
 * 検証範囲について:
 * `reconnecting` は `Sender.restartIce()` の中でのみ発行されるため、この状態遷移が
 * 「切断が検知され restartIce が実行された」ことの証跡になる。
 * 一方で **ICE restart 後のメディア再開は現時点の werift では成立しない**
 * （restart 後の candidate が `No media section matched the ICE usernameFragment` で
 * 弾かれる）。この制限は README に記載している。
 */
describe('restartIce', () => {
  it(
    'detects the broken ICE path and runs restartIce',
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
        const { stream: remoteStream } =
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

        await room.close();
      } finally {
        context.dispose();
        disposer();
      }
    },
    180_000
  );
});
