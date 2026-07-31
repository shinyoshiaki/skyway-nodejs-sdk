// submodule（werift）に対する fork 独自の修正の一覧。`submodule:patch` と
// `submodule:unpatch` が共有する。
//
// Why: これらの修正は werift / mediasoup-client-node の remote に push していない。
// gitlink を未公開のローカルコミットに向けると fresh checkout / CI で取得できないため、
// gitlink は remote から取得できる SHA のままにし、差分は本リポジトリの patches/ で
// 管理する。これで clone 直後でも `submodule:init` → `submodule:patch` で同じ状態になる。
export const patches = [
  {
    patch: 'patches/submodules/werift-ice-restart-and-multiple-stun.patch',
    cwd: 'submodules/mediasoup/submodules/werift',
    // この patch が前提とする submodule の SHA（remote から取得できるもの）
    base: 'd782a54395552e594a6c36cd06430c8224b3096e',
    // 親（mediasoup）側で werift の dirty を無視させる。親の .gitmodules は
    // upstream 管理なので clone ローカルの config に書く。
    ignoreDirtyIn: {
      repo: 'submodules/mediasoup',
      submodule: 'submodules/werift',
    },
  },
];
