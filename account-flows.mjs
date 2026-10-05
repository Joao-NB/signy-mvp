import bcrypt from 'bcryptjs';
import {randomBytes,createHash} from 'node:crypto';
import {publicUser,requirePermission} from './permissions.mjs';
const hash=value=>createHash('sha256').update(value).digest('hex');
const validEmail=email=>typeof email==='string'&&/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)&&email.length<=150;
export function accountFlows(db){
 const q=async(sql,params=[]) => (await db.query(sql,params)).rows;
 async function tokenFor(id,finalidade){const token=randomBytes(32).toString('hex');await db.transaction(async tx=>{await tx.query('SELECT id FROM usuario WHERE id=$1 FOR UPDATE',[id]);await tx.query('DELETE FROM token_acesso WHERE id_usuario=$1 AND finalidade=$2',[id,finalidade]);await tx.query("INSERT INTO token_acesso VALUES($1,$2,$3,NOW()+($4::int * INTERVAL '1 minute'),NULL)",[hash(token),id,finalidade,finalidade==='convite'?1440:30]);});return token;}
 async function deliver(email,token,finalidade){
  const url=process.env.APP_URL?new URL('/#'+finalidade+'='+token,process.env.APP_URL).href:null;
  if(!process.env.RESEND_API_KEY||!process.env.MAIL_FROM||!url)return {enviado:false,token,url};
  try{const res=await fetch('https://api.resend.com/emails',{method:'POST',signal:AbortSignal.timeout(10000),headers:{Authorization:`Bearer ${process.env.RESEND_API_KEY}`,'Content-Type':'application/json','Idempotency-Key':hash(token)},body:JSON.stringify({from:process.env.MAIL_FROM,to:[email],subject:finalidade==='convite'?'Seu convite para o Signy':'Recuperar acesso ao Signy',text:`Abra ${url} para definir sua senha. O link é temporário e só pode ser usado uma vez.`})});return res.ok?{enviado:true}:{enviado:false,token,url};}catch{return {enviado:false,token,url};}
 }
 async function inviteStudent(student){
  if(!student.email)return null;
  let u=(await q('SELECT * FROM usuario WHERE id_aluno=$1',[student.id_aluno]))[0];
  if(u?.aprovado)throw Error('Este aluno já possui uma conta ativa. Use a recuperação de senha.');
  if(!u)u=(await q("INSERT INTO usuario(nome,login,senha_hash,perfil,email,id_aluno,aprovado) VALUES($1,$2,$3,'aluno',$4,$5,FALSE) RETURNING *",[student.nome,`aluno.${student.id_aluno}`,await bcrypt.hash(randomBytes(32).toString('hex'),12),student.email,student.id_aluno]))[0];
  const token=await tokenFor(u.id,'convite');return {...await deliver(student.email,token,'convite'),login:u.login};
 }
 function publicRoutes(app){
  app.post('/api/recovery/request',async(req,res)=>{
   if(!process.env.RESEND_API_KEY||!process.env.MAIL_FROM||!process.env.APP_URL)return res.status(503).json({error:'Recuperação por e-mail indisponível. Peça um link ao administrador da academia.'});
   const u=(await q('SELECT * FROM usuario WHERE login=$1 OR lower(email)=$1 LIMIT 1',[String(req.body.identificacao||'').trim().toLowerCase()]))[0];
   res.json({message:'Se houver uma conta com e-mail cadastrado, você receberá um link temporário.'});
   if(u?.email&&u.aprovado)tokenFor(u.id,'recuperacao').then(token=>deliver(u.email,token,'recuperacao')).catch(()=>{});
  });
  app.post('/api/access/complete',async(req,res)=>{
   const {token,senha}=req.body;if(typeof token!=='string'||!/^[a-f0-9]{64}$/.test(token))throw Error('Link inválido.');
   if(typeof senha!=='string'||Buffer.byteLength(senha)<10||Buffer.byteLength(senha)>72)throw Error('Use uma senha de 10 a 72 bytes.');
   const password=await bcrypt.hash(senha,12);
   await db.transaction(async tx=>{const candidate=(await tx.query('SELECT id_usuario FROM token_acesso WHERE token_hash=$1',[hash(token)])).rows[0];if(!candidate)throw Error('Link inválido, expirado ou já utilizado. Solicite um novo.');await tx.query('SELECT id FROM usuario WHERE id=$1 FOR UPDATE',[candidate.id_usuario]);const t=(await tx.query('SELECT * FROM token_acesso WHERE token_hash=$1 AND expira>NOW() AND usado_em IS NULL FOR UPDATE',[hash(token)])).rows[0];if(!t)throw Error('Link inválido, expirado ou já utilizado. Solicite um novo.');await tx.query('UPDATE usuario SET senha_hash=$1,aprovado=TRUE WHERE id=$2',[password,t.id_usuario]);await tx.query('UPDATE token_acesso SET usado_em=NOW() WHERE id_usuario=$1',[t.id_usuario]);await tx.query('DELETE FROM sessao WHERE id_usuario=$1',[t.id_usuario]);});res.json({message:'Senha definida. Entre com seu usuário e a nova senha.'});
  });
 }
 function protectedRoutes(app){
  app.post('/api/users/:id/recovery',requirePermission('users'),async(req,res)=>{const u=(await q('SELECT * FROM usuario WHERE id=$1',[req.params.id]))[0];if(!u||!u.aprovado)return res.status(404).json({error:'Conta ativa não encontrada.'});const token=await tokenFor(u.id,'recuperacao');res.json({token,login:u.login});});
  app.post('/api/students/:id/invite',requirePermission('write','aluno'),async(req,res)=>{const a=(await q('SELECT * FROM aluno WHERE id_aluno=$1',[req.params.id]))[0];if(!a?.email)throw Error('Cadastre um e-mail para enviar o convite.');res.json(await inviteStudent(a));});
  app.put('/api/users/:id/profile',requirePermission('users'),async(req,res)=>{
   const {perfil,id_professor,email}=req.body;if(!['administrador','recepcionista','professor'].includes(perfil))throw Error('Selecione um perfil da equipe.');if(Number(req.params.id)===req.user.id&&perfil!=='administrador')throw Error('Você não pode remover o próprio acesso administrativo.');if(email&&!validEmail(email))throw Error('Informe um e-mail válido.');
   if(perfil==='professor'&&!id_professor)throw Error('Vincule a conta ao professor cadastrado.');
   const [u]=await q('UPDATE usuario SET perfil=$1,id_professor=$2,email=$3 WHERE id=$4 AND id_aluno IS NULL RETURNING *',[perfil,perfil==='professor'?id_professor:null,email?.toLowerCase()||null,req.params.id]);if(!u)return res.status(404).json({error:'Conta da equipe não encontrada.'});await q('DELETE FROM sessao WHERE id_usuario=$1 AND id_usuario<>$2',[u.id,req.user.id]);res.json(publicUser(u));
  });
 }
 return {publicRoutes,protectedRoutes,inviteStudent};
}
