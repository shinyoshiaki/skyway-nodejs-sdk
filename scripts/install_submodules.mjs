import 'zx';
import { cd } from 'zx';

cd('submodules/mediasoup');
await $`npm i`;

cd('submodules/werift');
await $`npm i`;
