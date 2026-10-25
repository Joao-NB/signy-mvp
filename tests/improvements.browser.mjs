import assert from 'node:assert/strict';
import {chromium} from 'playwright';
import {mkdir} from 'node:fs/promises';
process.env.NODE_ENV='test';process.env.DATA_DIR='memory://';process.env.OPEN_ACCESS='false';process.env.ADMIN_PASSWORD='BrowserMelhorias123!';
for(const key of ['DATABASE_URL','APP_URL','MAIL_FROM','RESEND_API_KEY','MP_ACCESS_TOKEN'])delete process.env[key];
const {app,db}=await import('../server.mjs');
const server=app.listen(0,'127.0.0.1');await new Promise(r=>server.once('listening',r));const origin=`http://127.0.0.1:${server.address().port}`;
let cookie='';async function api(route,body,method=body?'POST':'GET'){const r=await fetch(origin+'/api'+route,{method,headers:{Cookie:cookie,'Content-Type':'application/json'},...(body?{body:JSON.stringify(body)}:{})});const result=await r.json();assert.equal(r.ok,true,JSON.stringify(result));if(route==='/login')cookie=r.headers.get('set-cookie').split(';')[0];return result;}
await api('/login',{login:'admin',senha:'BrowserMelhorias123!'});
const browser=await chromium.launch({headless:true,channel:process.env.PLAYWRIGHT_CHANNEL||'msedge'}),page=await browser.newPage({viewport:{width:1440,height:1000}}),errors=[];
page.setDefaultTimeout(15000);page.on('pageerror',e=>errors.push(e.message));
async function login(login,password){await page.locator('#login-form [name=login]').fill(login);await page.locator('#login-form [name=senha]').fill(password);await page.locator('#login-form [type=submit]').click();await page.locator('[data-action=logout]').waitFor();}
async function logout(){await page.locator('[data-action=logout]').click();await page.waitForFunction(()=>document.querySelector('#login-form [type=submit]')&&!document.querySelector('#login-form [type=submit]').disabled);}
try{
 await mkdir('test-results',{recursive:true});await page.goto(origin);await login('admin','BrowserMelhorias123!');await page.locator('[data-nav=finance]').click();
 await page.getByText('Nenhuma mensalidade encontrada',{exact:true}).waitFor();assert.match(await page.locator('.content').innerText(),/Novas matrículas geram suas parcelas automaticamente/);
 assert.equal(await page.locator('.history-disclosure').getAttribute('open'),null);await page.screenshot({path:'test-results/finance-empty.png',fullPage:true});
 const today=(await api('/overview')).hoje,a=await api('/aluno',{nome:'Teste completo',cpf:'41424344455',data_nascimento:'1995-01-01',email:'browser@example.test'}),p=await api('/professor',{nome:'Professor teste',cpf:'51525354566'}),plan=await api('/plano',{nome:'Plano browser',valor_mensal:100,duracao_meses:5});
 await api('/matricula',{id_aluno:a.id_aluno,id_plano:plan.id_plano,data_inicio:today});await api('/users',{nome:'Recepção teste',login:'recepcao',senha:'Recepcao123!',perfil:'recepcionista'});await api('/users',{nome:'Professor teste',login:'professor',senha:'Professor123!',perfil:'professor',id_professor:p.id_professor});
 await page.locator('[data-nav=aluno]').click();await page.locator('.row-more summary').first().waitFor();
 for(const width of [1440,390,320]){
  await page.setViewportSize({width,height:900});const trigger=page.locator('.row-more summary').first();await trigger.click();
  const menu=page.locator('.row-more[open]>div');assert.equal(await menu.isVisible(),true);const box=await menu.boundingBox();assert.ok(box.x>=0&&box.x+box.width<=width&&box.y+box.height<=900);
  await page.screenshot({path:`test-results/more-${width}.png`,fullPage:true});await page.keyboard.press('Escape');assert.equal(await page.locator('.row-more[open]').count(),0);assert.equal(await trigger.evaluate(el=>el===document.activeElement),true);
  await trigger.press('ArrowDown');assert.equal(await menu.locator('button').evaluate(el=>el===document.activeElement),true);await page.keyboard.press('Tab');assert.equal(await page.locator('.row-more[open]').count(),0);
  await trigger.click();await page.getByRole('heading',{name:'Alunos',exact:true}).click();assert.equal(await page.locator('.row-more[open]').count(),0);
 }
 await page.setViewportSize({width:1440,height:1000});await page.locator('[data-nav=finance]').click();await page.locator('[data-receive]').first().click();await page.locator('#payment-form').waitFor();
 const method=page.locator('#payment-form [name=meio]'),reference=page.locator('#payment-form [name=comprovante]');await reference.fill('Referência preservada');
 for(const [value,placeholder] of [['pix','Identificador da transação PIX'],['cartao','NSU ou código de autorização'],['transferencia','Número do documento da transferência'],['dinheiro','Recebido em dinheiro no balcão']]){
  await method.selectOption(value);assert.match(await reference.getAttribute('placeholder'),new RegExp(placeholder));assert.equal(await reference.inputValue(),'Referência preservada');assert.equal(await reference.evaluate(el=>el.required),value!=='dinheiro');assert.equal(await reference.getAttribute('aria-describedby'),'reference-help reference-error');
 }
 await reference.fill('');await page.getByRole('button',{name:'Confirmar recebimento'}).click();await page.locator('.receipt').waitFor();const receipt=await page.locator('.receipt').innerText();assert.match(receipt,/Registrado pela recepção/);assert.doesNotMatch(receipt,/Referência:|undefined|null/);await page.locator('#close-modal').click();
 await page.locator('#finance-filter [name=q]').fill('ninguém encontrado');await page.locator('#finance-filter [type=submit]').click();await page.getByText('Nenhuma mensalidade corresponde aos filtros.',{exact:true}).waitFor();await page.locator('#clear-finance-filter').click();await page.locator('[data-receive]').first().waitFor();
 await page.route('**/api/finance?**',route=>route.fulfill({status:500,contentType:'application/json',body:JSON.stringify({error:'Falha de teste ao carregar mensalidades.'})}));
 await page.locator('#finance-filter [type=submit]').click();await page.getByRole('button',{name:'Tentar novamente'}).waitFor();assert.equal(await page.getByText('Nenhuma mensalidade encontrada',{exact:true}).count(),0);await page.unroute('**/api/finance?**');await page.getByRole('button',{name:'Tentar novamente'}).click();await page.locator('[data-receive]').first().waitFor();
 await logout();await login('recepcao','Recepcao123!');await page.getByRole('heading',{name:'A academia, hoje.'}).waitFor();assert.equal(await page.locator('.nav-group').filter({hasText:'Relatórios e BI'}).count(),0);assert.match(await page.locator('.account small').innerText(),/@recepcao · Recepcionista/);assert.equal(await page.locator('.nav-group').evaluateAll(groups=>groups.every(g=>g.querySelector('button'))),true);
 await page.locator('[data-nav=finance]').click();await page.locator('[data-receive]').first().waitFor();await page.locator('[data-receive]').first().click();await method.selectOption('dinheiro');await reference.fill('Recebido por Ana');await page.getByRole('button',{name:'Confirmar recebimento'}).click();await page.locator('.receipt').waitFor();assert.match(await page.locator('.receipt').innerText(),/Recebido por Ana/);await page.locator('#close-modal').click();
 await logout();await login('professor','Professor123!');await page.getByRole('heading',{name:'A academia, hoje.'}).waitFor();assert.equal(await page.locator('.nav-group').filter({hasText:/Financeiro|Relatórios e BI/}).count(),0);assert.equal(await page.locator('[data-new=aluno]').count(),0);
 await logout();await login('admin','BrowserMelhorias123!');await page.locator('[data-action=academy]').click();await page.locator('#academy-form').waitFor();for(const [key,value] of Object.entries({nome:'Academia browser',latitude:'-3.73',longitude:'-38.52',raio_metros:'125',precisao_maxima:'50',abertura:'00:00',fechamento:'23:59'}))await page.locator(`#academy-form [name=${key}]`).fill(value);await page.getByRole('button',{name:'Salvar configuração'}).click();await page.waitForFunction(()=>!document.querySelector('#modal').open);
 await api('/access/complete',{token:a.convite.token,senha:'AlunoBrowser123!'});await logout();
 await page.addInitScript(()=>{window.geoMode='denied';Object.defineProperty(navigator,'geolocation',{configurable:true,value:{getCurrentPosition(success,error){if(window.geoMode==='denied')error({code:1});else if(window.geoMode==='timeout')error({code:3});else success({timestamp:Date.now(),coords:{latitude:window.geoMode==='outside'?-3.75:-3.73,longitude:-38.52,accuracy:window.geoMode==='accuracy'?200:10}});}}});});
 await page.reload();await login(a.convite.login,'AlunoBrowser123!');await page.locator('[data-student-nav=frequencia]').click();await page.locator('#student-checkin').waitFor();
 for(const [mode,message] of [['denied','Permita o acesso'],['timeout','O tempo para obter'],['outside','fora da área'],['accuracy','precisão suficiente']]){
  await page.evaluate(m=>window.geoMode=m,mode);await page.locator('#student-checkin').click();await page.waitForFunction(text=>document.querySelector('#checkin-message').textContent.includes(text),message);assert.equal(await page.locator('#student-checkin').isDisabled(),false);
 }
 await page.evaluate(()=>window.geoMode='valid');await page.route('**/api/student/checkin',route=>route.abort());await page.locator('#student-checkin').click();await page.waitForFunction(()=>document.querySelector('#checkin-message').textContent.includes('conectar ao servidor'));assert.equal(await page.locator('#student-checkin').isDisabled(),false);await page.unroute('**/api/student/checkin');
 for(const width of [390,320]){await page.setViewportSize({width,height:900});assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);await page.screenshot({path:`test-results/checkin-${width}.png`,fullPage:true});}
 await page.locator('#student-checkin').click();await page.getByRole('button',{name:'Presença registrada hoje'}).waitFor();assert.equal(await page.getByRole('button',{name:'Presença registrada hoje'}).isDisabled(),true);
 await page.goto(origin+'/#financeiro');await page.getByRole('heading',{name:'Minhas mensalidades'}).waitFor();
 await logout();await login(a.convite.login,'AlunoBrowser123!');await page.getByRole('heading',{name:'Minhas mensalidades'}).waitFor();
 await logout();await page.setViewportSize({width:1440,height:1000});await page.goto(origin+'/#financeiro');await login('admin','BrowserMelhorias123!');await page.getByRole('heading',{name:'Financeiro',exact:true}).waitFor();
 await page.locator('[data-nav=reports]').click();await page.getByRole('heading',{name:'Relatórios e indicadores'}).waitFor();
 assert.deepEqual(errors,[]);console.log('Melhorias: 4 perfis, menus Mais, estado vazio/erro, comprovante contextual, dinheiro sem referência e check-in mobile OK.');
}finally{await browser.close();await new Promise(r=>server.close(r));await db.close();}
