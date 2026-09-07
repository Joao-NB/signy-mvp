import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {mkdir} from 'node:fs/promises';
const require=createRequire(import.meta.url);
const {chromium}=require(process.env.PLAYWRIGHT_MODULE||'playwright');
process.env.NODE_ENV='test';process.env.DATA_DIR='memory://';process.env.ADMIN_PASSWORD='Navegador123!';
delete process.env.DATABASE_URL;
const {app,db}=await import('../server.mjs');
const server=app.listen(0,'127.0.0.1');await new Promise(r=>server.once('listening',r));
const browser=await chromium.launch({headless:true,channel:'msedge'});
const page=await browser.newPage({viewport:{width:1440,height:1050}});const errors=[];page.on('pageerror',e=>errors.push(e.message));
await mkdir('test-results',{recursive:true});
try{
 await page.goto(`http://127.0.0.1:${server.address().port}`);
 await page.locator('[name=login]').fill('admin');await page.locator('[name=senha]').fill('Navegador123!');await page.getByRole('button',{name:'Entrar na academia'}).click();await page.getByRole('heading',{name:'Tudo pronto para um novo dia.'}).waitFor();
 async function form(table,values){await page.locator(`[data-nav="${table}"]`).first().click();await page.locator(`[data-new="${table}"]`).click();for(const [key,value]of Object.entries(values)){const field=page.locator(`#edit-form [name="${key}"]`);if(await field.evaluate(e=>e.tagName)==='SELECT')await field.selectOption(value);else await field.fill(value);}return page.locator('#edit-form [type=submit]');}
 async function save(button){await button.click();await page.waitForFunction(()=>!document.querySelector('#modal').open);}
 await save(await form('aluno',{nome:'Ana Oliveira',cpf:'12345678901',email:'ana@example.test',data_nascimento:'1995-02-20',sexo:'F'}));
 await save(await form('professor',{nome:'Lucas Martins',cpf:'23456789012',especialidade:'Musculação'}));
 await save(await form('plano',{nome:'Essencial',valor_mensal:'129.90',duracao_meses:'1'}));
 await save(await form('exercicio',{nome:'Agachamento livre',grupo_muscular:'Pernas'}));
 await save(await form('matricula',{id_aluno:'1',id_plano:'1'}));
 const sheet=await form('ficha_treino',{descricao:'Treino A — Fortalecimento',id_aluno:'1',id_professor:'1'});await page.locator('#add-exercise').click();await page.locator('[data-key=id_exercicio]').selectOption('1');await page.locator('[data-key=carga_sugerida]').fill('20');await save(sheet);
 await page.locator('[data-detail=ficha_treino]').click();assert.ok((await page.locator('#modal').innerText()).includes('Agachamento livre'));await page.locator('#close-modal').click();
 await save(await form('presenca',{id_aluno:'1'}));
 await page.locator('[data-nav=aluno]').click();await page.locator('[data-edit=aluno]').click();await page.locator('[name=telefone]').fill('81999990000');await save(page.locator('#edit-form [type=submit]'));await page.locator('#search').fill('Ana');assert.equal(await page.locator('tbody tr').count(),1);
 await page.reload();await page.getByRole('heading',{name:'Tudo pronto para um novo dia.'}).waitFor();assert.ok((await page.locator('.stats').innerText()).includes('01'));await page.screenshot({path:'test-results/dashboard-desktop.png',fullPage:true});
 await page.setViewportSize({width:390,height:844});await page.screenshot({path:'test-results/dashboard-mobile.png',fullPage:true});assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false,'Sem overflow horizontal no celular');
 assert.deepEqual(errors,[]);console.log('Browser: login, sete cadastros, treino, presença, edição, consulta, recarga e responsividade OK.');
}finally{await browser.close();await new Promise(r=>server.close(r));await db.close();}
