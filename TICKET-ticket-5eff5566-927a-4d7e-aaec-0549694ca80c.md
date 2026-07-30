# このリポジトリを開発するためのIDEのプロジェクト設定をCLI経由で行う

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

という状態です。本チケットでは **ide-cli 経由でこのリポジトリ用のプロジェクト設定を一通り投入し、worktree 作成直後から build / type / test が回る状態**にします。設定は IDE の GUI ではなく CLI（`node .sak-context/link/cli/src/index.ts ...`）で行い、再現手順として残すことがスコープです。

## 2. 実装（設定投入）すべき内容

対象 project id: **`skyway-nodejs-sdk`**

### 2-1. CI コマンドの登録（必須）

リポジトリ構成（ルート `package.json`）から使える npm scripts:

- `compile` … 各 workspace の `compile`（`tsc -p tsconfig.build.json` + esbuild）
- `type` … 各 workspace の型チェック
- `test` … `cd tests && npm run test` = `test-small` + `test-large`
- `first` … `submodule:init` → `submodule:install` → `npm i` → `compile`

`tests/large/fixture.ts:2` が `import { appId, secret } from '../../env'` で、`env.ts` は `.gitignore` 済み・`scripts/create_env.mjs` が `APP_ID` / `SECRET` から生成します。**large テストは実クレデンシャルと SkyWay サーバへの通信が必要**なので、既定 CI からは外し、small テストまでを CI とするのを推奨します（採用方針は「4. 制約」参照）。

```bash
node .sak-context/link/cli/src/index.ts config set-ci-command \
  --project-id skyway-nodejs-sdk \
  --command "npm run compile && npm run type && cd tests && npm run test-small"
```

必要なら `--append` で 2 本目（large テスト）を `--enabled false` 相当で持たせるのではなく、別 slot として追加し、通常は無効にしておく運用も可能（`--command-id` は 0 始まり index、`--enabled false` + `--command-id` で slot 削除）。

登録後の確認:

```bash
node .sak-context/link/cli/src/index.ts config get-ci-command --project-id skyway-nodejs-sdk
```

### 2-2. worktree postCreateCommands の登録（必須）

worktree 作成直後に依存解決とビルドを走らせます。`first` は submodule init/install + `npm i` + `compile` を一括で行うため、これを package-json source で登録します。

```bash
node .sak-context/link/cli/src/index.ts config set-container-post-create-command --help   # 仕様確認（コンテナ側）
```

※ **注意**: `postCreateCommands`（host worktree 用）と `containerPostCreateCommands`（コンテナ隔離用）は別フィールドです。config グループの専用コマンドは後者（`set-container-post-create-command`）のみで、前者は `config update --patch` による read-modify-write が必要です。

host worktree 用（`project.postCreateCommandsOverrides`）の投入例（既存値を壊さないよう read-modify-write）:

```bash
node .sak-context/link/cli/src/index.ts config get --section project > /tmp/ide-config.project.json
# postCreateCommandsOverrides に skyway-nodejs-sdk エントリを追加した patch を作る
node .sak-context/link/cli/src/index.ts config update --stdin <<'JSON'
{
  "project": {
    "postCreateCommandsOverrides": {
      "...既存の全プロジェクト分をそのまま含める...": [],
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

> `config update` は partial merge だが **配列フィールドは丸ごと置換**。`postCreateCommandsOverrides` はオブジェクトなのでキー単位マージが期待できるが、実際の挙動は投入後に `config get` で他プロジェクト分が残っているか必ず検証すること（消えていた場合は取得済み全体を含めて再投入）。

### 2-3. `env.ts` の worktree への配り込み（推奨）

`env.ts` は gitignore 対象で、**default project path（`/home/shin/code/skyway-nodejs-sdk`）にも現在存在しない**。large テストを回す前提なら:

1. default project path で `APP_ID=... SECRET=... npx zx ./scripts/create_env.mjs` を実行して `env.ts` を生成
2. `project.defaultPathFileCopyRuleOverrides` に `skyway-nodejs-sdk: [{ id, sourcePath: "env.ts", enabled: true }]` を追加（`skyway-speech-to-text` / `skyway-ai-noise-canceller` の `.env` ルールと同じ形式）
3. 専用 CLI コマンドは無いので `config update --patch` / `--stdin` で投入

### 2-4. コンテナ隔離（sysbox / docker）— 任意・要判断

有効化する場合に必要な設定は、`.github/workflows` の prepare ステップがそのまま指標になります（mediasoup / werift のネイティブビルド依存）:

```bash
node .sak-context/link/cli/src/index.ts config set-container-isolation \
  --project-id skyway-nodejs-sdk \
  --enabled true --ubuntu-version 24.04 \
  --additional-apt-packages "build-essential git gobject-introspection libgirepository1.0-dev libcairo2 libcairo2-dev libavdevice-dev libavfilter-dev libopus-dev libvpx-dev pkg-config libsrtp2-dev libasound2-dev libgstreamer1.0-0 gstreamer1.0-plugins-base gstreamer1.0-plugins-good gstreamer1.0-plugins-bad gstreamer1.0-plugins-ugly gstreamer1.0-libav gstreamer1.0-tools gstreamer1.0-x gstreamer1.0-alsa gstreamer1.0-pulseaudio gir1.2-gstreamer-1.0" \
  --additional-run-command "corepack enable npm"
# 必要なら専用 Dockerfile を生成して dockerfilePath override を設定
node .sak-context/link/cli/src/index.ts config generate-sysbox-base-dockerfile \
  --destination-directory-path /home/shin/code/skyway-nodejs-sdk.worktree/sysbox --ubuntu-version 24.04
