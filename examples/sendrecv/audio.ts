import {
  MediaStreamTrackFactory,
  RemoteVideoStream,
  RtpPacket,
  SkyWayContext,
  SkyWayRoom,
  SkyWayStreamFactory,
} from '../../packages/room/src';
import { testTokenString } from './fixture';
import Gst from '@girs/node-gst-1.0';
import {
  deserializeAudioLevelIndication,
  serializeAudioLevelIndication,
} from 'werift';

const gst = require('node-gtk').require('Gst', '1.0') as typeof Gst;
gst.init([]);

(async () => {
  const context = await SkyWayContext.Create(testTokenString, {
    codecCapabilities: [{ mimeType: 'audio/opus' }],
  });
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
  Gst.parseLaunch(
    `audiotestsrc wave=ticks ! audioconvert ! audioresample ! queue ! opusenc ! rtpopuspay ! udpsink host=127.0.0.1 port=${port}`
  ).setState(Gst.State.PLAYING);
  SkyWayStreamFactory.registerMediaDevices({ audio: track });

  const room = await SkyWayRoom.Create(context, {
    type: 'sfu',
  });
  console.log('roomId', room.id);
  const sender = await room.join();

  const publication = await sender.publish(
    await SkyWayStreamFactory.createMicrophoneAudioStream()
  );

  const receiver = await (await SkyWayRoom.Find(context, room, 'sfu')).join();
  const { stream: remoteStream } = await receiver.subscribe<RemoteVideoStream>(
    publication
  );
  remoteStream.track.onReceiveRtp.subscribe((rtp) => {
    const extensions = rtp.header.extensions;

    const audioLevel = extensions.find((e) => e.id === 10);
    const level = deserializeAudioLevelIndication(audioLevel!.payload);
    console.log({ level });
  });
})();
