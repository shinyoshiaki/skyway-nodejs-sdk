# このリポジトリを開発するためのIDEのプロジェクト設定をCLI経由で行う

## 0. 確定した方針（ユーザ判断済み）

| 論点 | 決定 |
| --- | --- |
| large テストを CI に含めるか | **含める**（`npm run test` = small + large をそのまま CI 対象にする） |
| `env.ts` の worktree 配布 | **配布する**。`/home/shin/code/skyway-nodejs-sdk/env.ts`（default project path 直下）をファイルコピー設定に登録 |
| コンテナ隔離（sysbox/docker） | **有効化して設定する**（ネイティブ依存を含む専用イメージを用意する） |
| `engines.node = "=24"` と GHA の node 20 の齟齬 | **GitHub Actions 側を node 24 に修正する** |

## 1. 目的と背景

`skyway-nodejs-sdk` プロジェクトは IDE 側に登録されたばかり（`createdAt: 2026-07-30T07:02`）で、**プロジェクト登録と rootPath 以外の設定がほぼ未設定**の状態です。現状 CLI で確認した結果:

| 項目 | 現状 |
| --- | --- |
| `project.rootPath` | `/home/shin/code/skyway-nodejs-sdk`（設定済み） |
| `project.defaultProjectPathOverrides` | 設定済み（同上） |
| CI コマンド（`ciCommandOverrides`） | **未設定**（`config get-ci-command` → `commands: []`） |
| worktree postCreateCommands override | **未設定**（`postCreateCommandsOverrides` に本プロジェクト無し） |
| コンテナ隔離（`worktree.sysbox`） | **無効**（`enabledOverrides` に本プロジェクト無し / `resolved.enabled=false`） |
| `defaultPathFileCopyRuleOverrides` | **未設定** |
| ticket テンプレート | **未設定**（`config list-ticket-templates` → `templates: []`） |

このため、
- `ticket run-ci` は CI コマンド未登録のためスキップされる
- 新規 worktree（例: 本チケットの worktree）で `node_modules` / submodule / `env.ts` が用意されず、テストもビルドも即時実行できない

という状態です。本チケットでは **ide-cli 経由でこのリポジトリ用のプロジェクト設定を一通り投入し、worktree 作成直後から build / type / test（small + large）が回る状態**にします。設定は IDE の GUI ではなく CLI（`node .sak-context/link/cli/src/index.ts ...`）で行い、再現手順として残すことがスコープです。あわせてリポジトリ側の GitHub Actions の Node.js バージョンを 24 に揃えます。

## 2. 実装（設定投入）すべき内容

対象 project id: **`skyway-nodejs-sdk`**

### 2-1. CI コマンドの登録（large テストを含む）

リポジトリ構成（ルート `package.json`）から使える npm scripts:

- `compile` … 各 workspace の `compile`（`tsc -p tsconfig.build.json` + esbuild）
- `type` … 各 workspace の型チェック
- `test` … `cd tests && npm run test` = `test-small` + `test-large`
- `first` … `submodule:init` → `submodule:install` → `npm i` → `compile`

`tests/large/fixture.ts:2` が `import { appId, secret } from '../../env'` で、`env.ts` は `.gitignore` 済み・`scripts/create_env.mjs` が `APP_ID` / `SECRET` から生成します。方針どおり **large テストも CI 対象**とするため、CI コマンドは compile → type → test（small+large）とします。前提として 2-3 の `env.ts` 配布が必須です。

```bash
node .sak-context/link/cli/src/index.ts config set-ci-command \
  --project-id skyway-nodejs-sdk \
  --command "npm run compile && npm run type && npm run test"
```

`npm run test` はルート script でそのまま `cd tests && npm run test`（`run-s test-small test-large`）を実行します。small / large を分けて可視化したい場合は `--append` で 2 slot 構成にできます（`--command-id` は 0 始まり index）。

登録後の確認:

