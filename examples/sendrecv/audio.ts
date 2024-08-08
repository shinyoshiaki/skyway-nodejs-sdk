import {
  MediaStreamTrackFactory,
  RemoteAudioStream,
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
    // web js-sdkと違い、Contextの作成時にコーデックのmimeTypeを指定する必要がある
    codecCapabilities: [{ mimeType: 'audio/opus' }],
  });
  // RTPのパケットをUDPで受信する設定
  const [track, port] = await MediaStreamTrackFactory.rtpSource({
    kind: 'audio',
    cb: (buf) => {
      // ここでRTPパケットを加工することができる（しなくてもよい）
      const rtp = RtpPacket.deSerialize(buf);
      rtp.header.extension = true;
      rtp.header.extensions.push({
        id: 3,
        payload: serializeAudioLevelIndication(25),
      });
      return rtp.serialize();
    },
  });
  // さっき設定したportにRTPパケットを送信するGStreamerのパイプラインを作成
  Gst.parseLaunch(
    `audiotestsrc wave=ticks ! audioconvert ! audioresample ! queue ! opusenc ! rtpopuspay ! udpsink host=127.0.0.1 port=${port}`
  ).setState(Gst.State.PLAYING);
  // web js-sdkと違い、MediaDevicesにtrackを登録する必要がある
  SkyWayStreamFactory.registerMediaDevices({ audio: track });

  const room = await SkyWayRoom.Create(context, {
    type: 'sfu',
  });
  console.log('roomId', room.id);
  const sender = await room.join();

  const publication = await sender.publish(
    //AudioStreamはすべてさっきMediaDevicesに登録したtrackがソースになる
    await SkyWayStreamFactory.createMicrophoneAudioStream()
  );

  const receiver = await (await SkyWayRoom.Find(context, room, 'sfu')).join();
  const { stream: remoteStream } = await receiver.subscribe<RemoteAudioStream>(
    publication
  );
  // trackからRTPパケットを受信することができる
  remoteStream.track.onReceiveRtp.subscribe((rtp) => {
    const extensions = rtp.header.extensions;

    const audioLevel = extensions.find((e) => e.id === 10);
    const level = deserializeAudioLevelIndication(audioLevel!.payload);
    console.log({ level });
  });
})();
