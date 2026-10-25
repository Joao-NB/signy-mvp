import {randomUUID} from 'node:crypto';
export const validEmail=email=>typeof email==='string'&&email.length<=150&&/^[^\s@<>]+@[^\s@<>]+\.[^\s@<>]+$/.test(email);
export function appOrigin(){
 try{const u=new URL(process.env.APP_URL);if(u.username||u.password||u.search||u.hash||u.pathname!=='/')return null;
  if(u.protocol!=='https:'&&!(process.env.NODE_ENV!=='production'&&u.protocol==='http:'&&['localhost','127.0.0.1'].includes(u.hostname)))return null;
  return u.origin;
 }catch{return null;}
}
export function mailReady(){const from=String(process.env.MAIL_FROM||'').trim(),address=from.match(/<([^<>]+)>$/)?.[1]||from;return Boolean(process.env.RESEND_API_KEY&&validEmail(address)&&appOrigin()&&!/[\r\n]/.test(from));}
export function mailService(db){
 async function send({to,subject,text,purpose,userId=null,billId=null,key=randomUUID(),entryId}){
  const id=entryId||(await db.query("INSERT INTO email_envio(finalidade,id_usuario,id_mensalidade,chave,situacao) VALUES($1,$2,$3,$4,'processando') RETURNING id",[purpose,userId,billId,key])).rows[0].id;
  let providerId=null,code=null;
  if(!mailReady())code='configuracao_indisponivel';else if(!validEmail(to))code='destinatario_invalido';else{
   try{
    const response=await fetch('https://api.resend.com/emails',{method:'POST',signal:AbortSignal.timeout(10000),headers:{Authorization:`Bearer ${process.env.RESEND_API_KEY}`,'Content-Type':'application/json','Idempotency-Key':key},body:JSON.stringify({from:process.env.MAIL_FROM,to:[to],subject,text})});
    const result=await response.json();if(response.ok&&typeof result.id==='string'&&result.id.length>0&&result.id.length<=100)providerId=result.id;else code=`resend_http_${response.status}`;
   }catch{code='resend_conexao';}
  }
  await db.query("UPDATE email_envio SET situacao=$2,provedor_id=$3,erro=$4,atualizado_em=NOW() WHERE id=$1",[id,providerId?'aceito':'falha',providerId,code]);
  if(code)console.error('Falha no envio de e-mail',{id,finalidade:purpose,codigo:code});
  return {enviado:Boolean(providerId),situacao:providerId?'aceito':'falha',id_envio:id};
 }
 async function delivery(id){
  const entry=(await db.query('SELECT * FROM email_envio WHERE id=$1',[id])).rows[0];
  if(!entry?.provedor_id||!mailReady())return entry;
  try{
   const response=await fetch('https://api.resend.com/emails/'+encodeURIComponent(entry.provedor_id),{headers:{Authorization:`Bearer ${process.env.RESEND_API_KEY}`},signal:AbortSignal.timeout(10000)});
   const result=await response.json();if(!response.ok)return entry;
   const event=result.last_event;const state=['delivered','opened','clicked'].includes(event)?'entregue':['bounced','failed','complained','suppressed'].includes(event)?'falha':entry.situacao;
   return (await db.query('UPDATE email_envio SET evento_provedor=$2,situacao=$3,atualizado_em=NOW() WHERE id=$1 RETURNING *',[id,String(event||'').slice(0,50),state])).rows[0];
  }catch{return entry;}
 }
 return {send,delivery};
}