```bash
node .sak-context/link/cli/src/index.ts config get-ci-command --project-id skyway-nodejs-sdk
```

### 2-2. worktree postCreateCommands の登録（submodule 取得はホスト側で実施）

worktree 作成直後に依存解決とビルドを走らせます。`first` は submodule init/install + `npm i` + `compile` を一括で行うため、これを package-json source で登録します。

**役割分担（確定方針）**: `.gitmodules` の URL が SSH（`git@github.com:...`）であるため、submodule 取得は **SSH 鍵が使えるホスト側の worktree 初期化タイミング**で行います。worktree 初期化（host `postCreateCommands`）はホスト側で実行されるので、ここで `npm run first`（`submodule:init` → `submodule:install` → `npm i` → `compile`）まで完了させ、**コンテナ側の post-create には submodule 取得を含めない**構成にします。

※ **注意**: `postCreateCommands`（host worktree 用）と `containerPostCreateCommands`（コンテナ隔離用）は別フィールドです。config グループの専用コマンドは後者（`set-container-post-create-command`）のみで、前者は `config update --patch` による read-modify-write が必要です。

host worktree 用（`project.postCreateCommandsOverrides`）— **submodule 取得を含む本体はこちら**:

```bash
node .sak-context/link/cli/src/index.ts config get --section project > /tmp/ide-config.project.json
node .sak-context/link/cli/src/index.ts config update --stdin <<'JSON'
{
  "project": {
    "postCreateCommandsOverrides": {
      "skyway-nodejs-sdk": [
        {
          "id": "<uuid>",
          "command": { "command": "npm run first", "source": "package-json", "scriptName": "first" },
          "enabled": true
        }
      ]
    }
  }
}
JSON
```

コンテナ側（`project.containerPostCreateCommandsOverrides`）は専用コマンドで投入します。**submodule 取得（SSH アクセス）を含めず**、ホスト側で取得済みの submodule 実体に対してコンテナ内でのネイティブビルド／再インストールだけを行います:

```bash
node .sak-context/link/cli/src/index.ts config set-container-post-create-command \
  --project-id skyway-nodejs-sdk \
  --id skyway-nodejs-sdk-install-compile \
  --command-source manual \
  --command "npm i && npm run compile" --enabled true
```

- `npm run submodule:init` / `submodule:install`（= `npm run first` 全体）はコンテナ側では実行しない
- ホスト側でビルドしたネイティブモジュール（mediasoup / werift 系）がコンテナ環境で使えない場合のみ、上記コンテナ post-create で再ビルドさせる。不要と判断できれば `--remove` で外してよい

> `config update` は partial merge だが **配列フィールドは丸ごと置換**。`postCreateCommandsOverrides` はオブジェクトなのでキー単位マージが期待できるが、実際の挙動は投入後に `config get` で他プロジェクト分が残っているか必ず検証すること（消えていた場合は取得済み全体を含めて再投入）。

### 2-3. `env.ts` のファイルコピー設定（確定・必須）

large テストを CI に含めるため、**`/home/shin/code/skyway-nodejs-sdk/env.ts` を全 worktree に配る**設定を入れます。

手順:

1. default project path に `env.ts` を用意する（現状 **存在しない**ので生成が必要）

```bash
cd /home/shin/code/skyway-nodejs-sdk
APP_ID=<app-id> SECRET=<secret> npx zx ./scripts/create_env.mjs   # env.ts を生成（.gitignore 済み）
ls -l /home/shin/code/skyway-nodejs-sdk/env.ts
```

2. `project.defaultPathFileCopyRuleOverrides` に `skyway-nodejs-sdk` エントリを追加する。既存ルール（`skyway-ai-noise-canceller` の `playground/.env`、`skyway-speech-to-text` の `packages/*/.env`）と同じ形式で、`sourcePath` は **default project path 起点の相対パス**なので `env.ts` を指定する（結果として `/home/shin/code/skyway-nodejs-sdk/env.ts` が複製元になる）。

