# v2.5.1 追従の検証記録

チケット `c4324925-7666-46c8-befa-593e59efce84`（最新の skyway-js-sdk への追従）の完了条件に対する
検証結果です。実行環境は Node.js v24.18.0 / pnpm 11.9.0、実接続テストの認証情報はリポジトリ直下の
`env.ts` を使用しています。

## 1. upstream v2.5.1 の merge

```
$ git merge-base --is-ancestor v2.5.1 HEAD && echo OK
OK
```

`v2.0.0` → `v2.5.1` の 2 段階 merge を実施済みです。

## 2. pnpm run compile

```
$ pnpm run compile
 Lerna (powered by Nx)   Successfully ran target compile for 7 projects
 Lerna (powered by Nx)   Successfully ran target type for 7 projects
exit code: 0
```

`pnpm run type` も 7 パッケージすべて成功します（werift 0.24.2 で mp4box 依存が消えたため）。

## 3. tests/small

```
$ pnpm --dir tests run test-small
 Test Files  1 passed (1)
      Tests  1 passed (1)
```

## 4. tests/large（実 SkyWay 接続）

```
$ pnpm --dir tests run test-large
 ✓ large/getStats.test.ts (2 tests) 2159ms
   ✓ getStats > p2p  907ms
   ✓ getStats > sfu  1251ms
 ✓ large/stunPorts.test.ts (3 tests) 2176ms
   ✓ stunPorts > single port 443  771ms
   ✓ stunPorts > single port 3478  723ms
   ✓ stunPorts > both ports (uses the first one)  680ms
 ✓ large/turn.test.ts (1 test) 2456ms
   ✓ turn > force_turn  2454ms
 ✓ large/p2p.test.ts (3 tests) 3627ms
   ✓ p2p > node-to-node  857ms
   ✓ p2p > node-to-browser  1722ms
   ✓ p2p > browser-to-node  1046ms
 ✓ large/loopback.test.ts (4 tests | 1 skipped) 4760ms
   ✓ loopback > audio  860ms
   ✓ loopback > audio_multiple  1597ms
   ✓ loopback > video_h264  2302ms

 Test Files  5 passed (5)
      Tests  12 passed | 1 skipped (13)
exit code: 0
```

- `--dangerouslyIgnoreUnhandledErrors` は外してあり、unhandled rejection は 0 件です。
- skip されている `loopback > video_vp8` は本追従作業以前から `it.skip` の既存テストです。
- `p2p > node-to-browser` / `browser-to-node` はブラウザ側で CDN の `@skyway-sdk/room@2.5.1`
  （本家 v2）を読み込んでおり、Node 版と本家 v2 の相互接続を確認しています。

## 5. CI（Node CI workflow 相当）

`ticket run-ci`（`pnpm run compile && pnpm run type && pnpm run test`）が success です。

```
ci.status: success
 Lerna (powered by Nx)   Successfully ran target compile for 7 projects
 Lerna (powered by Nx)   Successfully ran target type for 7 projects
 Test Files  1 passed (1)
      Tests  1 passed (1)
 Test Files  5 passed (5)
      Tests  12 passed | 1 skipped (13)
```

## 6. v2 主要 API の examples レベル動作確認

`examples/sendrecv/unified_room.ts`（統合 Room / `SkyWayRoom.Find` の新引数 /
`Member.side` / `rtcConfig.stunPorts` / `getStats`）の実行結果:

```
$ npx tsx examples/sendrecv/unified_room.ts
published {
  p2p: '967f19b3-56d2-4758-90be-07b733b3ea03',
  sfu: '8ef49d64-e548-492e-8834-073b8ca522e3'
}
member sides {
  localSide: 'local',
  remoteSides: [
    [ 'fc035f71-af80-4322-b28b-6c4b7ec98b18', 'remote' ],
    [ '05e3f122-be8e-4445-8e11-b96e9b8a346b', 'local' ]
  ]
}
subscribed { publicationType: 'p2p', ... }
received rtp { publicationType: 'p2p', payloadSize: 3 }
inbound-rtp { type: 'inbound-rtp', ... packetsReceived: 1 ... }
subscribed { publicationType: 'sfu', ... }
received rtp { publicationType: 'sfu', payloadSize: 3 }
inbound-rtp { type: 'inbound-rtp', ... sfuTransportId: ... }
exit code: 0
```

1 つの Room で P2P と SFU の Publication を同時に扱えており、`Member.side` も取得できています。

## 7. rtcConfig.stunPorts

- 単一ポート指定（`[443]` / `[3478]`）は指定どおりに接続できます（上記 stunPorts テスト）。
- 複数指定時は **先頭ポートのみ使用** されます。werift の ice 実装が STUN サーバーを
  1 台しか参照しないためで、README の「制限付きで動作する機能」に明記しています。
  テストでも `ice.connection.stunServer` が先頭ポートであることを検証しています。
- v2 内部が依存する getStats は `getStats.test.ts` で P2P / SFU 両方について
  `Subscription.getStats`（receiver 側）、`Publication.getStats`（sender 側）、
  `pc.getStats` を実接続で検証しています。`restartIce` は werift 実装済みで
  `sfu-bot` の transport 再接続経路から利用しています。

## submodule の扱い

`submodules/mediasoup` とその中の werift には fork 独自のコミットを持たせていません。

| gitlink | SHA | 取得元 |
| --- | --- | --- |
| `submodules/mediasoup` | `1d96eb8` | `origin/develop` に含まれる |
| `submodules/mediasoup/submodules/werift` | `d782a543` | タグ `v0.24.2` |

そのため fresh checkout / CI でも `pnpm run submodule:init` だけで同じ状態になります
（`git submodule status --recursive` も exit 0）。

remote 側に実在することの確認:

```
# submodules/mediasoup: origin/develop の先端そのもの
$ git -C submodules/mediasoup rev-parse origin/develop
1d96eb8a40c0861d99ff2d676c9270f2b164652a
$ git -C submodules/mediasoup merge-base --is-ancestor 1d96eb8 origin/develop && echo OK
OK

# nested werift: タグ v0.24.2 として公開済み（remote へ問い合わせて確認）
$ git -C submodules/mediasoup/submodules/werift ls-remote origin v0.24.2
d782a54395552e594a6c36cd06430c8224b3096e	refs/tags/v0.24.2
```

（この環境には `ssh` バイナリが無く、グローバル git 設定の
`url.git@github.com:.insteadof https://github.com/` により ssh へ書き換えられるため、
上記 `ls-remote` は `GIT_CONFIG_GLOBAL=/dev/null` を付けて https のまま実行しています。）

mediasoup-client-node の werift handler は `getTransportStats` / `getSenderStats` /
`getReceiverStats` が空実装ですが、submodule を変更する代わりに本リポジトリ側の
`packages/core/src/imports/weriftHandlerStats.ts` で prototype に委譲実装を与えています。
これにより SFU の統計取得（`consumer.getStats()` / `producer.getStats()`）が動作します。
