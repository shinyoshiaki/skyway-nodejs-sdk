import 'zx';
import { cd } from 'zx';

// `npm ci` は package-lock.json を書き換えないため、submodule の working tree が
// dirty にならない。dirty になると親リポジトリ側で "contains modified content" となり、
// CI の事前マージ（base branch のマージ）が失敗する。
cd('submodules/mediasoup');
cd('submodules/werift');
await $`npm ci`;

cd('../..');
await $`npm ci`;
