import { test, after } from 'node:test';
import assert from 'node:assert/strict';

process.env.NODE_ENV = 'test';
process.env.OPEN_ACCESS = 'true';
process.env.DATA_DIR = 'memory://';
delete process.env.DATABASE_URL;
delete process.env.ADMIN_PASSWORD;

const { app, db } = await import('../server.mjs');
const server = app.listen(0, '127.0.0.1');
await new Promise(resolve => server.once('listening', resolve));
const base = `http://127.0.0.1:${server.address().port}/api`;

async function request(path, method = 'GET', body, cookie) {
  const response = await fetch(base + path, {
    method,
    headers: { 'Content-Type': 'application/json', ...(cookie ? { Cookie: cookie } : {}) },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  return { status: response.status, body: await response.json(), cookie: response.headers.get('set-cookie')?.split(';')[0] };
}

after(async () => {
  await new Promise(resolve => server.close(resolve));
  await db.close();
});

test('acesso aberto aceita qualquer usuário e senha em banco vazio ou existente', async () => {
  assert.deepEqual((await request('/setup-status')).body, { required: false, open: true });
  const first = await request('/login', 'POST', { login: 'equipe', senha: 'qualquer coisa' });
  assert.equal(first.status, 200);
  assert.equal(first.body.login, 'equipe');
  assert.match(first.cookie, /^signy=/);
  assert.equal((await request('/me', 'GET', null, first.cookie)).body.login, 'equipe');
  assert.equal((await request('/data', 'GET', null, first.cookie)).status, 200);

  assert.equal((await request('/login', 'POST', { login: 'equipe', senha: 'senha diferente' })).status, 200);
  const another = await request('/login', 'POST', { login: 'outra pessoa', senha: '123' });
  assert.equal(another.status, 200);
  assert.equal(another.body.login, 'outra pessoa');
  assert.equal(Number((await db.query('SELECT COUNT(*) AS total FROM usuario')).rows[0].total), 2);
});
