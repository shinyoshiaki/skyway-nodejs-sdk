import { describe, it } from 'vitest';
import {
  RemoteVideoStream,
  RtpPacket,
  SkyWayContext,
  SkyWayRoom,
  MediaStreamTrackFactory,
  SkyWayStreamFactory,
} from '../../packages/room/src';

import Gst from '@girs/node-gst-1.0';
import { testTokenString } from './fixture';
import {
  dePacketizeRtpPackets,
  deserializeAudioLevelIndication,
  serializeAudioLevelIndication,
} from 'werift';

const gst = require('node-gtk').require('Gst', '1.0') as typeof Gst;
gst.init([]);

describe('loopback', () => {
  it('audio', () =>
    new Promise<void>(async (done) => {
      const context = await SkyWayContext.Create(testTokenString, {
        codecCapabilities: [{ mimeType: 'audio/opus' }],
      });
      const room = await SkyWayRoom.Create(context, {
        type: 'sfu',
      });
      console.log('roomId', room.id);
      const sender = await room.join();

      const [track, port, disposer] = await MediaStreamTrackFactory.rtpSource({
        kind: 'audio',
        cb: (buf) => {
          const rtp = RtpPacket.deSerialize(buf);
          rtp.header.extension = true;
          rtp.header.extensions.push({
            id: 3,
            payload: serializeAudioLevelIndication(25),
          });
          return rtp.serialize();
        },
      });
      const launch = gst.parseLaunch(
        `audiotestsrc wave=ticks ! audioconvert ! audioresample ! queue ! opusenc ! rtpopuspay ! udpsink host=127.0.0.1 port=${port}`
      );
      launch.setState(gst.State.PLAYING);
      const factory = new SkyWayStreamFactory({ audio: track });

      const publication = await sender.publish(
        await factory.createMicrophoneAudioStream()
      );

      const receiver = await (
        await SkyWayRoom.Find(context, room, 'sfu')
      ).join();
      const { stream: remoteStream } =
        await receiver.subscribe<RemoteVideoStream>(publication);
      remoteStream.track.onReceiveRtp.subscribe(async (rtp) => {
        const extensions = rtp.header.extensions;

        const audioLevel = extensions.find((e) => e.id === 10);
        const p = deserializeAudioLevelIndication(audioLevel!.payload);

        if (p.level === 25) {
          console.log('audioLevel', p);
          await room.close();
          context.dispose();
          launch.setState(gst.State.NULL);
          disposer();
          done();
        }
      });
    }));

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
      console.log('roomId', room.id);
      const sender = await room.join();

      const [track, port, disposer] = await MediaStreamTrackFactory.rtpSource({
        kind: 'video',
      });
      const launch = gst.parseLaunch(
        `videotestsrc ! video/x-raw,width=640,height=480,format=I420 ! x264enc key-int-max=60 ! rtph264pay ! udpsink host=127.0.0.1 port=${port}`
      );
      launch.setState(gst.State.PLAYING);
      const factory = new SkyWayStreamFactory({ video: track });

      const publication = await sender.publish(
        await factory.createCameraVideoStream()
      );

      const receiver = await (
        await SkyWayRoom.Find(context, room, 'sfu')
      ).join();
      const { stream: remoteStream } =
        await receiver.subscribe<RemoteVideoStream>(publication);
      remoteStream.track.onReceiveRtp.subscribe(async (rtp) => {
        const codec = dePacketizeRtpPackets('mpeg4/iso/avc', [rtp]);
        if (codec.isKeyframe) {
          console.log('receive keyframe');
          await room.close();
          context.dispose();
          launch.setState(gst.State.NULL);
          disposer();
          done();
        }
      });
    }));

  it('video_vp8', () =>
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
      console.log('roomId', room.id);
      const sender = await room.join();

      const [track, port, disposer] = await MediaStreamTrackFactory.rtpSource({
        kind: 'video',
      });
      const launch = gst.parseLaunch(
        `videotestsrc ! video/x-raw,width=640,height=480,format=I420 ! vp8enc keyframe-max-dist=30 ! rtpvp8pay picture-id-mode=1 ! udpsink host=127.0.0.1 port=${port}`
      );
      launch.setState(gst.State.PLAYING);
      const factory = new SkyWayStreamFactory({ video: track });

      const publication = await sender.publish(
        await factory.createCameraVideoStream()
      );

      const receiver = await (
        await SkyWayRoom.Find(context, room, 'sfu')
      ).join();
      const { stream: remoteStream } =
        await receiver.subscribe<RemoteVideoStream>(publication);
      remoteStream.track.onReceiveRtp.subscribe(async (rtp) => {
        const codec = dePacketizeRtpPackets('vp8', [rtp]);
        if (codec.isKeyframe) {
          console.log('receive keyframe');
          await room.close();
          context.dispose();
          launch.setState(gst.State.NULL);
          done();
        }
      });
    }));
});
