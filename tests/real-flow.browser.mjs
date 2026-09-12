import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { createRequire } from 'node:module';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import net from 'node:net';

const require = createRequire(import.meta.url);
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const dataDir = await mkdtemp(path.join(tmpdir(), 'signy-real-flow-'));
const password = 'FluxoReal123!';

const freePort = () => new Promise((resolve, reject) => {
  const probe = net.createServer();
  probe.once('error', reject);
  probe.listen(0, '127.0.0.1', () => {
    const { port } = probe.address();
    probe.close(() => resolve(port));
  });
});

async function startServer(port) {
  const child = spawn(process.execPath, ['server.mjs'], {
    cwd: path.resolve('.'),
    env: { ...process.env, NODE_ENV: 'development', DATA_DIR: dataDir, PORT: String(port), HOST: '127.0.0.1', ADMIN_PASSWORD: '' },
    stdio: ['ignore', 'pipe', 'pipe']
  });
  let output = '';
  child.stdout.on('data', chunk => { output += chunk; });
  child.stderr.on('data', chunk => { output += chunk; });
  for (let attempt = 0; attempt < 80; attempt++) {
    if (child.exitCode !== null) throw Error(`Servidor encerrou durante a inicialização:\n${output}`);
    try {
      const response = await fetch(`http://127.0.0.1:${port}/healthz`);
      if (response.ok) return child;
    } catch {}
    await new Promise(resolve => setTimeout(resolve, 250));
  }
  child.kill();
  throw Error(`Servidor não iniciou:\n${output}`);
}

async function stopServer(child) {
  if (child.exitCode !== null) return;
  child.kill('SIGTERM');
  await Promise.race([
    new Promise(resolve => child.once('exit', resolve)),
    new Promise(resolve => setTimeout(() => { child.kill(); resolve(); }, 5000))
  ]);
}

async function saveForm(page, table, values) {
  await page.locator(`[data-nav="${table}"]`).first().click();
  await page.locator(`[data-new="${table}"]`).click();
  const form = page.locator('#edit-form');
  await form.waitFor();
  for (const [key, value] of Object.entries(values)) {
    const field = form.locator(`[name="${key}"]`);
    if (await field.evaluate(element => element.tagName === 'SELECT')) await field.selectOption(String(value));
    else await field.fill(String(value));
  }
  await form.locator('[type="submit"]').click();
  await page.waitForFunction(() => !document.querySelector('#modal').open);
}

const browser = await chromium.launch({ headless: true, channel: 'msedge' });
let server;
try {
  const port = await freePort();
  server = await startServer(port);
  const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
  await page.goto(`http://127.0.0.1:${port}`);

  await page.locator('[name="nome"]').fill('Administrador do teste real');
  await page.locator('[name="login"]').fill('teste.real');
  await page.locator('[name="senha"]').fill(password);
  await page.locator('[name="confirmacao"]').fill(password);
  await page.getByRole('button', { name: 'Criar conta e entrar' }).click();
  await page.getByRole('heading', { name: 'Tudo pronto para um novo dia.' }).waitFor();
  await page.getByText('Próximo passo: Professor').waitFor();

  await saveForm(page, 'professor', { nome: 'Professor Teste Real', cpf: '43128697006', especialidade: 'Musculação' });
  await saveForm(page, 'plano', { nome: 'Plano Teste Real', valor_mensal: '99.90', duracao_meses: '3', descricao: 'Registro de validação ponta a ponta' });
  await saveForm(page, 'aluno', { nome: 'Aluno Teste Real', cpf: '52998224725', data_nascimento: '1995-06-15', sexo: 'M', email: 'aluno.teste@example.test' });
  await saveForm(page, 'matricula', { id_aluno: '1', id_plano: '1' });
  await saveForm(page, 'exercicio', { nome: 'Agachamento Teste Real', grupo_muscular: 'Pernas', descricao: 'Movimento controlado' });

  await page.locator('[data-nav="ficha_treino"]').first().click();
  await page.locator('[data-new="ficha_treino"]').click();
  await page.locator('#edit-form [name="descricao"]').fill('Ficha Teste Real');
  await page.locator('#edit-form [name="id_aluno"]').selectOption('1');
  await page.locator('#edit-form [name="id_professor"]').selectOption('1');
  await page.locator('#add-exercise').click();
  await page.locator('[data-key="id_exercicio"]').selectOption('1');
  await page.locator('[data-key="series"]').fill('4');
  await page.locator('[data-key="repeticoes"]').fill('10');
  await page.locator('[data-key="carga_sugerida"]').fill('25');
  await page.locator('#edit-form [type="submit"]').click();
  await page.waitForFunction(() => !document.querySelector('#modal').open);

  await saveForm(page, 'presenca', { id_aluno: '1' });
  const beforeRestart = await page.evaluate(() => fetch('/api/data').then(response => response.json()));
  assert.equal(beforeRestart.aluno.length, 1);
  assert.equal(beforeRestart.professor.length, 1);
  assert.equal(beforeRestart.plano.length, 1);
  assert.equal(beforeRestart.matricula.length, 1);
  assert.equal(beforeRestart.exercicio.length, 1);
  assert.equal(beforeRestart.ficha_treino.length, 1);
  assert.equal(beforeRestart.ficha_exercicio.length, 1);
  assert.equal(beforeRestart.presenca.length, 1);
  assert.equal(beforeRestart.matricula[0].situacao, 'ativa');
  assert.equal(beforeRestart.ficha_exercicio[0].series, 4);

  await page.close();
  await stopServer(server);
  server = await startServer(port);
  const reopened = await browser.newPage();
  await reopened.goto(`http://127.0.0.1:${port}`);
  await reopened.locator('[name="login"]').fill('teste.real');
  await reopened.locator('[name="senha"]').fill(password);
  await reopened.getByRole('button', { name: 'Entrar na academia' }).click();
  await reopened.getByRole('heading', { name: 'Tudo pronto para um novo dia.' }).waitFor();
  await reopened.getByText('Operação completa').waitFor();
  const afterRestart = await reopened.evaluate(() => fetch('/api/data').then(response => response.json()));
  for (const table of ['aluno', 'professor', 'plano', 'matricula', 'exercicio', 'ficha_treino', 'ficha_exercicio', 'presenca']) {
    assert.equal(afterRestart[table].length, 1, `${table} deve persistir após reiniciar`);
  }
  assert.equal(afterRestart.aluno[0].nome, 'Aluno Teste Real');
  assert.equal(afterRestart.professor[0].nome, 'Professor Teste Real');
  assert.equal(afterRestart.plano[0].nome, 'Plano Teste Real');
  assert.equal(afterRestart.ficha_treino[0].descricao, 'Ficha Teste Real');
  console.log('Fluxo real persistente: professor, plano, aluno, matrícula, exercício, ficha e presença OK após reinício.');
} finally {
  if (server) await stopServer(server);
  await browser.close();
  await rm(dataDir, { recursive: true, force: true });
}
