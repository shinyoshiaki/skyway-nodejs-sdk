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
- **`retry: 2` を `tests/large/vitest.config.ts` に設定しています**（チケット §4 の
  「integrate 系は flaky 傾向があるためリトライを考慮」に対応）。large は実 SkyWay 接続
  （signaling / SFU / TURN）に依存するため、ネットワーク側の都合でごく稀に接続が確立せず
  timeout します。実際に `turn > force_turn` が、**コードが 1 行も変わっていない状態**
  （最後に成功した CI `97ba6bc9` との差分は VERIFICATION.md の 10 行だけ）で通常 2.6s の
  実行から 60s timeout に転びました。各テストは毎回自分で context / room / UDP ポート /
  デバイス登録を作り、`pool: 'forks'` でファイルごとにプロセスが分かれるので、retry でも
  状態は持ち越しません。retry が実際に効くことは、1 回目だけ失敗するテストを一時的に
  置いて全体が pass することで確認しました（確認後に削除済み）。
- `p2p > node-to-browser` / `browser-to-node` はブラウザ側で CDN の `@skyway-sdk/room@2.5.1`
  （本家 v2）を読み込んでおり、Node 版と本家 v2 の相互接続を確認しています。

## 5. CI（Node CI workflow 相当）

`ticket run-ci`（`pnpm run compile && pnpm run type && pnpm run test`）が success です。

```
ci.status: success
durationMs: 54217
 Lerna (powered by Nx)   Successfully ran target compile for 7 projects
 Lerna (powered by Nx)   Successfully ran target type for 7 projects
 Test Files  1 passed (1)
      Tests  1 passed (1)
 Test Files  6 passed (6)
      Tests  13 passed | 1 skipped (14)
[CI exited with code 0]
```

これは §2.6 の方針変更（patch 運用 → submodule 自体の修正）後の実行結果です。CI の
前段で走る auto-commit の後も submodule は clean（werift `7c2a3ab9` / mediasoup
`a866ee8`）で、gitlink と一致したままです。

なお **GitHub Actions の Node CI workflow は、gitlink が push されるまでは
submodule checkout の段階で失敗します**（「submodule の扱い」の「push が必要」を参照）。
上記はローカルの worktree に対する CI 確認コマンドの結果です。

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

当初はこれに加えて SDK 側で 2 つの回避策を持っていましたが、**どちらも werift 側の
問題だったので werift を直し、SDK からは削除しました**（§2.4 の「まず werift 側の
実装可否を調査する」方針に沿った対応）。

4. `addIceCandidate()` が、candidate の `usernameFragment` が適用済み remote description に
   一致しないとき `OperationError` で reject していた。ICE restart では相手が新しい ufrag の
   candidate を、対応する description の適用前に trickle してくるため、呼び出し側はその
   candidate を失い restart 後の pair が作られなかった。**remote description が未適用のときに
   既に行っている buffering と同じ扱いにし**、次の `setRemoteDescription` で反映するように
   した（ufrag 以外の不整合 — 存在しない `sdpMid` など — は従来どおり reject）。保持数には
   上限を設けている。
   - SDK 側で削除したもの: `Peer.resolveCandidates()` が werift の**エラーメッセージ文字列**
     （`/No media section matched the ICE usernameFragment/`）を正規表現で判定して candidate を
     再キューしていた処理と `maxPendingCandidates`。
5. `PeerConnection.connectionState` が **nominated pair が無いまま `connected`** になっていた。
   `connect()` は DTLS が既に connected なら早期 return するため、ICE がまだ connectivity
   check 中でも完了扱いになる。加えて `RTCIceTransport.state` は gather 完了時点で
   `completed` になる（werift の既存セマンティクス）ので、transport の state だけでは
   「経路があるか」を判断できない。**全 ICE transport に `nominated` があり DTLS が
   connected のときだけ `connected` へ引き上げ**、ICE が後から connected になった時点で
   再評価するようにした（`promoteConnectionStateIfReady()`）。
   - SDK 側で削除したもの: `Sender._isMediaPathRestored()`（全 ICE transport の `nominated` を
     自前で確認していた）。今は `connectionState === 'connected'` を見るだけで足り、
     非標準の `pc.iceTransports` への依存もこの箇所から無くなった。

4 の regression テストとして `packages/webrtc/tests/integrate/iceCandidateBuffering.test.ts`
を追加しました。修正前は `OperationError` で落ちることを確認済みです（buffer 判定を
一時的に無効化して確認）。

werift のテストは ice 113 件 / webrtc 189 件すべて通っています
（webrtc は上記の追加 2 件を含む）。

## submodule の扱い

**2026-07-31 の要件変更により、patch 運用をやめて submodule 自体のコードを修正する方針に
変更しました。** werift への修正（ICE restart / 複数 STUN サーバー）は
`submodules/mediasoup/submodules/werift` の**コミットとして持ち、gitlink がそれを参照**します。
`patches/submodules/` と `submodule:patch` / `submodule:unpatch` は削除しました。

