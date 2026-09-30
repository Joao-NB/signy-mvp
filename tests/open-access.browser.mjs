import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { chromium } = require('playwright');
process.env.NODE_ENV = 'test';
process.env.OPEN_ACCESS = 'true';
process.env.DATA_DIR = 'memory://';
delete process.env.DATABASE_URL;
delete process.env.ADMIN_PASSWORD;

const { app, db } = await import('../server.mjs');
const server = app.listen(0, '127.0.0.1');
await new Promise(resolve => server.once('listening', resolve));
const browser = await chromium.launch({ headless: true, channel: 'msedge' });
const page = await browser.newPage();

try {
  await page.goto(`http://127.0.0.1:${server.address().port}`);
  await page.locator('#login-form').waitFor();
  assert.match(await page.locator('#login-form p').innerText(), /qualquer usuário e senha/);
  await page.locator('#login-form [name=login]').fill('equipe');
  await page.locator('#login-form [name=senha]').fill('senha que não existe');
  await page.getByRole('button', { name: /Entrar na academia/ }).click();
  await page.getByRole('heading', { name: 'A academia, hoje.' }).waitFor();
  assert.equal(await page.locator('[data-action=users]').isVisible(), false);
  assert.equal(await page.locator('[data-action=password]').isVisible(), false);
  await page.reload();
  await page.getByRole('heading', { name: 'A academia, hoje.' }).waitFor();
  console.log('Navegador: qualquer senha entra e a sessão funciona após recarregar.');
} finally {
  await browser.close();
  await new Promise(resolve => server.close(resolve));
  await db.close();
}
