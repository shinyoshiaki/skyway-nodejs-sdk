import { describe, it } from 'vitest';
import {
  RemoteVideoStream,
  SkyWayContext,
  SkyWayRoom,
  MediaStreamTrackFactory,
  SkyWayStreamFactory,
} from '../../packages/room/src';

import Gst from '@girs/node-gst-1.0';
import { testTokenString } from './fixture';
import { dePacketizeRtpPackets } from 'werift';

const gst = require('node-gtk').require('Gst', '1.0') as typeof Gst;
gst.init([]);

describe('turn', () => {
  it(
    'force_turn',
    () =>
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
          rtcConfig: { turnPolicy: 'turnOnly' },
        });
        const room = await SkyWayRoom.Create(context, {
          type: 'sfu',
        });
        console.log('roomId', room.id);
        const sender = await room.join();

        const [track, port, disposer] = await MediaStreamTrackFactory.rtpSource(
          {
            kind: 'video',
          }
        );
        const launch = gst.parseLaunch(
          `videotestsrc ! video/x-raw,width=640,height=480,format=I420 ! x264enc key-int-max=60 ! rtph264pay ! udpsink host=127.0.0.1 port=${port}`
        );
        launch.setState(gst.State.PLAYING);
        SkyWayStreamFactory.registerMediaDevices({ video: track });

        const publication = await sender.publish(
          await SkyWayStreamFactory.createCameraVideoStream()
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
      }),
    60_000
  );
});
