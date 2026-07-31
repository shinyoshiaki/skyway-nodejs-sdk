import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    testTimeout: 30_000,
    pool: 'forks',
    // large は実 SkyWay 接続（signaling / SFU / TURN）に依存するので、ネットワーク側の
    // 都合でごく稀に接続が確立せず timeout する。実際に turn > force_turn が、コードが
    // 1 行も変わっていない状態（差分は Markdown 10 行だけ）で通常 2.6s の実行から
    // 60s timeout に転んだことがある。各テストは毎回自分で context / room / UDP ポート /
    // デバイス登録を作るので retry しても状態は持ち越さない。
    retry: 2,
  },
});
