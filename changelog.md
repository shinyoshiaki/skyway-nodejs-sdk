# Changelog

skyway-nodejs-sdk（`@shinyoshiaki/skyway-nodejs-sdk` 系パッケージ）の変更履歴です。
本 fork 固有の変更のみを記載し、upstream 側の変更点は upstream のリリースノートを参照してください。

フォーマットは [Keep a Changelog](https://keepachangelog.com/ja/1.1.0/) に準じています。

## 2.5.1 - 2026-07-31

upstream v2.5.1 への追従。ブラウザ版 v2 の破壊的変更がそのまま適用されるメジャーアップデートです。

### Added

- 統合 `Room`（P2P と SFU を同一 Room で同時利用）に対応。`SkyWayRoom.Create` / `Find` / `FindOrCreate` で `type` を省略、または `'default'` を指定すると統合 Room になります。
- `Member.side` プロパティに対応。
- `rtcConfig.stunPorts` に対応（werift / mediasoup-client-node 側へ機能追加して実現）。
- 統合 Room・`Member.side`・`rtcConfig.stunPorts` を確認できるサンプル [`examples/sendrecv/unified_room.ts`](./examples/sendrecv/unified_room.ts) を追加。
- `stunPorts` を含む接続テストを追加。

### Changed

- **BREAKING** ブラウザ版 v2.0.0 の破壊的変更をそのまま採用。
  - `SkyWayRoom.Find` の第 3 引数が文字列からオブジェクトへ変更（`'sfu'` → `{ type: 'sfu' }`）。
  - `SfuRoom` → `SFURoom`、`SfuBotMember` → `SFUBotMember` など `Sfu` を含む識別子を `SFU` にリネーム。
  - `updateReminderSec` → `updateRemindSec` にリネーム。
  - `P2PRoom.moveRoom` / `SFURoom.moveRoom` を削除。
  - `cancel` / `onCanceled` / `LocalStream.isEnabled` などの deprecated メンバーを削除。
- **BREAKING** 対応 Node.js を v22 以降に変更（upstream の `engines` に追従）。
- `@skyway-sdk/*` の npm 依存（common / model / signaling-client など）を 2.x 系へ更新。
- vendor している analytics-client / sfu-api-client を upstream v2.5.1 のコードへ揃え、`Publication.getStats` / `Subscription.getStats` が werift 経由で動作することを確認。
- werift を最新版へ更新。
- submodule（mediasoup-client-node など）はパッチ運用をやめ、submodule 自体のコードを直接修正する方針へ変更。fresh checkout での `pnpm run first` が通るように整備。
- pnpm 11 系へ更新し、GitHub Actions の Node.js バージョンを `engines` に合わせて修正。CI の手動実行（`workflow_dispatch`）を許可。

### Fixed

- unpublish と close の競合（レース）を修正。ログ出力のみで見逃していた状態遷移を正しく処理するようになりました。
- v1/v2 形式と v3 形式のどちらの Auth Token でも `appId` を解決できるように修正。

### Docs

- 対応・非対応機能の一覧を実態に合わせて修正（simulcast、`getAudioLevel`、デバイス列挙 API、Analytics が非対応）。
- README に v1 系からの移行ガイドを追加。