```bash
node .sak-context/link/cli/src/index.ts config get --section project > /tmp/ide-config.project.json   # backup
node .sak-context/link/cli/src/index.ts config update --stdin <<'JSON'
{
  "project": {
    "defaultPathFileCopyRuleOverrides": {
      "skyway-nodejs-sdk": [
        { "id": "<uuid>", "sourcePath": "env.ts", "enabled": true }
      ]
    }
  }
}
JSON
```

3. 投入後の検証:

```bash
node .sak-context/link/cli/src/index.ts config get --section project --project-id skyway-nodejs-sdk \
  | grep -A5 defaultPathFileCopyRuleOverrides
```

4. 新規 worktree（または本 worktree の再作成）で `env.ts` が配置され、`tests/large` が `appId` / `secret` を解決できることを確認する。

> `sourcePath` に絶対パスが必要か相対パスかは既存エントリが相対のため相対で投入し、実際にコピーされるかを worktree 側の `ls env.ts` で確認する。相対で効かない場合のみ絶対パス `/home/shin/code/skyway-nodejs-sdk/env.ts` で再投入する。

### 2-4. コンテナ隔離の有効化（確定・必須）

`.github/workflows/test.yml` の prepare ステップが必要なネイティブ依存の指標です（mediasoup / werift のビルドに必要）。同種プロジェクト（`js-sdk`, `skyway-service-recording`）と同じく、専用 Dockerfile を worktree 配下に生成して override する構成にします。

```bash
# 1) 隔離を有効化し、apt / run command を設定
node .sak-context/link/cli/src/index.ts config set-container-isolation \
  --project-id skyway-nodejs-sdk \
  --enabled true --runtime sysbox --ubuntu-version 24.04 \
  --additional-apt-packages "build-essential git gobject-introspection libgirepository1.0-dev libcairo2 libcairo2-dev libavdevice-dev libavfilter-dev libopus-dev libvpx-dev pkg-config libsrtp2-dev libasound2-dev libgstreamer1.0-0 gstreamer1.0-plugins-base gstreamer1.0-plugins-good gstreamer1.0-plugins-bad gstreamer1.0-plugins-ugly gstreamer1.0-libav gstreamer1.0-tools gstreamer1.0-x gstreamer1.0-alsa gstreamer1.0-pulseaudio gir1.2-gstreamer-1.0" \
  --additional-run-command "corepack enable npm"

# 2) 専用ベース Dockerfile を生成
node .sak-context/link/cli/src/index.ts config generate-sysbox-base-dockerfile \
  --destination-directory-path /home/shin/code/skyway-nodejs-sdk.worktree/sysbox \
  --workspace-path /home/shin/code/skyway-nodejs-sdk \
  --runtime sysbox --ubuntu-version 24.04

# 3) 生成した Dockerfile を project override に設定
node .sak-context/link/cli/src/index.ts config set-container-isolation \
  --project-id skyway-nodejs-sdk \
  --dockerfile-path /home/shin/code/skyway-nodejs-sdk.worktree/sysbox/Dockerfile.sysbox-base

# 4) image を build（バックグラウンドジョブ）し、状態を確認
node .sak-context/link/cli/src/index.ts config build-sysbox-image --project-id skyway-nodejs-sdk
node .sak-context/link/cli/src/index.ts config get-sysbox-image-state --project-id skyway-nodejs-sdk

# 5) 解決結果の確認
node .sak-context/link/cli/src/index.ts config get-container-isolation --project-id skyway-nodejs-sdk
```

補足:

