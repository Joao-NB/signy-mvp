import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
process.env.NODE_ENV = 'test';
process.env.DATA_DIR = 'memory://';
process.env.ADMIN_PASSWORD = 'BotoesTeste123!';
delete process.env.DATABASE_URL;

const { app, db } = await import('../server.mjs');
const server = app.listen(0, '127.0.0.1');
await new Promise(resolve => server.once('listening', resolve));
const browser = await chromium.launch({ headless: true, channel: 'msedge' });
const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
const pageErrors = [];
page.on('pageerror', error => pageErrors.push(error.message));

const nav = async section => {
  await page.locator(`[data-nav="${section}"]`).first().click();
  await page.locator(`[data-nav="${section}"][aria-current="page"]`).waitFor();
};
const closeModal = async () => {
  await page.locator('#close-modal').click();
  await page.waitForFunction(() => !document.querySelector('#modal').open);
};
const startForm = async (table, values = {}) => {
  await nav(table);
  await page.locator(`[data-new="${table}"]`).click();
  await page.locator('#edit-form').waitFor();
  for (const [key, value] of Object.entries(values)) {
    const input = page.locator(`#edit-form [name="${key}"]`);
    if (await input.evaluate(element => element.tagName === 'SELECT')) await input.selectOption(String(value));
    else await input.fill(String(value));
  }
  return page.locator('#edit-form [type="submit"]');
};
const save = async button => {
  await button.click();
  await page.waitForFunction(() => !document.querySelector('#modal').open);
};
const row = name => page.locator('tbody tr').filter({ hasText: name });
const confirm = async () => {
  await page.locator('#confirm').click();
  await page.waitForFunction(() => !document.querySelector('#modal').open);
};

