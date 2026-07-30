# v2.5.1 追従の検証記録

チケット `c4324925-7666-46c8-befa-593e59efce84`（最新の skyway-js-sdk への追従）の完了条件に対する
検証結果です。実行環境は Node.js v24.18.0 / pnpm 11.9.0、実接続テストの認証情報はリポジトリ直下の
`env.ts` を使用しています。

## 0. 公開パッケージのバージョン

チケット §2.3 の「`@shinyoshiaki/*` パッケージのバージョンを 2.5.x 系へ引き上げる」に対応し、
vendor した fork 名義のパッケージは全て `2.5.1` に揃えています（`src/version.ts` の埋め込みも同じ）。

| パッケージ | version |
| --- | --- |
| `@shinyoshiaki/skyway-nodejs-sdk-core` | 2.5.1 |
| `@shinyoshiaki/skyway-nodejs-sdk`（room） | 2.5.1 |
| `@shinyoshiaki/skyway-rtc-api-client` | 2.5.1 |
| `@shinyoshiaki/skyway-rtc-rpc-api-client` | 2.5.1 |
| `@shinyoshiaki/skyway-nodejs-sdk-sfu-bot` | 2.5.1 |

`packages/analytics-client`（2.0.5）と `packages/sfu-api-client`（2.0.6）は
`@skyway-sdk/*` の名前のまま vendor しており、npm 上の同名パッケージの range を
満たして workspace 側が使われる必要があるため upstream の版数を維持しています。

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
 ✓ large/getStats.test.ts (2 tests) 2110ms
   ✓ getStats > p2p
   ✓ getStats > sfu
 ✓ large/stunPorts.test.ts (3 tests) 2244ms
   ✓ stunPorts > single port 443
   ✓ stunPorts > single port 3478
   ✓ stunPorts > both ports (uses the first one)
 ✓ large/turn.test.ts (1 test) 2487ms
   ✓ turn > force_turn
 ✓ large/p2p.test.ts (3 tests) 3742ms
   ✓ p2p > node-to-node
   ✓ p2p > node-to-browser
   ✓ p2p > browser-to-node
 ✓ large/loopback.test.ts (4 tests | 1 skipped) 4890ms
   ✓ loopback > audio
   ✓ loopback > audio_multiple
   ✓ loopback > video_h264
 ✓ large/restartIce.test.ts (1 test) 31745ms
   ✓ restartIce > detects the broken ICE path and runs restartIce

 Test Files  6 passed (6)
      Tests  13 passed | 1 skipped (14)
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
 Test Files  6 passed (6)
      Tests  13 passed | 1 skipped (14)
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
  `pc.getStats` を実接続で検証しています。

## 8. restartIce（再接続処理）

`tests/large/restartIce.test.ts` で ICE 切断を意図的に発生させて検証しています。

障害注入は「接続確立後、送信側 PeerConnection の ICE ソケットを全て閉じる」方法を使います。
nominated pair だけを閉じると ICE が別の候補ペアへ自力で切り替わり restartIce まで到達しないため、
自己回復できない状態にする必要がありました。

```
$ pnpm --dir tests exec vitest -c large/vitest.config.ts run ./large/restartIce.test.ts
 ✓ large/restartIce.test.ts (1 test) 31651ms
   ✓ restartIce > detects the broken ICE path and runs restartIce  31651ms
```

**確認できたこと**: 経路を壊すと werift が consent freshness の期限切れ（RFC 7675、
`CONSENT_TIMEOUT` = 30 秒）で ICE を failed にし、SDK の
`onPeerConnectionStateChanged` が `iceDisconnectBufferTimeout` だけ復帰を待った後
`Sender.restartIce()` を実行します。`reconnecting` は `restartIce()` の中だけで
発行される状態なので、この遷移が実行の証跡になります。

**確認できなかったこと（既知の制限）**: **ICE restart 後のメディア（RTP）再開は
現時点の werift では成立しません。** 原因を計測で特定しています。

restart 前後で送信側 / 受信側の統計と ICE の状態を取ると次のようになります。

```
before-break        senderIce=connected  nominated=stun  packetsSent=1     packetsReceived=1
(restartIce 実行)
after-reconnect +3s senderIce=completed  nominated=null  packetsSent=1700  packetsReceived=1
after-reconnect +10s senderIce=completed nominated=null  packetsSent=2050  packetsReceived=1
```

- werift の ICE は restart 後に state だけ `completed` になり、**`nominated`（採用された
  candidate pair）が null のまま**です。
- そのため送信側は送信を続ける（`packetsSent` が増える）のに、受信側には 1 パケットも
  届きません（`packetsReceived` が増えない）。
- 併せて restart 直後の candidate が
  `OperationError: No media section matched the ICE usernameFragment` で弾かれます。

これは werift 内部の ICE restart 時の状態遷移の問題で、SDK 側（本リポジトリ）からは
修正できません。README の「制限付きで動作する機能」に利用者向けの記載をしています。

### 原因の所在と修正に必要な作業

`packages/ice/src/ice.ts` の `gatherCandidates()` は末尾で無条件に
`this.setState("completed")` を呼びます。つまり **candidate の収集完了が
そのまま「接続完了」として扱われています**。初回接続では収集後に `connect()` が
`connected` を立てるので問題になりませんが、ICE restart では収集だけが再実行され、
`nominated` が未選出のまま状態が `completed` になります。

SDK 側で試した対処と結果:

- `Peer.resolveCandidates` で usernameFragment 不一致の candidate を破棄せず
  次の `setRemoteDescription` 後に再試行する → **メディアは復帰せず**
  （`nominated` が null のままなので効果なし）。unverified な変更を残さないため revert 済み。
- werift 側で `gatherCandidates()` の `setState("completed")` を
  「`nominated` があるときだけ」に変更 → werift の ice テストは 112 件すべて通るが、
  **webrtc パッケージのテストが 11 件失敗**（`iceTransport > test_connect`、
  DTLS ハンドシェイク系など）。werift は `completed` を収集完了の意味でも使っており、
  収集状態（`iceGatheringState`）と接続状態の分離を伴う設計変更が必要です。

したがってこの項目は **werift 本体の修正とその公開（push）が前提** になります。
本チケットは push を禁止しているため、対応するには利用者の明示的な許可が必要です。

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
