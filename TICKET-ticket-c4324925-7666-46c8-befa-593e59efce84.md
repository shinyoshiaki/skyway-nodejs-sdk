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

- **統合 Room 型**: P2P と SFU を同一 Room で同時に使える新 Room 型の導入。fork は現在 SFU に加え P2P も対応済み（`origin/p2p` 取り込み済み、`tests/large/p2p.test.ts` あり）なので、両モードの Node.js 動作を統合 Room 上で成立させる。
- `SkyWayRoom.Find` の引数変更。
- `moveRoom`（P2PRoom / SFURoom）の削除。
- リネーム: `SfuRoom` → `SFURoom` など Sfu→SFU、`updateReminderSec` → `updateRemindSec`。
- deprecated メソッド群の削除: `cancel` / `onCanceled` / `getStats` / `getRTCPeerConnection` / `getConnectionState` など（fork はもともと getStats 非対応のため、むしろ Node 対応差分が減る方向）。
- `Member` に `side` プロパティ追加。

### 2.3 パッケージ構成・依存の更新

- upstream v2 では `packages/` に **common / model / signaling-client** が in-repo 化され、`workspace:*` 依存になった。fork は common / model を削除して npm の `@skyway-sdk/common@^1.5.0` 等に置き換えている。v2 系はすべて npm 公開済み（common 2.0.6 / model 2.0.0 / signaling-client 2.0.4 / rtc-api-client 2.2.5 / sfu-api-client 2.0.6 / analytics-client 2.0.5 / token 2.1.5）なので、**npm 依存のまま 2.x へ更新する方針を推奨**（vendor し直すより差分が小さい）。
- **新規依存 `@skyway-sdk/signaling-client`**: v2 の core が依存する（`core/src/external/signaling.ts`）。fork の core にも依存追加が必要。
- fork が vendor している `packages/`（core / room / sfu-bot / rtc-api-client / rtc-rpc-api-client / sfu-api-client / analytics-client / token）は upstream v2.5.1 のコードをベースに更新し、`@shinyoshiaki/*` パッケージのバージョンを 2.5.x 系へ引き上げる。
- upstream v2 のツールチェーン: TypeScript は `^4.9.5` のまま（メジャー更新不要）、Node `>=22`（CI は 24.x 使用のため問題なし）、pnpm 11 系。

### 2.4 Node.js アダプテーション層の維持

fork の核心は browser API を werift ベースに差し替える層。merge 時に以下が主な衝突ポイントになる:

- `packages/core/src/imports/mediasoup.ts` — `submodules/mediasoup`（mediasoup-client-node、内部に werift）への redirect
- `packages/core/src/media/factory.ts`、`media/stream/local|remote/*`
- `packages/core/src/plugin/internal/person/connection/{peer,sender,receiver}.ts`
- `packages/core/src/external/ice.ts`、`context.ts`、`channel/index.ts`

v2.5.0 で追加された `rtcConfig.stunPorts` など WebRTC 層に触れる新機能は、werift / mediasoup-client-node 側での対応可否を確認し、非対応なら README の非対応機能一覧に明記する。

### 2.5 ドキュメント更新

- README の「skyway-js-sdk との違い」（対応機能・非対応機能）を v2 基準で更新。

## 3. 技術的アプローチ（調査結果まとめ)

1. **merge 方式の継続が妥当**。upstream はリリースごとに squash された 15 コミットのみ（v1.15.2..v2.5.1）で、git 履歴は fork と共有されている。
2. **2 段階 merge を推奨**:
   - Step 1: `v2.0.0` を merge し、破壊的 API 変更と Node アダプテーション層の衝突解消に集中する（core/room/sfu-bot だけで 66 ファイル / ±1,500 行）。
   - Step 2: 続けて `v2.5.1` を merge（v2.0.0 以降は差分が小さく、大半がバグ修正）。**v2.0.0 で止めない**こと — v2.0.0〜v2.3.0 には P2P で unpublish/republish を繰り返すと media が取れなくなる既知バグがあり、v2.3.1 以降で修正済み。
3. **fetch 時の注意**: この環境は `ssh` バイナリがなく、グローバル git 設定に `url.git@github.com:.insteadof https://github.com/` があるため、そのままでは upstream fetch が失敗する。`GIT_CONFIG_GLOBAL=/dev/null git fetch upstream --tags --no-recurse-submodules` で回避できる（upstream remote は https URL で追加済み）。
4. **依存解決**: npm の `@skyway-sdk/*` を 2.x へ一括更新し、`@skyway-sdk/signaling-client` を core に追加。pnpm の strict な解決のため、実際に import するパッケージは各 package.json に明示宣言が必要。

## 4. 制約・注意点

- **werift / mediasoup-client-node との整合**: werift は直近で最新化済み（commit `7dcac013`）。v2 の WebRTC 関連新機能（stunPorts 等）が werift で表現できない場合は無理に実装せず非対応として明記する。
- **既知の非対応機能**（getStats / restartIce / simulcast）は v2 でも維持。v2 で getStats 系 API が削除されたため公開 API 上のギャップは縮小する。
- **`pnpm run type` は mp4box 起因で通らない既知問題**があるため、型チェックの完了判定は `compile`（tsc -p tsconfig.build.json）基準にする。
- **テスト**: `tests/large`（loopback / p2p / turn）は実 SkyWay 接続が必要で、`env.ts` の APP_ID / SECRET がないとタイムアウトする。ローカルで secret がない場合は `tests/small` と compile を確認し、実接続テストは CI（secrets 設定済み、Node CI workflow）で検証する。integrate 系は flaky 傾向があるためリトライを考慮。
- **submodule 運用**: `submodules/mediasoup` の checkout 状態を壊さないこと（core.worktree 問題の再発防止のため `git submodule` 操作後の `git status` 確認を行う）。CI では wpt nested submodule を除外する既存手順を維持。
- **バージョン表記**: `packages/*/src/version.ts` 等、SDK バージョン埋め込み箇所の更新漏れに注意。
- 破壊的変更を含むため、`@shinyoshiaki/skyway-nodejs-sdk` の npm publish 時はメジャーバージョンを 2.x に上げる（publish 自体は本チケットのスコープ外とし、必要なら別チケット化）。

## 5. 完了条件

1. upstream `v2.5.1` タグが作業ブランチに merge され、衝突がすべて解消されている（`git log` 上で v2.5.1 が祖先になっている）。
2. `pnpm run compile` が全パッケージで成功する。
3. `tests/small` がローカルで pass する。
4. `tests/large`（loopback / p2p / turn）が CI（Node CI workflow、APP_ID / SECRET あり）で pass する。
5. v2 の主要 API 変更（統合 Room、`SFURoom` リネーム、`SkyWayRoom.Find` 新引数、`Member.side`）が examples レベルで動作確認できる（`examples/sendrecv` の更新を含む）。
6. README の対応/非対応機能・バージョン記載が v2 基準に更新されている。
7. npm 依存の `@skyway-sdk/*` がすべて 2.x 系に更新され、`pnpm install --frozen-lockfile` が通る lockfile がコミットされている。
