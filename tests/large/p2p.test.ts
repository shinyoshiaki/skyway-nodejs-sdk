import { describe, expect, it } from 'vitest';

import {
  RemoteVideoStream,
  SkyWayContext,
  SkyWayRoom,
  SkyWayStreamFactory,
} from '../../packages/room/src';
import { gst, testTokenString } from './fixture';
import { browserExec } from './util';

describe('p2p', () => {
  it('node-to-node', () =>
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

  it('node-to-browser', async () => {
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

    const stats = await browserExec(
      async ({ testTokenString, roomId, publicationId }) => {
        // vite用のハック
        // eslint-disable-next-line @typescript-eslint/no-unused-vars
        const __vite_ssr_import_3__ = (...args) => {};
        const load = new Function('url', 'return import(url)');
        const skyway = await load(
          'https://cdn.jsdelivr.net/npm/@skyway-sdk/room@1.12.0/+esm'
        );
        const context = await skyway.SkyWayContext.Create(testTokenString);
        const receiver = await (
          await skyway.SkyWayRoom.Find(context, { id: roomId }, 'p2p')
        ).join();
        const { subscription } = await receiver.subscribe(publicationId);
        await new Promise((r) => setTimeout(r, 1_500));
        const stats = await subscription.getStats();
        return stats;
      },
      { testTokenString, roomId: room.id, publicationId: publication.id }
    );

    const inboundRtp = stats.find((s) => s.type === 'inbound-rtp');
    expect(inboundRtp.bytesReceived).toBeGreaterThan(2500);

    disposer();
    await room.close();
  }, 15_000);

  it('browser-to-node', async () => {
    const context = await SkyWayContext.Create(testTokenString, {
      codecCapabilities: [{ mimeType: 'audio/opus' }],
    });
    const room = await SkyWayRoom.Create(context, {
      type: 'p2p',
    });
    const receiver = await room.join();

    browserExec(
      async ({ testTokenString, roomId }) => {
        // vite用のハック
        // eslint-disable-next-line @typescript-eslint/no-unused-vars
        const __vite_ssr_import_3__ = (...args) => {};
        const load = new Function('url', 'return import(url)');
        const skyway = await load(
          'https://cdn.jsdelivr.net/npm/@skyway-sdk/room@1.12.0/+esm'
        );
        const context = await skyway.SkyWayContext.Create(testTokenString);
        const sender = await (
          await skyway.SkyWayRoom.Find(context, { id: roomId }, 'p2p')
        ).join();
        const stream =
          await skyway.SkyWayStreamFactory.createMicrophoneAudioStream();
        await sender.publish(stream);
        await new Promise((r) => setTimeout(r, 5000));
      },
      { testTokenString, roomId: room.id }
    ).catch(() => {});

    const p = await room.onStreamPublished.asPromise();
    const { stream } = await receiver.subscribe<RemoteVideoStream>(
      p.publication.id
    );
    const [rtp] = await stream.track.onReceiveRtp.asPromise();
    expect(rtp.payload).toBeDefined();
  });
});
