import {
  LocalVideoStream,
  MediaStreamTrack,
  RemoteVideoStream,
  SkyWayContext,
  SkyWayRoom,
  dePacketizeRtpPackets,
  randomPort,
  Event,
} from '../../packages/room/src';
import { testTokenString } from './fixture';
import { createSocket } from 'dgram';
import Gst from '@girs/node-gst-1.0';

const gst = require('node-gtk').require('Gst', '1.0') as typeof Gst;
gst.init([]);

(async () => {
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

  const video = await randomPort();
  const onVideo = new Event<Buffer>();
  createSocket('udp4')
    .on('message', (buf) => {
      onVideo.emit(buf);
    })
    .bind(video);

  Gst.parseLaunch(
    `videotestsrc ! video/x-raw,width=640,height=480,format=I420 ! x264enc key-int-max=60 ! rtph264pay ! udpsink host=127.0.0.1 port=${video}`
  ).setState(Gst.State.PLAYING);

  const track = new MediaStreamTrack({ kind: 'video' });
  onVideo.add((data) => {
    track.writeRtp(data);
  });

  const publication = await sender.publish(new LocalVideoStream(track));

  const receiver = await (await SkyWayRoom.Find(context, room, 'sfu')).join();
  const { stream: remoteStream } = await receiver.subscribe<RemoteVideoStream>(
    publication
  );
  remoteStream.track.onReceiveRtp.subscribe((rtp) => {
    const codec = dePacketizeRtpPackets('mpeg4/iso/avc', [rtp]);
    if (codec.isKeyframe) {
      console.log('receive keyframe');
    }
  });
})();
