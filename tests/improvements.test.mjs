import {test,after} from 'node:test';
import assert from 'node:assert/strict';
import {distanceMeters,validateLocation} from '../attendance.mjs';
import {appOrigin,mailService,mailReady} from '../mail.mjs';
import {migrate} from '../migrations.mjs';
import {fileURLToPath} from 'node:url';
process.env.NODE_ENV='test';process.env.OPEN_ACCESS='false';process.env.DATA_DIR='memory://';process.env.ADMIN_PASSWORD='MelhoriasAdmin123!';
for(const key of ['DATABASE_URL','RESEND_API_KEY','MAIL_FROM','APP_URL','MP_ACCESS_TOKEN','MP_WEBHOOK_SECRET'])delete process.env[key];
const {app,db,finance}=await import('../server.mjs');
const server=app.listen(0,'127.0.0.1');await new Promise(r=>server.once('listening',r));
const base=`http://127.0.0.1:${server.address().port}/api`,nativeFetch=globalThis.fetch;
async function req(route,method='GET',body,cookie=''){const r=await nativeFetch(base+route,{method,headers:{Cookie:cookie,'Content-Type':'application/json'},...(body?{body:JSON.stringify(body)}:{})});return {status:r.status,body:await r.json(),cookie:r.headers.get('set-cookie')?.split(';')[0]};}
const admin=(await req('/login','POST',{login:'admin',senha:'MelhoriasAdmin123!'})).cookie;
const today=(await req('/overview','GET',null,admin)).body.hoje;
let student,studentCookie,plan,enrollment,bills,reception;
after(async()=>{globalThis.fetch=nativeFetch;await new Promise(r=>server.close(r));await db.close();});
test('estado vazio distinto de filtro vazio e geração automática com fila persistente',async()=>{
 const empty=(await req('/finance','GET',null,admin)).body;assert.equal(empty.total_base,0);assert.deepEqual(empty.rows,[]);
 student=(await req('/aluno','POST',{nome:'Aluno localização',cpf:'01020304050',data_nascimento:'1995-05-01',email:'localizacao@example.test'},admin)).body;
 const invite=student.convite;assert.equal((await req('/access/complete','POST',{token:invite.token,senha:'AlunoLocal123!'})).status,200);
 studentCookie=(await req('/login','POST',{login:invite.login,senha:'AlunoLocal123!'})).cookie;
 plan=(await req('/plano','POST',{nome:'Plano preservado',valor_mensal:120,duracao_meses:9},admin)).body;
 enrollment=(await req('/matricula','POST',{id_aluno:student.id_aluno,id_plano:plan.id_plano,data_inicio:today},admin)).body;
 bills=(await req('/finance','GET',null,admin)).body.rows;
 assert.equal(bills.length,9);assert.equal((await req('/finance?q=inexistente','GET',null,admin)).body.total_base,9);
 assert.equal((await db.query("SELECT count(*)::int AS n FROM email_envio WHERE finalidade='financeiro' AND situacao='fila'")).rows[0].n,9);
 await req('/users','POST',{nome:'Recepção',login:'recepcao',senha:'Recepcao123!',perfil:'recepcionista'},admin);reception=(await req('/login','POST',{login:'recepcao',senha:'Recepcao123!'})).cookie;
});
test('dinheiro aceita referência vazia e observação; outros meios mantêm rastreabilidade e limite',async()=>{
 const pay=(id,body)=>req(`/finance/${id}/pay`,'POST',body,reception);
 assert.equal((await pay(bills[0].id_mensalidade,{meio:'dinheiro',comprovante:''})).status,200);
 const receipt=(await req(`/finance/${bills[0].id_mensalidade}/receipt`,'GET',null,studentCookie)).body;
 assert.equal(receipt.pagamento.comprovante,null);
 assert.equal((await pay(bills[1].id_mensalidade,{meio:'dinheiro',comprovante:'  Caixa da manhã  '})).status,200);
 assert.equal((await req(`/finance/${bills[1].id_mensalidade}/receipt`,'GET',null,studentCookie)).body.pagamento.comprovante,'Caixa da manhã');
 for(const [index,meio] of ['pix','cartao','transferencia'].entries()){
  const id=bills[index+2].id_mensalidade;
  assert.equal((await pay(id,{meio,comprovante:''})).status,400);
  assert.equal((await pay(id,{meio,comprovante:' '.repeat(5)})).status,400);
  assert.equal((await pay(id,{meio,comprovante:'x'.repeat(301)})).status,400);
  const reference=index===2?'x'.repeat(300):'Referência livre, sem formato artificial';
  assert.equal((await pay(id,{meio,comprovante:reference})).status,200);
  assert.equal((await req(`/finance/${id}/receipt`,'GET',null,studentCookie)).body.pagamento.comprovante,reference);
 }
 assert.equal((await pay(bills[5].id_mensalidade,{meio:'boleto',comprovante:'errado'})).status,400);
 assert.equal((await pay(bills[5].id_mensalidade,{meio:'pix',comprovante:{codigo:'objeto inválido'}})).status,400);
 assert.equal((await req(`/finance/${bills[5].id_mensalidade}/pay`,'POST',{meio:'dinheiro'},studentCookie)).status,403);
});
test('regularização rejeita matrícula inexistente, preserva contrato e confirma valor sem histórico',async()=>{
 assert.equal((await req('/finance/generate/999999','POST',{},reception)).status,404);
 assert.equal((await req('/finance/generate/abc','POST',{},reception)).status,400);
 assert.equal((await req('/finance/generate/'+enrollment.id_matricula,'POST',{},reception)).body.count,0);
 const old=(await db.query("INSERT INTO matricula(id_aluno,id_plano,data_inicio,data_fim,situacao) VALUES($1,$2,'2020-01-31','2020-10-31','vencida') RETURNING *",[student.id_aluno,plan.id_plano])).rows[0];
 await req('/plano/'+plan.id_plano,'PUT',{valor_mensal:250},admin);
 const preview=(await req('/finance/enrollment/'+old.id_matricula,'GET',null,reception)).body;assert.equal(Number(preview.valor_mensal),250);
 assert.equal((await req('/finance/generate/'+old.id_matricula,'POST',{},reception)).status,400);
 assert.equal((await req('/finance/generate/'+old.id_matricula,'POST',{confirmar_valor_atual:true,valor_confirmado:120},reception)).status,400);
 const generated=await req('/finance/generate/'+old.id_matricula,'POST',{confirmar_valor_atual:true,valor_confirmado:250},reception);assert.equal(generated.body.count,9);
 await req('/plano/'+plan.id_plano,'PUT',{valor_mensal:300},admin);
 assert.equal((await req('/finance/generate/'+old.id_matricula,'POST',{},reception)).body.count,0);
 assert.ok((await db.query('SELECT valor FROM mensalidade WHERE id_matricula=$1',[enrollment.id_matricula])).rows.every(m=>Number(m.valor)===120));
 assert.ok((await db.query('SELECT valor FROM mensalidade WHERE id_matricula=$1',[old.id_matricula])).rows.every(m=>Number(m.valor)===250));
});
const config={nome:'Academia de teste',latitude:-3.73,longitude:-38.52,raio_metros:125,precisao_maxima:50,abertura:'00:00',fechamento:'23:59'};
const position=()=>({latitude:config.latitude,longitude:config.longitude,accuracy:10,timestamp:Date.now()});
test('check-in valida precisão, raio, horário, sessão e matrícula sem gravar coordenadas',async()=>{
 assert.equal((await req('/student/checkin','POST',position())).status,401);
 assert.equal((await req('/student/checkin','POST',position(),admin)).status,403);
 assert.equal((await req('/student/checkin','POST',position(),studentCookie)).status,503);
 assert.equal((await req('/academy/settings','PUT',config,reception)).status,403);
 assert.equal((await req('/academy/settings','PUT',{...config,latitude:91},admin)).status,400);
 assert.equal((await req('/academy/settings','PUT',config,admin)).status,200);
 assert.equal((await req('/student/checkin','POST',{...position(),id_aluno:999},studentCookie)).status,403);
 for(const invalid of [{latitude:config.latitude+0.01},{accuracy:100},{timestamp:Date.now()-120000},{longitude:'-38.52'},{latitude:NaN}])assert.equal((await req('/student/checkin','POST',{...position(),...invalid},studentCookie)).status,400);
 await req('/academy/settings','PUT',{...config,abertura:'00:00',fechamento:'00:01'},admin);
 assert.equal((await req('/student/checkin','POST',position(),studentCookie)).status,400);
 await req('/academy/settings','PUT',config,admin);
 const parallel=await Promise.all([req('/student/checkin','POST',position(),studentCookie),req('/student/checkin','POST',position(),studentCookie)]);
 assert.deepEqual(parallel.map(r=>r.status).sort(),[201,409]);
 assert.equal((await req('/student','GET',null,studentCookie)).body.presencas.length,1);
 const columns=(await db.query("SELECT column_name FROM information_schema.columns WHERE table_name='presenca'")).rows.map(r=>r.column_name);assert.equal(columns.includes('latitude'),false);
 await db.query("UPDATE matricula SET situacao='cancelada' WHERE id_matricula=$1",[enrollment.id_matricula]);
 await db.query('DELETE FROM presenca WHERE id_aluno=$1',[student.id_aluno]);assert.equal((await req('/student/checkin','POST',position(),studentCookie)).status,400);
 await db.query("UPDATE matricula SET situacao='ativa' WHERE id_matricula=$1",[enrollment.id_matricula]);
});
test('distância e margem de precisão não ampliam o raio permitido',()=>{
 assert.equal(distanceMeters(0,0,0,0),0);assert.ok(Math.abs(distanceMeters(0,0,0,1)-111195)<1);
 assert.throws(()=>validateLocation({...position(),latitude:config.latitude+0.0009,accuracy:40},config),/limite/);
 assert.doesNotThrow(()=>validateLocation(position(),config));
});
test('Resend registra aceitação e entrega separadas; recuperação usa token temporário e login novo',async()=>{
 process.env.APP_URL='https://signy.example.test';process.env.RESEND_API_KEY='test-key';process.env.MAIL_FROM='Signy <acesso@example.test>';
 let sent=[],failure=false;
 globalThis.fetch=async(url,options)=>{if(String(url)==='https://api.resend.com/emails'){if(failure)return Response.json({message:'domain invalid'},{status:403});sent.push(JSON.parse(options.body));return Response.json({id:'email-test-'+sent.length});}if(String(url).startsWith('https://api.resend.com/emails/'))return Response.json({last_event:'delivered'});return nativeFetch(url,options);};
 const unknown=await req('/recovery/request','POST',{identificacao:'ausente@example.test'}),known=await req('/recovery/request','POST',{identificacao:'localizacao@example.test'});assert.deepEqual(unknown,known);
 for(let n=0;n<100&&!sent.length;n++)await new Promise(r=>setTimeout(r,20));assert.equal(sent.length,1);
 const token=sent[0].text.match(/recuperacao=([a-f0-9]{64})/)[1];assert.ok(sent[0].text.includes(student.convite.login));
 assert.equal((await req('/access/complete','POST',{token,senha:'NovaAluno123!'})).status,200);
 assert.equal((await req('/access/complete','POST',{token,senha:'NovaAluno123!'})).status,400);
 const logged=await req('/login','POST',{login:student.convite.login,senha:'NovaAluno123!'});assert.equal(logged.status,200);studentCookie=logged.cookie;
 assert.equal((await req('/student','GET',null,studentCookie)).status,200);
 const entry=(await db.query("SELECT * FROM email_envio WHERE finalidade='recuperacao' ORDER BY id DESC LIMIT 1")).rows[0];assert.equal(entry.situacao,'aceito');assert.equal((await mailService(db).delivery(entry.id)).situacao,'entregue');
 failure=true;const response=await req('/recovery/request','POST',{identificacao:'localizacao@example.test'});assert.deepEqual(response.body,known.body);
 for(let n=0;n<100;n++){if((await db.query("SELECT id FROM email_envio WHERE finalidade='recuperacao' AND situacao='falha'")).rows.length)break;await new Promise(r=>setTimeout(r,20));}
 assert.equal((await db.query("SELECT erro FROM email_envio WHERE finalidade='recuperacao' AND situacao='falha'")).rows[0].erro,'resend_http_403');
 assert.ok(!(await db.query('SELECT * FROM token_acesso')).rows.some(t=>t.token_hash===token));
 assert.equal((await req('/students/'+student.id_aluno+'/invite','POST',{},reception)).status,400);
 globalThis.fetch=nativeFetch;
});
test('URLs e remetentes inválidos não habilitam o envio',()=>{
 const origin=process.env.APP_URL,from=process.env.MAIL_FROM;
 for(const url of ['http://example.test','https://usuario:senha@example.test','https://example.test/subpath','invalid']){process.env.APP_URL=url;assert.equal(appOrigin(),null);assert.equal(mailReady(),false);}
 process.env.APP_URL=origin;process.env.MAIL_FROM='invalid';assert.equal(mailReady(),false);process.env.MAIL_FROM=from;
});
test('fila financeira, idempotência do checkout, reenvio e confirmação autenticada',async()=>{
 process.env.MP_ACCESS_TOKEN='test-token';process.env.MP_WEBHOOK_SECRET='test-secret';let preferences=0,sends=0,captured;
 globalThis.fetch=async(url,options)=>{
  if(String(url).endsWith('/checkout/preferences')){preferences++;captured=JSON.parse(options.body);assert.ok(captured.payment_methods.excluded_payment_types.some(p=>p.id==='ticket'));assert.ok(captured.payment_methods.excluded_payment_types.some(p=>p.id==='debit_card'));return Response.json({id:'pref-test-'+preferences,init_point:'https://www.mercadopago.com.br/checkout/v1/redirect?pref_id='+preferences});}
  if(String(url)==='https://api.resend.com/emails'){const text=JSON.parse(options.body).text;assert.ok(text.includes('PIX dinâmico'));assert.ok(text.includes('Portal financeiro'));sends++;return Response.json({id:'financial-mail-'+sends});}
  if(String(url).startsWith('https://api.resend.com/emails/'))return Response.json({last_event:'delivered'});
  return nativeFetch(url,options);
 };
 await finance.runEmailQueue();await finance.runEmailQueue();assert.equal(sends,13);
 const bill=bills[5],id=bill.id_mensalidade;
 assert.equal((await req(`/finance/${id}/checkout`,'POST',{},studentCookie)).status,200);const count=preferences;
 assert.equal((await req(`/finance/${id}/checkout`,'POST',{},studentCookie)).status,200);assert.equal(preferences,count);
 assert.equal((await req(`/finance/${id}`,'GET',null,studentCookie)).body.status,'pendente');
 assert.equal((await req(`/finance/${id}/email`,'POST',{},studentCookie)).status,403);
 assert.equal((await req(`/finance/${id}/email`,'POST',{},reception)).status,400);
 await db.query("UPDATE email_envio SET criado_em=NOW()-INTERVAL '6 minutes' WHERE id_mensalidade=$1",[id]);
 assert.equal((await req(`/finance/${id}/email`,'POST',{},reception)).status,202);assert.equal((await req(`/finance/${id}/email`,'POST',{},reception)).status,400);
 const c=(await db.query('SELECT * FROM checkout WHERE id_mensalidade=$1',[id])).rows[0];
 const payment={id:777,status:'pending',external_reference:`signy-${id}`,currency_id:'BRL',transaction_amount:120,payment_type_id:'bank_transfer',payment_method_id:'pix',metadata:{signy_checkout_key:c.chave,signy_student_id:student.id_aluno},date_last_updated:'2026-10-14T12:00:00Z'};
 await assert.rejects(()=>finance.reconcile({...payment,metadata:{...payment.metadata,signy_student_id:999}}),/aluno/);
 await assert.rejects(()=>finance.reconcile({...payment,transaction_amount:1}),/Valor/);
 await assert.rejects(()=>finance.reconcile({...payment,payment_type_id:'ticket'}),/escopo/);
 await assert.rejects(()=>finance.reconcile({...payment,status:'approved',transaction_amount_refunded:20}),/Reembolso parcial/);
 await finance.reconcile(payment);assert.equal((await req(`/finance/${id}`,'GET',null,studentCookie)).body.estado_gateway,'pendente');
 await finance.reconcile({...payment,status:'approved',date_last_updated:'2026-10-14T12:01:00Z'});await finance.reconcile({...payment,status:'approved',date_last_updated:'2026-10-14T12:01:00Z'});
 assert.equal((await db.query("SELECT count(*)::int AS n FROM pagamento WHERE referencia='mp-777'")).rows[0].n,1);
 assert.equal((await req(`/finance/${id}`,'GET',null,studentCookie)).body.status,'pago');
 await finance.reconcile({...payment,status:'refunded',date_last_updated:'2026-10-14T12:02:00Z'});
 await finance.reconcile({...payment,status:'approved',date_last_updated:'2026-10-14T12:01:00Z'});assert.equal((await req(`/finance/${id}`,'GET',null,studentCookie)).body.status,'pendente');
 const send=(await db.query("SELECT id FROM email_envio WHERE id_mensalidade=$1 AND situacao='aceito' LIMIT 1",[id])).rows[0];assert.equal((await req(`/finance/${id}/email/${send.id}/status`,'POST',{},reception)).body.situacao,'entregue');
 assert.equal(captured.metadata.signy_student_id,student.id_aluno);
 // Uma rejeição de entrega posterior à aceitação não volta automaticamente à fila.
 await finance.runEmailQueue();const beforeBounce=sends;
 await db.query("UPDATE email_envio SET situacao='falha',evento_provedor='bounced',proxima_tentativa=NOW()-INTERVAL '1 minute' WHERE id=$1",[send.id]);
 await finance.runEmailQueue();assert.equal(sends,beforeBounce);
 globalThis.fetch=nativeFetch;
});
test('convite reenviado invalida o anterior, usa e-mail atual e respeita vínculos exclusivos',async()=>{
 for(const key of ['RESEND_API_KEY','MAIL_FROM','APP_URL'])delete process.env[key];
 const pending=(await req('/aluno','POST',{nome:'Aluno convite',cpf:'61626364677',data_nascimento:'1995-01-01',email:'convite@example.test'},reception)).body;
 await req('/aluno/'+pending.id_aluno,'PUT',{email:'novo-convite@example.test'},reception);
 const resent=(await req('/students/'+pending.id_aluno+'/invite','POST',{},reception)).body;
 assert.notEqual(resent.token,pending.convite.token);
 assert.equal((await req('/access/complete','POST',{token:pending.convite.token,senha:'ConviteAluno123!'})).status,400);
 const account=(await db.query('SELECT * FROM usuario WHERE id_aluno=$1',[pending.id_aluno])).rows[0];assert.equal(account.email,'novo-convite@example.test');
 await db.query("UPDATE token_acesso SET expira=NOW()-INTERVAL '1 minute' WHERE id_usuario=$1",[account.id]);
 assert.equal((await req('/access/complete','POST',{token:resent.token,senha:'ConviteAluno123!'})).status,400);
 const next=(await req('/students/'+pending.id_aluno+'/invite','POST',{},reception)).body;
 assert.equal((await req('/access/complete','POST',{token:next.token,senha:'ConviteAluno123!'})).status,200);
 assert.equal((await req('/login','POST',{login:next.login,senha:'ConviteAluno123!'})).body.id_aluno,pending.id_aluno);
 assert.equal((await req('/users/'+account.id+'/approve','POST',{},admin)).status,404);
 const conflict=(await req('/aluno','POST',{nome:'Aluno e-mail ocupado',cpf:'71727374788',data_nascimento:'1995-01-01',email:'ocupado@example.test'},reception)).body;
 await db.query('UPDATE usuario SET email=$1 WHERE login=$2',['equipe-ocupada@example.test','admin']);
 await req('/aluno/'+conflict.id_aluno,'PUT',{email:'equipe-ocupada@example.test'},reception);
 assert.equal((await req('/students/'+conflict.id_aluno+'/invite','POST',{},reception)).status,400);
 assert.equal((await db.query('SELECT count(*)::int AS n FROM usuario WHERE id_aluno=$1',[pending.id_aluno])).rows[0].n,1);
 assert.equal((await req('/access/complete','POST',{token:'token inválido',senha:'OutraSenha123!'})).status,400);
 assert.equal((await req('/access/complete','POST',{token:next.token,senha:'OutraSenha123!'})).status,429);
});
test('migração versionada reaplica sem apagar dados',async()=>{
 // A conexão instrumentada expõe só query; usa uma conexão nova para validar o runner real.
 const {PGlite}=await import('@electric-sql/pglite'),{readFile}=await import('node:fs/promises');
 const isolated=new PGlite('memory://'),root=fileURLToPath(new URL('../',import.meta.url));
 try{await isolated.exec(await readFile(new URL('../schema.sql',import.meta.url),'utf8'));await migrate(isolated,root);await isolated.query("INSERT INTO configuracao_academia(latitude,longitude,raio_metros,precisao_maxima,abertura,fechamento) VALUES(0,0,125,50,'06:00','22:00')");await migrate(isolated,root);assert.equal((await isolated.query('SELECT count(*)::int AS n FROM schema_migration')).rows[0].n,1);assert.equal((await isolated.query('SELECT raio_metros FROM configuracao_academia')).rows[0].raio_metros,125);}finally{await isolated.close();}
});
