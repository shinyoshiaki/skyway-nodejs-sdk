# SkyWay NodeJS-SDK

SkyWay JS-SDK を Node.js に非公式に対応させた SDK です。
JS-SDK と API はほとんど同じですが、一部機能に対応していません。

本 SDK は [skyway-js-sdk](https://github.com/skyway/js-sdk) の **v2.5.1** に追従しています。
v2 は破壊的変更を含むメジャーアップデートであり、本 SDK もブラウザ版 v2 の API をそのまま採用しています。

# サンプルコード

- https://github.com/shinyoshiaki/skyway-nodejs-sdk/tree/nodejs/examples
- https://github.com/shinyoshiaki/skyway-nodejs-playground

# v1 系からの移行

ブラウザ版 v2.0.0 の破壊的変更がそのまま適用されます。主な変更点は次のとおりです。

- P2P と SFU を同一 Room で同時に使える統合 `Room` 型が追加された（`SkyWayRoom.Create` / `Find` / `FindOrCreate` で `type` を省略、または `'default'` を指定すると統合 Room になる）。
- `SkyWayRoom.Find` の第 3 引数が文字列からオブジェクトに変更された。
  - v1: `SkyWayRoom.Find(context, { id }, 'sfu')`
  - v2: `SkyWayRoom.Find(context, { id }, { type: 'sfu' })`
- `SfuRoom` → `SFURoom`、`SfuBotMember` → `SFUBotMember` など `Sfu` を含む識別子が `SFU` にリネームされた。
- `updateReminderSec` → `updateRemindSec` にリネームされた。
- `P2PRoom.moveRoom` / `SFURoom.moveRoom` が削除された。
- `cancel` / `onCanceled` / `LocalStream.isEnabled` などの deprecated なメンバーが削除された。
- `Member` に `side` プロパティが追加された。

# skyway-js-sdk との違い

## 仕様

- 提供パッケージ
  - room
- 対応動作環境
  - Node.js v22 以降
- 対応通信方法
  - P2P
  - SFU
- 対応コーデック
  - opus
  - vp8
  - h264
- 対応機能（ブラウザ版と同様に利用できるもの）
  - `Publication.getStats` / `Subscription.getStats` / `getRTCPeerConnection`
  - `restartIce`（ICE 切断時の再接続。切断検知 → ICE restart → メディア再開まで
    実接続テストで確認しています）
  - `rtcConfig.stunPorts`（`[443]` / `[3478]` / `[443, 3478]` のいずれも指定どおりに動作。
    複数指定時は全てのポートに問い合わせます）
- 非対応機能
  - simulcast
  - `LocalAudioStream.getAudioLevel` / `RemoteAudioStream.getAudioLevel`
    （Web Audio API に依存するため。呼び出すと `notSupportedInNodejs` エラーになります）
  - `SkyWayStreamFactory.enumerateDevices` などのデバイス列挙 API と `createDisplayStreams`
    （ブラウザのデバイス列挙・`getDisplayMedia` に依存するため）。
    Stream のソースは `registerMediaDevices` / `registerAudioTestSrc` / `registerVideoTestSrc`
    で登録してから `createMicrophoneAudioStream` / `createCameraVideoStream` を使います。
  - Analytics（統計情報の SkyWay サーバへの自動送信）。
    SkyWay の AnalyticsServer が Node.js からの WebSocket 接続を受け付けないため、
    トークンで `analytics: true` を指定しても Analytics セッションは作成されません。
    統計情報そのものは `Publication.getStats` / `Subscription.getStats` で取得できます。

## 使い方

- SFU: [./examples/sendrecv/audio.ts](./examples/sendrecv/audio.ts)
- P2P: [./examples/sendrecv/p2p.ts](./examples/sendrecv/p2p.ts)
- 統合 Room（P2P と SFU の同時利用 / `Member.side` / `rtcConfig.stunPorts`）:
  [./examples/sendrecv/unified_room.ts](./examples/sendrecv/unified_room.ts)

# SDK のインストール方法

ユーザアプリケーションで利用する際は NPM と CDN の 2 通りのインストール方法があります

## NPM を利用する場合

npm がインストールされている環境下で以下のコマンドを実行します。

```sh
npm install @shinyoshiaki/skyway-nodejs-sdk
```

また SkyWay Auth Token 用モジュールは次の HTML 記述および グローバル変数 `skyway_token` より取得することができます。

```html
<script src="https://cdn.jsdelivr.net/npm/@skyway-sdk/token/dist/skyway_token-latest.js"></script>
```

```js
const { SkyWayAuthToken, nowInSec, uuidV4 } = skyway_token;
```

# ドキュメント

## ユーザガイド

一部 API に対応していません。

[https://skyway.ntt.com/ja/docs/user-guide/javascript-sdk/](https://skyway.ntt.com/ja/docs/user-guide/javascript-sdk/)

## API リファレンス

一部 API に対応していません。

- [Room ライブラリ](https://javascript-sdk.api-reference.skyway.ntt.com/room)
- [Token ライブラリ](https://javascript-sdk.api-reference.skyway.ntt.com/token)

# サンプルアプリの起動方法

examples 配下にサンプルアプリケーションを同梱しております。

- examples ディレクトリ以下の任意のサンプルアプリのディレクトリに移動する
- そのディレクトリで以下のコマンドを実行する

```sh
npm i
npm run dev
```

- コマンドを実行するとローカルサーバが起動するので Web ブラウザでアクセスする

# リポジトリのセットアップ方法(ビルドのための環境構築)

以下はこのリポジトリを用いて利用者自身で SDK をビルドするために必要な手順です。なおこのリポジトリはモノリポジトリ構成であり、依存関係は pnpm の workspace によって管理されています。

## 初期設定時

- Node.js をインストールする（バージョンは v22.0.0 以降。upstream の要求に合わせています）
- examples の依存パッケージをインストール

```
sudo apt-get -y install build-essential git gobject-introspection libgirepository1.0-dev libcairo2 libcairo2-dev libavdevice-dev libavfilter-dev libopus-dev libvpx-dev pkg-config libsrtp2-dev libasound2-dev libgstreamer1.0-0 gstreamer1.0-plugins-base gstreamer1.0-plugins-good gstreamer1.0-plugins-bad gstreamer1.0-plugins-ugly gstreamer1.0-libav gstreamer1.0-tools gstreamer1.0-x gstreamer1.0-alsa gstreamer1.0-pulseaudio gir1.2-gstreamer-1.0
```

- corepack を有効化するために次のコマンドを実行する
  - `sudo corepack enable`
  - パッケージマネージャは `package.json` の `packageManager`（pnpm 11 系）に従います
- ルートディレクトリで次のコマンドを実行する

```sh
pnpm run first
```

`pnpm run first` は `submodule:init`（werift の `third_party/wpt` は除外）→
`submodule:patch` → `pnpm i` → `submodule:install` → `compile` を順に実行します。

`submodule:patch` は werift への fork 独自の修正（ICE restart / 複数 STUN サーバー対応）を
`patches/submodules/` から submodule の working tree に当てます。これらの修正は werift の
remote に push していないため、gitlink は remote から取得できる SHA のままにして、差分は
patch として本リポジトリで管理しています。冪等なので何度実行しても構いません。

patch を当てたファイルは `skip-worktree` が付いて submodule の `git status` に出なくなります
（うっかりコミットして gitlink を未公開 SHA に向けてしまうのを防ぐため）。patch を作り直す
ときは先に `pnpm run submodule:unpatch` で元に戻してください。詳細は `VERIFICATION.md` の
「submodule の扱い」を参照。

- `env.ts.template`を`env.ts`にリネームし、ファイル中の appId と secret にダッシュボードで発行した appId と secret を入力する
  - appId と secret の発行方法は[こちら](https://skyway.ntt.com/ja/docs/user-guide/javascript-sdk/quickstart/#199)

## 更新時

git で更新を同期した時や packages ディレクトリ以下のソースコードを編集した際にはルートディレクトリで以下のコマンドを実行する必要があります。

```sh
pnpm run compile
```

# サンプルアプリの起動方法

- examples ディレクトリ以下の任意のサンプルアプリのディレクトリに移動する
- そのディレクトリで以下のコマンドを実行する

  - `npm i`
  - `npm run dev`

# SDK のビルド方法

- 環境構築のセクションの作業を実施する
- ルートディレクトリで次のコマンドを実行する

```sh
pnpm run build
```

# 検証記録

v2.5.1 追従時の完了条件に対する検証結果（compile / tests/small / tests/large の実接続結果、
CI、examples での v2 API 動作確認、stunPorts の制限、submodule の扱い）は
[VERIFICATION.md](./VERIFICATION.md) にまとめています。

# License

- [LICENSE](/LICENSE)
- [THIRD_PARTY_LICENSE](/THIRD_PARTY_LICENSE)
