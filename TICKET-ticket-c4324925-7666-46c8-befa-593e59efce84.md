# 最新の skyway-js-sdk (https://github.com/skyway/js-sdk) に追従する

## 1. 目的と背景

本リポジトリ (skyway-nodejs-sdk) は、公式 [skyway-js-sdk](https://github.com/skyway/js-sdk) を Node.js で動作するようにした非公式 fork であり、upstream の git 履歴をタグ単位で merge する運用で追従してきた（`follow-v1.12.0` / `follow-v1.15.0` ブランチ、`v1.13.0`〜`v1.15.2` の merge 実績あり）。

- **現在の追従状況**: upstream **v1.15.2**（2025-09-04、v1 系の最終リリース）まで merge 済み。merge-base 確認済み（`c0074cee` = v1.15.2 タグ）。
- **upstream の現状**: **v2.0.0**（2025-10-22）でメジャーバージョンアップし、最新は **v2.5.1**（2026-07-07）。v1 系の更新は終了している。
- つまり本タスクの実体は **v1 → v2 のメジャーアップデートをまたぐ追従**であり、破壊的 API 変更への対応を含む。

放置すると upstream のバグ修正（P2P の unpublish/republish 問題、切断処理、メモリ管理など）やセキュリティ更新を取り込めなくなるため、v2 系最新への追従が必要。

## 2. 実装すべき具体的な変更内容

### 2.1 upstream v2.5.1 の merge

- upstream remote（https://github.com/skyway/js-sdk.git）からタグを fetch し、`v2.5.1` を作業ブランチへ merge して衝突を解消する（従来の追従運用と同じ方式）。
- fork 側と upstream 側の双方で変更されたファイルは **113 ファイル**（衝突候補）。SDK パッケージ全体の diff は v1.15.2→v2.5.1 で 166 ファイル / +5,227 / -3,647 行。

### 2.2 v2 の破壊的変更への対応（v2.0.0 リリースノートより）

**【決定】API 互換方針: ブラウザ版（upstream v2）の API をそのまま採用する。** fork 独自の互換レイヤーや旧 API の温存は行わず、既存利用者に対しては upstream v2 と同じ破壊的変更をそのまま適用する。

- **統合 Room 型**: P2P と SFU を同一 Room で同時に使える新 Room 型の導入。fork は現在 SFU に加え P2P も対応済み（`origin/p2p` 取り込み済み、`tests/large/p2p.test.ts` あり）なので、両モードの Node.js 動作を統合 Room 上で成立させる。
- `SkyWayRoom.Find` の引数変更。
- `moveRoom`（P2PRoom / SFURoom）の削除。
- リネーム: `SfuRoom` → `SFURoom` など Sfu→SFU、`updateReminderSec` → `updateRemindSec`。
- deprecated メソッド群の削除: `cancel` / `onCanceled` / `getStats` / `getRTCPeerConnection` / `getConnectionState` など（fork はもともと getStats 非対応のため、むしろ Node 対応差分が減る方向）。
- `Member` に `side` プロパティ追加。

### 2.3 パッケージ構成・依存の更新

- **【決定】common / model / signaling-client 等は vendor せず、npm 依存のまま 2.x へ更新する。** upstream v2 では `packages/` にこれらが in-repo 化され `workspace:*` 依存になったが、v2 系はすべて npm 公開済み（common 2.0.6 / model 2.0.0 / signaling-client 2.0.4 / rtc-api-client 2.2.5 / sfu-api-client 2.0.6 / analytics-client 2.0.5 / token 2.1.5）のため、merge 時に upstream 側の in-repo 化は取り込まず（fork 側の削除を維持）、npm バージョンだけ 2.x に引き上げる。
- **新規依存 `@skyway-sdk/signaling-client`**: v2 の core が依存する（`core/src/external/signaling.ts`）。fork の core にも依存追加が必要。
- fork が vendor している `packages/`（core / room / sfu-bot / rtc-api-client / rtc-rpc-api-client / sfu-api-client / analytics-client / token）は upstream v2.5.1 のコードをベースに更新し、`@shinyoshiaki/*` パッケージのバージョンを 2.5.x 系へ引き上げる。
- upstream v2 のツールチェーン: TypeScript は `^4.9.5` のまま（メジャー更新不要）、Node `>=22`、pnpm 11 系。
- **【決定】サポート対象 Node.js は upstream に合わせて `>=22` とする。** 各公開パッケージの `engines.node` と README の動作環境記載を更新する（CI は既に Node 24.x のため変更不要）。

### 2.4 Node.js アダプテーション層の維持

fork の核心は browser API を werift ベースに差し替える層。merge 時に以下が主な衝突ポイントになる:

- `packages/core/src/imports/mediasoup.ts` — `submodules/mediasoup`（mediasoup-client-node、内部に werift）への redirect
- `packages/core/src/media/factory.ts`、`media/stream/local|remote/*`
- `packages/core/src/plugin/internal/person/connection/{peer,sender,receiver}.ts`
- `packages/core/src/external/ice.ts`、`context.ts`、`channel/index.ts`

**【決定】v2.5.0 で追加された `rtcConfig.stunPorts` など WebRTC 層に触れる新機能は、werift / mediasoup-client-node（`submodules/mediasoup`、nested submodule に werift 本体）のコードベースを調査し、必要に応じて werift / mediasoup-client-node 側に機能追加して対応する。**「非対応として明記して済ませる」は最終手段とし、まず実装可否を調査する。werift は直近で最新化済み（commit `7dcac013`）なので、その版を起点に不足機能を洗い出す。

#### WebRTC 新機能の調査結果（2026-07-30 実施、v1.15.2→v2.5.1 の diff と現行 werift コードの突き合わせ）

| v2 の変更 | 実体 | werift / mediasoup-client-node の対応状況 | 必要な作業 |
| --- | --- | --- | --- |
| `rtcConfig.stunPorts`（v2.5.0） | SDK 層のみの変更。`config.ts` でのバリデーション（443/3478 を 1〜2 個、重複不可）と `external/ice.ts` での `stun:<domain>:<port>` URL 生成（v2.5.1 の `ice.ts:77-81`） | werift の `parseIceServerUrl`（webrtc/src/utils.ts）は `stun:host:port` の明示ポートをパース可能 → **単一ポート指定 `[443]` / `[3478]` はそのまま動作**。ただし `parseIceServers` は**最初の 1 STUN サーバーしか採用しない**（ice パッケージの `options.stunServer` が単数）ため、`[443, 3478]` の 2 個指定時は先頭のみ使用される | SDK 側は upstream コードの取り込みのみ。werift 側は `packages/ice` の `stunServer` を複数対応にする機能追加を行う（できない場合は「複数指定時は先頭ポートのみ使用」と README に明記） |
| 内部での `pc.getStats()` / `sender.getStats()` / `receiver.getStats()` 使用（v2 の analytics 統計収集: `connection/index.ts:273-298`、`receiver.ts:263`、`sender.ts:690` 等） | 公開 API の getStats は v2 で削除されたが、**内部実装が getStats に依存**するようになった | 現行 werift は `pc.getStats()`（peerConnection.ts:1183）、`RTCRtpSender.getStats()`（rtpSender.ts:683）、receiver 側 getStats を**実装済み** | 追加実装不要の見込み。ただし analytics が参照する RTCStatsReport のフィールドが werift の `buildStatsReport` の出力と一致するかを merge 後に実測確認 |
| `restartIce()` を使う再接続処理（v2 sender.ts で多用） | SDK 層の再接続ロジック強化 | werift は `restartIce()` 実装済み（peerConnection.ts:919）。fork の現行 `sender.ts` にも restartIce 使用実績あり | 追加実装不要の見込み |
| `pc.connectionState === 'closed'` チェック追加（v2.x transport/sender） | SDK 層の状態チェック | werift は `connectionState` 実装済み | 不要 |
| `iceDisconnectBufferTimeout` | v1.15.2 に既存（新機能ではない） | 対応済み | 不要 |
| RemoteDataStream 安定化（v2.4.3、`datachannel.ts` / `messageBuffer.ts`） | SDK 層のメッセージバッファリング変更 | werift の RTCDataChannel API の範囲内 | upstream コードの取り込みのみ |
| 再接続イベントハンドラ追加（v2.4.0） | signaling / SDK 層のイベント。WebRTC 層への新要求なし | — | upstream コードの取り込みのみ |
| TURN URL 生成（turn tcp / turn udp / turns tcp の 3 種） | v1 から変更なし | werift は 1 TURN サーバーのみ採用（既存挙動のまま） | 不要（現状維持） |

**結論**: werift への必須の機能追加は「STUN サーバー複数指定対応」のみで、それも `stunPorts` を 2 個指定した場合に限る縮退（先頭のみ使用）で初期リリースを許容する選択肢がある。getStats / restartIce は最新化済み werift が既に実装しているため、v2 内部実装の要求は満たせる見込み。

### 2.5 ドキュメント更新

- README の「skyway-js-sdk との違い」（対応機能・非対応機能）を v2 基準で更新。

### 2.6 submodule 修正の管理方針（2026-07-31 追加要件）

**submodule への fork 独自修正は、patch 運用ではなく submodule 自体のコード修正として管理する。**

- werift への修正（ICE restart の修正 3 点 / 複数 STUN サーバー対応 / DataChannel の DOM 互換
  `onbufferedamountlow`）は `submodules/mediasoup/submodules/werift` 内のコミットとして持ち、
  gitlink がそのコミットを参照する。`submodules/mediasoup` 側も werift の gitlink 更新を
  コミットする。
- 本リポジトリで差分を patch として保持する運用（`patches/submodules/` +
  `submodule:patch` / `submodule:unpatch`、および patch 由来の dirty を隠すための
  `skip-worktree` / `.gitmodules` の `ignore = dirty`）は廃止し、関連ファイル・スクリプト・
  CI の patch 適用ステップを削除する。
- 経緯: 当初は「gitlink を remote から取得できる SHA に固定し、差分は patch で管理」する
  方針で実装したが、submodule の変更を submodule 自身の履歴として持つ方が管理として素直で
  あるため、方針を変更する。
- **この方針では gitlink が push 前のローカルコミットを指すため、fresh clone および
  Node CI workflow は submodule を取得できない**。§4 の push 禁止と併せて、これは方針変更に
  伴って受け入れる制約とし、再現性は push 後に確保する。push 対象のコミットは
  `VERIFICATION.md` に明記し、push は利用者の明示的な許可を得てから別途実施する。

## 3. 技術的アプローチ（調査結果まとめ)

1. **merge 方式の継続が妥当**。upstream はリリースごとに squash された 15 コミットのみ（v1.15.2..v2.5.1）で、git 履歴は fork と共有されている。
2. **2 段階 merge を推奨**:
   - Step 1: `v2.0.0` を merge し、破壊的 API 変更と Node アダプテーション層の衝突解消に集中する（core/room/sfu-bot だけで 66 ファイル / ±1,500 行）。
   - Step 2: 続けて `v2.5.1` を merge（v2.0.0 以降は差分が小さく、大半がバグ修正）。**v2.0.0 で止めない**こと — v2.0.0〜v2.3.0 には P2P で unpublish/republish を繰り返すと media が取れなくなる既知バグがあり、v2.3.1 以降で修正済み。
3. **fetch 時の注意**: この環境は `ssh` バイナリがなく、グローバル git 設定に `url.git@github.com:.insteadof https://github.com/` があるため、そのままでは upstream fetch が失敗する。`GIT_CONFIG_GLOBAL=/dev/null git fetch upstream --tags --no-recurse-submodules` で回避できる（upstream remote は https URL で追加済み）。
4. **依存解決**: npm の `@skyway-sdk/*` を 2.x へ一括更新し、`@skyway-sdk/signaling-client` を core に追加。pnpm の strict な解決のため、実際に import するパッケージは各 package.json に明示宣言が必要。

## 4. 制約・注意点

- **werift / mediasoup-client-node との整合**: werift は直近で最新化済み（commit `7dcac013`）。v2 の WebRTC 関連新機能（stunPorts 等）は原則 werift / mediasoup-client-node への機能追加で対応する（§2.4 の決定参照）。submodule 側の変更は fork リポジトリ（shinyoshiaki/mediasoup-client-node、werift）へのコミットと参照 SHA 更新を伴う点に注意（ただし push は行わず、ローカルコミットまでにとどめる。後述の禁止事項参照）。
- **README の非対応機能一覧（getStats / restartIce / simulcast）は古くなっている**: 最新化済みの werift は getStats / restartIce を実装済み（§2.4 調査結果参照）で、v2 では getStats 系の公開 API 自体が削除された。v2 追従後の実質的な非対応は simulcast のみになる見込みのため、README 更新時に一覧を見直す。
- **`pnpm run type` は mp4box 起因で通らない既知問題**があるため、型チェックの完了判定は `compile`（tsc -p tsconfig.build.json）基準にする。
- **テスト**: `tests/large`（loopback / p2p / turn）は実 SkyWay 接続が必要。**認証情報はリポジトリ直下の `env.ts`（appId / secret）に設定済み**のため、ローカルで実接続テストを実行して合格を必須とする（CI も secrets 設定済みの Node CI workflow で同テストを実行）。integrate 系は flaky 傾向があるためリトライを考慮。
- **submodule 運用**: `submodules/mediasoup` の checkout 状態を壊さないこと（core.worktree 問題の再発防止のため `git submodule` 操作後の `git status` 確認を行う）。CI では wpt nested submodule を除外する既存手順を維持。fork 独自修正は §2.6 のとおり submodule 自体のコミットとして持つ（patch 運用は廃止）。
- **submodule に対する git 操作の注意**: この環境のシェルは `GIT_DIR` / `GIT_COMMON_DIR` を export しているため、`git -C <submodule>` でも親リポジトリを操作してしまい、しかもエラーにならない（実際に親ブランチを submodule のコミットへ動かす事故が起きた）。submodule 内の git は `env -u GIT_DIR -u GIT_COMMON_DIR -u GIT_WORK_TREE git -C <path> ...` の形で実行する。
- **§2.6 に伴う既知の制約**: gitlink が未 push のローカルコミット（werift `58d4c23c` / mediasoup `01d8acd`）を指すため、fresh clone と Node CI workflow は submodule checkout の段階で失敗する。方針変更に伴って受け入れた制約であり、push 後に解消する。ローカル検証はミラーを使って push 後相当の状態で実施し、結果を `VERIFICATION.md` に記録する。
- **バージョン表記**: `packages/*/src/version.ts` 等、SDK バージョン埋め込み箇所の更新漏れに注意。
- **【禁止】作業中の `git push` は行わない**: 本チケットの作業範囲はローカルのコミットまでとし、リモートへの push は一切行わない。対象は本リポジトリだけでなく、submodule 側（shinyoshiaki/mediasoup-client-node、werift）への push も含む。具体的に禁止する操作は以下:
  - `git push` / `git push --tags` / `git push --force`（本リポジトリ・submodule いずれも）
  - `git submodule foreach git push` など間接的に push を発生させるコマンド
  - `npm publish` / `pnpm publish`（リモートへの公開を伴うため）
  - PR 作成やブランチ公開（`gh pr create` 等）

  §2.4 の werift / mediasoup-client-node への機能追加も **submodule 内のローカルコミットまで**にとどめ、参照 SHA の更新はローカルコミットを指す状態で構わない。push が必要になった場合は作業を止め、利用者に push 対象（リポジトリ・ブランチ・コミット）を提示して明示的な許可を得てから実行する。
- 破壊的変更を含むため、`@shinyoshiaki/skyway-nodejs-sdk` の npm publish 時はメジャーバージョンを 2.x に上げる（publish 自体は本チケットのスコープ外とし、必要なら別チケット化）。

## 5. 完了条件

1. upstream `v2.5.1` タグが作業ブランチに merge され、衝突がすべて解消されている（`git log` 上で v2.5.1 が祖先になっている）。
2. `pnpm run compile` が全パッケージで成功する。
3. `tests/small` がローカルで pass する。
4. `tests/large`（loopback / p2p / turn）が `env.ts` の認証情報を使った実接続で pass する（ローカル実行および CI の Node CI workflow の両方で合格必須）。
5. v2 の主要 API 変更（統合 Room、`SFURoom` リネーム、`SkyWayRoom.Find` 新引数、`Member.side`）が examples レベルで動作確認できる（`examples/sendrecv` の更新を含む）。
6. `rtcConfig.stunPorts` が Node.js 上で動作する: 単一ポート指定（`[443]` / `[3478]`）での接続が確認済みで、複数指定 `[443, 3478]` は werift の ice パッケージへの複数 STUN 対応追加で動作する（縮退運用とした場合は「先頭ポートのみ使用」の制限が README に明記されている）。また v2 内部の getStats / restartIce 依存箇所（analytics 統計収集・再接続処理）が werift 実装で動作することが実接続テストで確認済みである。
7. README の対応/非対応機能・バージョン・動作環境（Node >=22）記載が v2 基準に更新され、各公開パッケージの `engines.node` が `>=22` になっている。
8. npm 依存の `@skyway-sdk/*` がすべて 2.x 系に更新され、`pnpm install --frozen-lockfile` が通る lockfile がコミットされている。
9. 成果物がすべてローカルコミットのみで完結しており、本リポジトリ・submodule のいずれに対しても `git push` / publish / PR 作成が行われていない（§4 の禁止事項）。
10. （§2.6 追加要件）werift への fork 独自修正が submodule 自体のコミットとして存在し、`submodules/mediasoup` および親リポジトリの gitlink がそれを参照している。patch 運用の資材（`patches/submodules/`、`scripts/{apply,unapply,}submodule_patches.mjs`、`submodule:patch` / `submodule:unpatch`、CI の patch 適用ステップ、`.gitmodules` の `ignore = dirty`）がすべて削除されている。submodule checkout が gitlink と一致し（dirty でない）、patch 適用ステップ無しで `compile` と `tests/small` / `tests/large` が pass する。push が必要なコミットが `VERIFICATION.md` に明記されている。
