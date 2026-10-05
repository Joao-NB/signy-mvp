import {randomUUID,createHmac,timingSafeEqual} from 'node:crypto';
import {requirePermission,permissions} from './permissions.mjs';
export async function generateInstallments(tx,id,userId){
 const rows=(await tx.query(`INSERT INTO mensalidade(id_matricula,competencia,vencimento,valor)
 SELECT m.id_matricula,date_trunc('month',m.data_inicio + make_interval(months=>n))::date,(m.data_inicio + make_interval(months=>n))::date,COALESCE(m.valor_contratado,p.valor_mensal)
 FROM matricula m JOIN plano p USING(id_plano),generate_series(0,COALESCE(m.meses_contratados,p.duracao_meses)-1) n WHERE m.id_matricula=$1
 ON CONFLICT(id_matricula,competencia) DO NOTHING RETURNING id_mensalidade`,[id])).rows;
 for(const row of rows)await tx.query("INSERT INTO evento_financeiro(id_mensalidade,tipo,detalhe,id_usuario) VALUES($1,'criacao','Mensalidade gerada com o valor contratado.',$2)",[row.id_mensalidade,userId]);
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
 const q=async(sql,params=[]) => (await db.query(sql,params)).rows;
 const ready=()=>Boolean(process.env.MP_ACCESS_TOKEN&&process.env.MP_WEBHOOK_SECRET&&process.env.APP_URL?.startsWith('https://'));
 async function mp(route,method='GET',body,key){const r=await fetch('https://api.mercadopago.com'+route,{method,signal:AbortSignal.timeout(15000),headers:{Authorization:`Bearer ${process.env.MP_ACCESS_TOKEN}`,'Content-Type':'application/json',...(key?{'X-Idempotency-Key':key}:{})},...(body?{body:JSON.stringify(body)}:{})});const data=await r.json();if(!r.ok){const error=Error('Não foi possível consultar o serviço de pagamento. Tente novamente.');error.status=502;throw error;}return data;}
 async function charge(id,user){const [m]=await q(`SELECT m.*,a.id_aluno,a.nome,a.email,TO_CHAR(CURRENT_DATE,'YYYY-MM-DD') AS hoje FROM mensalidade m JOIN matricula mt USING(id_matricula) JOIN aluno a USING(id_aluno) WHERE id_mensalidade=$1`,[id]);if(!m){const e=Error('Mensalidade não encontrada.');e.status=404;throw e;}if(user.perfil==='aluno'?m.id_aluno!==user.id_aluno:!permissions[user.perfil]?.finance){const e=Error('Seu perfil não tem acesso a esta mensalidade.');e.status=403;throw e;}return m;}
 async function reconcile(payment){
  const reference=String(payment.external_reference||'');if(!/^signy-\d+$/.test(reference))throw Error('Referência de pagamento inválida.');const id=Number(reference.slice(6));
  return db.transaction(async tx=>{
   const m=(await tx.query('SELECT * FROM mensalidade WHERE id_mensalidade=$1 FOR UPDATE',[id])).rows[0];if(!m||payment.currency_id!=='BRL'||Math.round(Number(payment.transaction_amount)*100)!==Math.round(Number(m.valor)*100))throw Error('Valor ou moeda não corresponde à mensalidade.');
   const state={approved:'confirmado',refunded:'estornado',charged_back:'estornado',rejected:'rejeitado',cancelled:'cancelado'}[payment.status]||'pendente';
   const ref=`mp-${payment.id}`;const existing=(await tx.query('SELECT * FROM pagamento WHERE referencia=$1',[ref])).rows[0];
   if(existing?.situacao===state||(existing?.situacao==='confirmado'&&state==='pendente'))return {ok:true};
   if(state==='confirmado'&&m.situacao==='cancelado')throw Error('Cobrança cancelada: conciliação manual necessária.');
   if(state==='confirmado'&&(await tx.query("SELECT id_pagamento FROM pagamento WHERE id_mensalidade=$1 AND situacao='confirmado' AND referencia<>$2",[id,ref])).rows.length)throw Error('Pagamento duplicado: conciliação manual necessária.');
   await tx.query(`INSERT INTO pagamento(id_mensalidade,provedor,referencia,valor,meio,situacao,confirmado_em) VALUES($1,'mercadopago',$2,$3,$4,$5,CASE WHEN $5='confirmado' THEN NOW() ELSE NULL END)
    ON CONFLICT(referencia) DO UPDATE SET situacao=EXCLUDED.situacao,confirmado_em=COALESCE(pagamento.confirmado_em,EXCLUDED.confirmado_em)`,[id,ref,m.valor,payment.payment_method_id||'gateway',state]);
   if(state==='confirmado')await tx.query("UPDATE mensalidade SET situacao='pago',pago_em=NOW() WHERE id_mensalidade=$1",[id]);
   if(state==='estornado'&&existing?.situacao==='confirmado')await tx.query("UPDATE mensalidade SET situacao='pendente',pago_em=NULL WHERE id_mensalidade=$1",[id]);
   await tx.query('INSERT INTO evento_financeiro(id_mensalidade,chave,tipo,detalhe) VALUES($1,$2,$3,$4) ON CONFLICT(chave) DO NOTHING',[id,`${ref}-${state}-${payment.date_last_updated||''}`,state,`Mercado Pago: ${payment.status}`]);return {ok:true};
  });
 }
 function publicRoutes(app){app.post('/api/payments/webhook',async(req,res)=>{if(!ready()||!validWebhook(req,process.env.MP_WEBHOOK_SECRET))return res.status(401).json({error:'Assinatura inválida.'});if(req.body.type!=='payment')return res.json({ok:true});const id=String(req.query['data.id']);if(!/^\d+$/.test(id)||String(req.body.data?.id)!==id)return res.status(400).json({error:'Notificação inválida.'});res.json(await reconcile(await mp('/v1/payments/'+id)));});}
 function protectedRoutes(app){
  app.get('/api/finance',requirePermission('finance'),async(req,res)=>{
   const page=Math.max(1,Number.parseInt(req.query.page)||1),limit=30,search=String(req.query.q||'').slice(0,150),state=String(req.query.status||'');
   const params=[`%${search}%`,state,(page-1)*limit];
   const [result]=await q(`WITH bills AS (SELECT m.*,a.nome,a.id_aluno,TO_CHAR(CURRENT_DATE,'YYYY-MM-DD') AS hoje,CASE WHEN m.situacao='pendente' AND m.vencimento<CURRENT_DATE THEN 'atraso' ELSE m.situacao END AS status FROM mensalidade m JOIN matricula mt USING(id_matricula) JOIN aluno a USING(id_aluno)), filtered AS (SELECT * FROM bills WHERE nome ILIKE $1 AND ($2='' OR status=$2)) SELECT
    (SELECT count(*)::int FROM filtered) AS total,
    COALESCE((SELECT json_agg(r) FROM (SELECT * FROM filtered ORDER BY vencimento DESC,id_mensalidade DESC LIMIT 30 OFFSET $3) r),'[]') AS rows,
    (SELECT COALESCE(SUM(valor),0) FROM bills WHERE situacao='pago' AND date_trunc('month',pago_em)=date_trunc('month',CURRENT_DATE)) AS recebido_mes,
    (SELECT COALESCE(SUM(valor),0) FROM bills WHERE status='atraso') AS em_atraso,
    (SELECT COALESCE(SUM(valor),0) FROM bills WHERE situacao='pendente') AS pendente,
    TO_CHAR(CURRENT_DATE,'YYYY-MM-DD') AS hoje`,params);res.json({...result,page,limit,gateway:ready()});
  });
  app.get('/api/finance/:id',async(req,res)=>{const m=await charge(req.params.id,req.user);res.json({...m,status:effectiveStatus(m),pagamentos:await q('SELECT * FROM pagamento WHERE id_mensalidade=$1 ORDER BY id_pagamento DESC',[m.id_mensalidade]),eventos:await q('SELECT tipo,detalhe,criado_em FROM evento_financeiro WHERE id_mensalidade=$1 ORDER BY id_evento DESC',[m.id_mensalidade]),gateway:ready()});});
  app.post('/api/finance/generate/:id',requirePermission('finance'),async(req,res)=>{const count=await db.transaction(tx=>generateInstallments(tx,req.params.id,req.user.id));res.json({count});});
  app.post('/api/finance/:id/pay',requirePermission('finance'),async(req,res)=>{
   const m=await charge(req.params.id,req.user);const meio=req.body.meio;if(!['dinheiro','pix','cartao','transferencia'].includes(meio))throw Error('Selecione o meio de pagamento.');
   const comprovante=String(req.body.comprovante||'').trim();if(!comprovante||comprovante.length>300)throw Error('Informe uma referência ou comprovante de até 300 caracteres.');
   await db.transaction(async tx=>{const current=(await tx.query('SELECT situacao FROM mensalidade WHERE id_mensalidade=$1 FOR UPDATE',[m.id_mensalidade])).rows[0];if(current.situacao!=='pendente')throw Error('Esta mensalidade já foi paga ou cancelada.');await tx.query("INSERT INTO pagamento(id_mensalidade,provedor,referencia,valor,meio,situacao,comprovante,registrado_por,confirmado_em) VALUES($1,'manual',$2,$3,$4,'confirmado',$5,$6,NOW())",[m.id_mensalidade,randomUUID(),m.valor,meio,comprovante,req.user.id]);await tx.query("UPDATE mensalidade SET situacao='pago',pago_em=NOW() WHERE id_mensalidade=$1",[m.id_mensalidade]);await tx.query("INSERT INTO evento_financeiro(id_mensalidade,tipo,detalhe,id_usuario) VALUES($1,'pagamento','Pagamento confirmado pela equipe: '||$2,$3)",[m.id_mensalidade,comprovante,req.user.id]);});res.json({ok:true});
  });
  app.post('/api/finance/:id/cancel',requirePermission('finance'),async(req,res)=>{
   const m=await charge(req.params.id,req.user),motivo=String(req.body.motivo||'').trim();if(motivo.length<3||motivo.length>300)throw Error('Informe o motivo do cancelamento (3 a 300 caracteres).');await db.transaction(async tx=>{const row=(await tx.query('SELECT situacao FROM mensalidade WHERE id_mensalidade=$1 FOR UPDATE',[m.id_mensalidade])).rows[0];if(row.situacao!=='pendente')throw Error('Só é possível cancelar uma mensalidade pendente.');if((await tx.query('SELECT chave FROM checkout WHERE id_mensalidade=$1',[m.id_mensalidade])).rows.length)throw Error('Há uma cobrança no gateway. Cancele no provedor e concilie antes de alterar.');await tx.query("UPDATE mensalidade SET situacao='cancelado',motivo_cancelamento=$2 WHERE id_mensalidade=$1",[m.id_mensalidade,motivo]);await tx.query("INSERT INTO evento_financeiro(id_mensalidade,tipo,detalhe,id_usuario) VALUES($1,'cancelamento',$2,$3)",[m.id_mensalidade,motivo,req.user.id]);});res.json({ok:true});
  });
  app.get('/api/finance/:id/receipt',async(req,res)=>{const m=await charge(req.params.id,req.user);if(m.situacao!=='pago')throw Error('Recibo disponível após confirmação do pagamento.');const [p]=await q("SELECT meio,comprovante,referencia,confirmado_em FROM pagamento WHERE id_mensalidade=$1 AND situacao='confirmado'",[m.id_mensalidade]);res.json({numero:`SIGNY-${m.id_mensalidade}`,aluno:m.nome,competencia:m.competencia,valor:m.valor,pagamento:p});});
  app.post('/api/finance/:id/checkout',async(req,res)=>{
   if(!ready())return res.status(503).json({error:'Pagamento online indisponível. Fale com a recepção.'});const m=await charge(req.params.id,req.user);if(m.situacao!=='pendente')throw Error('Esta mensalidade já foi paga ou cancelada.');
   const c=await db.transaction(async tx=>{await tx.query('SELECT id_mensalidade FROM mensalidade WHERE id_mensalidade=$1 FOR UPDATE',[m.id_mensalidade]);const [existing]=(await tx.query('SELECT * FROM checkout WHERE id_mensalidade=$1',[m.id_mensalidade])).rows;if(existing){if(new Date(existing.expira)<=new Date())throw Error('Cobrança expirada. A recepção precisa conciliar no provedor.');return existing;}return(await tx.query("INSERT INTO checkout(id_mensalidade,chave,expira) VALUES($1,$2,NOW()+INTERVAL '1 day') RETURNING *",[m.id_mensalidade,randomUUID()])).rows[0];});
   if(c.url)return res.json({url:c.url});
   const preference=await mp('/checkout/preferences','POST',{items:[{id:String(m.id_mensalidade),title:`Signy · Mensalidade ${isoDay(m.competencia).slice(0,7)}`,quantity:1,currency_id:'BRL',unit_price:Number(m.valor)}],...(m.email?{payer:{email:m.email}}:{}),external_reference:`signy-${m.id_mensalidade}`,notification_url:new URL('/api/payments/webhook',process.env.APP_URL).href,back_urls:{success:process.env.APP_URL,pending:process.env.APP_URL,failure:process.env.APP_URL},expires:true,expiration_date_to:new Date(c.expira).toISOString(),payment_methods:{excluded_payment_types:[{id:'ticket'},{id:'atm'}]}},c.chave);
   const url=process.env.MP_SANDBOX==='true'?preference.sandbox_init_point:preference.init_point;if(!url||!/^https:\/\/([a-z0-9-]+\.)?mercadopago\.(com|com\.br)\//.test(url))throw Error('Endereço de pagamento inválido.');await q('UPDATE checkout SET url=$2 WHERE id_mensalidade=$1',[m.id_mensalidade,url]);res.json({url});
  });
  app.post('/api/finance/:id/reconcile',requirePermission('finance'),async(req,res)=>{if(!ready())return res.status(503).json({error:'Gateway indisponível.'});const m=await charge(req.params.id,req.user);const id=String(req.body.id_pagamento||'');if(!/^\d+$/.test(id))throw Error('Informe o identificador de pagamento do Mercado Pago.');const payment=await mp('/v1/payments/'+id);if(payment.external_reference!==`signy-${m.id_mensalidade}`)throw Error('Pagamento pertence a outra mensalidade.');res.json(await reconcile(payment));});
 }
 return {publicRoutes,protectedRoutes,reconcile};
}
