import { describe, expect, it } from 'vitest';

import {
  type RemoteAudioStream,
  SkyWayContext,
  SkyWayRoom,
  SkyWayStreamFactory,
} from '../../packages/room/src';
import { gst, testTokenString } from './fixture';
import { browserExec } from './util';

/**
 * p2p.test.ts と同じ 3 ケース（node 同士 / node → ブラウザ / ブラウザ → node）を
 * SFU Room で確認する。P2P は PeerConnection を直接張るが、SFU は SFUBot を挟んで
 * publish 側 / subscribe 側が別々の transport になるため、経路が変わる。
 * ブラウザ側は CDN の本家 v2 SDK を使うので、Node 版と本家 v2 の SFU 相互接続の確認も兼ねる。
 */
describe('sfu', () => {
  it(
    'node-to-node',
    async () => {
      const context = await SkyWayContext.Create(testTokenString, {
        codecCapabilities: [{ mimeType: 'audio/opus' }],
      });
      const room = await SkyWayRoom.Create(context, {
        type: 'sfu',
      });
      const sender = await room.join();

      const disposer = await SkyWayStreamFactory.registerAudioTestSrc({ gst });

      try {
        const publication = await sender.publish(
          await SkyWayStreamFactory.createMicrophoneAudioStream()
        );

        const receiver = await (
          await SkyWayRoom.Find(context, room, { type: 'sfu' })
        ).join();
        const { stream: remoteStream, subscription } =
          await receiver.subscribe<RemoteAudioStream>(publication);

        const [rtp] = await remoteStream.track.onReceiveRtp.asPromise();
        expect(rtp.payload).toBeDefined();

        // SFU 経由であることの確認。SFUBot 経由の subscribe では stats に
        // `sfuTransportId`（SFU transport の id）が付く。これを見ないと、
        // 仮に P2P で繋がっても RTP が届いた時点で pass してしまう。
        const stats = await subscription.getStats();
        const inbound = stats.find((s) => s.type === 'inbound-rtp');
        expect(inbound).toBeDefined();
        expect(inbound!.sfuTransportId).toBeDefined();

        await room.close();
      } finally {
        context.dispose();
        disposer();
      }
    },
    60_000
  );

  it(
    'node-to-browser',
    async () => {
      const context = await SkyWayContext.Create(testTokenString, {
        codecCapabilities: [{ mimeType: 'audio/opus' }],
      });
      const room = await SkyWayRoom.Create(context, {
        type: 'sfu',
      });
      const sender = await room.join();

      const disposer = await SkyWayStreamFactory.registerAudioTestSrc({ gst });
      const publication = await sender.publish(
        await SkyWayStreamFactory.createMicrophoneAudioStream()
      );

      const stats = await browserExec(
        async ({
          testTokenString,
          roomId,
          publicationId,
          minBytesReceived,
        }) => {
          // vite用のハック
          // eslint-disable-next-line @typescript-eslint/no-unused-vars
          const __vite_ssr_import_3__ = (...args) => {};
          const load = new Function('url', 'return import(url)');
          const skyway = await load(
            'https://cdn.jsdelivr.net/npm/@skyway-sdk/room@2.5.1/+esm'
          );
          const context = await skyway.SkyWayContext.Create(testTokenString);
          const receiver = await (
            await skyway.SkyWayRoom.Find(
              context,
              { id: roomId },
              { type: 'sfu' }
            )
          ).join();
          const { subscription } = await receiver.subscribe(publicationId);

          // p2p.test.ts と同じ理由でポーリングする（固定待機だと接続確立の
          // 速さに受信量が依存する）。SFU は SFUBot 経由なので P2P より
          // 確立に時間がかかる。
          const deadline = Date.now() + 20_000;
          let stats = await subscription.getStats();
          for (;;) {
            stats = await subscription.getStats();
            const inbound = stats.find((s) => s.type === 'inbound-rtp');
            if (inbound && inbound.bytesReceived > minBytesReceived) break;
            if (Date.now() > deadline) break;
            await new Promise((r) => setTimeout(r, 250));
          }
          return stats;
        },
        {
          testTokenString,
          roomId: room.id,
          publicationId: publication.id,
          minBytesReceived: 2500,
        }
      );

      const inboundRtp = stats.find((s) => s.type === 'inbound-rtp');
      expect(inboundRtp.bytesReceived).toBeGreaterThan(2500);
      // ブラウザ側（本家 v2 SDK）も SFUBot 経由で subscribe できていること
      expect(inboundRtp.sfuTransportId).toBeDefined();

      disposer();
      await room.close();
    },
    60_000
  );

  it(
    'browser-to-node',
    async () => {
      const context = await SkyWayContext.Create(testTokenString, {
        codecCapabilities: [{ mimeType: 'audio/opus' }],
      });
      const room = await SkyWayRoom.Create(context, {
        type: 'sfu',
      });
      const receiver = await room.join();

      // ブラウザ側は publish 後に一定時間待つだけなので待ち合わせはしないが、
      // 起動や publish が失敗したときに「node 側の待ちがタイムアウトする」形で
      // 原因が隠れないよう、エラーは node 側の待ちと race させて表に出す。
      const browserDone = browserExec(
        async ({ testTokenString, roomId }) => {
          // vite用のハック
          // eslint-disable-next-line @typescript-eslint/no-unused-vars
          const __vite_ssr_import_3__ = (...args) => {};
          const load = new Function('url', 'return import(url)');
          const skyway = await load(
            'https://cdn.jsdelivr.net/npm/@skyway-sdk/room@2.5.1/+esm'
          );
          const context = await skyway.SkyWayContext.Create(testTokenString);
          const sender = await (
            await skyway.SkyWayRoom.Find(
              context,
              { id: roomId },
              { type: 'sfu' }
            )
          ).join();
          const stream =
            await skyway.SkyWayStreamFactory.createMicrophoneAudioStream();
          await sender.publish(stream);
          await new Promise((r) => setTimeout(r, 5000));
        },
        { testTokenString, roomId: room.id }
      );
      const browserFailed: Promise<never> = browserDone.then(
        () => new Promise<never>(() => {}),
        (error) => {
          throw new Error(`browser side failed: ${error?.message ?? error}`);
        }
      );

      const raceWithBrowser = <T>(promise: Promise<T>) =>
        Promise.race([promise, browserFailed]) as Promise<T>;

      try {
        const p = await raceWithBrowser(room.onStreamPublished.asPromise());
        const { stream, subscription } = await raceWithBrowser(
          receiver.subscribe<RemoteAudioStream>(p.publication.id)
        );
        const [rtp] = await raceWithBrowser(
          stream.track.onReceiveRtp.asPromise()
        );
        expect(rtp.payload).toBeDefined();

        // SFU 経由であることの確認（node-to-node と同じ理由）
        const stats = await subscription.getStats();
        const inbound = stats.find((s) => s.type === 'inbound-rtp');
        expect(inbound).toBeDefined();
        expect(inbound!.sfuTransportId).toBeDefined();

        await room.close();
      } finally {
        context.dispose();
      }
    },
    60_000
  );
});
