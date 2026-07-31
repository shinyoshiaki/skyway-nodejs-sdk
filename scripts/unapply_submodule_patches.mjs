import 'zx';
import { $, fs, path } from 'zx';

// `submodule:patch` の逆操作。submodule を patch 適用前（= gitlink の SHA そのまま）の
// 状態に戻す。
//
// patch を作り直すときはこれを先に実行してください。`submodule:patch` は patch が触る
// ファイルを skip-worktree にして submodule を clean に見せているため、印が付いたままだと
// submodule 内で修正しても `git diff` に出てこず、patch を取り直せません。
import { patches } from './submodule_patches.mjs';

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

for (const { patch, cwd, ignoreDirtyIn } of patches) {
  const patchPath = path.join(repoRoot, patch);
  const target = path.join(repoRoot, cwd);

  if (!fs.existsSync(path.join(target, '.git'))) {
    console.log(`- not initialized, nothing to do: ${cwd}`);
    continue;
  }

  // skip-worktree を外す。ここを先にやらないと checkout / diff が効かない。
  const numstat = await $({ cwd: target, nothrow: true, quiet: true })`
    git apply --numstat ${patchPath}`;
  const files = numstat.stdout
    .split('\n')
    .map((line) => line.split('\t')[2])
    .filter(Boolean);
  if (files.length > 0) {
    await $({ cwd: target, nothrow: true, quiet: true })`
      git update-index --no-skip-worktree ${files}`;
  }

  const applied = await $({ cwd: target, nothrow: true, quiet: true })`
    git apply --reverse --check ${patchPath}`;
  if (applied.exitCode !== 0) {
    console.log(`- not applied, only cleared skip-worktree: ${cwd}`);
    continue;
  }

  const reverted = await $({ cwd: target, nothrow: true, quiet: true })`
    git apply --reverse --whitespace=nowarn ${patchPath}`;
  if (reverted.exitCode !== 0) {
    console.error(`✗ failed to revert ${patch} in ${cwd}`);
    console.error(reverted.stderr);
    failed = true;
    continue;
  }

  if (ignoreDirtyIn) {
    const { repo, submodule } = ignoreDirtyIn;
    await $({ cwd: path.join(repoRoot, repo), nothrow: true, quiet: true })`
      git config --unset submodule.${submodule}.ignore`;
  }
  console.log(`✓ reverted: ${patch}`);
}

if (failed) {
  process.exit(1);
}
