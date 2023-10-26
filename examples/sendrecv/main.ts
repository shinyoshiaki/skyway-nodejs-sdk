import {
  LocalVideoStream,
  MediaStreamTrack,
  RemoteVideoStream,
  SkyWayContext,
  SkyWayRoom,
  dePacketizeRtpPackets,
  randomPort,
} from '@skyway-sdk/room';
import { testTokenString } from './fixture';
import { createSocket } from 'dgram';
import Gst from '@girs/node-gst-1.0';

const gst = require('node-gtk').require('Gst', '1.0') as typeof Gst;
gst.init([]);

(async () => {
  const context = await SkyWayContext.Create(testTokenString);
  const room = await SkyWayRoom.Create(context, {
    type: 'sfu',
  });
  console.log('roomId', room.id);
  const sender = await room.join();

  const port = await randomPort();

  const udp = createSocket('udp4');
  udp.bind(port);

  const track = new MediaStreamTrack({ kind: 'video' });
  udp.addListener('message', (data) => {
    track.writeRtp(data);
  });

  const stream = new LocalVideoStream(track);
  const publication = await sender.publish(stream, {
    codecCapabilities: [{ mimeType: 'video/vp8' }],
  });

  const src = gst.ElementFactory.make('videotestsrc', null)!;
  const capsfilter = gst.ElementFactory.make('capsfilter', null)!;
  capsfilter.setProperty(
    'caps',
    Gst.capsFromString(
      'video/x-raw,width=640,height=480,format=I420,framerate=60/1'
    )
  );
  const enc = gst.ElementFactory.make('vp8enc', null)!;
  enc.setProperty('keyframe-max-dist', 60);
  enc.setProperty('cpu-used', 5);
  const pay = gst.ElementFactory.make('rtpvp8pay', null)!;
  pay.setProperty('picture-id-mode', 1);
  const sink = gst.ElementFactory.make('udpsink', null)!;
  sink.setProperty('host', '127.0.0.1');
  sink.setProperty('port', port);
  const pipeline = new gst.Pipeline();
  [src, capsfilter, enc, pay, sink].reduce((acc, cur) => {
    pipeline.add(cur);
    if (acc) {
      acc.link(cur);
    }
    return cur;
  }, undefined as Gst.Element | undefined);
  pipeline.setState(gst.State.PLAYING);

  const receiver = await (await SkyWayRoom.Find(context, room, 'sfu')).join();
  const { stream: remoteStream } = await receiver.subscribe<RemoteVideoStream>(
    publication
  );
  remoteStream.track.onReceiveRtp.subscribe((rtp) => {
    const codec = dePacketizeRtpPackets('vp8', [rtp]);
    if (codec.isKeyframe) {
      console.log('keyframe');
    }
  });
})();
