import 'zx';
import { cd } from 'zx';

cd('submodules/mediasoup');
cd('submodules/werift');
await $`npm i`;

cd('../..');
await $`npm i`;
