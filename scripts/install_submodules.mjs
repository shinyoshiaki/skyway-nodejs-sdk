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
await $`npm ci`;
