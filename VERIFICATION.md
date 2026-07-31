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
   ✓ stunPorts > both ports
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
   ✓ restartIce > reconnects and resumes RTP after the ICE path breaks

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

- 単一ポート指定（`[443]` / `[3478]`）も複数指定（`[443, 3478]`）も指定どおりに動作します。
  werift の ice パッケージに複数 STUN サーバー対応（`IceOptions.stunServers`）を追加し、
  `parseIceServers` が全ての STUN URL を収集するようにしました。
  テストでは `ice.connection.stunServers` が指定ポート全てを含むことを検証しています。
- v2 内部が依存する getStats は `getStats.test.ts` で P2P / SFU 両方について
  `Subscription.getStats`（receiver 側）、`Publication.getStats`（sender 側）、
  `pc.getStats` を実接続で検証しています。

## 8. restartIce（再接続処理）

`tests/large/restartIce.test.ts` で ICE 切断を意図的に発生させ、**メディア再開まで**
検証しています。

障害注入は「接続確立後、送信側 PeerConnection の ICE ソケットを全て閉じる」方法です。
nominated pair だけを閉じると ICE が別の候補ペアへ自力で切り替わり restartIce まで
到達しないため、自己回復できない状態にする必要があります。

```
$ pnpm --dir tests exec vitest -c large/vitest.config.ts run ./large/restartIce.test.ts
 ✓ large/restartIce.test.ts (1 test) 31768ms
   ✓ restartIce > reconnects and resumes RTP after the ICE path breaks  31767ms
```

テストが確認していること:

1. まず RTP が流れている
2. 経路を壊すと werift が consent freshness の期限切れ（RFC 7675、`CONSENT_TIMEOUT` = 30 秒）で
   ICE を failed にし、SDK が `iceDisconnectBufferTimeout` 待機後に `Sender.restartIce()` を実行
   （`reconnecting` は restartIce 内でのみ発行される状態）
3. 再接続が完了し、**`nominated`（採用された candidate pair）が選び直されている**
4. **RTP が実際に届く**（`inbound-rtp.packetsReceived` が増加している）

計測値（restart 前後）:

```
before-break         senderIce=connected  nominated=stun  packetsSent=1     packetsReceived=1
(restartIce 実行)
after-reconnect +3s  senderIce=connected  nominated=stun  packetsSent=1702  packetsReceived=151
after-reconnect +10s senderIce=connected  nominated=stun  packetsSent=2053  packetsReceived=502
```

### 成立させるために必要だった修正

werift の ICE restart には 3 つの不具合があり、いずれも修正しました
（`submodules/mediasoup/submodules/werift`）。

1. `packages/ice/src/ice.ts` の `gatherCandidates()` が末尾で無条件に
   `setState("completed")` を呼び、**candidate 収集の完了を接続完了として報告**していた。
   初回 gathering は既存セマンティクス（`RTCIceTransport` は `gather()` 完了で `completed`）を
   維持し、restart 後は pair が選出されるまで状態を進めないようにした。
2. `restart()` は incoming の earlyCheck 用に protocol を残す設計だが、**close 済みの
   protocol も残していた**。`getCandidatePromises()` は既に protocol がある
   アドレスをスキップするため、閉じた protocol がそのアドレスの再 gathering を
   恒久的に阻害し candidate が 1 つも作れなくなっていた。close 済みは破棄するようにし、
   `Protocol` に任意の `closed` を追加して `StunProtocol` で公開した。
3. `packages/webrtc/src/peerConnection.ts` の `connect()` が **DTLS が connected なら
   早期 return** していた。DTLS は ICE restart をまたいで維持される仕様のため、
   これにより `iceTransport.start()` が呼ばれず connectivity check が再実行されなかった。
   ICE が new / disconnected / failed のときは start まで進めるようにした
   （ICE start 後の既存ガードにより DTLS の再ハンドシェイクは発生しない）。

SDK 側では、werift の `connectionState` だけを再接続完了の判定に使わないようにしました
（`Sender._isMediaPathRestored()`。`connectionState === 'connected'` かつ全 ICE transport に
`nominated` があることを確認します）。また ICE restart 直後に相手の新しい
usernameFragment を持つ candidate が古い remoteDescription しか無い状態で届くと
werift が `OperationError` にするため、`Peer.resolveCandidates` では破棄せず
次の `setRemoteDescription` 後に再試行します。

werift のテストは ice 113 件 / webrtc 187 件すべて通っています。

## submodule の扱い

werift への修正（ICE restart / 複数 STUN サーバー）は、**gitlink を remote から取得できる
SHA のままにし、差分を本リポジトリの `patches/submodules/` で管理**しています。
push していないコミットを gitlink に指させると fresh checkout / CI で取得できなくなるためです。

| gitlink | SHA | 取得元 |
| --- | --- | --- |
| `submodules/mediasoup` | `1d96eb8` | `origin/develop` の先端 |
| `submodules/mediasoup/submodules/werift` | `d782a543` | タグ `v0.24.2` |

