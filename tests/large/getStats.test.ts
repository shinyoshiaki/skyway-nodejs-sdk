import { describe, expect, it } from 'vitest';

import {
  type RemoteAudioStream,
  SkyWayContext,
  SkyWayRoom,
  SkyWayStreamFactory,
} from '../../packages/room/src';
import { gst, testTokenString } from './fixture';

/**
 * js-sdk v2 は統計収集や再接続処理で pc / sender / receiver の getStats に
 * 依存するようになった。werift 側の getStats 実装(および mediasoup-client-node の
 * werift handler の getSenderStats / getReceiverStats)で実際にレポートを
 * 組み立てられることを P2P / SFU の実接続で確認する。
 */
describe('getStats', () => {
  const assertStats = async (type: 'p2p' | 'sfu') => {
    const context = await SkyWayContext.Create(testTokenString, {
      codecCapabilities: [{ mimeType: 'audio/opus' }],
    });
    const room = await SkyWayRoom.Create(context, { type });
    const sender = await room.join();
    const disposer = await SkyWayStreamFactory.registerAudioTestSrc({ gst });

    try {
      const publication = await sender.publish(
        await SkyWayStreamFactory.createMicrophoneAudioStream()
      );

      const receiver = await (
        await SkyWayRoom.Find(context, room, { type })
      ).join();
      const { stream: remoteStream, subscription } =
        await receiver.subscribe<RemoteAudioStream>(publication);

      await remoteStream.track.onReceiveRtp.asPromise();

      // receiver 側: werift の RTCRtpReceiver.getStats (SFUの場合はmediasoup handler経由)
      const subscriberStats = await subscription.getStats();
      const inbound = subscriberStats.find((s) => s.type === 'inbound-rtp');
      expect(inbound).toBeDefined();
      expect(inbound!.packetsReceived).toBeGreaterThan(0);

      // sender 側: werift の RTCRtpSender.getStats
      // (SFU の場合 selector は使われず、内部で SFUBot 宛の Publication が使われる)
      const publisherStats = await publication.getStats(receiver.id);
      expect(
        publisherStats.find((s) => s.type === 'outbound-rtp')
      ).toBeDefined();

      // pc.getStats 経由でも transport/candidate 統計が取得できる
      const raw = await subscription.getRTCPeerConnection()!.getStats();
      const rawTypes = new Set([...raw.values()].map((s: any) => s.type));
      expect(rawTypes.has('inbound-rtp')).toBe(true);
      expect(rawTypes.has('local-candidate')).toBe(true);

      await room.close();
    } finally {
      disposer();
      context.dispose();
    }
  };

  it('p2p', () => assertStats('p2p'), 60_000);

  it('sfu', () => assertStats('sfu'), 60_000);
});