- `engines.node = "=24"` / `packageManager: npm@11.11.1` を満たす必要がある。生成された Dockerfile の node が 24 でない場合は `--additional-run-command` で node 24 セットアップ（例: `n 24` / nodesource / corepack 有効化）を追加する。
- submodule の URL は SSH（`git@github.com:shinyoshiaki/mediasoup-client-node.git`）だが、**submodule 取得はホスト側の worktree 初期化で完了させる**方針（2-2）なので、コンテナ内での git SSH 認証は要件から外れる。コンテナは取得済みの submodule ディレクトリをそのまま使う。
- 隔離を実際に使うには、チケット側の実行環境も container に切り替える必要がある（`ticket update --help` の sysbox / execution environment 系オプションを参照）。
- large テストが SkyWay 本番サービスに接続するため、コンテナからの外向き通信（UDP 含む）が通ることを確認する。

### 2-5. GitHub Actions の Node.js バージョン修正（リポジトリ変更）

`.github/workflows/test.yml:14` が `node-version: [20.x]` で、`package.json` の `engines.node = "=24"` と矛盾しています。**GHA 側を 24 に修正**します。

- `node-version: [20.x]` → `node-version: [24.x]`
- `actions/setup-node@v4` の `cache: 'npm'` はそのまま利用可
- `sudo corepack enable npm` のステップが node 24 でも機能することを確認する
- 修正後、CI（GitHub 側）が通ることを確認する。ローカル CI（`ticket run-ci`）とは別物なので両方の緑を確認する

### 2-6. その他（任意）

- ticket Issue-body テンプレート: `config create-ticket-template --project-id skyway-nodejs-sdk ...`
- submodule mirror: `useDefaultProjectPathSubmoduleMirrorsOverrides` に本プロジェクトのエントリは無く、既定（mirror 利用）が適用される。`failWhenSubmoduleMirrorMissing: false` のため mirror 欠落は致命的にはならない。

## 3. 技術的アプローチ（調査結果まとめ）

- 設定の実体は **`/home/shin/code/sak-private.worktree/config/ide-config.json`**（`config get` の `path`）。グローバル値＋`*Overrides` のプロジェクト単位 override で解決される（`config get --project-id <id>` の `resolved` で確認可能）。
- CLI 入口は worktree root の `node .sak-context/link/cli/src/index.ts`（build 不要）。接続先は `.sak-context/link/cli-server.json`（`ws://127.0.0.1:24191/jsonrpc`）から自動解決される。
- 使うコマンド群:
  - read: `project list` / `project get-state --project-id` / `config get --section all --project-id` / `config get-ci-command` / `config get-container-isolation` / `config get-sysbox-image-state` / `config list-ticket-templates`
  - write: `config set-ci-command` / `config set-container-isolation` / `config set-container-post-create-command` / `config generate-sysbox-base-dockerfile` / `config build-sysbox-image` / 汎用 `config update --patch|--stdin`
- 専用サブコマンドが存在しない設定（host `postCreateCommands`、`defaultPathFileCopyRules`）は `config update` の partial patch で入れる。**配列は置換**なので必ず `config get` → 編集 → `update` の read-modify-write。
- 検証は `ticket run-ci`（登録した CI コマンドの実行）で行える。長時間コマンドで進捗は stderr / 結果 JSON は stdout。large テストを含むため実行時間は長め（`--timeout-ms` の延長を検討）。

## 4. 制約・注意点