| patch | 内容 |
| --- | --- |
| `patches/submodules/werift-ice-restart-and-multiple-stun.patch` | ICE restart の修正 3 点 + 複数 STUN サーバー対応 + DataChannel の DOM 互換 `onbufferedamountlow` |

適用は `pnpm run submodule:patch`（冪等。`first` と CI の prepare に組み込み済み）。
patch は前提 SHA（`d782a543`）を検証してから当てるので、submodule が別の状態のときは
黙って当たらずエラーになります。

remote 側に実在することの確認:

```
# submodules/mediasoup: origin/develop の先端そのもの
$ git -C submodules/mediasoup rev-parse origin/develop
1d96eb8a40c0861d99ff2d676c9270f2b164652a

# nested werift: タグ v0.24.2 として公開済み（remote へ問い合わせて確認）
$ git -C submodules/mediasoup/submodules/werift ls-remote origin v0.24.2
d782a54395552e594a6c36cd06430c8224b3096e	refs/tags/v0.24.2
```

（この環境には `ssh` バイナリが無く、グローバル git 設定の
`url.git@github.com:.insteadof https://github.com/` により ssh へ書き換えられるため、
上記 `ls-remote` は `GIT_CONFIG_GLOBAL=/dev/null` を付けて https のまま実行しています。）

patch を当てた結果が意図した内容と一致することは tree hash で確認しています
（`d782a543` + patch のツリーが、手元で作った修正コミットのツリーと同一）。

```
worktree tree:  813c60136551195f2f6b8fb02a6045ee67c87f69
commit   tree:  813c60136551195f2f6b8fb02a6045ee67c87f69
```

### fresh checkout からの再現確認

この記録では branch の HEAD の SHA を書いていません。CI / レビューの実行前に
auto-commit が 1 コミット足すので、記録に書いた SHA は書いた直後に必ず古くなります。
代わりに、内容で同一性が確認できるもの（gitlink の SHA と patch 適用後の tree hash
`813c6013…`）で状態を特定してください。branch は
`ticket/c4324925-7666-46c8-befa-593e59efce84` です。

公開済み gitlink のまま clone し、CI workflow と同じ手順を実行して large test まで
通ることを確認しました（submodule の fetch 元だけは、この環境に `ssh` が無いため
ローカルのミラーに差し替えています。SHA は公開済みのものと同一です）。

```
$ git clone <repo> /tmp/fresh3/repo
$ git -C /tmp/fresh3/repo checkout ticket/c4324925-7666-46c8-befa-593e59efce84

$ pnpm run submodule:init
Submodule path 'submodules/mediasoup': checked out '1d96eb8a…'
Submodule path 'submodules/mediasoup/submodules/werift': checked out 'd782a543…'
Skipping submodule 'submodules/mediasoup/submodules/werift/third_party/wpt'

$ git submodule status --recursive
 1d96eb8a40c0861d99ff2d676c9270f2b164652a submodules/mediasoup (v0.0.3-85-g1d96eb8)
 d782a54395552e594a6c36cd06430c8224b3096e submodules/mediasoup/submodules/werift (v0.24.1-6-gd782a543)
-121babb3c1d6a78dd0f638593c82d6cdcd0bcd18 submodules/mediasoup/submodules/werift/third_party/wpt

$ pnpm run submodule:patch
✓ applied: patches/submodules/werift-ice-restart-and-multiple-stun.patch

$ pnpm install --frozen-lockfile        # exit 0（node_modules/.pnpm に 1119 パッケージ）
$ pnpm run submodule:install            # exit 0
$ pnpm exec playwright install chromium # exit 0
$ pnpm run compile                      # exit 0 (Successfully ran target compile for 7 projects)
$ pnpm run type                         # exit 0 (Successfully ran target type for 7 projects)
$ CI=true pnpm run test
 ✓ small/stream.test.ts (1 test) 5ms
 Test Files  1 passed (1)
      Tests  1 passed (1)
 ✓ large/turn.test.ts (1 test) 2565ms
 ✓ large/stunPorts.test.ts (3 tests) 2601ms
 ✓ large/getStats.test.ts (2 tests) 3416ms
 ✓ large/p2p.test.ts (3 tests) 4905ms
 ✓ large/loopback.test.ts (4 tests | 1 skipped) 4990ms
 ✓ large/restartIce.test.ts (1 test) 31980ms
 Test Files  6 passed (6)
      Tests  13 passed | 1 skipped (14)
                                        # exit 0

# 全工程を通したあとも gitlink は公開済み SHA のまま（drift しない）
$ git submodule status --recursive
 1d96eb8a40c0861d99ff2d676c9270f2b164652a submodules/mediasoup (v0.0.3-85-g1d96eb8)
 d782a54395552e594a6c36cd06430c8224b3096e submodules/mediasoup/submodules/werift (v0.24.1-6-gd782a543)
-121babb3c1d6a78dd0f638593c82d6cdcd0bcd18 submodules/mediasoup/submodules/werift/third_party/wpt
```

（submodule の fetch 先だけはローカルミラーに向けています。この環境に `ssh` も外部
ネットワークも無いためで、SHA は公開済みのものと同一です。ミラーを `file` transport で
submodule として clone するのに `protocol.file.allow=always` も検証側の一時 global
config に入れています — いずれも検証環境の都合で、リポジトリ側の設定ではありません。）

