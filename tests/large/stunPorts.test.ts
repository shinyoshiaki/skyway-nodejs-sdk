import { describe, expect, it } from 'vitest';

import {
  type RemoteAudioStream,
  SkyWayContext,
  SkyWayRoom,
  SkyWayStreamFactory,
} from '../../packages/room/src';
import { gst, testTokenString } from './fixture';

/**
 * js-sdk v2.5.0 で追加された rtcConfig.stunPorts の実接続確認。
 *
 * werift の ice パッケージを複数 STUN サーバー対応にしてあるため、指定した全ての
 * ポートが候補収集に使われる。単一指定 / 両方指定のいずれでも接続が成立すること、
 * および指定したポートが実際に ICE の STUN サーバー一覧に入っていることを確認する。
 */
describe('stunPorts', () => {
  const connectWithStunPorts = async (stunPorts: (443 | 3478)[]) => {
    const context = await SkyWayContext.Create(testTokenString, {
      codecCapabilities: [{ mimeType: 'audio/opus' }],
      // TURN経由だとSTUNの候補収集を検証できないのでSTUNのみに寄せる
      rtcConfig: { stunPorts, turnPolicy: 'disable' },
    });
    expect(context.config.rtcConfig.stunPorts).toEqual(stunPorts);

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

      const [rtp] = await remoteStream.track.onReceiveRtp.asPromise();
      expect(rtp.payload).toBeDefined();

      // 指定した全てのポートが STUN サーバーとして使われている
      const pc = subscription.getRTCPeerConnection()!;
      const [ice] = pc.iceTransports;
      expect(
        ice.connection.stunServers.map(([, port]) => port).sort()
      ).toEqual([...stunPorts].sort());

      await room.close();
    } finally {
      disposer();
      context.dispose();
    }
  };

  it('single port 443', () => connectWithStunPorts([443]), 60_000);

  it('single port 3478', () => connectWithStunPorts([3478]), 60_000);

  it('both ports', () => connectWithStunPorts([443, 3478]), 60_000);
});