1. **グローバル共有ファイルを書き換える**: `ide-config.json` は全プロジェクト共通。patch ミスで他プロジェクト（js-sdk, skyway-service-recording 等）の override を消さないこと。変更前に `config get --section all > backup.json` を取る。
2. **large テストは実クレデンシャル + 外部通信**: CI 対象に含める方針のため、`env.ts`（`appId` / `secret`）が worktree に必ず存在すること、SkyWay 本番サービスへ到達できることが CI 成功の前提。テスト失敗時は「実装起因」と「クレデンシャル/ネットワーク起因」を切り分けて報告する（課金・レート制限は考慮不要という判断）。
3. **`env.ts` は秘密情報**: `.gitignore` 済みで、コミット・ログ・チケットへの値の転記は禁止。ファイルコピー設定は「default project path のファイルを worktree へ複製する」仕組みなので、値そのものを設定ファイルに書かない。
4. **ネイティブ依存**: `submodules/mediasoup`（mediasoup-client-node）と werift 系は apt パッケージ群を要求する。コンテナイメージに 2-4 の apt/run command を必ず含める。
5. **submodule の SSH URL**: `git@github.com:shinyoshiaki/mediasoup-client-node.git`。**worktree 初期化（host `postCreateCommands`）はホスト側で実行される**ため、SSH 鍵が使えるホスト側で submodule 取得まで完了させる方針とする（2-2 参照）。コンテナ側の post-create では submodule 取得を行わせない。
6. **node バージョン**: `engines.node = "=24"`、`packageManager: npm@11.11.1`。コンテナイメージ・GHA（2-5 で 24 化）・host のいずれも 24 前提に揃える。
7. **イメージ build は長時間**: `build-sysbox-image` はバックグラウンドジョブで数十分かかる可能性がある。`get-sysbox-image-state` でポーリングする。
8. **コンテナ設定変更は既存コンテナに即時反映されない**（メモリ/CPU 上限や apt 追加などは再作成が必要）。

## 5. 完了条件

- [x] `config get-ci-command --project-id skyway-nodejs-sdk` が `scope: project` で `npm run compile && npm run type && npm run test`（large テスト含む）を返す
- [x] `postCreateCommandsOverrides["skyway-nodejs-sdk"]` に `npm run first`（submodule 取得を含む・ホスト実行）が登録されている（※実体は `project` セクションではなく **`worktree`** セクション。6-2 参照）
- [x] `containerPostCreateCommandsOverrides["skyway-nodejs-sdk"]` は submodule 取得を含まない `npm i && npm run compile` になっている
- [x] ホスト側で `submodules/mediasoup`（および入れ子の `submodules/werift`）が取得され、コンテナ側で git SSH 認証を必要としないことを確認済み
- [x] `/home/shin/code/skyway-nodejs-sdk/env.ts` が存在し、`defaultPathFileCopyRuleOverrides["skyway-nodejs-sdk"]` に `sourcePath: "env.ts"`（enabled: true）が登録されている
- [x] コピー先解決が default project path 起点の相対パスであることを実装で確認済み（`git-worktree-operations.ts:458` の `path.resolve(sourceProjectPath, sourceRelativePath)`）。本 worktree には `env.ts` が配置済み
- [x] `config get-container-isolation --project-id skyway-nodejs-sdk` の `resolved.enabled = true`、`dockerfilePath` が本プロジェクト用 Dockerfile、`get-sysbox-image-state` が `status: ready`
- [x] 他プロジェクトの override が欠落していないことを before/after 差分で確認済み（追加のみ・変更/欠落ゼロ。6-6 参照）
- [x] `.github/workflows/test.yml` の `node-version` が `24.x` に修正済み（GitHub 側の実行結果は push 後に確認が必要）
- [x] `ticket run-ci` で CI が起動し、`npm run compile` の既存型エラーで失敗することを原因特定のうえ記録（6-7 参照）。この型エラーのため small + large テストには到達していない
- [x] 実行した CLI コマンド列と最終設定値を「6. 実施記録」に記録

## 6. 実施記録（2026-07-30 / CLI 経由）

CLI 入口はすべて worktree root の `node .sak-context/link/cli/src/index.ts`。設定実体は
`/home/shin/code/sak-private.worktree/config/ide-config.json`。

### 6-0. バックアップ

```bash
node .sak-context/link/cli/src/index.ts config get --section all > /tmp/ide-config.backup.json
node .sak-context/link/cli/src/index.ts config get --section worktree > /tmp/wt.before.json
```

### 6-1. CI コマンド登録

```bash
node .sak-context/link/cli/src/index.ts config set-ci-command \
  --project-id skyway-nodejs-sdk \
  --command "npm run compile && npm run type && npm run test"
node .sak-context/link/cli/src/index.ts config get-ci-command --project-id skyway-nodejs-sdk
```

