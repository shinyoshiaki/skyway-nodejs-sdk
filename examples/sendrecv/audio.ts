import {
  Event,
  LocalAudioStream,
  LocalVideoStream,
  MediaStreamTrack,
  RemoteVideoStream,
  RtpPacket,
  SkyWayContext,
  SkyWayRoom,
  dePacketizeRtpPackets,
  randomPort,
  // } from '@shinyoshiaki/skyway-nodejs-sdk';
} from '../../packages/room/src/index';
import { testTokenString } from './fixture';
import { createSocket } from 'dgram';
import Gst from '@girs/node-gst-1.0';
import {
  deserializeAudioLevelIndication,
  serializeAudioLevelIndication,
} from 'werift';

const gst = require('node-gtk').require('Gst', '1.0') as typeof Gst;
gst.init([]);

(async () => {
  const context = await SkyWayContext.Create(testTokenString);
  const room = await SkyWayRoom.Create(context, {
    type: 'sfu',
  });
  console.log('roomId', room.id);
  const sender = await room.join();

  const audio = await randomPort();
  const onAudio = new Event<Buffer>();
  createSocket('udp4')
    .on('message', (buf) => {
      onAudio.emit(buf);
    })
    .bind(audio);
  Gst.parseLaunch(
    `audiotestsrc wave=ticks ! audioconvert ! audioresample ! queue ! opusenc ! rtpopuspay ! udpsink host=127.0.0.1 port=${audio}`
  ).setState(Gst.State.PLAYING);
  const audioTrack = new MediaStreamTrack({ kind: 'audio' });
  onAudio.add((buf) => {
    const rtp = RtpPacket.deSerialize(buf);
    rtp.header.extension = true;
    rtp.header.extensions.push({
      id: 3,
      payload: serializeAudioLevelIndication(25),
    });
    audioTrack.writeRtp(rtp);
  });

  const publication = await sender.publish(new LocalAudioStream(audioTrack), {
    codecCapabilities: [{ mimeType: 'audio/opus' }],
  });

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
