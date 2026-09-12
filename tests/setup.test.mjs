import { test, after } from 'node:test';
import assert from 'node:assert/strict';

process.env.NODE_ENV = 'test';
process.env.DATA_DIR = 'memory://';
delete process.env.DATABASE_URL;
delete process.env.ADMIN_PASSWORD;

const { app, db } = await import('../server.mjs');
const server = app.listen(0, '127.0.0.1');
await new Promise(resolve => server.once('listening', resolve));
const base = `http://127.0.0.1:${server.address().port}/api`;

async function request(path, method = 'GET', body) {
  const response = await fetch(base + path, {
    method,
    headers: { 'Content-Type': 'application/json' },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  return { status: response.status, body: await response.json(), cookie: response.headers.get('set-cookie') };
}

after(async () => {
  await new Promise(resolve => server.close(resolve));
  await db.close();
});

test('primeiro acesso cria uma única conta persistente sem variável de senha', async () => {
  assert.deepEqual((await request('/setup-status')).body, { required: true });
  assert.equal((await request('/setup', 'POST', { nome: 'A', login: 'x', senha: 'curta' })).status, 400);

  const setup = await request('/setup', 'POST', {
    nome: 'Gestor da Academia',
    login: 'gestor.signy',
    senha: 'SenhaPersistente123!',
  });
  assert.equal(setup.status, 200);
  assert.equal(setup.body.login, 'gestor.signy');
  assert.match(setup.cookie, /HttpOnly/);
  assert.deepEqual((await request('/setup-status')).body, { required: false });
  assert.equal((await request('/setup', 'POST', {
    nome: 'Invasor', login: 'outro', senha: 'OutraSenha123!'
  })).status, 409);

  const stored = (await db.query('SELECT nome,login,senha_hash FROM usuario')).rows;
  assert.equal(stored.length, 1);
  assert.equal(stored[0].login, 'gestor.signy');
  assert.notEqual(stored[0].senha_hash, 'SenhaPersistente123!');

  const login = await request('/login', 'POST', { login: ' GESTOR.SIGNY ', senha: 'SenhaPersistente123!' });
  assert.equal(login.status, 200);
});
