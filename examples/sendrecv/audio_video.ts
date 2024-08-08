import {
  dePacketizeRtpPackets,
  MediaStreamTrackFactory,
  RemoteVideoStream,
  RtpPacket,
  SkyWayContext,
  SkyWayRoom,
  SkyWayStreamFactory,
  RemoteAudioStream,
} from '../../packages/room/src';
import { testTokenString } from './fixture';
import type Gst from '@girs/node-gst-1.0';
import {
  deserializeAudioLevelIndication,
  serializeAudioLevelIndication,
} from 'werift';

const gst = require('node-gtk').require('Gst', '1.0') as typeof Gst;
gst.init([]);

(async () => {
  const context = await SkyWayContext.Create(testTokenString, {
    codecCapabilities: [
      { mimeType: 'audio/opus' },
      {
        mimeType: 'video/h264',
        parameters: {
          'level-asymmetry-allowed': 1,
          'packetization-mode': 0,
          'profile-level-id': '42001f',
        },
      },
    ],
  });
  {
    const [track, port] = await MediaStreamTrackFactory.rtpSource({
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
    gst
      .parseLaunch(
        `audiotestsrc wave=ticks ! audioconvert ! audioresample ! queue ! opusenc ! rtpopuspay ! udpsink host=127.0.0.1 port=${port}`
      )
      .setState(gst.State.PLAYING);
    SkyWayStreamFactory.registerMediaDevices({ audio: track });
  }
  {
    const [track, port] = await MediaStreamTrackFactory.rtpSource({
      kind: 'video',
    });
    gst
      .parseLaunch(
        `videotestsrc ! video/x-raw,width=640,height=480,format=I420 ! x264enc key-int-max=60 ! rtph264pay ! udpsink host=127.0.0.1 port=${port}`
      )
      .setState(gst.State.PLAYING);
    SkyWayStreamFactory.registerMediaDevices({ video: track });
  }

  const room = await SkyWayRoom.Create(context, {
    type: 'sfu',
  });
  console.log('roomId', room.id);
  const sender = await room.join();

  const publicationAudio = await sender.publish(
    await SkyWayStreamFactory.createMicrophoneAudioStream()
  );
  const publicationVideo = await sender.publish(
    await SkyWayStreamFactory.createCameraVideoStream()
  );

  const receiver = await (await SkyWayRoom.Find(context, room, 'sfu')).join();
  {
    const { stream: remoteStream } =
      await receiver.subscribe<RemoteAudioStream>(publicationAudio);
    remoteStream.track.onReceiveRtp.subscribe((rtp) => {
      const extensions = rtp.header.extensions;

      const audioLevel = extensions.find((e) => e.id === 10);
      const level = deserializeAudioLevelIndication(audioLevel!.payload);
      console.log({ level });
    });
  }
  {
    const { stream: remoteStream } =
      await receiver.subscribe<RemoteVideoStream>(publicationVideo);
    remoteStream.track.onReceiveRtp.subscribe((rtp) => {
      const codec = dePacketizeRtpPackets('mpeg4/iso/avc', [rtp]);
      if (codec.isKeyframe) {
        console.log('receive keyframe');
      }
    });
  }
})();
