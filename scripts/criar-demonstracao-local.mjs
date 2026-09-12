import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import path from 'node:path';
import bcrypt from 'bcryptjs';

const require = createRequire(import.meta.url);
const { chromium } = require('playwright');
process.env.NODE_ENV = 'test';
process.env.DATA_DIR = path.resolve('data');
delete process.env.DATABASE_URL;
delete process.env.ADMIN_PASSWORD;

const { app, db } = await import('../server.mjs');
const login = 'demonstracao';
const password = 'DemoSigny123!';
const code = String(Date.now()).slice(-8);
const studentName = `Aluno Demonstração ${code}`;
const teacherName = `Professor Demonstração ${code}`;
const planName = `Plano Demonstração ${code}`;
const exerciseName = `Agachamento Demonstração ${code}`;
const sheetName = `Ficha Demonstração ${code}`;

await db.query(
  `INSERT INTO usuario(nome,login,senha_hash) VALUES($1,$2,$3)
   ON CONFLICT(login) DO UPDATE SET nome=EXCLUDED.nome,senha_hash=EXCLUDED.senha_hash`,
  ['Usuário de demonstração', login, await bcrypt.hash(password, 12)]
);

const server = app.listen(0, '127.0.0.1');
await new Promise(resolve => server.once('listening', resolve));
const browser = await chromium.launch({ headless: true, channel: 'msedge' });
const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });

async function openForm(table) {
  await page.locator(`[data-nav="${table}"]`).first().click();
  await page.locator(`[data-new="${table}"]`).click();
  await page.locator('#edit-form').waitFor();
}

async function fill(values) {
  for (const [key, value] of Object.entries(values)) {
    const field = page.locator(`#edit-form [name="${key}"]`);
    if (await field.evaluate(element => element.tagName === 'SELECT')) await field.selectOption(String(value));
    else await field.fill(String(value));
  }
}

async function choose(key, text) {
  const select = page.locator(`#edit-form [name="${key}"]`);
  const value = await select.locator('option').filter({ hasText: text }).getAttribute('value');
  if (!value) throw Error(`Opção não encontrada: ${text}`);
  await select.selectOption(value);
}

async function save() {
  await page.locator('#edit-form [type="submit"]').click();
  await page.waitForFunction(() => !document.querySelector('#modal').open);
}

try {
  await page.goto(`http://127.0.0.1:${server.address().port}`);
  await page.locator('[name="login"]').fill(login);
  await page.locator('[name="senha"]').fill(password);
  await page.getByRole('button', { name: 'Entrar na academia' }).click();
  await page.getByRole('heading', { name: 'Tudo pronto para um novo dia.' }).waitFor();

  await openForm('professor');
  await fill({ nome: teacherName, cpf: `20${code}1`, especialidade: 'Musculação e condicionamento' });
  await save();

  await openForm('plano');
  await fill({ nome: planName, valor_mensal: '99.90', duracao_meses: '3', descricao: 'Plano criado durante a simulação de uso' });
  await save();

  await openForm('aluno');
  await fill({ nome: studentName, cpf: `10${code}1`, data_nascimento: '1995-06-15', sexo: 'M', email: `demo.${code}@example.test`, telefone: '81999990000' });
  await save();

  await openForm('matricula');
  await choose('id_aluno', studentName);
  await choose('id_plano', planName);
  await save();

  await openForm('exercicio');
  await fill({ nome: exerciseName, grupo_muscular: 'Pernas', descricao: 'Quatro séries com execução controlada' });
  await save();

  await openForm('ficha_treino');
  await fill({ descricao: sheetName });
  await choose('id_aluno', studentName);
  await choose('id_professor', teacherName);
  await page.locator('#add-exercise').click();
  const exerciseValue = await page.locator('[data-key="id_exercicio"] option').filter({ hasText: exerciseName }).getAttribute('value');
  await page.locator('[data-key="id_exercicio"]').selectOption(exerciseValue);
  await page.locator('[data-key="series"]').fill('4');
  await page.locator('[data-key="repeticoes"]').fill('10');
  await page.locator('[data-key="carga_sugerida"]').fill('25');
  await page.locator('[data-key="observacao"]').fill('Descanso de 60 segundos');
  await save();

  await openForm('presenca');
  await choose('id_aluno', studentName);
  await save();

  const data = await page.evaluate(() => fetch('/api/data').then(response => response.json()));
  const student = data.aluno.find(item => item.nome === studentName);
  const teacher = data.professor.find(item => item.nome === teacherName);
  const plan = data.plano.find(item => item.nome === planName);
  const exercise = data.exercicio.find(item => item.nome === exerciseName);
  const enrollment = data.matricula.find(item => item.id_aluno === student.id_aluno && item.id_plano === plan.id_plano);
  const sheet = data.ficha_treino.find(item => item.descricao === sheetName && item.id_aluno === student.id_aluno && item.id_professor === teacher.id_professor);
  assert.ok(student && teacher && plan && exercise && enrollment && sheet);
  assert.equal(enrollment.situacao, 'ativa');
  assert.ok(data.ficha_exercicio.some(item => item.id_ficha === sheet.id_ficha && item.id_exercicio === exercise.id_exercicio));
  assert.ok(data.presenca.some(item => item.id_aluno === student.id_aluno && String(item.data_presenca).slice(0, 10) === data.hoje));

  console.log(`Demonstração criada: ${studentName}`);
  console.log(`Login local: ${login}`);
  console.log(`Senha local: ${password}`);
} finally {
  await browser.close();
  await new Promise(resolve => server.close(resolve));
  await db.close();
}
