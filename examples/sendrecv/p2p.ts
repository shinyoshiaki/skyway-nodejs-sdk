import Gst from '@girs/node-gst-1.0';
import nodeGtk from 'node-gtk';

import {
  dePacketizeRtpPackets,
  MediaStreamTrackFactory,
  RemoteVideoStream,
  SkyWayContext,
  SkyWayRoom,
  SkyWayStreamFactory,
} from '../../packages/room/src';
import { testTokenString } from './fixture';
const gst = nodeGtk.require('Gst', '1.0') as typeof Gst;
gst.init([]);

(async () => {
  const context = await SkyWayContext.Create(testTokenString, {
    codecCapabilities: [
      {
        mimeType: 'video/vp8',
      },
      {
        mimeType: 'audio/opus',
      },
    ],
  });
  const [track, port] = await MediaStreamTrackFactory.rtpSource({
    kind: 'video',
  });
  Gst.parseLaunch(
    `videotestsrc ! video/x-raw,width=640,height=480,format=I420 ! vp8enc keyframe-max-dist=30 ! rtpvp8pay picture-id-mode=1 ! udpsink host=127.0.0.1 port=${port}`
  ).setState(Gst.State.PLAYING);
  SkyWayStreamFactory.registerMediaDevices({ video: track });

  const room = await SkyWayRoom.Create(context, {
    type: 'p2p',
  });
  console.log('roomId', room.id);
  const sender = await room.join();

  const publication = await sender.publish(
    await SkyWayStreamFactory.createCameraVideoStream()
  );

  const receiver = await (await SkyWayRoom.Find(context, room, 'p2p')).join();
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
