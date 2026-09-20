import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { mkdir } from 'node:fs/promises';

const require = createRequire(import.meta.url);
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
process.env.NODE_ENV = 'test';
process.env.DATA_DIR = 'memory://';
delete process.env.DATABASE_URL;
delete process.env.ADMIN_PASSWORD;

const { app, db } = await import('../server.mjs');
const server = app.listen(0, '127.0.0.1');
await new Promise(resolve => server.once('listening', resolve));
const browser = await chromium.launch({ headless: true, channel: 'msedge' });
const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });

try {
  await page.goto(`http://127.0.0.1:${server.address().port}`);
  await page.getByRole('heading', { name: 'Conta administrativa' }).waitFor();
  await page.locator('[name=nome]').fill('Gestor Signy');
  await page.locator('[name=login]').fill('gestor');
  await page.locator('[name=senha]').fill('SenhaInicial123!');
  await page.locator('[name=confirmacao]').fill('SenhaDiferente123!');
  await page.getByRole('button', { name: /Criar conta e entrar/ }).click();
  await page.getByText('A confirmação não corresponde à senha.').waitFor();
  await page.locator('[name=confirmacao]').fill('SenhaInicial123!');
  await page.getByRole('button', { name: /Criar conta e entrar/ }).click();
  await page.getByRole('heading', { name: 'Tudo pronto para um novo dia.' }).waitFor();
  assert.match(await page.locator('.account').innerText(), /@gestor/);

  await page.locator('[data-action=password]').click();
  await page.locator('#password-form [name=nome]').fill('Gestor Atualizado');
  await page.locator('#password-form [name=login]').fill('gestor.atualizado');
  await page.locator('#password-form [name=atual]').fill('SenhaInicial123!');
  await page.getByRole('button', { name: 'Salvar conta' }).click();
  await page.getByText('Conta atualizada.').waitFor();
  assert.match(await page.locator('.account').innerText(), /@gestor\.atualizado/);

  await page.locator('[data-action=logout]').click();
  await page.locator('[name=login]').fill('gestor.atualizado');
  await page.locator('[name=senha]').fill('SenhaInicial123!');
  await page.getByRole('button', { name: /Entrar na academia/ }).click();
  await page.getByRole('heading', { name: 'Tudo pronto para um novo dia.' }).waitFor();
  await page.getByRole('button', { name: 'Usuários', exact: true }).click();
  await page.getByRole('button', { name: 'Novo usuário', exact: true }).click();
  await mkdir('test-results', { recursive: true });
  await page.screenshot({ path: 'test-results/users-desktop.png', fullPage: true });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.screenshot({ path: 'test-results/users-mobile.png', fullPage: true });
  assert.ok(await page.locator('#modal').evaluate(el=>el.scrollWidth<=el.clientWidth));
  await page.locator('#new-user-form [name=nome]').fill('Recepção Signy');
  await page.locator('#new-user-form [name=login]').fill('recepcao');
  await page.locator('#new-user-form [name=senha]').fill('Recepcao123!');
  await page.locator('#new-user-form [name=confirmacao]').fill('Diferente123!');
  await page.getByRole('button', { name: 'Cadastrar usuário' }).click();
  await page.locator('#new-user-form .error').getByText('A confirmação não corresponde à senha.').waitFor();
  await page.locator('#new-user-form [name=confirmacao]').fill('Recepcao123!');
  await page.getByRole('button', { name: 'Cadastrar usuário' }).click();
  await page.getByRole('cell', { name: 'recepcao', exact: true }).waitFor();
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.screenshot({ path: 'test-results/users-list.png', fullPage: true });
  assert.match(await page.locator('.account').innerText(), /@gestor\.atualizado/);
  await page.getByRole('button', { name: 'Fechar', exact: true }).last().click();
  await page.locator('[data-action=logout]').click();
  await page.locator('[name=login]').fill('recepcao');
  await page.locator('[name=senha]').fill('Recepcao123!');
  await page.getByRole('button', { name: /Entrar na academia/ }).click();
  await page.getByRole('heading', { name: 'Tudo pronto para um novo dia.' }).waitFor();
  assert.match(await page.locator('.account').innerText(), /@recepcao/);
  console.log('Cadastro de usuário e login pela interface OK.');
  console.log('Primeiro acesso e credenciais persistentes pela interface OK.');
} finally {
  await browser.close();
  await new Promise(resolve => server.close(resolve));
  await db.close();
}
