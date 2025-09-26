import { describe, expect, it } from 'vitest';
import { dePacketizeRtpPackets } from 'werift';

import {
  RemoteVideoStream,
  SkyWayContext,
  SkyWayRoom,
  SkyWayStreamFactory,
} from '../../packages/room/src';
import { gst, testTokenString } from './fixture';

describe('turn', () => {
  it(
    'force_turn',
    () =>
      new Promise<void>(async (done) => {
        const context = await SkyWayContext.Create(testTokenString, {
          codecCapabilities: [
            {
              mimeType: 'video/h264',
              parameters: {
                'level-asymmetry-allowed': 1,
                'packetization-mode': 0,
                'profile-level-id': '42001f',
              },
            },
          ],
          rtcConfig: { turnPolicy: 'turnOnly' },
        });
        const room = await SkyWayRoom.Create(context, {
          type: 'sfu',
        });
        const sender = await room.join();

        const disposer = await SkyWayStreamFactory.registerVideoTestSrc({
          gst,
          codec: 'h264',
        });

        const publication = await sender.publish(
          await SkyWayStreamFactory.createCameraVideoStream()
        );

        const receiver = await (
          await SkyWayRoom.Find(context, room, 'sfu')
        ).join();
        const { stream: remoteStream, subscription } =
          await receiver.subscribe<RemoteVideoStream>(publication);
        await remoteStream.track.onReceiveRtp.watch((rtp) => {
          const codec = dePacketizeRtpPackets('mpeg4/iso/avc', [rtp]);
          return codec.isKeyframe === true;
        });

        const pc = subscription.getRTCPeerConnection();
        const [ice] = pc.iceTransports;
        expect(ice.connection.nominated!.protocol.type).toBe('turn');

        await room.close();
        context.dispose();
        disposer();
        done();
      }),
    60_000
  );
});