try {
  await page.goto(`http://127.0.0.1:${server.address().port}`);
  await page.locator('[name=login]').fill('admin');
  await page.locator('[name=senha]').fill('senha-incorreta');
  await page.getByRole('button', { name: 'Entrar na academia' }).click();
  await page.getByText('Usuário ou senha incorretos.').waitFor();
  await page.locator('[name=senha]').fill('BotoesTeste123!');
  await page.getByRole('button', { name: 'Entrar na academia' }).click();
  await page.getByRole('heading', { name: 'Tudo pronto para um novo dia.' }).waitFor();

  await page.locator('[data-new=presenca]').click();
  await page.getByRole('heading', { name: 'Nenhum aluno disponível' }).waitFor();
  await page.getByRole('button', { name: 'Voltar' }).click();
  await page.waitForFunction(() => !document.querySelector('#modal').open);
  await page.locator('[data-new=aluno]').click();
  await page.locator('#edit-form').waitFor();
  await page.getByRole('button', { name: 'Voltar' }).click();
  await page.waitForFunction(() => !document.querySelector('#modal').open);

  await nav('matricula');
  await page.locator('[data-new=matricula]').click();
  await page.getByRole('heading', { name: 'Cadastre um aluno primeiro' }).waitFor();
  await page.locator('#prerequisite-action').click();
  await page.locator('#edit-form').waitFor();
  await closeModal();

  await nav('ficha_treino');
  await page.locator('[data-new=ficha_treino]').click();
  await page.getByRole('heading', { name: 'Cadastre um aluno primeiro' }).waitFor();
  await closeModal();

  await save(await startForm('aluno', { nome: 'Ana Principal', cpf: '12345678901', data_nascimento: '1994-05-10', sexo: 'F', email: 'ana@example.test' }));
  await save(await startForm('aluno', { nome: 'Aluno Temporário', cpf: '12345678902', data_nascimento: '1996-06-11' }));

  await nav('matricula');
  await page.locator('[data-new=matricula]').click();
  await page.getByRole('heading', { name: 'Ative ou cadastre um plano' }).waitFor();
  await closeModal();

  await save(await startForm('professor', { nome: 'Professor Principal', cpf: '22345678901', especialidade: 'Musculação' }));
  await save(await startForm('professor', { nome: 'Professor Temporário', cpf: '22345678902' }));
  await save(await startForm('plano', { nome: 'Plano Acadêmico', valor_mensal: '89.90', duracao_meses: '1' }));
  await save(await startForm('exercicio', { nome: 'Agachamento Principal', grupo_muscular: 'Pernas', descricao: 'Execução controlada' }));
  await save(await startForm('exercicio', { nome: 'Exercício Temporário', grupo_muscular: 'Braços' }));

  await nav('plano');
  await page.locator('[data-toggle]').click();
  await confirm();
  assert.match(await page.locator('tbody').innerText(), /Inativo/);
  await page.locator('[data-toggle]').click();
  await confirm();
  assert.match(await page.locator('tbody').innerText(), /Ativo/);

  await save(await startForm('matricula', { id_aluno: '1', id_plano: '1' }));
  await nav('home');
  await page.locator('#quick-student').selectOption('1');
  await page.locator('#quick-checkin button').click();
  await page.getByText('Presença registrada. Bom treino!').waitFor();
  assert.equal(await page.locator('#quick-checkin button').isDisabled(), true);

  await nav('presenca');
  await page.locator('[data-new=presenca]').click();
  await page.getByRole('heading', { name: 'Presenças de hoje concluídas' }).waitFor();
  await closeModal();

  const sheet = await startForm('ficha_treino', { descricao: 'Treino A', id_aluno: '1', id_professor: '1' });
  await page.locator('#add-exercise').click();
  await page.locator('.exercise-row button[aria-label="Remover exercício"]').click();
  assert.equal(await page.locator('.exercise-row').count(), 0);
  await page.locator('#add-exercise').click();
  await page.locator('[data-key=id_exercicio]').selectOption('1');
  await page.locator('[data-key=carga_sugerida]').fill('20');
  await save(sheet);

  for (const section of ['aluno', 'professor', 'plano', 'matricula', 'ficha_treino', 'exercicio', 'presenca']) {
    await nav(section);
    await page.locator(`[data-detail="${section}"]`).first().click();
    await page.getByRole('heading', { name: 'Detalhes do cadastro' }).waitFor();
    await closeModal();
  }

  await nav('aluno');
  await row('Ana Principal').locator('[data-edit=aluno]').click();
  await page.locator('[name=telefone]').fill('81999998888');
  await save(page.locator('#edit-form [type=submit]'));
  assert.match(await row('Ana Principal').innerText(), /Ana Principal/);

  await nav('professor');
  await row('Professor Principal').locator('[data-edit=professor]').click();
  await page.locator('[name=especialidade]').fill('Treinamento funcional');
  await save(page.locator('#edit-form [type=submit]'));

  await nav('plano');
  await page.locator('[data-edit=plano]').click();
  await page.locator('[name=valor_mensal]').fill('99.90');
  await save(page.locator('#edit-form [type=submit]'));

  await nav('exercicio');
  await row('Agachamento Principal').locator('[data-edit=exercicio]').click();
  await page.locator('[name=descricao]').fill('Execução refinada');
  await save(page.locator('#edit-form [type=submit]'));
  await page.locator('#search').fill('não existe');
  assert.match(await page.locator('#results').innerText(), /Nenhum registro/);
  await page.locator('[data-action=clear]').click();
  assert.match(await page.locator('#results').innerText(), /Agachamento Principal/);

  await nav('ficha_treino');
  await page.locator('[data-edit=ficha_treino]').click();
  await page.locator('[name=descricao]').fill('Treino A refinado');
  await page.locator('[name=ativa]').selectOption('false');
  await save(page.locator('#edit-form [type=submit]'));
  assert.match(await page.locator('tbody').innerText(), /Inativa/);

  for (const [section, item] of [['aluno', 'Aluno Temporário'], ['professor', 'Professor Temporário'], ['exercicio', 'Exercício Temporário']]) {
    await nav(section);
    await row(item).locator(`[data-delete="${section}"]`).click();
    await confirm();
    assert.equal(await row(item).count(), 0);
  }

  await nav('aluno');
  await row('Ana Principal').locator('[data-delete=aluno]').click();
  await page.locator('#confirm').click();
  await page.getByText(/existem registros vinculados/).waitFor();
  await closeModal();

  await nav('matricula');
  await page.locator('[data-cancel]').click();
  await confirm();
  assert.match(await page.locator('tbody').innerText(), /Cancelada/);

  await nav('home');
  await page.getByRole('button', { name: /Ver todos os alunos/ }).click();
  await page.getByRole('heading', { name: 'Alunos' }).waitFor();

  await page.locator('[data-action=password]').click();
  await page.locator('[name=atual]').fill('BotoesTeste123!');
  await page.locator('[name=nova]').fill('SenhaRefinada123!');
  await page.locator('[name=confirmacao]').fill('diferente123');
  await page.getByRole('button', { name: 'Salvar conta' }).click();
  await page.getByText('A confirmação não corresponde à nova senha.').waitFor();
  await page.locator('[name=confirmacao]').fill('SenhaRefinada123!');
  await page.getByRole('button', { name: 'Salvar conta' }).click();
  await page.getByText('Conta atualizada.').waitFor();

  for (const section of ['home', 'aluno', 'professor', 'plano', 'matricula', 'ficha_treino', 'exercicio', 'presenca']) await nav(section);

  await page.locator('[data-action=logout]').click();
  await page.locator('#login-form').waitFor();
  await page.locator('[name=login]').fill('admin');
  await page.locator('[name=senha]').fill('SenhaRefinada123!');
  await page.getByRole('button', { name: 'Entrar na academia' }).click();
  try {
    await page.getByRole('heading', { name: 'Tudo pronto para um novo dia.' }).waitFor({ timeout: 10000 });
  } catch {
    throw new Error(`Novo login falhou após a troca de senha: ${await page.locator('body').innerText()}`);
  }

  assert.deepEqual(pageErrors, []);
  console.log('Ações: navegação, pré-requisitos, CRUD, detalhes, filtros, presença, senha e logout OK.');
} finally {
  await browser.close();
  await new Promise(resolve => server.close(resolve));
  await db.close();
}
