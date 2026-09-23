import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import { createRequire } from 'node:module';
import bcrypt from 'bcryptjs';

const require = createRequire(import.meta.url);
const { chromium } = require('playwright');
const localCheck = process.env.SIGNY_SEED_LOCAL_CHECK === '1';
if (!localCheck && !process.env.DATABASE_URL) {
  throw Error('Configure DATABASE_URL com a conexão completa do Neon antes de executar esta simulação.');
}
if (!localCheck) {
  const databaseUrl = new URL(process.env.DATABASE_URL);
  if (!databaseUrl.hostname.endsWith('.neon.tech')) {
    throw Error('DATABASE_URL deve apontar para um servidor do Neon (*.neon.tech).');
  }
}
if (localCheck) {
  process.env.DATA_DIR = 'memory://';
  delete process.env.DATABASE_URL;
}
process.env.NODE_ENV = 'test';

const { app, db } = await import('../server.mjs');
const login = 'academia.simulada';
const suppliedPassword = process.env.SIGNY_DEMO_PASSWORD;
const password = suppliedPassword || `Signy${randomBytes(15).toString('base64url')}!`;
if (Buffer.byteLength(password) < 10 || Buffer.byteLength(password) > 72) {
  throw Error('SIGNY_DEMO_PASSWORD deve ter entre 10 e 72 bytes.');
}

const teachers = [
  ['Ana Beatriz Lima', 'Musculação e hipertrofia'],
  ['Bruno Martins Rocha', 'Treinamento funcional'],
  ['Carla Nogueira Alves', 'Condicionamento físico'],
  ['Diego Ferreira Costa', 'Avaliação física'],
  ['Elisa Barros Mendes', 'Mobilidade e alongamento'],
  ['Felipe Duarte Silva', 'Treino de força'],
  ['Gabriela Moreira Reis', 'Treinamento para iniciantes'],
];
const students = [
  ['Amanda Ribeiro', '1995-03-12', 'F'],
  ['André Oliveira', '1988-07-21', 'M'],
  ['Beatriz Campos', '2001-11-04', 'F'],
  ['Caio Rodrigues', '1992-02-18', 'M'],
  ['Camila Freitas', '1998-09-30', 'F'],
  ['Daniel Pereira', '1984-05-16', 'M'],
  ['Fernanda Azevedo', '2003-01-25', 'F'],
  ['João Victor Souza', '1997-12-08', 'M'],
  ['Larissa Monteiro', '1990-06-14', 'F'],
  ['Marcos Vinícius Melo', '1979-10-02', 'M'],
];
const plans = [
  ['Simulação Mensal', '119.90', '1', 'Acesso à musculação durante um mês'],
  ['Simulação Trimestral', '104.90', '3', 'Acesso à musculação durante três meses'],
  ['Simulação Semestral', '94.90', '6', 'Acesso à musculação durante seis meses'],
];
const movements = [
  ['Agachamento livre', 'Pernas'], ['Supino reto', 'Peitoral'],
  ['Remada baixa', 'Costas'], ['Puxada frontal', 'Costas'],
  ['Desenvolvimento com halteres', 'Ombros'], ['Cadeira extensora', 'Pernas'],
  ['Rosca direta', 'Braços'], ['Prancha abdominal', 'Abdômen'],
];

