import { chromium } from 'playwright';
import { mkdir } from 'node:fs/promises';
import { readFile } from 'node:fs/promises';

const browser = await chromium.launch({ headless: true, channel: 'msedge' });
try {
  await mkdir('test-results', { recursive: true });
  let page = await browser.newPage({ viewport: { width: 192, height: 192 } });
  await page.goto(new URL('../public/favicon.svg', import.meta.url).href);
  await page.screenshot({ path: 'public/icon-192.png' });

  await page.setViewportSize({ width: 1200, height: 630 });
  await page.goto(new URL('../public/og-image.svg', import.meta.url).href);
  await page.screenshot({ path: 'public/og-image.png' });

  await page.close();
  page = await browser.newPage({ viewport: { width: 720, height: 240 } });
  const darkLogo = `data:image/svg+xml;base64,${(await readFile(new URL('../public/logo.svg', import.meta.url))).toString('base64')}`;
  const lightLogo = `data:image/svg+xml;base64,${(await readFile(new URL('../public/logo-light.svg', import.meta.url))).toString('base64')}`;
  await page.setContent(`<style>
    body{margin:0;display:grid;grid-template-columns:1fr 1fr;height:240px;background:#f5f7f5}
    section{display:grid;place-items:center}section:last-child{background:#163f34}img{width:238px}
  </style><section><img src="${darkLogo}"></section><section><img src="${lightLogo}"></section>`);
  await page.screenshot({ path: 'test-results/brand-preview.png' });
} finally {
  await browser.close();
}
