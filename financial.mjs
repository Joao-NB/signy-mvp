import {randomUUID,createHmac,timingSafeEqual} from 'node:crypto';
import {requirePermission,permissions} from './permissions.mjs';
import {mailService,mailReady,appOrigin} from './mail.mjs';
export async function generateInstallments(tx,id,userId){
 const rows=(await tx.query(`INSERT INTO mensalidade(id_matricula,competencia,vencimento,valor)
 SELECT m.id_matricula,date_trunc('month',m.data_inicio + make_interval(months=>n))::date,(m.data_inicio + make_interval(months=>n))::date,COALESCE(m.valor_contratado,p.valor_mensal)
 FROM matricula m JOIN plano p USING(id_plano),generate_series(0,COALESCE(m.meses_contratados,p.duracao_meses)-1) n WHERE m.id_matricula=$1
 ON CONFLICT(id_matricula,competencia) DO NOTHING RETURNING id_mensalidade`,[id])).rows;
 for(const row of rows){await tx.query("INSERT INTO evento_financeiro(id_mensalidade,tipo,detalhe,id_usuario) VALUES($1,'criacao','Mensalidade gerada conforme os dados da matrícula.',$2)",[row.id_mensalidade,userId]);await tx.query("INSERT INTO email_envio(finalidade,id_mensalidade,chave) VALUES('financeiro',$1,$2)",[row.id_mensalidade,`mensalidade-${row.id_mensalidade}`]);}
 return rows.length;
}
const isoDay=value=>value instanceof Date?value.toISOString().slice(0,10):String(value).slice(0,10);
export const effectiveStatus=m=>m.situacao==='pendente'&&isoDay(m.vencimento)<m.hoje?'atraso':m.situacao;
export function validWebhook(req,secret){
 const id=String(req.query['data.id']||'').toLowerCase(),requestId=req.headers['x-request-id'],parts=Object.fromEntries(String(req.headers['x-signature']||'').split(',').map(x=>x.trim().split('=')));
 if(!secret||!id||!requestId||!/^\d+$/.test(parts.ts||'')||!/^[a-f0-9]{64}$/.test(parts.v1||''))return false;
 const time=Number(parts.ts)*(parts.ts.length>10?1:1000);if(Math.abs(Date.now()-time)>300000)return false;
 const expected=createHmac('sha256',secret).update(`id:${id};request-id:${requestId};ts:${parts.ts};`).digest();return timingSafeEqual(expected,Buffer.from(parts.v1,'hex'));
}
export function financialModule(db){
 const mail=mailService(db);
 const q=async(sql,params=[]) => (await db.query(sql,params)).rows;
 const ready=()=>Boolean(process.env.MP_ACCESS_TOKEN&&process.env.MP_WEBHOOK_SECRET&&appOrigin()?.startsWith('https://'));
 async function mp(route,method='GET',body,key){
  try{const r=await fetch('https://api.mercadopago.com'+route,{method,signal:AbortSignal.timeout(15000),headers:{Authorization:`Bearer ${process.env.MP_ACCESS_TOKEN}`,'Content-Type':'application/json',...(key?{'X-Idempotency-Key':key}:{})},...(body?{body:JSON.stringify(body)}:{})});const result=await r.json();if(!r.ok)throw Error('gateway');return result;}
  catch{console.error('Falha na comunicação com Mercado Pago',{operacao:method,rota:route.split('?')[0]});throw Object.assign(Error('Não foi possível consultar o serviço de pagamento. Tente novamente.'),{status:502});}
 }
 async function charge(id,user){const [m]=await q(`SELECT m.*,COALESCE((SELECT situacao FROM pagamento pg WHERE pg.id_mensalidade=m.id_mensalidade AND pg.provedor='mercadopago' ORDER BY pg.id_pagamento DESC LIMIT 1),CASE WHEN EXISTS(SELECT 1 FROM checkout c WHERE c.id_mensalidade=m.id_mensalidade AND c.url IS NOT NULL AND c.expira>NOW()) THEN 'pendente' END) AS estado_gateway,a.id_aluno,a.nome,a.email,TO_CHAR(CURRENT_DATE,'YYYY-MM-DD') AS hoje FROM mensalidade m JOIN matricula mt USING(id_matricula) JOIN aluno a USING(id_aluno) WHERE id_mensalidade=$1`,[id]);if(!m){const e=Error('Mensalidade não encontrada.');e.status=404;throw e;}if(user.perfil==='aluno'?m.id_aluno!==user.id_aluno:!permissions[user.perfil]?.finance){const e=Error('Seu perfil não tem acesso a esta mensalidade.');e.status=403;throw e;}return m;}
 async function reconcile(payment){
  if(!/^\d+$/.test(String(payment.id||'')))throw Error('Identificador de pagamento inválido.');
  const reference=String(payment.external_reference||'');if(!/^signy-\d+$/.test(reference))throw Error('Referência de pagamento inválida.');const id=Number(reference.slice(6));
  return db.transaction(async tx=>{
   const m=(await tx.query('SELECT * FROM mensalidade WHERE id_mensalidade=$1 FOR UPDATE',[id])).rows[0];if(!m||payment.currency_id!=='BRL'||Math.round(Number(payment.transaction_amount)*100)!==Math.round(Number(m.valor)*100))throw Error('Valor ou moeda não corresponde à mensalidade.');
   if(Number(payment.transaction_amount_refunded)>0&&Number(payment.transaction_amount_refunded)<Number(payment.transaction_amount))throw Error('Reembolso parcial: solicite revisão financeira na recepção antes de alterar a mensalidade.');
   const checkout=(await tx.query('SELECT * FROM checkout WHERE id_mensalidade=$1',[id])).rows[0];
   const student=(await tx.query('SELECT id_aluno FROM matricula WHERE id_matricula=$1',[m.id_matricula])).rows[0];
   if(!checkout)throw Error('A transação não corresponde ao checkout desta mensalidade.');
   if(payment.metadata?.signy_checkout_key!==checkout.chave||Number(payment.metadata?.signy_student_id)!==student.id_aluno){
    // Se o provedor não propagar metadata, validar a preferência pela ordem oficial.
    let legacyPreference=null;try{legacyPreference=new URL(checkout.url).searchParams.get('pref_id');}catch{}
    const preferenceId=checkout.preference_id||legacyPreference;
    if(payment.metadata?.signy_checkout_key||!preferenceId||!/^\d+$/.test(String(payment.order?.id||'')))throw Error('A transação não corresponde ao checkout e ao aluno desta mensalidade.');
    const order=await mp('/merchant_orders/'+payment.order.id);
    if(order.preference_id!==preferenceId||order.external_reference!==reference||!order.payments?.some(p=>String(p.id)===String(payment.id)))throw Error('A ordem do gateway não corresponde à cobrança da matrícula.');
   }
   if(!['credit_card','bank_transfer'].includes(payment.payment_type_id)||payment.payment_type_id==='bank_transfer'&&payment.payment_method_id!=='pix')throw Error('Meio de pagamento fora do escopo PIX/cartão de crédito.');
   const states={approved:'confirmado',refunded:'estornado',charged_back:'estornado',rejected:'rejeitado',cancelled:'cancelado',pending:'pendente',in_process:'pendente',authorized:'pendente'};
   const state=states[payment.status];if(!state)throw Error('Situação do gateway desconhecida. Conciliação necessária.');
   const ref=`mp-${payment.id}`;const existing=(await tx.query('SELECT * FROM pagamento WHERE referencia=$1',[ref])).rows[0];
   if(existing&&existing.id_mensalidade!==id)throw Error('Transação já vinculada a outra mensalidade.');
   const updated=payment.date_last_updated?new Date(payment.date_last_updated):null;
   if(updated&&Number.isNaN(updated.getTime()))throw Error('Data de atualização do gateway inválida.');
   if(existing?.atualizado_gateway&&updated&&updated<=new Date(existing.atualizado_gateway))return {ok:true};
   if(existing?.situacao===state||existing?.situacao==='estornado'||existing?.situacao==='confirmado'&&['pendente','rejeitado','cancelado'].includes(state))return {ok:true};
   if(state==='confirmado'&&m.situacao==='cancelado')throw Error('Cobrança cancelada: conciliação manual necessária.');
   if(state==='confirmado'&&(await tx.query("SELECT id_pagamento FROM pagamento WHERE id_mensalidade=$1 AND situacao='confirmado' AND referencia<>$2",[id,ref])).rows.length)throw Error('Pagamento duplicado: conciliação manual necessária.');
   await tx.query(`INSERT INTO pagamento(id_mensalidade,provedor,referencia,valor,meio,situacao,confirmado_em) VALUES($1,'mercadopago',$2,$3,$4,$5,CASE WHEN $5='confirmado' THEN NOW() ELSE NULL END)
    ON CONFLICT(referencia) DO UPDATE SET situacao=EXCLUDED.situacao,confirmado_em=COALESCE(pagamento.confirmado_em,EXCLUDED.confirmado_em)`,[id,ref,m.valor,payment.payment_method_id||'gateway',state]);
   if(updated)await tx.query('UPDATE pagamento SET atualizado_gateway=$2 WHERE referencia=$1',[ref,updated]);
   if(state==='confirmado')await tx.query("UPDATE mensalidade SET situacao='pago',pago_em=NOW() WHERE id_mensalidade=$1",[id]);
   if(state==='estornado'&&m.situacao==='pago'&&!(await tx.query("SELECT id_pagamento FROM pagamento WHERE id_mensalidade=$1 AND situacao='confirmado'",[id])).rows.length)await tx.query("UPDATE mensalidade SET situacao='pendente',pago_em=NULL WHERE id_mensalidade=$1",[id]);
   await tx.query('INSERT INTO evento_financeiro(id_mensalidade,chave,tipo,detalhe) VALUES($1,$2,$3,$4) ON CONFLICT(chave) DO NOTHING',[id,`${ref}-${state}-${payment.date_last_updated||''}`,state,`Mercado Pago: ${payment.status}`]);return {ok:true};
  });
 }
 async function checkout(m){
  if(m.situacao!=='pendente')throw Error('Esta mensalidade já foi paga ou cancelada.');
  // Reserve a chave antes da chamada externa: um timeout deve reutilizá-la.
  await db.transaction(async tx=>{const row=(await tx.query('SELECT situacao FROM mensalidade WHERE id_mensalidade=$1 FOR UPDATE',[m.id_mensalidade])).rows[0];if(row.situacao!=='pendente')throw Error('Esta mensalidade já foi paga ou cancelada.');await tx.query("INSERT INTO checkout(id_mensalidade,chave,expira) VALUES($1,$2,NOW()+INTERVAL '1 day') ON CONFLICT(id_mensalidade) DO NOTHING",[m.id_mensalidade,randomUUID()]);});
  // O lock também impede que pagamento manual concorra com a criação da preferência.
  return db.transaction(async tx=>{
   const current=(await tx.query('SELECT * FROM mensalidade WHERE id_mensalidade=$1 FOR UPDATE',[m.id_mensalidade])).rows[0];
   if(current.situacao!=='pendente')throw Error('Esta mensalidade já foi paga ou cancelada.');
   let c=(await tx.query('SELECT * FROM checkout WHERE id_mensalidade=$1',[m.id_mensalidade])).rows[0];
   if(c&&new Date(c.expira)<=new Date())throw Error('Cobrança expirada. A recepção precisa conciliar no provedor.');
   if(c?.url)return {url:c.url};
   const preference=await mp('/checkout/preferences','POST',{items:[{id:String(m.id_mensalidade),title:`Signy · Mensalidade ${isoDay(m.competencia).slice(0,7)}`,quantity:1,currency_id:'BRL',unit_price:Number(m.valor)}],...(m.email?{payer:{email:m.email}}:{}),external_reference:`signy-${m.id_mensalidade}`,metadata:{signy_checkout_key:c.chave,signy_student_id:m.id_aluno},notification_url:new URL('/api/payments/webhook',appOrigin()).href,back_urls:{success:appOrigin(),pending:appOrigin(),failure:appOrigin()},expires:true,expiration_date_to:new Date(c.expira).toISOString(),payment_methods:{excluded_payment_types:[{id:'ticket'},{id:'atm'},{id:'debit_card'},{id:'prepaid_card'},{id:'account_money'}]}},c.chave);
   const url=process.env.MP_SANDBOX==='true'?preference.sandbox_init_point:preference.init_point;
   if(!url||!/^https:\/\/([a-z0-9-]+\.)?mercadopago\.(com|com\.br)\//.test(url))throw Error('Endereço de pagamento inválido.');
   await tx.query('UPDATE checkout SET url=$2,preference_id=$3 WHERE id_mensalidade=$1',[m.id_mensalidade,url,preference.id||null]);return {url};
  });
 }
 let processing=false;
 async function runEmailQueue(){
  if(processing||!mailReady())return;processing=true;
  try{for(let n=0;n<10;n++){
   const entry=await db.transaction(async tx=>{
    const row=(await tx.query("SELECT * FROM email_envio WHERE finalidade='financeiro' AND provedor_id IS NULL AND tentativas<5 AND ((situacao IN ('fila','falha') AND proxima_tentativa<=NOW()) OR (situacao='processando' AND atualizado_em<NOW()-INTERVAL '2 minutes')) ORDER BY id LIMIT 1 FOR UPDATE SKIP LOCKED")).rows[0];
    if(!row)return null;await tx.query("UPDATE email_envio SET situacao='processando',tentativas=tentativas+1,atualizado_em=NOW(),proxima_tentativa=NOW()+INTERVAL '5 minutes' WHERE id=$1",[row.id]);return row;
   });if(!entry)break;
   try{
    const m=await charge(entry.id_mensalidade,{perfil:'administrador'});
    if(m.situacao!=='pendente'){await q("UPDATE email_envio SET situacao='cancelado',atualizado_em=NOW() WHERE id=$1",[entry.id]);continue;}
    const [academy]=await q('SELECT nome FROM configuracao_academia WHERE id=1');
    const link=ready()?(await checkout(m)).url:null;
    const result=await mail.send({entryId:entry.id,key:entry.chave,to:m.email,purpose:'financeiro',billId:m.id_mensalidade,subject:`${academy?.nome||'Signy'} · Mensalidade ${isoDay(m.competencia).slice(0,7)}`,text:`${academy?.nome||'Academia Signy'}\nOlá, ${m.nome}.\nMensalidade ${m.id_mensalidade} · matrícula ${m.id_matricula}\nCompetência: ${isoDay(m.competencia).slice(0,7)}\nValor: R$ ${Number(m.valor).toFixed(2)}\nVencimento: ${isoDay(m.vencimento)}\n${link?`Pague com PIX dinâmico ou cartão de crédito: ${link}\nO QR Code e o código PIX são apresentados no checkout seguro do Mercado Pago.`:'Pagamento online indisponível. Consulte a recepção para registrar o recebimento.'}\nPortal financeiro: ${appOrigin()}/#financeiro\nO envio desta mensagem não confirma o pagamento.`});
    await q("INSERT INTO evento_financeiro(id_mensalidade,tipo,detalhe) VALUES($1,'email',$2)",[m.id_mensalidade,result.enviado?'Envio de cobrança aceito pelo Resend; entrega ainda não confirmada.':'Falha no envio da cobrança. Será tentado novamente, até o limite de 5 tentativas.']);
   }catch{await q("UPDATE email_envio SET situacao='falha',erro='preparacao_cobranca',atualizado_em=NOW() WHERE id=$1",[entry.id]);console.error('Falha na preparação do e-mail financeiro',{id_envio:entry.id});}
  }}finally{processing=false;}
 }
 function publicRoutes(app){app.post('/api/payments/webhook',async(req,res)=>{if(!ready()||!validWebhook(req,process.env.MP_WEBHOOK_SECRET))return res.status(401).json({error:'Assinatura inválida.'});if(req.body.type!=='payment')return res.json({ok:true});const id=String(req.query['data.id']);if(!/^\d+$/.test(id)||String(req.body.data?.id)!==id)return res.status(400).json({error:'Notificação inválida.'});res.json(await reconcile(await mp('/v1/payments/'+id)));});}
 function protectedRoutes(app){
  app.post('/api/finance/:id/email',requirePermission('finance'),async(req,res)=>{
   const m=await charge(req.params.id,req.user);if(m.situacao!=='pendente')throw Error('Envie cobranças somente para mensalidades pendentes.');if(!m.email)throw Error('Cadastre o e-mail do aluno para enviar a cobrança.');if(!mailReady())return res.status(503).json({error:'E-mail indisponível. Peça ao administrador para conferir a configuração.'});
   await db.transaction(async tx=>{await tx.query('SELECT id_mensalidade FROM mensalidade WHERE id_mensalidade=$1 FOR UPDATE',[m.id_mensalidade]);if((await tx.query("SELECT id FROM email_envio WHERE id_mensalidade=$1 AND (criado_em>NOW()-INTERVAL '5 minutes' OR situacao IN ('fila','processando'))",[m.id_mensalidade])).rows.length)throw Error('Uma cobrança foi solicitada recentemente ou ainda está na fila. Aguarde antes de reenviar.');await tx.query("INSERT INTO email_envio(finalidade,id_mensalidade,chave,id_usuario) VALUES('financeiro',$1,$2,$3)",[m.id_mensalidade,randomUUID(),req.user.id]);await tx.query("INSERT INTO evento_financeiro(id_mensalidade,tipo,detalhe,id_usuario) VALUES($1,'email','Reenvio de cobrança solicitado pela equipe.',$2)",[m.id_mensalidade,req.user.id]);});res.status(202).json({message:'Cobrança adicionada à fila de envio.'});
  });
  app.post('/api/finance/:id/email/:sendId/status',requirePermission('finance'),async(req,res)=>{await charge(req.params.id,req.user);const [e]=await q('SELECT id FROM email_envio WHERE id=$1 AND id_mensalidade=$2',[req.params.sendId,req.params.id]);if(!e)return res.status(404).json({error:'Envio não encontrado.'});const result=await mail.delivery(e.id);res.json({id:result.id,situacao:result.situacao,evento_provedor:result.evento_provedor});});
  app.get('/api/finance',requirePermission('finance'),async(req,res)=>{
   const page=Math.max(1,Number.parseInt(req.query.page)||1),limit=30,search=String(req.query.q||'').slice(0,150),state=String(req.query.status||'');
   const params=[`%${search}%`,state,(page-1)*limit];
   const [result]=await q(`WITH bills AS (SELECT m.*,COALESCE((SELECT situacao FROM pagamento pg WHERE pg.id_mensalidade=m.id_mensalidade AND pg.provedor='mercadopago' ORDER BY pg.id_pagamento DESC LIMIT 1),CASE WHEN EXISTS(SELECT 1 FROM checkout c WHERE c.id_mensalidade=m.id_mensalidade AND c.url IS NOT NULL AND c.expira>NOW()) THEN 'pendente' END) AS estado_gateway,a.nome,a.id_aluno,TO_CHAR(CURRENT_DATE,'YYYY-MM-DD') AS hoje,CASE WHEN m.situacao='pendente' AND m.vencimento<CURRENT_DATE THEN 'atraso' ELSE m.situacao END AS status FROM mensalidade m JOIN matricula mt USING(id_matricula) JOIN aluno a USING(id_aluno)), filtered AS (SELECT * FROM bills WHERE nome ILIKE $1 AND ($2='' OR status=$2)) SELECT
    (SELECT count(*)::int FROM filtered) AS total,
    (SELECT count(*)::int FROM bills) AS total_base,
    COALESCE((SELECT json_agg(r) FROM (SELECT * FROM filtered ORDER BY vencimento DESC,id_mensalidade DESC LIMIT 30 OFFSET $3) r),'[]') AS rows,
    (SELECT COALESCE(SUM(valor),0) FROM bills WHERE situacao='pago' AND date_trunc('month',pago_em)=date_trunc('month',CURRENT_DATE)) AS recebido_mes,
    (SELECT COALESCE(SUM(valor),0) FROM bills WHERE status='atraso') AS em_atraso,
    (SELECT COALESCE(SUM(valor),0) FROM bills WHERE situacao='pendente') AS pendente,
    TO_CHAR(CURRENT_DATE,'YYYY-MM-DD') AS hoje`,params);res.json({...result,page,limit,gateway:ready()});
  });
  app.get('/api/finance/:id',async(req,res)=>{const m=await charge(req.params.id,req.user);res.json({...m,status:effectiveStatus(m),pagamentos:await q('SELECT * FROM pagamento WHERE id_mensalidade=$1 ORDER BY id_pagamento DESC',[m.id_mensalidade]),envios:req.user.perfil==='aluno'?[]:await q('SELECT id,situacao,provedor_id,evento_provedor,criado_em FROM email_envio WHERE id_mensalidade=$1 ORDER BY id DESC',[m.id_mensalidade]),eventos:await q('SELECT tipo,detalhe,criado_em FROM evento_financeiro WHERE id_mensalidade=$1 ORDER BY id_evento DESC',[m.id_mensalidade]),gateway:ready()});});
  app.get('/api/finance/enrollment/:id',requirePermission('finance'),async(req,res)=>{const [m]=await q('SELECT m.*,p.valor_mensal,p.duracao_meses,a.nome FROM matricula m JOIN plano p USING(id_plano) JOIN aluno a USING(id_aluno) WHERE id_matricula=$1',[req.params.id]);if(!m)return res.status(404).json({error:'Matrícula não encontrada. Confira o identificador.'});res.json(m);});
  app.post('/api/finance/generate/:id',requirePermission('finance'),async(req,res)=>{if(!/^[1-9]\d*$/.test(req.params.id))throw Error('Informe um identificador de matrícula válido.');const count=await db.transaction(async tx=>{const m=(await tx.query('SELECT m.*,p.valor_mensal FROM matricula m JOIN plano p USING(id_plano) WHERE id_matricula=$1 FOR UPDATE OF m',[req.params.id])).rows[0];if(!m){const e=Error('Matrícula não encontrada. Confira o identificador.');e.status=404;throw e;}
   if(m.valor_contratado===null){const amounts=(await tx.query('SELECT DISTINCT valor FROM mensalidade WHERE id_matricula=$1',[m.id_matricula])).rows;
    if(amounts.length>1)throw Error('A matrícula possui valores históricos diferentes. Peça ao administrador para revisar o contrato antes de regularizar.');
    const value=amounts[0]?.valor||m.valor_mensal;
    if(!amounts.length&&(req.body.confirmar_valor_atual!==true||Number(req.body.valor_confirmado)!==Number(value)))throw Error('Esta matrícula não tem valor contratado. Confira e confirme o valor atual do plano antes de gerar.');
    await tx.query('UPDATE matricula SET valor_contratado=$2 WHERE id_matricula=$1',[m.id_matricula,value]);
   }return generateInstallments(tx,m.id_matricula,req.user.id);});res.json({count});});
  app.post('/api/finance/:id/pay',requirePermission('finance'),async(req,res)=>{
   const m=await charge(req.params.id,req.user);const meio=req.body.meio;if(!['dinheiro','pix','cartao','transferencia'].includes(meio))throw Error('Selecione o meio de pagamento.');
   if(req.body.comprovante!=null&&typeof req.body.comprovante!=='string')throw Error('Informe uma referência / comprovante em texto.');const comprovante=(req.body.comprovante||'').trim();if(comprovante.length>300)throw Error('A referência / comprovante deve ter até 300 caracteres.');if(meio!=='dinheiro'&&!comprovante)throw Error({pix:'Informe o identificador da transação PIX ou outra referência para conferência.',cartao:'Informe o NSU, o código de autorização ou outra referência do comprovante.',transferencia:'Informe o identificador da transferência ou outra referência para conferência.'}[meio]);
   await db.transaction(async tx=>{const current=(await tx.query('SELECT situacao FROM mensalidade WHERE id_mensalidade=$1 FOR UPDATE',[m.id_mensalidade])).rows[0];if(current.situacao!=='pendente')throw Error('Esta mensalidade já foi paga ou cancelada.');await tx.query("INSERT INTO pagamento(id_mensalidade,provedor,referencia,valor,meio,situacao,comprovante,registrado_por,confirmado_em) VALUES($1,'manual',$2,$3,$4,'confirmado',$5,$6,NOW())",[m.id_mensalidade,randomUUID(),m.valor,meio,comprovante||null,req.user.id]);await tx.query("UPDATE mensalidade SET situacao='pago',pago_em=NOW() WHERE id_mensalidade=$1",[m.id_mensalidade]);await tx.query("INSERT INTO evento_financeiro(id_mensalidade,tipo,detalhe,id_usuario) VALUES($1,'pagamento','Pagamento confirmado pela equipe: '||$2,$3)",[m.id_mensalidade,comprovante||'Recebido em dinheiro no balcão',req.user.id]);});res.json({ok:true});
  });
  app.post('/api/finance/:id/cancel',requirePermission('finance'),async(req,res)=>{
   const m=await charge(req.params.id,req.user),motivo=String(req.body.motivo||'').trim();if(motivo.length<3||motivo.length>300)throw Error('Informe o motivo do cancelamento (3 a 300 caracteres).');await db.transaction(async tx=>{const row=(await tx.query('SELECT situacao FROM mensalidade WHERE id_mensalidade=$1 FOR UPDATE',[m.id_mensalidade])).rows[0];if(row.situacao!=='pendente')throw Error('Só é possível cancelar uma mensalidade pendente.');if((await tx.query('SELECT chave FROM checkout WHERE id_mensalidade=$1',[m.id_mensalidade])).rows.length)throw Error('Há uma cobrança no gateway. Cancele no provedor e concilie antes de alterar.');await tx.query("UPDATE mensalidade SET situacao='cancelado',motivo_cancelamento=$2 WHERE id_mensalidade=$1",[m.id_mensalidade,motivo]);await tx.query("INSERT INTO evento_financeiro(id_mensalidade,tipo,detalhe,id_usuario) VALUES($1,'cancelamento',$2,$3)",[m.id_mensalidade,motivo,req.user.id]);});res.json({ok:true});
  });
  app.get('/api/finance/:id/receipt',async(req,res)=>{const m=await charge(req.params.id,req.user);if(m.situacao!=='pago')throw Error('Recibo disponível após confirmação do pagamento.');const [p]=await q("SELECT meio,comprovante,referencia,confirmado_em FROM pagamento WHERE id_mensalidade=$1 AND situacao='confirmado'",[m.id_mensalidade]);res.json({numero:`SIGNY-${m.id_mensalidade}`,aluno:m.nome,competencia:m.competencia,valor:m.valor,pagamento:p});});
  app.post('/api/finance/:id/checkout',async(req,res)=>{if(!ready())return res.status(503).json({error:'Pagamento online indisponível. Fale com a recepção.'});res.json(await checkout(await charge(req.params.id,req.user)));});
  app.post('/api/finance/:id/reconcile',requirePermission('finance'),async(req,res)=>{if(!ready())return res.status(503).json({error:'Gateway indisponível.'});const m=await charge(req.params.id,req.user);const id=String(req.body.id_pagamento||'');if(!/^\d+$/.test(id))throw Error('Informe o identificador de pagamento do Mercado Pago.');const payment=await mp('/v1/payments/'+id);if(payment.external_reference!==`signy-${m.id_mensalidade}`)throw Error('Pagamento pertence a outra mensalidade.');res.json(await reconcile(payment));});
 }
 return {publicRoutes,protectedRoutes,reconcile,runEmailQueue};
}