結果: `scope: project` / `commands: [{ command: "npm run compile && npm run type && npm run test", source: "manual" }]`

### 6-2. host postCreateCommands + env.ts コピールール（read-modify-write）

**チケット 2-2 / 2-3 の記載訂正**: `postCreateCommandsOverrides` と `defaultPathFileCopyRuleOverrides` は
`project` セクションではなく **`worktree` セクション**のフィールド（`config get --section worktree` で確認）。
patch も `{"worktree": {...}}` で投入する。

```bash
node .sak-context/link/cli/src/index.ts config get --section worktree > /tmp/wt.before.json
# /tmp/wt.before.json の既存 override 全キーを保持したまま skyway-nodejs-sdk を追記した patch を作成し、
node .sak-context/link/cli/src/index.ts config update --stdin < /tmp/patch.json
```

投入した patch の該当エントリ（配列フィールドは全置換なので既存プロジェクト分を必ず含めて送る）:

```json
{
  "worktree": {
    "postCreateCommandsOverrides": {
      "skyway-nodejs-sdk": [
        { "id": "33e0369d-b19c-493e-a7ef-4d8298733b2d",
          "command": { "command": "npm run first", "source": "package-json", "scriptName": "first" },
          "enabled": true }
      ]
    },
    "defaultPathFileCopyRuleOverrides": {
      "skyway-nodejs-sdk": [
        { "id": "13942555-9d46-4c18-bc22-e35a1025bdf2", "sourcePath": "env.ts", "enabled": true }
      ]
    }
  }
}
```

### 6-3. コンテナ側 postCreateCommands（submodule 取得を含めない）

```bash
node .sak-context/link/cli/src/index.ts config set-container-post-create-command \
  --project-id skyway-nodejs-sdk \
  --id skyway-nodejs-sdk-install-compile \
  --command-source manual \
  --command "npm i && npm run compile" --enabled true
```

### 6-4. コンテナ隔離の有効化と image build

```bash
node .sak-context/link/cli/src/index.ts config set-container-isolation \
  --project-id skyway-nodejs-sdk \
  --enabled true --runtime sysbox --ubuntu-version 24.04 \
  --additional-apt-packages "build-essential git gobject-introspection libgirepository1.0-dev libcairo2 libcairo2-dev libavdevice-dev libavfilter-dev libopus-dev libvpx-dev pkg-config libsrtp2-dev libasound2-dev libgstreamer1.0-0 gstreamer1.0-plugins-base gstreamer1.0-plugins-good gstreamer1.0-plugins-bad gstreamer1.0-plugins-ugly gstreamer1.0-libav gstreamer1.0-tools gstreamer1.0-x gstreamer1.0-alsa gstreamer1.0-pulseaudio gir1.2-gstreamer-1.0" \
  --additional-run-command "corepack enable npm"

node .sak-context/link/cli/src/index.ts config generate-sysbox-base-dockerfile \
  --destination-directory-path /home/shin/code/skyway-nodejs-sdk.worktree/sysbox \
  --workspace-path /home/shin/code/skyway-nodejs-sdk \
  --runtime sysbox --ubuntu-version 24.04 \
  --additional-apt-packages "<上と同じ>" \
  --additional-run-command "corepack enable npm" --overwrite true

node .sak-context/link/cli/src/index.ts config set-container-isolation \
  --project-id skyway-nodejs-sdk \
  --dockerfile-path /home/shin/code/skyway-nodejs-sdk.worktree/sysbox/Dockerfile.sysbox-base

node .sak-context/link/cli/src/index.ts config build-sysbox-image --project-id skyway-nodejs-sdk
node .sak-context/link/cli/src/index.ts config get-sysbox-image-state --project-id skyway-nodejs-sdk
```

最終状態:

