import { expect, it } from 'vitest';

import {
  RemoteVideoStream,
  SkyWayContext,
  SkyWayStreamFactory,
} from '../../packages/core/src';
import { SkyWayRoom } from '../../packages/room/src';
import { gst, testTokenString } from './fixture';

it('disable', async () => {
  const context = await SkyWayContext.Create(testTokenString, {
    codecCapabilities: [{ mimeType: 'audio/opus' }],
    rtcConfig: { iceUseLinkLocalAddress: true },
  });

  SkyWayStreamFactory.registerNodeGtkGst(gst);
  const room = await SkyWayRoom.Create(context, {
    type: 'sfu',
  });
  const sender = await room.join();

  const disposer = await SkyWayStreamFactory.registerGstAudio();

  const publication = await sender.publish(
    await SkyWayStreamFactory.createMicrophoneAudioStream()
  );

  const receiver = await (await SkyWayRoom.Find(context, room, 'sfu')).join();
  const { stream: remoteStream } = await receiver.subscribe<RemoteVideoStream>(
    publication
  );
  await remoteStream.track.onReceiveRtp.asPromise();

  await publication.disable();

  const e = await remoteStream.track.onReceiveRtp
    .asPromise(1000)
    .catch(() => new Error('timeout'));
  expect(e).toBeInstanceOf(Error);

  disposer();
});
