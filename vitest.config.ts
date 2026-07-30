import { defineConfig } from 'vitest/config';

/**
 * packages/*\/vitest.*.ts が mergeConfig のベースとして参照する共通設定。
 * ブラウザ前提の本家 SDK と違い node で実行するため pool は forks を使う。
 */
export default defineConfig({
  test: {
    globals: true,
    pool: 'forks',
    testTimeout: 60_000,
  },
});
