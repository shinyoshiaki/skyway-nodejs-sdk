import { chromium } from 'playwright';

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
