import assert from 'node:assert/strict';
import {chromium} from 'playwright';
import {mkdir} from 'node:fs/promises';
process.env.NODE_ENV='test';process.env.OPEN_ACCESS='false';process.env.DATA_DIR='memory://';process.env.ADMIN_PASSWORD='CatalogoLocal123!';
for(const key of ['DATABASE_URL','RESEND_API_KEY','MP_ACCESS_TOKEN','APP_URL'])delete process.env[key];
const {app,db}=await import('../server.mjs');
const server=app.listen(0,'127.0.0.1');await new Promise(resolve=>server.once('listening',resolve));
const origin=`http://127.0.0.1:${server.address().port}`;let cookie='';
async function api(path,body,method=body?'POST':'GET'){const response=await fetch(origin+'/api'+path,{method,headers:{'Content-Type':'application/json',Cookie:cookie},...(body?{body:JSON.stringify(body)}:{})});const result=await response.json();if(path==='/login')cookie=response.headers.get('set-cookie')?.split(';')[0];return {status:response.status,result};}
async function create(table,body){const response=await api('/'+table,body);assert.equal(response.status,201,JSON.stringify(response.result));return response.result;}
let browser;
try{
 await api('/login',{login:'admin',senha:'CatalogoLocal123!'});const today=(await api('/overview')).result.hoje;
 const student=await create('aluno',{nome:'Aluno com nome completo extenso para conferir a navegação da academia',cpf:'12345123456',data_nascimento:'1990-05-10'});
 const professor=await create('professor',{nome:'Professor de treinamento funcional e musculação',cpf:'23456234567'});
 const exercise=await create('exercicio',{nome:'Exercício com orientação completa e execução supervisionada',grupo_muscular:'Treino de força'});
 const plan=await create('plano',{nome:'Plano acompanhamento e evolução',valor_mensal:150,duracao_meses:2});
 const enrollment=await create('matricula',{id_aluno:student.id_aluno,id_plano:plan.id_plano,data_inicio:today});
 const workout=await create('ficha_treino',{id_aluno:student.id_aluno,id_professor:professor.id_professor,descricao:'Treino de força e mobilidade',exercicios:[{id_exercicio:exercise.id_exercicio,ordem:1,series:3,repeticoes:12}]});
 for(const [table,id] of [['professor',professor.id_professor],['exercicio',exercise.id_exercicio],['ficha_treino',workout.id_ficha],['plano',plan.id_plano]]){
  assert.equal((await api('/lifecycle/'+table+'/'+id,{ativo:false})).status,200);
  assert.equal((await api('/lifecycle/'+table+'/'+id,{ativo:true})).status,200);
 }
 let bills=(await db.query('SELECT id_mensalidade FROM mensalidade ORDER BY id_mensalidade')).rows;
 await db.query("UPDATE mensalidade SET vencimento=CURRENT_DATE-10 WHERE id_mensalidade=$1",[bills[0].id_mensalidade]);
 await db.query("UPDATE mensalidade SET vencimento=CURRENT_DATE+10 WHERE id_mensalidade=$1",[bills[1].id_mensalidade]);
 let finance=(await api('/finance')).result;
 assert.equal(Number(finance.em_atraso),150);assert.equal(Number(finance.a_vencer),150);assert.equal(Number(finance.pendente),300);
 assert.equal(finance.atrasos.reduce((total,row)=>total+Number(row.valor),0),150);
 assert.equal((await api('/aluno/'+student.id_aluno,undefined,'DELETE')).status,200);
 let catalogue=(await api('/data')).result;
 assert.equal(catalogue.aluno.length,1);assert.ok(catalogue.aluno[0].arquivado_em);assert.equal(catalogue.matricula[0].situacao,'cancelada');assert.equal(catalogue.ficha_treino[0].ativa,false);assert.equal(catalogue.ficha_exercicio.length,1);
 assert.equal((await db.query('SELECT COUNT(*)::int AS count FROM mensalidade')).rows[0].count,2);
 assert.equal((await api('/ficha_treino/'+workout.id_ficha,{ativa:true,exercicios:[{id_exercicio:exercise.id_exercicio,ordem:1,series:3,repeticoes:12}]},'PUT')).status,400,'Editar também deve impedir reativar ficha de aluno desativado.');
 assert.equal((await api('/matricula',{id_aluno:student.id_aluno,id_plano:plan.id_plano,data_inicio:today})).status,400);
 browser=await chromium.launch({headless:true,channel:process.env.PLAYWRIGHT_CHANNEL||'msedge'});
 const page=await browser.newPage({viewport:{width:1440,height:900}});const errors=[];page.on('pageerror',e=>errors.push(e.message));page.on('console',m=>{if(/violates.*(?:style-src|script-src)/i.test(m.text()))errors.push(m.text());});
 await page.goto(origin);await page.locator('[name=login]').fill('admin');await page.locator('[name=senha]').fill('CatalogoLocal123!');await page.locator('#login-form [type=submit]').click();await page.locator('.layout').waitFor();
 await page.locator('.nav [data-nav=aluno]').click();await page.locator('[data-catalog-scope=return]').click();await page.getByRole('heading',{name:'Prontos para voltar.'}).waitFor();await page.locator('[data-reenroll]').click();await page.getByRole('heading',{name:'Rematricular aluno',exact:true}).waitFor();
 await page.locator('[name=id_plano]').selectOption(String(plan.id_plano));await page.getByRole('button',{name:'Confirmar rematrícula'}).click();await page.locator('#modal').waitFor({state:'hidden'});
 catalogue=(await api('/data')).result;assert.equal(catalogue.aluno[0].arquivado_em,null);assert.equal(catalogue.matricula.length,2);assert.equal(catalogue.matricula.find(m=>m.id_matricula===enrollment.id_matricula).situacao,'cancelada');assert.equal(catalogue.ficha_treino[0].ativa,false);
 await mkdir('test-results',{recursive:true});
 for(const width of [1440,1024,390]){
  await page.setViewportSize({width,height:900});
  for(const section of ['aluno','matricula','ficha_treino','exercicio','professor','plano','finance']){
   if(width<=700&&await page.locator('.menu-toggle').getAttribute('aria-expanded')!=='true')await page.locator('.menu-toggle').click();
   await page.locator('.nav [data-nav='+section+']').click();await page.locator('.content .load-state[role=status]').waitFor({state:'detached'});
   const overflow=await page.locator('.content .table-scroll').evaluateAll(els=>els.some(el=>el.scrollWidth>el.clientWidth+1));assert.equal(overflow,false,section+' deve caber na largura '+width);
   assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
  }
 }
 await page.setViewportSize({width:1440,height:900});await page.locator('.nav [data-nav=aluno]').click();await page.locator('[data-edit=aluno]').click();
 const birth=page.locator('[name=data_nascimento]');await birth.locator('..').locator('.date-trigger').click();await page.locator('.signy-calendar').waitFor();await page.locator('.signy-calendar [aria-label=Ano]').selectOption('1992');await page.locator('.signy-calendar [aria-label=Mês]').selectOption('4');await page.locator('[data-day="1992-05-15"]').click();assert.equal(await birth.inputValue(),'1992-05-15');
 await birth.locator('..').locator('.date-trigger').click();await page.screenshot({path:'test-results/catalog-calendar.png'});await page.keyboard.press('Escape');assert.equal(await page.locator('#modal').evaluate(el=>el.open),true);await page.locator('#close-modal').click();
 await page.locator('.nav [data-nav=finance]').click();await page.locator('[data-receive]').first().click();await page.locator('#payment-form').waitFor();
 assert.notEqual(await page.locator('.payment-summary').evaluate(el=>getComputedStyle(el).backgroundColor),'rgb(255, 255, 255)');await page.screenshot({path:'test-results/catalog-receiving.png'});
 await page.locator('[name=meio]').selectOption('dinheiro');await page.getByRole('button',{name:'Confirmar recebimento'}).click();await page.locator('.receipt').waitFor();assert.match(await page.locator('.receipt').innerText(),/150,00/);await page.locator('#close-modal').click();
 const report=(await api('/reports?from='+today+'&to='+today)).result;assert.equal(Number(report.caixa_recebido),150);
 assert.equal(Number(report.carteira_prevista),150);assert.equal(Number(report.carteira_pendente)+Number(report.carteira_liquidada),Number(report.carteira_prevista));
 await page.locator('.nav [data-nav=reports]').click();await page.getByRole('heading',{name:'Caixa e carteira, com contexto.'}).waitFor();assert.deepEqual(errors,[]);
 console.log('Verificação pontual: desativação reversível, histórico e valores preservados, rematrícula, calendários, sete abas sem scroll lateral, recebimento e BI OK.');
}finally{if(browser)await browser.close();await new Promise(resolve=>server.close(resolve));await db.close();}
