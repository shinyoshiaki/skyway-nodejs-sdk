import {
  RemoteVideoStream,
  SkyWayContext,
  SkyWayRoom,
  dePacketizeRtpPackets,
  MediaStreamTrackFactory,
  SkyWayStreamFactory,
} from '../../packages/room/src';
import { testTokenString } from './fixture';
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
  });
  const [track, port] = await MediaStreamTrackFactory.rtpSource({
    kind: 'video',
  });
  Gst.parseLaunch(
    `videotestsrc ! video/x-raw,width=640,height=480,format=I420 ! x264enc key-int-max=60 ! rtph264pay ! udpsink host=127.0.0.1 port=${port}`
  ).setState(Gst.State.PLAYING);
  SkyWayStreamFactory.registerMediaDevices({ video: track });

  const room = await SkyWayRoom.Create(context, {
    type: 'sfu',
  });
  console.log('roomId', room.id);
  const sender = await room.join();

  const publication = await sender.publish(
    await SkyWayStreamFactory.createCameraVideoStream()
  );

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