| gitlink | SHA | 内容 |
| --- | --- | --- |
| `submodules/mediasoup` | `a866ee8` | `1d96eb8`（`origin/develop` 先端）+ 2 コミット（werift gitlink の更新） |
| `submodules/mediasoup/submodules/werift` | `7c2a3ab9` | `d782a543`（タグ `v0.24.2`）+ 下記の修正コミット 2 本 |

werift 側の 2 コミット:

```
$ git -C submodules/mediasoup/submodules/werift log --oneline d782a543..HEAD
7c2a3ab9 fix(webrtc): keep ICE-restart candidates and stop reporting connected without a pair
58d4c23c fix(ice): re-establish a nominated pair on ICE restart, support multiple STUN servers
```

`58d4c23c`（ICE restart の修正 3 点 + 複数 STUN サーバー対応 + DataChannel の
`onbufferedamountlow`）:

```
 packages/ice/src/ice.ts               | 65 ++++++++++++++++++++++++++++-------
 packages/ice/src/iceBase.ts           |  6 ++++
 packages/ice/src/stun/protocol.ts     |  4 +++
 packages/ice/src/types/model.ts       |  5 +++
 packages/ice/tests/ice/ice.test.ts    | 48 ++++++++++++++++++++++++++
 packages/webrtc/src/dataChannel.ts    |  2 ++
 packages/webrtc/src/peerConnection.ts | 13 ++++++-
 packages/webrtc/src/utils.ts          | 19 ++++++++--
 packages/webrtc/tests/utils.test.ts   | 26 ++++++++++++++
 9 files changed, 173 insertions(+), 15 deletions(-)
```

`7c2a3ab9`（SDK 側の回避策 2 件を werift 側の修正に置き換えたもの。
「成立させるために必要だった修正」の 4 と 5）:

```
 packages/ice/src/ice.ts                            |  3 +-
 packages/webrtc/src/peerConnection.ts              | 66 +++++++++++++++-
 packages/webrtc/src/secureTransportManager.ts      | 36 +++++++++
 .../tests/integrate/iceCandidateBuffering.test.ts  | 92 ++++++++++++++++++++++
 4 files changed, 193 insertions(+), 4 deletions(-)
```

（`ice.ts` の 3 行はコメントのみの変更で、挙動は変えていません。）

`58d4c23c` の時点の tree hash は patch 運用時と同一（`813c6013…`）であることを確認済みです。

### push が必要（未実施 / 許可待ち）

**この方針では gitlink が push されていないローカルコミットを指すため、fresh clone や
Node CI からは submodule を取得できません。** チケット §4 が作業中の push を禁止している
ため、本チケットの成果物はローカルコミットまでで止めています（§4 は
「参照 SHA の更新はローカルコミットを指す状態で構わない」と明示しています）。

再現可能にするには、以下を push する許可が必要です:

| リポジトリ | push するコミット |
| --- | --- |
| `shinyoshiaki/werift-webrtc` | `7c2a3ab9`（`d782a543` = v0.24.2 の上に 2 コミット） |
| `shinyoshiaki/mediasoup-client-node` | `a866ee8`（`1d96eb8` = develop 先端の上に 2 コミット） |

push 前は、fresh clone での `submodule:init` が該当 SHA を取得できず失敗します。
CI（Node CI workflow）も同じ理由で submodule checkout の段階で失敗します。これは
方針変更に伴って受け入れた既知の制約で、push 後に解消します。

### submodule 内の作業手順

この環境のシェルは `GIT_DIR` / `GIT_COMMON_DIR` を export しているため、`git -C <submodule>`
でも**親リポジトリを操作してしまいます**（しかもエラーにならない）。submodule に対する git は
必ず環境変数を落として実行してください:

```
$ env -u GIT_DIR -u GIT_COMMON_DIR -u GIT_WORK_TREE \
    git -C submodules/mediasoup/submodules/werift status
```

修正の流れは、werift を編集 → werift でコミット → mediasoup で `git add submodules/werift`
してコミット → 親で `git add submodules/mediasoup` してコミット、の 3 段です。

`.gitmodules` の `submodules/mediasoup` の url は SSH から HTTPS
(`https://github.com/shinyoshiaki/mediasoup-client-node.git`) に変更しています。公開
リポジトリなので、SSH 鍵を持たない fresh clone や CI の checkout からも取得できます
（mediasoup 側が werift を参照する url も元から HTTPS です）。patch 運用のために入れていた
`ignore = dirty` は、submodule が dirty にならなくなったので削除しました。

### fresh checkout からの再現確認

この記録では branch の HEAD の SHA を書いていません。CI / レビューの実行前に
auto-commit が 1 コミット足すので、記録に書いた SHA は書いた直後に必ず古くなります。
代わりに、内容で同一性が確認できるもの（gitlink の SHA と werift の tree hash
`813c6013…`）で状態を特定してください。branch は
`ticket/c4324925-7666-46c8-befa-593e59efce84` です。

clone から CI workflow と同じ手順を実行して large test まで通ることを確認しました。
**submodule の fetch 元はローカルミラーに向けています。** この環境に `ssh` も外部
ネットワークも無いためですが、今回の方針では gitlink が未 push のコミットを指すので、
これは同時に**「push 後の状態」のシミュレーション**でもあります（ミラーには
`7c2a3ab9` / `a866ee8` が含まれています）。

