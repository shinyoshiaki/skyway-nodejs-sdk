#!/usr/bin/env zx
/* eslint-disable no-undef */
/* eslint-disable @typescript-eslint/no-var-requires */

import { appendLicenses, createLicenses } from '../../bundler/license.mjs';
const pkg = require('./package.json');

fs.writeFile(
  './src/version.ts',
  `export const PACKAGE_VERSION = '${pkg.version}';\n`
);

const globalName = 'skyway_sfu_bot';
const dist = 'dist';

await $`npm run compile`;

await $`cp -r ../../bundler/shims ./ `;

await $`esbuild src/index.ts --bundle --platform=node --inject:./shims/process.js --format=esm --target=es2020 --outfile=${dist}/index.mjs`;
await $`esbuild src/index.ts --bundle --platform=node --inject:./shims/process.js --format=iife --global-name=${globalName} --target=es2020 --outfile=${dist}/${globalName}-latest.js`;

// const licenses = await createLicenses();
// await appendLicenses(`${dist}/index.mjs`, licenses);
// await appendLicenses(`${dist}/${globalName}-latest.js`, licenses);

await $`cp ${dist}/${globalName}-latest.js ${dist}/${globalName}-${pkg.version}.js`;

await $`rm -rf ./shims`;