let server;
let browser;
try {
  const existing = (await db.query('SELECT id FROM usuario WHERE login=$1', [login])).rows[0];
  if (existing && !suppliedPassword) {
    throw Error(`A conta ${login} já existe. Informe SIGNY_DEMO_PASSWORD para reutilizá-la.`);
  }
  if (!existing) {
    await db.query('INSERT INTO usuario(nome,login,senha_hash,aprovado) VALUES($1,$2,$3,TRUE)',
      ['Gestão da academia simulada', login, await bcrypt.hash(password, 12)]);
  } else {
    const hash = (await db.query('SELECT senha_hash FROM usuario WHERE id=$1', [existing.id])).rows[0].senha_hash;
    if (!await bcrypt.compare(password, hash)) throw Error('SIGNY_DEMO_PASSWORD não corresponde à conta existente.');
  }

  server = app.listen(0, '127.0.0.1');
  await new Promise(resolve => server.once('listening', resolve));
  browser = await chromium.launch({ headless: true, channel: 'msedge' });
  const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
  await page.goto(`http://127.0.0.1:${server.address().port}`);
  await page.locator('#login-form [name=login]').fill(login);
  await page.locator('#login-form [name=senha]').fill(password);
  await page.getByRole('button', { name: /Entrar na academia/ }).click();
  await page.getByRole('heading', { name: 'Tudo pronto para um novo dia.' }).waitFor();

  const data = () => page.evaluate(async () => {
    const response = await fetch('/api/data');
    if (!response.ok) throw Error(`Consulta de dados: ${response.status}`);
    return response.json();
  });
  async function form(table, fields) {
    await page.locator(`[data-nav="${table}"]`).first().click();
    await page.locator(`[data-new="${table}"]`).click();
    await page.locator('#edit-form').waitFor();
    for (const [name, value] of Object.entries(fields)) {
      const field = page.locator(`#edit-form [name="${name}"]`);
      if (await field.evaluate(element => element.tagName === 'SELECT')) {
        await field.selectOption(String(value));
      } else await field.fill(String(value));
    }
  }
  async function selectNamed(name, label) {
    const field = page.locator(`#edit-form [name="${name}"]`);
    const value = await field.locator('option').filter({ hasText: label }).getAttribute('value');
    if (!value) throw Error(`Opção não encontrada: ${label}`);
    await field.selectOption(value);
  }
  async function save() {
    await page.locator('#edit-form [type=submit]').click();
    await page.waitForFunction(() => !document.querySelector('#modal').open, { timeout: 10000 });
  }

  for (let i = 0; i < teachers.length; i++) {
    const [nome, especialidade] = teachers[i];
    const cpf = `91000000${String(i + 1).padStart(3, '0')}`;
    if ((await data()).professor.some(item => item.cpf === cpf)) continue;
    await form('professor', { nome, cpf, especialidade,
      telefone: `8599000${String(i + 1).padStart(4, '0')}`,
      email: `professor${i + 1}@example.test` });
    await save();
  }
  for (const [nome, valor_mensal, duracao_meses, descricao] of plans) {
    if ((await data()).plano.some(item => item.nome === nome)) continue;
    await form('plano', { nome, valor_mensal, duracao_meses, descricao });
    await save();
  }
  for (let i = 0; i < students.length; i++) {
    const [nome, data_nascimento, sexo] = students[i];
    const cpf = `92000000${String(i + 1).padStart(3, '0')}`;
    if ((await data()).aluno.some(item => item.cpf === cpf)) continue;
    await form('aluno', { nome, cpf, data_nascimento, sexo,
      telefone: `8598000${String(i + 1).padStart(4, '0')}`,
      email: `aluno${i + 1}@example.test` });
    await save();
  }
  for (const [nome, grupo_muscular] of movements) {
    if ((await data()).exercicio.some(item => item.nome === nome)) continue;
    await form('exercicio', { nome, grupo_muscular, descricao: 'Execução orientada pelo professor responsável' });
    await save();
  }
  for (let i = 0; i < students.length; i++) {
    const snapshot = await data();
    const student = snapshot.aluno.find(item => item.nome === students[i][0]);
    if (snapshot.matricula.some(item => item.id_aluno === student.id_aluno && item.situacao === 'ativa')) continue;
    await form('matricula', {});
    await selectNamed('id_aluno', students[i][0]);
    await selectNamed('id_plano', plans[i % plans.length][0]);
    await save();
  }
  for (let i = 0; i < students.length; i++) {
    const descricao = `Treino inicial - ${students[i][0]}`;
    if ((await data()).ficha_treino.some(item => item.descricao === descricao)) continue;
    await form('ficha_treino', { descricao });
    await selectNamed('id_aluno', students[i][0]);
    await selectNamed('id_professor', teachers[i % teachers.length][0]);
    for (let j = 0; j < 3; j++) {
      await page.locator('#add-exercise').click();
      const row = page.locator('.exercise-row').nth(j);
      const movement = movements[(i + j) % movements.length][0];
      const value = await row.locator('[data-key=id_exercicio] option').filter({ hasText: movement }).getAttribute('value');
      await row.locator('[data-key=id_exercicio]').selectOption(value);
      await row.locator('[data-key=series]').fill('3');
      await row.locator('[data-key=repeticoes]').fill('12');
      await row.locator('[data-key=carga_sugerida]').fill('10');
      await row.locator('[data-key=observacao]').fill('Ajustar carga conforme avaliação');
    }
    await save();
  }
  for (const [nome] of students.slice(0, 5)) {
    const snapshot = await data();
    const student = snapshot.aluno.find(item => item.nome === nome);
    if (snapshot.presenca.some(item => item.id_aluno === student.id_aluno && String(item.data_presenca).slice(0, 10) === snapshot.hoje)) continue;
    await form('presenca', {});
    await selectNamed('id_aluno', nome);
    await save();
  }

  const snapshot = await data();
  assert.equal(teachers.filter(([nome]) => snapshot.professor.some(item => item.nome === nome)).length, 7);
  assert.equal(students.filter(([nome]) => snapshot.aluno.some(item => item.nome === nome)).length, 10);
  assert.equal(students.filter(([nome]) => snapshot.ficha_treino.some(item => item.descricao === `Treino inicial - ${nome}`)).length, 10);
  console.log(JSON.stringify({ banco: localCheck ? 'verificação local' : 'Neon', login,
    senha: password, professores: 7, alunos: 10, planos: 3, matriculas: 10,
    exercicios: 8, fichas: 10, presencasHoje: 5 }, null, 2));
} finally {
  if (browser) await browser.close();
  if (server) await new Promise(resolve => server.close(resolve));
  await db.close();
}