```
$ git clone <repo> /tmp/fresh4/repo
$ git -C /tmp/fresh4/repo checkout ticket/c4324925-7666-46c8-befa-593e59efce84

$ pnpm run submodule:init
Submodule path 'submodules/mediasoup': checked out 'a866ee8…'
Submodule path 'submodules/mediasoup/submodules/werift': checked out '7c2a3ab9…'
Skipping submodule 'submodules/mediasoup/submodules/werift/third_party/wpt'

$ git submodule status --recursive
 a866ee85ee8fdb1fe3cca39690446c2e3e203de8 submodules/mediasoup
 7c2a3ab9c544dffdfadf4d8e4fcd8f0713fcc69d submodules/mediasoup/submodules/werift
-121babb3c1d6a78dd0f638593c82d6cdcd0bcd18 submodules/mediasoup/submodules/werift/third_party/wpt

# patch 適用ステップは無い。checkout した時点で修正が入っている
$ git -C submodules/mediasoup/submodules/werift status --short   # 出力なし（clean）

$ pnpm install --frozen-lockfile        # exit 0
$ pnpm run submodule:install            # exit 0
$ pnpm exec playwright install chromium # exit 0
$ pnpm run compile                      # exit 0 (Successfully ran target compile for 7 projects)
$ pnpm run type                         # exit 0 (Successfully ran target type for 7 projects)
$ CI=true pnpm run test
 Test Files  1 passed (1)
      Tests  1 passed (1)
 ✓ large/stunPorts.test.ts > stunPorts > single port 443 862ms
 ✓ large/stunPorts.test.ts > stunPorts > single port 3478 664ms
 ✓ large/stunPorts.test.ts > stunPorts > both ports 683ms
 ✓ large/getStats.test.ts > getStats > p2p 962ms
 ✓ large/getStats.test.ts > getStats > sfu 1252ms
 ✓ large/turn.test.ts > turn > force_turn 2497ms
 ✓ large/loopback.test.ts > loopback > audio 995ms
 ✓ large/loopback.test.ts > loopback > audio_multiple 1604ms
 ✓ large/loopback.test.ts > loopback > video_h264 2317ms
 ✓ large/p2p.test.ts > p2p > node-to-node 977ms
 ✓ large/p2p.test.ts > p2p > node-to-browser 2421ms
 ✓ large/p2p.test.ts > p2p > browser-to-node 1077ms
 ✓ large/restartIce.test.ts > restartIce > reconnects and resumes RTP after the ICE path breaks 32025ms
 Test Files  6 passed (6)
      Tests  13 passed | 1 skipped (14)
                                        # exit 0

# 全工程を通したあとも gitlink は同じ
$ git submodule status --recursive
 a866ee85ee8fdb1fe3cca39690446c2e3e203de8 submodules/mediasoup (v0.0.3-87-ga866ee8)
 7c2a3ab9c544dffdfadf4d8e4fcd8f0713fcc69d submodules/mediasoup/submodules/werift (v0.24.1-8-g7c2a3ab9)
-121babb3c1d6a78dd0f638593c82d6cdcd0bcd18 submodules/mediasoup/submodules/werift/third_party/wpt
```

（ミラーを `file` transport で submodule として clone するのに
`protocol.file.allow=always` を検証側の一時 global config に入れています。検証環境の
都合で、リポジトリ側の設定ではありません。）

この確認の過程で、fresh checkout では `pnpm run submodule:install` が失敗することが
分かったので直しました。mediasoup submodule（パッケージ名 `msc-node`）の `prepare` が
自身の dist を tsc でビルドしますが、`submodules/werift/node_modules` 配下の第三者型定義
（`@types/dom-webcodecs` / `mediabunny`）が prepare の tsc 設定でエラーになるためです。
本 SDK は mediasoup の dist ではなく src を直接 import するので、
`npm ci --ignore-scripts` として依存の取得だけを行うようにしました。

### 参考: patch 運用でぶつかった問題（2026-07-31 の方針変更前）

方針変更前は gitlink を公開済み SHA（`1d96eb8` / `d782a543`）に固定し、差分を
`patches/submodules/` で管理していました。この運用では、submodule を再帰的にコミットする
ツール（CI / レビュー前の auto-commit）が patch 内容を submodule のローカルコミットに
変えてしまう問題が 2 回起きています（1 回目は gitlink が `4d9f3329` / `1f9626af` へ、
2 回目は werift の HEAD だけが `bd73fa14` へ動いて gitlink と不一致）。
`.gitmodules` の `ignore = dirty` は親から見た表示しか変えないので防げず、最終的に
patch 対象ファイルを `git update-index --skip-worktree` にして submodule 自身の
`git status` を clean に見せることで止めていました。

新方針では submodule のコミットが正規の状態になるため、auto-commit が submodule 内で
コミットしても gitlink が意図せず動くだけで、内容が失われることはありません。ただし
submodule に未コミットの編集を残したまま CI / レビューを回すと余計なコミットが増えるので、
submodule 側の編集は都度コミットしてから回してください。

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
