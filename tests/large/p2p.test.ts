import Gst from '@girs/node-gst-1.0';
import { describe, expect, it } from 'vitest';

import {
  RemoteVideoStream,
  SkyWayContext,
  SkyWayRoom,
  SkyWayStreamFactory,
} from '../../packages/room/src';
import { testTokenString } from './fixture';

let gst: typeof Gst;
(async () => {
  const nodeGtk = await import('node-gtk');
  gst = nodeGtk.require('Gst', '1.0') as typeof Gst;
  gst.init([]);
})();

describe('p2p', () => {
  it('audio', () =>
    new Promise<void>(async (done) => {
      const context = await SkyWayContext.Create(testTokenString, {
        codecCapabilities: [{ mimeType: 'audio/opus' }],
      });
      const room = await SkyWayRoom.Create(context, {
        type: 'p2p',
      });
      const sender = await room.join();

      const disposer = await SkyWayStreamFactory.registerAudioTestSrc({ gst });

      const publication = await sender.publish(
        await SkyWayStreamFactory.createMicrophoneAudioStream()
      );

      const receiver = await (
        await SkyWayRoom.Find(context, room, 'p2p')
      ).join();
      const { stream: remoteStream } =
        await receiver.subscribe<RemoteVideoStream>(publication);

      const [rtp] = await remoteStream.track.onReceiveRtp.asPromise();
      expect(rtp.payload).toBeDefined();

      disposer();
      done();
    }));
});
