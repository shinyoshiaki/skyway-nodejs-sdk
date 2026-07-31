import 'zx';
import { $, fs, path } from 'zx';

// submodule（werift）に対する fork 独自の修正を patch として当てる。
//
// Why: これらの修正は werift / mediasoup-client-node の remote に push していない。
// gitlink を未公開のローカルコミットに向けると fresh checkout / CI で取得できないため、
// gitlink は remote から取得できる SHA のままにし、差分は本リポジトリの patches/ で
// 管理する。これで clone 直後でも `submodule:init` → `submodule:patch` で同じ状態になる。
const patches = [
  {
    patch: 'patches/submodules/werift-ice-restart-and-multiple-stun.patch',
    cwd: 'submodules/mediasoup/submodules/werift',
    // この patch が前提とする submodule の SHA（remote から取得できるもの）
    base: 'd782a54395552e594a6c36cd06430c8224b3096e',
    // patch を当てた werift は常に dirty になる。親（mediasoup）側で dirty を
    // 無視させないと、submodule を再帰的に commit する類のツールが patch を
    // werift のローカルコミットに変えてしまい、mediasoup の gitlink が
    // 未公開 SHA を指して fresh checkout / CI で取得できなくなる。
    // 親の .gitmodules は upstream 管理なので clone ローカルの config に書く。
    ignoreDirtyIn: {
      repo: 'submodules/mediasoup',
      submodule: 'submodules/werift',
    },
  },
];

// submodule の git dir はホスト/コンテナで解決が異なるため、親から継承した
// GIT_DIR / GIT_WORK_TREE が混ざると別リポジトリを触ってしまう。明示的に外す。
for (const key of [
  'GIT_DIR',
  'GIT_COMMON_DIR',
  'GIT_WORK_TREE',
  'GIT_INDEX_FILE',
]) {
  delete process.env[key];
}

$.verbose = false;

const repoRoot = process.cwd();
let failed = false;

// patch 由来の dirty を親 submodule 側で無視させる（理由は patches の定義を参照）。
async function ignoreDirty(ignoreDirtyIn) {
  if (!ignoreDirtyIn) return;
  const { repo, submodule } = ignoreDirtyIn;
  await $({ cwd: path.join(repoRoot, repo), nothrow: true, quiet: true })`
    git config submodule.${submodule}.ignore dirty`;
}

for (const { patch, cwd, base, ignoreDirtyIn } of patches) {
  const patchPath = path.join(repoRoot, patch);
  const target = path.join(repoRoot, cwd);

  if (!fs.existsSync(patchPath)) {
    console.error(`✗ patch not found: ${patch}`);
    failed = true;
    continue;
  }
  if (!fs.existsSync(path.join(target, '.git'))) {
    console.error(
      `✗ submodule not initialized: ${cwd} (run \`pnpm run submodule:init\` first)`
    );
    failed = true;
    continue;
  }

  // 既に適用済み（= 逆方向に当てられる）なら何もしない。
  // まだ当たっていない場合は当然失敗するので、この判定の出力は捨てる。
  const alreadyApplied = await $({
    cwd: target,
    nothrow: true,
    quiet: true,
  })`git apply --reverse --check ${patchPath}`;
  if (alreadyApplied.exitCode === 0) {
    await ignoreDirty(ignoreDirtyIn);
    console.log(`- already applied: ${patch}`);
    continue;
  }

  // patch の前提 SHA と実際の HEAD がずれていたら黙って当てない
  const head = await $({ cwd: target, nothrow: true, quiet: true })`git rev-parse HEAD`;
  const headSha = head.stdout.trim();
  if (head.exitCode === 0 && headSha !== base) {
    console.error(
      `✗ ${cwd} is at ${headSha}, but ${patch} expects ${base}.\n` +
        `  Re-generate the patch, or check out the expected commit.`
    );
    failed = true;
    continue;
  }

  // patch には末尾空白を残していない（空の context 行は空行のまま）。git apply は
  // これを空の context 行として解釈できるが、環境依存の警告は黙らせる。
  const applied = await $({
    cwd: target,
    nothrow: true,
    quiet: true,
  })`git apply --whitespace=nowarn ${patchPath}`;
  if (applied.exitCode !== 0) {
    console.error(`✗ failed to apply ${patch} in ${cwd}`);
    console.error(applied.stderr);
    failed = true;
    continue;
  }
  await ignoreDirty(ignoreDirtyIn);
  console.log(`✓ applied: ${patch}`);
}

if (failed) {
  process.exit(1);
}
