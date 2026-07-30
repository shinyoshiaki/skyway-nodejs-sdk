import 'zx';
import { cd } from 'zx';

// submodule は親リポジトリ (pnpm) とは独立に npm で管理されている。
// `/workspace/package.json` の `packageManager: pnpm` を corepack が拾ってしまい
// submodule 内の `npm ci` が "This project is configured to use pnpm" で拒否される
// ため、submodule 側では corepack の strict チェックを無効化する。
process.env.COREPACK_ENABLE_STRICT = '0';

// `npm ci` は package-lock.json を書き換えないため、submodule の working tree が
// dirty にならない。dirty になると親リポジトリ側で "contains modified content" となり、
// CI の事前マージ（base branch のマージ）が失敗する。
cd('submodules/mediasoup');
cd('submodules/werift');
await $`npm ci`;

cd('../..');
// mediasoup submodule（パッケージ名は msc-node）の prepare は自身の dist を tsc で
// ビルドするが、本 SDK は dist ではなく src を直接 import するため不要。
// しかも fresh checkout では submodules/werift/node_modules 配下の第三者型定義
// （@types/dom-webcodecs / mediabunny）が prepare の tsc 設定（skipLibCheck 無効）で
// エラーになり npm ci 全体が失敗する。依存の取得だけが目的なのでスクリプトは実行しない。
await $`npm ci --ignore-scripts`;
