import 'zx';
import { $, fs, path } from 'zx';

// submodules/mediasoup（mediasoup-client-node）と、その中の werift に対する
// fork 独自の修正を patch として当てる。
//
// Why: これらの修正は upstream の submodule リポジトリに push していないため、
// gitlink を独自コミットに向けると fresh checkout / CI で取得できなくなる。
// gitlink は remote から取得できる SHA のままにし、差分は本リポジトリの
// patches/ で管理することで、clone 直後でも再現できるようにする。
const patches = [
  {
    patch: 'patches/submodules/werift-multiple-stun-servers.patch',
    cwd: 'submodules/mediasoup/submodules/werift',
  },
  {
    patch: 'patches/submodules/mediasoup-client-node-werift-getstats.patch',
    cwd: 'submodules/mediasoup',
  },
];

// submodule の git dir はホスト/コンテナで解決が異なるため、親から継承した
// GIT_DIR / GIT_WORK_TREE が混ざると別リポジトリを触ってしまう。明示的に外す。
for (const key of ['GIT_DIR', 'GIT_COMMON_DIR', 'GIT_WORK_TREE', 'GIT_INDEX_FILE']) {
  delete process.env[key];
}

$.verbose = false;

const repoRoot = process.cwd();
let failed = false;

for (const { patch, cwd } of patches) {
  const patchPath = path.join(repoRoot, patch);
  if (!fs.existsSync(patchPath)) {
    console.error(`✗ patch not found: ${patch}`);
    failed = true;
    continue;
  }
  if (!fs.existsSync(path.join(repoRoot, cwd, '.git'))) {
    console.error(
      `✗ submodule not initialized: ${cwd} (run \`pnpm run submodule:init\` first)`
    );
    failed = true;
    continue;
  }

  const target = path.join(repoRoot, cwd);

  // 既に適用済みなら何もしない（逆方向に当てられる = 適用済み）
  // まだ当たっていない場合は当然失敗するので、この判定の出力は捨てる
  const alreadyApplied = await $({
    cwd: target,
    nothrow: true,
    quiet: true,
  })`git apply --reverse --check ${patchPath}`;
  if (alreadyApplied.exitCode === 0) {
    console.log(`- already applied: ${patch}`);
    continue;
  }

  const applied = await $({
    cwd: target,
    nothrow: true,
    quiet: true,
  })`git apply ${patchPath}`;
  if (applied.exitCode !== 0) {
    console.error(`✗ failed to apply ${patch} in ${cwd}`);
    console.error(applied.stderr);
    failed = true;
    continue;
  }
  console.log(`✓ applied: ${patch}`);
}

if (failed) {
  process.exit(1);
}
