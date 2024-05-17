# SkyWay NodeJS-SDK

SkyWay JS-SDK を Node.js に非公式に対応させた SDK です。
JS-SDK と API はほとんど同じですが、一部機能に対応していません。

# サンプルコード

- https://github.com/shinyoshiaki/skyway-nodejs-sdk/tree/nodejs/examples
- https://github.com/shinyoshiaki/skyway-nodejs-playground

# skyway-js-sdk との違い

- 提供パッケージ
  - room
- 対応動作環境
  - Node.js
- 対応通信方法
  - SFU
- 対応コーデック
  - opus
  - vp8
  - h264
- 非対応機能
  - getStats
  - restartIce
  - simulcast

# SDK のインストール方法

## NPM を利用する場合

npm がインストールされている環境下で以下のコマンドを実行します

**Room ライブラリ**

```sh
npm install @shinyoshiaki/skyway-nodejs-sdk
```

# ドキュメント

## ユーザガイド

一部 API に対応していません。

[https://skyway.ntt.com/ja/docs/user-guide/javascript-sdk/](https://skyway.ntt.com/ja/docs/user-guide/javascript-sdk/)

## API リファレンス

一部 API に対応していません。

- [Room ライブラリ](https://javascript-sdk.api-reference.skyway.ntt.com/room)

# 環境構築

このリポジトリのサンプルアプリを起動したり、SDK をビルドするために必要な手順。

## 初期設定時

- Node.js をインストールする（バージョンは v16.17.1 以降）
- examples の依存パッケージをインストール

```
sudo apt-get -y install build-essential git gobject-introspection libgirepository1.0-dev libcairo2 libcairo2-dev libavdevice-dev libavfilter-dev libopus-dev libvpx-dev pkg-config libsrtp2-dev libasound2-dev libgstreamer1.0-0 gstreamer1.0-plugins-base gstreamer1.0-plugins-good gstreamer1.0-plugins-bad gstreamer1.0-plugins-ugly gstreamer1.0-libav gstreamer1.0-tools gstreamer1.0-x gstreamer1.0-alsa gstreamer1.0-pulseaudio gir1.2-gstreamer-1.0
```

- corepack を有効化するために次のコマンドを実行する
  - `corepack enable npm`
- ルートディレクトリで次のコマンドを実行する
  - `git submodule update --init --recursive`
  - `npm run first`
- `env.ts.template`を`env.ts`にリネームし、ファイル中の appId と secret にダッシュボードで発行した appId と secret を入力する
  - appId と secret の発行方法は[こちら](https://skyway.ntt.com/ja/docs/user-guide/javascript-sdk/quickstart/#199)

## 更新時

git で更新を同期した時や packages ディレクトリ以下のソースコードを編集した際にはルートディレクトリで以下のコマンドを実行する必要がある。

```sh
npm run compile
```

# サンプルアプリの起動方法

- 環境構築のセクションの作業を実施する
- examples ディレクトリ以下の任意のサンプルアプリのディレクトリに移動する
- そのディレクトリで以下のコマンドを実行する

  - `npm run dev`

# SDK のビルド方法

- 環境構築のセクションの作業を実施する
- ルートディレクトリで次のコマンドを実行する
  - `npm run build`

# License

- [LICENSE](/LICENSE)
- [THIRD_PARTY_LICENSE](/THIRD_PARTY_LICENSE)
