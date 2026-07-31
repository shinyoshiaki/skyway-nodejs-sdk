import 'zx';
import { $, fs, path } from 'zx';

// submodule（werift）に対する fork 独自の修正を patch として当てる。
// 一覧と Why は submodule_patches.mjs を参照。
import { patches } from './submodule_patches.mjs';

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

// patch を当てた submodule は常に dirty になる。これを放置すると、submodule を再帰的に
// commit する類のツール（CI 前の auto-commit など）が patch を submodule のローカル
// コミットに変えてしまい、push していない SHA が HEAD / gitlink に残って
// fresh checkout や CI から同じ状態を取得できなくなる。実際に 2 回踏んだ。
//
// そこで patch が触るファイルを skip-worktree にして、submodule 自身の `git status` を
// clean に見せる。ファイルの中身は patch 適用後のまま残る。`git commit -a` は
// 「何も commit するものが無い」で no-op になり、HEAD は gitlink と一致し続ける。
//
// patch を作り直すときはこの印を外す必要がある（`pnpm run submodule:unpatch`）。
async function guardAgainstAccidentalCommits(target, patchPath, ignoreDirtyIn) {
  const numstat = await $({ cwd: target, nothrow: true, quiet: true })`
    git apply --numstat ${patchPath}`;
  const files = numstat.stdout
    .split('\n')
    .map((line) => line.split('\t')[2])
    .filter(Boolean);
  if (files.length > 0) {
    await $({ cwd: target, nothrow: true, quiet: true })`
      git update-index --skip-worktree ${files}`;
  }

  if (ignoreDirtyIn) {
    const { repo, submodule } = ignoreDirtyIn;
    await $({ cwd: path.join(repoRoot, repo), nothrow: true, quiet: true })`
      git config submodule.${submodule}.ignore dirty`;
  }
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
    await guardAgainstAccidentalCommits(target, patchPath, ignoreDirtyIn);
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
  await guardAgainstAccidentalCommits(target, patchPath, ignoreDirtyIn);
  console.log(`✓ applied: ${patch}`);
}

if (failed) {
  process.exit(1);
}