node .sak-context/link/cli/src/index.ts config set-container-isolation \
  --project-id skyway-nodejs-sdk \
  --dockerfile-path /home/shin/code/skyway-nodejs-sdk.worktree/sysbox/Dockerfile.sysbox-base
node .sak-context/link/cli/src/index.ts config build-sysbox-image --project-id skyway-nodejs-sdk
node .sak-context/link/cli/src/index.ts config get-sysbox-image-state --project-id skyway-nodejs-sdk
```

`package.json` の `engines.node = "=24"` なので、共有ベース Dockerfile の node が 24 でない場合は `--additional-run-command` で node 24 を用意する必要があります。**イメージ build は数十分かかるため、隔離が本当に必要かはユーザ判断**（未判断なら 2-1〜2-3 のみ実施し、本節は保留として明記する）。

### 2-5. その他（任意）

- ticket Issue-body テンプレート: `config create-ticket-template --project-id skyway-nodejs-sdk ...`
- submodule mirror: `useDefaultProjectPathSubmoduleMirrorsOverrides` に本プロジェクトのエントリは無く、既定（mirror 利用）が適用される。`.gitmodules` の URL は `git@github.com:...`（SSH）なので、mirror が効かない環境では submodule 取得に SSH 鍵が必要。`failWhenSubmoduleMirrorMissing: false` のため mirror 欠落は致命的にはならない。

## 3. 技術的アプローチ（調査結果まとめ）

- 設定の実体は **`/home/shin/code/sak-private.worktree/config/ide-config.json`**（`config get` の `path`）。グローバル値＋`*Overrides` のプロジェクト単位 override で解決される（`config get --project-id <id>` の `resolved` で確認可能）。
- CLI 入口は worktree root の `node .sak-context/link/cli/src/index.ts`（build 不要）。接続先は `.sak-context/link/cli-server.json`（`ws://127.0.0.1:24191/jsonrpc`）から自動解決される。
- 使うコマンド群:
  - read: `project list` / `project get-state --project-id` / `config get --section all --project-id` / `config get-ci-command` / `config get-container-isolation` / `config list-ticket-templates`
  - write: `config set-ci-command` / `config set-container-isolation` / `config set-container-post-create-command` / `config generate-sysbox-base-dockerfile` / `config build-sysbox-image` / 汎用 `config update --patch|--stdin`
- 専用サブコマンドが存在しない設定（host `postCreateCommands`、`defaultPathFileCopyRules`）は `config update` の partial patch で入れる。**配列は置換**なので必ず `config get` → 編集 → `update` の read-modify-write。
- 検証は `ticket run-ci`（登録した CI コマンドの実行）で行える。長時間コマンドで進捗は stderr / 結果 JSON は stdout。

## 4. 制約・注意点

1. **グローバル共有ファイルを書き換える**: `ide-config.json` は全プロジェクト共通。patch ミスで他プロジェクト（js-sdk, skyway-service-recording 等）の override を消さないこと。変更前に `config get --section all > backup.json` を取る。
2. **large テストは外部依存**: `tests/large` は `env.ts` の `appId`/`secret` と SkyWay 本番サービスへの接続が必要。既定 CI に入れると常時課金・不安定化するため、CI は compile + type + small を基本とする（この前提で進め、方針変更が必要ならユーザ判断を仰ぐ）。
3. **ネイティブ依存**: `submodules/mediasoup`（mediasoup-client-node）と werift 系は apt パッケージ群を要求する。host 実行なら既存環境に依存、コンテナ隔離を有効化する場合は 2-4 の apt/run command が必須。
4. **submodule の SSH URL**: `git@github.com:shinyoshiaki/mediasoup-client-node.git`。認証が通らない環境では `npm run first` の submodule ステップが失敗する。
5. **node バージョン**: `engines.node = "=24"`、`packageManager: npm@11.11.1`。CI/コンテナともこの前提を満たす必要がある。GitHub Actions 側は node 20 のままなので、齟齬に注意（本チケットではリポジトリ側 CI 定義は変更しない）。
6. **リポジトリのコード変更は原則不要**: 本チケットは IDE 側設定の投入が成果物。リポジトリに残すのは（必要なら）手順ドキュメントのみ。
7. **メモリ/CPU 上限やコンテナ設定変更は既存コンテナに即時反映されない**（再作成が必要）。

## 5. 完了条件

- [ ] `config get-ci-command --project-id skyway-nodejs-sdk` が `scope: project` で意図した CI コマンドを返す
- [ ] `config get --section project` で `postCreateCommandsOverrides["skyway-nodejs-sdk"]` に有効な依存解決/ビルドコマンドが登録されている
- [ ] 上記 patch 投入後も他プロジェクトの override（`ciCommandOverrides` / `postCreateCommandsOverrides` / `defaultPathFileCopyRuleOverrides` など）が欠落していないことを `config get` で確認済み
- [ ] `env.ts` の配り込み方針が決定され、必要なら `defaultPathFileCopyRuleOverrides` に登録されている（不要と判断した場合は理由を記載）
- [ ] コンテナ隔離は「有効化して image build 成功（`get-sysbox-image-state` が success）」または「今回は無効のまま／保留」のいずれかが明示されている
- [ ] `ticket run-ci`（または登録コマンドの手動実行）で CI が起動し、結果（成功／既知の失敗理由）が報告されている
- [ ] 実行した CLI コマンド列と最終設定値が本チケットに記録され、再現可能になっている
