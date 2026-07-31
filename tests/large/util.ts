import { chromium } from 'playwright';

import type { RtpPacket } from '../../packages/room/src';

type RtpEvent = {
  subscribe: (cb: (rtp: RtpPacket) => void) => { unSubscribe: () => void };
};

/**
 * RTP を受信して条件を満たすまで待つ。
 *
 * Why: `onReceiveRtp.subscribe(async (rtp) => { ... await room.close() ... })` のように
 * 同期イベントに async コールバックを渡すと、(1) 条件成立後もコールバックが呼ばれ続けて
 * close/dispose が多重に走り、(2) その中の reject を誰も受け取らないため
 * unhandled rejection になる。条件成立時点で必ず unsubscribe し、エラーは待ち側へ
 * 伝播させることで、後片付けをテスト本体の直線的な流れに戻す。
 */
export const waitForRtp = (
  track: { onReceiveRtp: RtpEvent },
  predicate: (rtp: RtpPacket) => boolean,
  { timeoutMs = 30_000 }: { timeoutMs?: number } = {}
) =>
  new Promise<RtpPacket>((resolve, reject) => {
    let settled = false;
    const { unSubscribe } = track.onReceiveRtp.subscribe((rtp) => {
      if (settled) {
        return;
      }
      try {
        if (!predicate(rtp)) {
          return;
        }
      } catch (error) {
        settled = true;
        unSubscribe();
        clearTimeout(timer);
        reject(error);
        return;
      }
      settled = true;
      unSubscribe();
      clearTimeout(timer);
      resolve(rtp);
    });

    const timer = setTimeout(() => {
      if (settled) {
        return;
      }
      settled = true;
      unSubscribe();
      reject(new Error(`waitForRtp timeout: ${timeoutMs}ms`));
    }, timeoutMs);
  });

export const browserExec = async <T>(
  func: (...args: any) => Promise<T>,
  arg: any
) => {
  const browser = await chromium.launch({
    args: [
      '--use-fake-ui-for-media-stream', // 許可ダイアログを自動承認
      '--use-fake-device-for-media-stream', // 仮想カメラ／マイクを提供
    ],
  });

  // 2. 新しいコンテキスト。自己署名証明書も気にしない
  const context = await browser.newContext({ ignoreHTTPSErrors: true });
  const HTTPS_ORIGIN = 'https://example.com';

  // 4. リクエストを横取りして空のページを返す
  await context.route(`${HTTPS_ORIGIN}/**`, (route) => {
    route.fulfill({
      status: 200,
      contentType: 'text/html',
      body: '<!doctype html><title>blank</title>',
    });
  });

  const page = await browser.newPage(); // about:blank
  await page.goto(HTTPS_ORIGIN);
  page.on('console', (msg) => {
    console.log('PAGE LOG:', msg.text());
  });

  const res = await page.evaluate(func, arg);
  await browser.close();
  return res as T;
};