この確認の過程で、fresh checkout では `pnpm run submodule:install` が失敗することが
分かったので直しました。mediasoup submodule（パッケージ名 `msc-node`）の `prepare` が
自身の dist を tsc でビルドしますが、`submodules/werift/node_modules` 配下の第三者型定義
（`@types/dom-webcodecs` / `mediabunny`）が prepare の tsc 設定でエラーになるためです。
本 SDK は mediasoup の dist ではなく src を直接 import するので、
`npm ci --ignore-scripts` として依存の取得だけを行うようにしました。

patch を更新する場合は、

```
$ pnpm run submodule:unpatch   # skip-worktree を外して patch を revert
# submodules/mediasoup/submodules/werift を編集
$ git -C submodules/mediasoup/submodules/werift diff d782a543 \
    > patches/submodules/werift-ice-restart-and-multiple-stun.patch
$ pnpm run submodule:patch     # 当て直して skip-worktree を再設定
```

の順で行ってください。`submodule:unpatch` を先に実行しないと、編集が
`git diff` に出てこないため patch を取り直せません。

なお patch 適用後は submodule の working tree が dirty になります。これは意図した状態なので、
submodule 側でコミットして解消しないでください（コミットすると gitlink が remote から
取得できない SHA を指すことになります）。

実際にこれを 2 回踏んだため、規約だけに頼らない防止策を入れています。submodule を再帰的に
コミットするツール（CI 前の auto-commit）が動くと、patch 内容が werift のローカル
コミットになってしまいます。

1 回目は mediasoup の gitlink が `1d96eb8` → `4d9f3329`、werift が
`d782a543` → `1f9626af` に動きました。2 回目は親の gitlink は守れたものの werift の
HEAD だけが `d782a543` → `bd73fa14` に動き、gitlink と checkout が不一致になりました。
内容はどちらも patch と同一でしたが、これらの SHA は push していないので fresh checkout /
CI からは取得できません。

対策（`submodule:patch` が適用時に自動でやること）:

- **patch が触る 9 ファイルを `git update-index --skip-worktree` にする。** これが本命です。
  submodule 自身の `git status` が clean になるため `git commit -a` が no-op になり、
  HEAD は gitlink と一致し続けます。ファイルの内容は patch 適用後のまま残ります。
- 親（mediasoup）側に `submodule.submodules/werift.ignore=dirty` を設定する。mediasoup 自身の
  `.gitmodules` は upstream 管理なので clone ローカルの config に書きます。
- 親リポジトリ側は `.gitmodules` の `ignore = dirty` で従来どおり gitlink の変更だけを見ます。

`ignore=dirty` だけでは不十分でした。これは親から見た status/diff の表示を変えるだけで、
submodule 内で直接 `git commit -a` されるのは止められません（2 回目がこれ）。
`skip-worktree` は submodule 自身の status を clean にするので止まります。

この印が付いている間は submodule 内で修正しても `git diff` に出ません。patch を作り直す
ときは先に `pnpm run submodule:unpatch` で印を外して patch を revert してください。

`.gitmodules` の `submodules/mediasoup` の url は SSH から HTTPS
(`https://github.com/shinyoshiaki/mediasoup-client-node.git`) に変更しました。公開
リポジトリなので、SSH 鍵を持たない fresh clone や CI の checkout からも取得できます
（mediasoup 側が werift を参照する url も元から HTTPS です）。

patch ファイルには末尾空白を残していません。unified diff では空行の context 行が
「空白 1 文字だけの行」になりますが、末尾空白を除去するツールに壊されると patch が
当たらなくなるため、空行のまま保存しています（`git apply` は空行を空の context 行として
解釈します。適用は `--whitespace=nowarn` 付き）。除去後も同じ tree hash
`813c6013…` になることを確認済みです。

mediasoup-client-node の werift handler の getStats 空実装は submodule を変更せず、
本リポジトリの `packages/core/src/imports/weriftHandlerStats.ts` が prototype に
実装を注入して補っています。

## Analytics（要件変更の要否）

Analytics（統計情報の SkyWay サーバへの自動送信）は **Node.js では実接続検証ができません**。
SkyWay の AnalyticsServer が Node.js からの WebSocket 接続を受け付けないためです。

計測した内容:

- `analytics: true` のトークンで `setupAnalyticsSession` を有効化すると、
  AnalyticsServer から close code `4100` / reason `User-Agent is required` が返る。
- `ws` の `headers: { 'User-Agent': ... }` で UA を付与しても（plain Node の handshake では
  実際に送信されていることを確認済み）、その後 `1006`（異常終了）で切断され接続できない。

そのため `context.ts` の `setupAnalyticsSession` 呼び出しは無効のまま維持し、理由をコードに
明記しています。**この項目は「Node.js では非対応」として要件を変更する合意が必要です。**
統計情報そのものは `Publication.getStats` / `Subscription.getStats` で取得でき、
v2 が内部で使う getStats 依存箇所は `tests/large/getStats.test.ts` で検証済みです。