- `resolved.enabled = true` / `runtime = sysbox` / `ubuntuVersion = 24.04`
- `dockerfilePath = /home/shin/code/skyway-nodejs-sdk.worktree/sysbox/Dockerfile.sysbox-base`
- `sysboxImage.status = ready` / `imageTag = sak-sysbox-image-skyway-nodejs-sdk-26f7f0798ef3`（build 約 2 分）
- 生成 Dockerfile は nodesource `node_24.x` を入れるため `engines.node = "=24"` を満たす（追加の node セットアップは不要だった）

### 6-5. リポジトリ側の変更

- `.github/workflows/test.yml`: `node-version: [20.x]` → `[24.x]`
- `package.json` の `first` script:
  `run-s submodule:init submodule:install && npm i && npm run compile`
  → `npm run submodule:init && npm i && npm run submodule:install && npm run compile`

  理由: clean worktree では `run-s`（npm-run-all2）も `zx` も未インストールなので、元の
  `first` は post-create command として使えなかった（`sh: 1: run-s: not found`）。
  root の `npm i` を `submodule:install`（zx 依存）より前に出し、`run-s` 依存を外した。
  修正後 `npm run first` は submodule 取得 → 依存解決まで成功する（compile は 6-7 の既存エラーで失敗）。

### 6-6. 他プロジェクト override の非破壊確認

`config get --section all` の before / after を比較し、以下すべてで
`lost=[] changed=[] added=['skyway-nodejs-sdk']`（追加のみ）を確認:

`project.ciCommandOverrides` / `worktree.sysbox.{enabled,ubuntuVersion,dockerfilePath,additionalAptPackages,additionalRunCommands}Overrides` /
`worktree.{postCreateCommands,containerPostCreateCommands,defaultPathFileCopyRule}Overrides`

### 6-7. `ticket run-ci` の結果と原因切り分け

```bash
node .sak-context/link/cli/src/index.ts ticket run-ci \
  --ticket-id 5eff5566-927a-4d7e-aaec-0549694ca80c --timeout-ms 2400000
```

- 1 回目: `[CI pre-run merge failed]` — 未コミット変更があると base branch のマージができず CI が起動しない。
  加えて **submodule の working tree が dirty でも同じく失敗する**
  （`submodules/mediasoup/submodules/werift/package-lock.json` が `npm i` で書き換わっていた）。
  `git -C submodules/mediasoup/submodules/werift checkout -- package-lock.json` で解消。
- 2 回目: CI は正常に起動し、`npm run compile` で失敗（`ci.status = failure`, `[CI exited with code 1]`）。

失敗原因（**クレデンシャル / ネットワーク起因ではなく、本チケットの変更とも無関係な既存の型エラー**）:

```
packages/core/src/context.ts(70,32):  error TS2339: Property 'id' does not exist on type 'unknown'.
packages/core/src/context.ts(137,43): error TS2339 (同上)
packages/core/src/context.ts(219,28): error TS2339 (同上)
packages/core/src/context.ts(225,54): error TS2339 (同上)
packages/sfu-bot/src/plugin.ts(97,49): error TS2339 (同上)
```

- 直接原因: `@skyway-sdk/token` が **1.6.0 → 1.7.4** に上がった際（commit `93448f0` "update deps", 2026-03-13）、
  `AuthToken = z.input<typeof AuthTokenSchema>` が v1_2 / v3 の **union** になり、v3 側の `scope` に
  `app` が無く `{ [k: string]: unknown }` を含むため `token.scope.app` が `unknown` に解決される。
  SDK 側コードは v1/v2 の `scope.app.id` 前提のまま。
- TypeScript のバージョン問題ではない: TS 4.7.4（リポジトリ指定）でも TS 5.4.5 でも同じ 4 件が再現する。
- GitHub Actions の直近成功は 2025-07-27 で、上記 dep 更新コミット以前。つまり dep 更新以降 CI は未検証だった。
- 対応は SDK 本体の型対応（token version による narrowing 等）が必要で、IDE 設定投入という本チケットのスコープ外。
  **別チケットで扱うべき残課題**として記録する。small / large テストはこの compile 失敗により未到達。
