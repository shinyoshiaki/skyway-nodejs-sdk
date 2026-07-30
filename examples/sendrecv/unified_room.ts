import Gst from '@girs/node-gst-1.0';
import nodeGtk from 'node-gtk';

import {
  MediaStreamTrackFactory,
  type RemoteAudioStream,
  type Room,
  SkyWayContext,
  SkyWayRoom,
  SkyWayStreamFactory,
} from '../../packages/room/src';
import { testTokenString } from './fixture';
const gst = nodeGtk.require('Gst', '1.0') as typeof Gst;
gst.init([]);

/**
 * js-sdk v2 で追加された統合 Room の例。
 * 1 つの Room の中で P2P と SFU を同時に使い分けることができる。
 */
(async () => {
  const context = await SkyWayContext.Create(testTokenString, {
    // web js-sdkと違い、Contextの作成時にコーデックのmimeTypeを指定する必要がある
    codecCapabilities: [{ mimeType: 'audio/opus' }],
    rtcConfig: {
      // v2.5.0 で追加された設定。STUNサーバーへの接続に使うポートを選択できる。
      // 複数指定すると指定した全てのポートに問い合わせる。
      stunPorts: [443, 3478],
    },
  });

  const [track, port] = await MediaStreamTrackFactory.rtpSource({
    kind: 'audio',
  });
  Gst.parseLaunch(
    `audiotestsrc wave=ticks ! audioconvert ! audioresample ! queue ! opusenc ! rtpopuspay ! udpsink host=127.0.0.1 port=${port}`
  ).setState(Gst.State.PLAYING);
  SkyWayStreamFactory.registerMediaDevices({ audio: track });

  // type を省略（もしくは 'default'）すると統合 Room になる
  const room: Room = await SkyWayRoom.Create(context, {});
  console.log('roomId', room.id);

  const sender = await room.join();

  // 同じ Room の中で P2P と SFU の Publication を並べて作れる
  // (同一の Stream インスタンスは 1 度しか publish できないので個別に作る)
  const p2pPublication = await sender.publish(
    await SkyWayStreamFactory.createMicrophoneAudioStream(),
    { type: 'p2p' }
  );
  const sfuPublication = await sender.publish(
    await SkyWayStreamFactory.createMicrophoneAudioStream(),
    { type: 'sfu' }
  );
  console.log('published', {
    p2p: p2pPublication.id,
    sfu: sfuPublication.id,
  });

  // v2 では Find の第3引数がオブジェクトになった
  const receiverRoom = await SkyWayRoom.Find(context, { id: room.id }, {
    type: 'default',
  });
  const receiver = await receiverRoom.join();

  // v2 で Member に side プロパティが追加された
  console.log('member sides', {
    localSide: receiver.side,
    remoteSides: receiverRoom.members.map((m) => [m.id, m.side]),
  });

  for (const publication of [p2pPublication, sfuPublication]) {
    const { subscription, stream: remoteStream } =
      await receiver.subscribe<RemoteAudioStream>(publication.id);
    console.log('subscribed', {
      publicationType: publication.type,
      subscriptionId: subscription.id,
    });

    const [rtp] = await remoteStream.track.onReceiveRtp.asPromise();
    console.log('received rtp', {
      publicationType: publication.type,
      payloadSize: rtp.payload.length,
    });

    // v2 では内部の統計収集が getStats に依存しており、werift でも利用できる
    const stats = await subscription.getStats();
    console.log('inbound-rtp', stats.find((s) => s.type === 'inbound-rtp'));
  }

  await room.close();
  context.dispose();
  // gst のパイプラインなどが残るため明示的に終了する
  process.exit(0);
})();
