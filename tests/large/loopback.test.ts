import { describe, expect, it } from 'vitest';
import {
  dePacketizeRtpPackets,
  deserializeAudioLevelIndication,
  serializeAudioLevelIndication,
} from 'werift';

import {
  RemoteVideoStream,
  RoomPublication,
  roomTypes,
  RtpPacket,
  SkyWayContext,
  SkyWayRoom,
  SkyWayStreamFactory,
} from '../../packages/room/src';
import { gst, testTokenString } from './fixture';
import { RTCPeerConnection } from '../../submodules/mediasoup/src';

describe('loopback', () => {
  it.each(['p2p'] as const)(
    'audio',
    (type) =>
      new Promise<void>(async (done) => {
        const context = await SkyWayContext.Create(testTokenString, {
          codecCapabilities: [{ mimeType: 'audio/opus' }],
          rtcConfig: { iceUseLinkLocalAddress: true },
        });
        const room = await SkyWayRoom.Create(context, {
          type,
        });
        const sender = await room.join();

        const receiver = await (
          await SkyWayRoom.Find(context, room, type)
        ).join();

        let getSenderPc = (): undefined | RTCPeerConnection => undefined;
        const disposer = await SkyWayStreamFactory.registerAudioTestSrc({
          rtpProcessor: (buf) => {
            const id =
              getSenderPc()?._localDescription?.media[0]?.rtp
                ?.headerExtensions[0]?.id;
            if (id == undefined) {
              return buf;
            }

            const rtp = RtpPacket.deSerialize(buf);
            rtp.header.extension = true;
            rtp.header.extensions.push({
              id,
              payload: serializeAudioLevelIndication(25),
            });
            return rtp.serialize();
          },
          gst,
        });
        const publication = await sender.publish(
          await SkyWayStreamFactory.createMicrophoneAudioStream()
        );
        getSenderPc = () => publication?.getRTCPeerConnection(receiver);

        const { stream, subscription } =
          await receiver.subscribe<RemoteVideoStream>(publication);
        stream.track.onReceiveRtp.subscribe(async (rtp) => {
          const extensions = rtp.header.extensions;

          const pc = subscription.getRTCPeerConnection();
          const id =
            pc._localDescription?.media[0]?.rtp?.headerExtensions[0]?.id;

          const audioLevel = extensions.find((e) => e.id === id);
          const p = deserializeAudioLevelIndication(audioLevel!.payload);

          if (p.level === 25) {
            await room.close();
            context.dispose();
            disposer();
            done();
          }
        });
      })
  );

  it('audio_multiple', async () => {
    const context = await SkyWayContext.Create(testTokenString, {
      codecCapabilities: [{ mimeType: 'audio/opus' }],
    });
    const room = await SkyWayRoom.Create(context, {
      type: 'sfu',
    });
    const sender = await room.join();

    const disposer = await SkyWayStreamFactory.registerAudioTestSrc({
      rtpProcessor: (buf) => {
        const rtp = RtpPacket.deSerialize(buf);
        rtp.header.extension = true;
        rtp.header.extensions.push({
          id: 3,
          payload: serializeAudioLevelIndication(25),
        });
        return rtp.serialize();
      },
      gst,
    });
    const publication1 = await sender.publish(
      await SkyWayStreamFactory.createMicrophoneAudioStream()
    );

    const receiver = await (await SkyWayRoom.Find(context, room, 'sfu')).join();

    const subscribe = async (publication: RoomPublication) =>
      new Promise<void>(async (done) => {
        {
          const { stream: remoteStream } =
            await receiver.subscribe<RemoteVideoStream>(publication);
          remoteStream.track.onReceiveRtp.subscribe(async (rtp) => {
            const extensions = rtp.header.extensions;

            const audioLevel = extensions.find((e) => e.id === 10);
            const p = deserializeAudioLevelIndication(audioLevel!.payload);

            if (p.level === 25) {
              done();
            }
          });
        }
      });

    await subscribe(publication1);

    const publication2 = await sender.publish(
      await SkyWayStreamFactory.createMicrophoneAudioStream()
    );

    await subscribe(publication2);

    await room.close();
    context.dispose();
    disposer();
    disposer();
  });

  it('video_h264', () =>
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
        rtcConfig: { turnPolicy: 'disable' },
      });

      const room = await SkyWayRoom.Create(context, {
        type: 'sfu',
      });
      const sender = await room.join();

      const disposer = await SkyWayStreamFactory.registerVideoTestSrc({
        codec: 'h264',
        gst,
      });
      const publication = await sender.publish(
        await SkyWayStreamFactory.createCameraVideoStream()
      );

      const receiver = await (
        await SkyWayRoom.Find(context, room, 'sfu')
      ).join();
      const { stream: remoteStream, subscription } =
        await receiver.subscribe<RemoteVideoStream>(publication);
      remoteStream.track.onReceiveRtp.subscribe(async (rtp) => {
        const codec = dePacketizeRtpPackets('mpeg4/iso/avc', [rtp]);
        if (codec.isKeyframe) {
          const pc = subscription.getRTCPeerConnection();
          const [ice] = pc.iceTransports;
          expect(ice.connection.nominated!.protocol.type).toBe('stun');

          await room.close();
          context.dispose();
          disposer();
          done();
        }
      });
    }));

  it.skip('video_vp8', () =>
    new Promise<void>(async (done) => {
      const context = await SkyWayContext.Create(testTokenString, {
        codecCapabilities: [
          {
            mimeType: 'video/vp8',
          },
        ],
        rtcConfig: { turnPolicy: 'disable' },
      });
      const room = await SkyWayRoom.Create(context, {
        type: 'sfu',
      });
      const sender = await room.join();

      const disposer = await SkyWayStreamFactory.registerVideoTestSrc({
        codec: 'vp8',
        gst,
      });

      const publication = await sender.publish(
        await SkyWayStreamFactory.createCameraVideoStream()
      );

      const receiver = await (
        await SkyWayRoom.Find(context, room, 'sfu')
      ).join();
      const { stream: remoteStream } =
        await receiver.subscribe<RemoteVideoStream>(publication);
      remoteStream.track.onReceiveRtp.subscribe(async (rtp) => {
        const codec = dePacketizeRtpPackets('vp8', [rtp]);
        if (codec.isKeyframe) {
          await room.close();
          context.dispose();
          done();
          disposer();
        }
      });
    }));
});
