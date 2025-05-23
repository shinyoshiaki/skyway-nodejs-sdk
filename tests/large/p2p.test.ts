/* eslint-disable @typescript-eslint/ban-ts-comment */
import Gst from '@girs/node-gst-1.0';
import { describe, expect, it } from 'vitest';
import { chromium } from 'playwright';
import {
  RemoteVideoStream,
  SkyWayContext,
  SkyWayRoom,
  SkyWayStreamFactory,
} from '../../packages/room/src';
import { testTokenString } from './fixture';
import { roomErrors } from '../../packages/room/src/errors';
import { string } from '../../submodules/mediasoup/src';

let gst: typeof Gst;
(async () => {
  const nodeGtk = await import('node-gtk');
  gst = nodeGtk.require('Gst', '1.0') as typeof Gst;
  gst.init([]);
})();

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

  it.only('node-to-browser', async () => {
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

    {
      const browser = await chromium.launch({
        args: [
          '--use-fake-ui-for-media-stream', // 許可ダイアログを自動承認
          '--use-fake-device-for-media-stream', // 仮想カメラ／マイクを提供
        ],
      });

      // 2. 新しいコンテキスト。自己署名証明書も気にしない
      const context = await browser.newContext({ ignoreHTTPSErrors: true });
      const HTTPS_ORIGIN = 'https://example.com';

      // 3. HTTPS オリジンに対してカメラ & マイク権限を付与
      await context.grantPermissions(['camera', 'microphone'], {
        origin: HTTPS_ORIGIN,
      });

      // 4. リクエストを横取りして空のページを返す
      await context.route(`${HTTPS_ORIGIN}/**`, (route) => {
        route.fulfill({
          status: 200,
          contentType: 'text/html',
          body: '<!doctype html><title>blank</title>',
        });
      });

      const page = await browser.newPage(); // about:blank
      await page.goto(HTTPS_ORIGIN);
      page.on('console', (msg) => {
        console.log('PAGE LOG:', msg.text());
      });
      // await page.addScriptTag({
      //   url: 'https://cdn.jsdelivr.net/npm/@skyway-sdk/room/dist/skyway_room-latest.js',
      // });
      // await page.waitForFunction('skyway_room!==undefined');

      const client = async (testTokenString) => {
        const __vite_ssr_import_3__ = (...args) => {
          console.log('import', args);
        };
        console.log('page.evaluate', testTokenString);
        const load = new Function('url', 'return import(url)');
        const skyway = await load(
          'https://cdn.jsdelivr.net/npm/@skyway-sdk/room@1.12.0/+esm'
        );
        console.log(`${testTokenString}`);
        const context = await skyway.SkyWayContext.Create(testTokenString);
        console.log('skyway', context);
        // const receiver = await (
        //   await skyway.SkyWayRoom.Find(context, { id: room.id }, 'p2p')
        // ).join();
        // const { subscription } = await receiver.subscribe(publication.id);
        // const stats = await subscription.getStats();
        // console.log(stats);
        // return stats;
      };

      const result = await page.evaluate(
        async ({ testTokenString, roomId, publicationId }) => {
          const __vite_ssr_import_3__ = (...args) => {
            console.log('import', args);
          };
          console.log('page.evaluate', testTokenString);
          const load = new Function('url', 'return import(url)');
          const skyway = await load(
            'https://cdn.jsdelivr.net/npm/@skyway-sdk/room@1.12.0/+esm'
          );
          console.log(`${testTokenString}`);
          const context = await skyway.SkyWayContext.Create(testTokenString);
          console.log('skyway', context);
          const receiver = await (
            await skyway.SkyWayRoom.Find(context, { id: roomId }, 'p2p')
          ).join();
          const { subscription } = await receiver.subscribe(publicationId);
          await new Promise((r) => setTimeout(r, 4000));
          const stats = await subscription.getStats();
          console.log(stats);
          return stats;
        },
        { testTokenString, roomId: room.id, publicationId: publication.id }
      );

      console.log(result);
      await browser.close();
    }
  }, 15_000);
});
