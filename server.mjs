import express from 'express';
import { connectDatabase } from './database.mjs';
import bcrypt from 'bcryptjs';
import { randomBytes, createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { permissions, publicUser, requirePermission } from './permissions.mjs';
import { instrumentDatabase, timing } from './telemetry.mjs';
import { accountFlows } from './account-flows.mjs';
import { financialModule, generateInstallments } from './financial.mjs';
import { experienceModule } from './experience.mjs';
import { migrate } from './migrations.mjs';
import { attendanceModule } from './attendance.mjs';
const root=path.dirname(fileURLToPath(import.meta.url));
export const db=await connectDatabase(root);
await db.exec(readFileSync(path.join(root,'schema.sql'),'utf8'));
await migrate(db,root);
instrumentDatabase(db);
const accounts=accountFlows(db);
const q=async(sql,params=[]) => (await db.query(sql,params)).rows;
const openAccess=process.env.OPEN_ACCESS==='true'&&process.env.NODE_ENV!=='production';
const openAccessHash=openAccess?await bcrypt.hash(randomBytes(32).toString('hex'),12):null;
if(!openAccess&&!(await q('SELECT id FROM usuario LIMIT 1')).length){
 if(process.env.ADMIN_PASSWORD){
  if(Buffer.byteLength(process.env.ADMIN_PASSWORD)<10||Buffer.byteLength(process.env.ADMIN_PASSWORD)>72)throw Error('ADMIN_PASSWORD deve ter entre 10 e 72 bytes.');
  await q('INSERT INTO usuario(nome,login,senha_hash) VALUES($1,$2,$3)',['Administrador','admin',await bcrypt.hash(process.env.ADMIN_PASSWORD,12)]);
 }else console.log('Primeiro acesso pendente: crie a conta administrativa pela página inicial.');
}
const models={aluno:['id_aluno','nome','cpf','data_nascimento','sexo','telefone','email'],professor:['id_professor','nome','cpf','telefone','email','especialidade','data_admissao'],plano:['id_plano','nome','descricao','valor_mensal','duracao_meses','ativo'],exercicio:['id_exercicio','nome','grupo_muscular','descricao','video_url'],ficha_treino:['id_ficha','id_aluno','id_professor','descricao','ativa'],matricula:['id_matricula','id_aluno','id_plano','data_inicio'],presenca:['id_presenca','id_aluno']};
export const app=express();
if(process.env.TRUST_PROXY_HOPS){const hops=Number(process.env.TRUST_PROXY_HOPS);if(!Number.isInteger(hops)||hops<1||hops>5)throw Error('TRUST_PROXY_HOPS inválido.');app.set('trust proxy',hops);}
app.disable('x-powered-by');
app.use('/api',timing);
app.get('/healthz',async(req,res)=>{try{await q('SELECT 1');res.json({ok:true});}catch{res.status(503).json({ok:false});}});
app.use((req,res,next)=>{res.set({'X-Content-Type-Options':'nosniff','Referrer-Policy':'same-origin','Content-Security-Policy':"default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' data:; frame-ancestors 'none'; base-uri 'self'; form-action 'self'"}); if(req.path.startsWith('/api'))res.set('Cache-Control','no-store'); next();});
app.use(express.json({limit:'100kb'}));
app.use('/api',(req,res,next)=>{if(req.path==='/payments/webhook')return next();if(!['GET','HEAD'].includes(req.method)&&req.headers.origin&&req.headers.origin!==`${req.protocol}://${req.headers.host}`)return res.status(403).json({error:'Origem da requisição não permitida.'});next();});
const sessions=req=>{const match=(req.headers.cookie||'').match(/(?:^|; )signy=([^;]+)/); return match?createHash('sha256').update(match[1]).digest('hex'):'';};
const attempts=new Map();
const accountData=body=>{
 const nome=String(body.nome||'').trim(),login=String(body.login||'').trim().toLowerCase(),senha=String(body.senha||body.nova||'');
 if(nome.length<2||nome.length>150)throw Error('Informe um nome de 2 a 150 caracteres.');
 if(!/^[a-z0-9._-]{3,100}$/.test(login))throw Error('O usuário deve ter de 3 a 100 caracteres e usar apenas letras, números, ponto, hífen ou sublinhado.');
 if(Buffer.byteLength(senha)<10||Buffer.byteLength(senha)>72)throw Error('Use uma senha de 10 a 72 bytes.');
 return {nome,login,senha};
};
const issueSession=async(res,user,secure)=>{const token=randomBytes(32).toString('hex');await q("WITH cleanup AS (DELETE FROM sessao WHERE expira < NOW()) INSERT INTO sessao VALUES($1,$2,NOW()+INTERVAL '8 hours')",[createHash('sha256').update(token).digest('hex'),user.id]);res.set('Set-Cookie',`signy=${token}; HttpOnly; SameSite=Strict; Path=/; Max-Age=28800${secure?'; Secure':''}`).json(publicUser(user));};
app.get('/api/setup-status',async(req,res)=>res.json(openAccess?{required:false,open:true}:{required:!(await q('SELECT id FROM usuario LIMIT 1')).length}));
// Resolve the entry screen in one request; never include password hashes.
app.get('/api/bootstrap',async(req,res)=>{
 const user=sessions(req)?(await q('SELECT u.* FROM sessao s JOIN usuario u ON u.id=s.id_usuario WHERE token=$1 AND expira>NOW() AND u.aprovado=TRUE',[sessions(req)]))[0]:null;
 const required=!openAccess&&!user&&!(await q('SELECT id FROM usuario LIMIT 1')).length;
 res.json({required,open:openAccess,user:user?publicUser(user):null});
});
app.post('/api/setup',async(req,res)=>{
 if(openAccess)return res.status(404).json({error:'Configuração inicial desnecessária no acesso livre.'});
 const values=accountData(req.body);
 const user=await db.transaction(async tx=>{await tx.query('LOCK TABLE usuario IN EXCLUSIVE MODE');if((await tx.query('SELECT id FROM usuario LIMIT 1')).rows.length){const error=Error('A conta inicial já foi criada.');error.status=409;throw error;}return (await tx.query('INSERT INTO usuario(nome,login,senha_hash) VALUES($1,$2,$3) RETURNING *',[values.nome,values.login,await bcrypt.hash(values.senha,12)])).rows[0];});
 await issueSession(res,user,req.secure);
});
app.post('/api/login',async(req,res)=>{
 if(openAccess){
  const login=String(req.body.login||'visitante').trim().toLowerCase().slice(0,100)||'visitante';
  const user=(await q("INSERT INTO usuario(nome,login,senha_hash,aprovado) VALUES($1,$2,$3,TRUE) ON CONFLICT(login) DO UPDATE SET nome=usuario.nome WHERE usuario.perfil='administrador' RETURNING *",[login,login,openAccessHash]))[0];
  if(!user)return res.status(403).json({error:'Use o acesso protegido para esta conta.'});
  return issueSession(res,user,req.secure);
 }
 const key=req.ip, now=Date.now(), attempt=attempts.get(key); if(attempt&&attempt.until>now&&attempt.count>=10)return res.status(429).json({error:'Muitas tentativas. Aguarde 15 minutos.'});
 const user=(await q('SELECT * FROM usuario WHERE login=$1',[String(req.body.login||'').trim().toLowerCase()]))[0];
 if(!user||!await bcrypt.compare(String(req.body.senha||''),user.senha_hash)){const a=attempt&&attempt.until>now?attempt:{count:0,until:now+900000};a.count++;attempts.set(key,a);return res.status(401).json({error:'Usuário ou senha incorretos.'});}
 if(!user.aprovado)return res.status(403).json({error:'Sua conta foi criada e aguarda aprovação de um administrador da academia.'});
 attempts.delete(key);await issueSession(res,user,req.secure);
});
app.post('/api/register',(req,res)=>res.status(404).json({error:'Cadastro público indisponível.'}));
const recoveryAttempts=new Map();
app.use(['/api/recovery','/api/access'],(req,res,next)=>{const now=Date.now(),previous=recoveryAttempts.get(req.ip),entry=previous&&previous.until>now?previous:{count:0,until:now+900000};entry.count++;recoveryAttempts.set(req.ip,entry);if(entry.count>10)return res.status(429).json({error:'Muitas solicitações. Aguarde 15 minutos.'});next();});
accounts.publicRoutes(app);
export const finance=financialModule(db);
finance.publicRoutes(app);
app.post('/api/logout',async(req,res)=>{await q('DELETE FROM sessao WHERE token=$1',[sessions(req)]);res.set('Set-Cookie',`signy=; HttpOnly; SameSite=Strict; Path=/; Max-Age=0${req.secure?'; Secure':''}`).json({ok:true});});
app.use('/api',async(req,res,next)=>{try{const user=(await q('SELECT u.id,u.nome,u.login,u.perfil,u.id_aluno,u.id_professor FROM sessao s JOIN usuario u ON u.id=s.id_usuario WHERE token=$1 AND expira>NOW() AND u.aprovado=TRUE',[sessions(req)]))[0];if(!user)return res.status(401).json({error:'Entre na sua conta para continuar.'});req.user=user;next();}catch(e){next(e);}});
app.get('/api/me',(req,res)=>res.json(publicUser(req.user)));
accounts.protectedRoutes(app);
finance.protectedRoutes(app);
experienceModule(app,db);
attendanceModule(app,db);
app.get('/api/users',requirePermission('users'),async(req,res)=>res.json(await q('SELECT id,nome,login,aprovado,perfil,email,id_professor,id_aluno FROM usuario ORDER BY aprovado,nome,id')));
app.post('/api/users/:id/approve',requirePermission('users'),async(req,res)=>{
 const rows=await q('UPDATE usuario SET aprovado=TRUE WHERE id=$1 AND id_aluno IS NULL RETURNING id,nome,login,aprovado',[req.params.id]);
 if(!rows.length)return res.status(404).json({error:'Usuário não encontrado.'});
 res.json(rows[0]);
});
app.post('/api/users',requirePermission('users'),async(req,res)=>{
 const values=accountData(req.body);
 const perfil=req.body.perfil||'recepcionista';if(!['administrador','recepcionista','professor'].includes(perfil))throw Error('Selecione um perfil da equipe.');if(perfil==='professor'&&!req.body.id_professor)throw Error('Vincule a conta ao professor cadastrado.');
 const email=String(req.body.email||'').trim().toLowerCase();if(email&&!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))throw Error('Informe um e-mail válido.');
 const created=(await q('INSERT INTO usuario(nome,login,senha_hash,perfil,email,id_professor,aprovado) VALUES($1,$2,$3,$4,$5,$6,$7) RETURNING *',[values.nome,values.login,await bcrypt.hash(values.senha,12),perfil,email||null,perfil==='professor'?req.body.id_professor:null,req.body.aprovado!==false]))[0];
 res.status(201).json(publicUser(created));
});

app.post('/api/password',async(req,res)=>{const u=(await q('SELECT * FROM usuario WHERE id=$1',[req.user.id]))[0];if(!await bcrypt.compare(String(req.body.atual||''),u.senha_hash))throw Error('Senha atual incorreta.');if(typeof req.body.nova!=='string'||Buffer.byteLength(req.body.nova)<10||Buffer.byteLength(req.body.nova)>72)throw Error('Use uma senha de 10 a 72 bytes.');await q('UPDATE usuario SET senha_hash=$1 WHERE id=$2',[await bcrypt.hash(req.body.nova,12),u.id]);await q('DELETE FROM sessao WHERE id_usuario=$1 AND token<>$2',[u.id,sessions(req)]);res.json({ok:true});});
app.put('/api/account',async(req,res)=>{
 const values=accountData({nome:req.body.nome,login:req.body.login,senha:req.body.nova||req.body.atual});
 const currentPassword=String(req.body.atual||'');
 const updated=await db.transaction(async tx=>{const u=(await tx.query('SELECT * FROM usuario WHERE id=$1 FOR UPDATE',[req.user.id])).rows[0];if(!u||!await bcrypt.compare(currentPassword,u.senha_hash))throw Error('Senha atual incorreta.');const hash=req.body.nova?await bcrypt.hash(values.senha,12):u.senha_hash;return (await tx.query('UPDATE usuario SET nome=$1,login=$2,senha_hash=$3 WHERE id=$4 RETURNING *',[values.nome,values.login,hash,u.id])).rows[0];});
 await q('DELETE FROM sessao WHERE id_usuario=$1 AND token<>$2',[updated.id,sessions(req)]);res.json(publicUser(updated));
});
async function expire(tx=db){await tx.query("UPDATE matricula SET situacao='vencida' WHERE situacao='ativa' AND data_fim<CURRENT_DATE");}
app.get('/api/overview',requirePermission('read','aluno'),async(req,res)=>{
 // One database round trip, bounded histories, no exercise catalogue or workout details.
 const [result]=await q(`SELECT
  TO_CHAR(CURRENT_DATE,'YYYY-MM-DD') AS hoje,
  (SELECT COUNT(*)::int FROM aluno) AS alunos,
  (SELECT COUNT(DISTINCT id_aluno)::int FROM matricula WHERE situacao='ativa' AND CURRENT_DATE BETWEEN data_inicio AND data_fim) AS ativos,
  (SELECT COUNT(*)::int FROM presenca WHERE data_presenca=CURRENT_DATE) AS presencas,
  (SELECT COUNT(*)::int FROM ficha_treino WHERE ativa) AS fichas,
  (SELECT COUNT(*)::int FROM professor) AS professores,
  (SELECT COUNT(*)::int FROM plano WHERE ativo) AS planos,
  (SELECT COUNT(*)::int FROM exercicio) AS exercicios,
  (SELECT COUNT(*)::int FROM matricula WHERE situacao='ativa' AND data_fim BETWEEN CURRENT_DATE AND CURRENT_DATE+7) AS vencimentos,
  COALESCE((SELECT json_agg(w) FROM (SELECT TO_CHAR(d,'YYYY-MM-DD') AS dia, (SELECT COUNT(*)::int FROM presenca WHERE data_presenca=d::date) AS total FROM generate_series(CURRENT_DATE-6,CURRENT_DATE,INTERVAL '1 day') d ORDER BY d) w),'[]') AS semana,
  COALESCE((SELECT json_agg(a) FROM (SELECT id_aluno,nome FROM aluno WHERE EXISTS(SELECT 1 FROM matricula m WHERE m.id_aluno=aluno.id_aluno AND m.situacao='ativa' AND CURRENT_DATE BETWEEN m.data_inicio AND m.data_fim) AND NOT EXISTS(SELECT 1 FROM presenca p WHERE p.id_aluno=aluno.id_aluno AND p.data_presenca=CURRENT_DATE) ORDER BY nome) a),'[]') AS disponiveis,
  COALESCE((SELECT json_agg(a) FROM (SELECT a.id_aluno,a.nome,a.data_cadastro,(SELECT p.nome FROM matricula m JOIN plano p USING(id_plano) WHERE m.id_aluno=a.id_aluno AND m.situacao='ativa' AND CURRENT_DATE BETWEEN m.data_inicio AND m.data_fim LIMIT 1) AS plano FROM aluno a ORDER BY a.id_aluno DESC LIMIT 5) a),'[]') AS recentes`);
 res.json(result);
});
app.get('/api/data',requirePermission('read','aluno'),async(req,res)=>{await expire();const select=Object.entries(models).map(([table,[pk]])=>`COALESCE((SELECT json_agg(r) FROM (SELECT * FROM ${table} ORDER BY ${pk} DESC) r),'[]') AS ${table}`);select.push("COALESCE((SELECT json_agg(r) FROM (SELECT * FROM ficha_exercicio ORDER BY ordem,id_ficha_exercicio) r),'[]') AS ficha_exercicio","TO_CHAR(CURRENT_DATE,'YYYY-MM-DD') AS hoje");const [data]=await q('SELECT '+select.join(','));if(req.user.perfil==='professor'){data.aluno=data.aluno.map(a=>({id_aluno:a.id_aluno,nome:a.nome,data_cadastro:a.data_cadastro}));data.professor=data.professor.map(p=>({id_professor:p.id_professor,nome:p.nome,especialidade:p.especialidade,data_admissao:p.data_admissao}));}res.json(data);});
function clean(table,body){if(table==='plano'&&body.duracao_meses!==undefined&&(!Number.isInteger(Number(body.duracao_meses))||Number(body.duracao_meses)<1||Number(body.duracao_meses)>120))throw Error('A duração do plano deve ser de 1 a 120 meses.');const data={};for(const key of models[table].slice(1)){if(body[key]!==undefined)data[key]=typeof body[key]==='string'?body[key].trim()||null:body[key];}if('cpf'in data)data.cpf=String(data.cpf||'').replace(/\D/g,'');if(data.email){data.email=data.email.toLowerCase();if(!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(data.email))throw Error('Informe um e-mail válido.');}for(const key of ['nome','descricao','grupo_muscular'])if(key in data&&data[key]===null&&!(key==='descricao'&&['plano','exercicio'].includes(table)))throw Error('Preencha os campos obrigatórios.');return data;}
async function insert(tx,table,data){const keys=Object.keys(data);return (await tx.query(`INSERT INTO ${table} (${keys.join(',')}) VALUES (${keys.map((_,i)=>'$'+(i+1)).join(',')}) RETURNING *`,Object.values(data))).rows[0];}
async function exercises(tx,id,list){if(!Array.isArray(list)||!list.length||list.length>100)throw Error('Adicione pelo menos um exercício à ficha.');await tx.query('DELETE FROM ficha_exercicio WHERE id_ficha=$1',[id]);for(const item of list){await insert(tx,'ficha_exercicio',{id_ficha:id,id_exercicio:item.id_exercicio,ordem:item.ordem,series:item.series,repeticoes:item.repeticoes,carga_sugerida:item.carga_sugerida===''?null:item.carga_sugerida,observacao:item.observacao||null});}}
app.post('/api/:table',async(req,res,next)=>{const table=req.params.table;if(!models[table])return res.sendStatus(404);if(!permissions[req.user.perfil].write.includes(table))return res.status(403).json({error:'Seu perfil não tem permissão para esta operação.'});const data=clean(table,req.body);
 if(table==='exercicio'&&data.video_url){const url=new URL(data.video_url);if(url.protocol!=='https:')throw Error('O vídeo precisa usar um endereço HTTPS.');}
 if(table==='ficha_treino'&&req.user.perfil==='professor'&&Number(data.id_professor)!==req.user.id_professor)return res.status(403).json({error:'Selecione seu próprio cadastro de professor.'});
 const result=await db.transaction(async tx=>{await expire(tx);
 if(table==='matricula'){const plan=(await tx.query('SELECT * FROM plano WHERE id_plano=$1 AND ativo=TRUE FOR SHARE',[data.id_plano])).rows[0];if(!plan)throw Error('Selecione um plano ativo.');const dates=(await tx.query("SELECT ($1::date + make_interval(months => $2::integer))::date AS fim, $1::date>CURRENT_DATE AS futura, ($1::date + make_interval(months => $2::integer))::date<CURRENT_DATE AS vencida",[data.data_inicio,plan.duracao_meses])).rows[0];if(dates.futura)throw Error('A data de início não pode ser futura neste MVP.');data.data_fim=dates.fim;data.situacao=dates.vencida?'vencida':'ativa';data.valor_contratado=plan.valor_mensal;data.meses_contratados=plan.duracao_meses;}
 if(table==='presenca'){const current=(await tx.query("SELECT id_matricula FROM matricula WHERE id_aluno=$1 AND situacao='ativa' AND data_inicio<=CURRENT_DATE AND data_fim>=CURRENT_DATE FOR SHARE",[data.id_aluno])).rows[0];if(!current)throw Error('Presença bloqueada: aluno sem matrícula vigente.');}
 if(table==='aluno'&&data.data_nascimento&&String(data.data_nascimento)>new Date().toISOString().slice(0,10))throw Error('A data de nascimento não pode ser futura.');
 const row=await insert(tx,table,data);if(table==='ficha_treino')await exercises(tx,row.id_ficha,req.body.exercicios||[]);if(table==='matricula')await generateInstallments(tx,row.id_matricula,req.user.id);return row;
 });if(table==='aluno'&&result.email){try{result.convite=await accounts.inviteStudent(result);}catch{result.convite={enviado:false,error:'Cadastro salvo. Gere o convite no detalhe do aluno.'};}}res.status(201).json(result);
});
app.put('/api/:table/:id',async(req,res)=>{const table=req.params.table;if(!models[table]||table==='presenca')return res.sendStatus(404);if(!permissions[req.user.perfil].write.includes(table))return res.status(403).json({error:'Seu perfil não tem permissão para esta operação.'});const pk=models[table][0],data=clean(table,req.body);if(table==='matricula'){if(req.body.situacao!=='cancelada')throw Error('Uma matrícula só pode ser cancelada.');for(const k of Object.keys(data))delete data[k];data.situacao='cancelada';data.cancelada_em=new Date().toISOString();}
 if(table==='exercicio'&&data.video_url&&new URL(data.video_url).protocol!=='https:')throw Error('O vídeo precisa usar um endereço HTTPS.');
 if(table==='ficha_treino'&&req.user.perfil==='professor'){const [f]=await q('SELECT id_professor FROM ficha_treino WHERE id_ficha=$1',[req.params.id]);if(f?.id_professor!==req.user.id_professor||(data.id_professor!==undefined&&Number(data.id_professor)!==req.user.id_professor))return res.status(403).json({error:'Você só pode alterar suas próprias fichas.'});}
 if(table==='aluno'&&data.data_nascimento&&String(data.data_nascimento)>new Date().toISOString().slice(0,10))throw Error('A data de nascimento não pode ser futura.');
 const result=await db.transaction(async tx=>{await expire(tx);if(table==='matricula'){const old=(await tx.query('SELECT situacao FROM matricula WHERE id_matricula=$1',[req.params.id])).rows[0];if(!old||old.situacao!=='ativa')throw Error('Somente matrículas ativas podem ser canceladas.');}const keys=Object.keys(data);if(!keys.length)throw Error('Nenhuma alteração informada.');const row=(await tx.query(`UPDATE ${table} SET ${keys.map((k,i)=>`${k}=$${i+1}`).join(',')} WHERE ${pk}=$${keys.length+1} RETURNING *`,[...Object.values(data),req.params.id])).rows[0];if(!row)throw Error('Registro não encontrado.');if(table==='ficha_treino')await exercises(tx,row.id_ficha,req.body.exercicios||[]);return row;});res.json(result);
});
app.delete('/api/:table/:id',async(req,res)=>{const table=req.params.table;if(!['aluno','professor','exercicio','ficha_treino'].includes(table))return res.status(400).json({error:'Este registro deve ser mantido no histórico.'});if(!permissions[req.user.perfil].write.includes(table))return res.status(403).json({error:'Seu perfil não tem permissão para esta operação.'});if(table==='ficha_treino'&&req.user.perfil==='professor'){const [f]=await q('SELECT id_professor FROM ficha_treino WHERE id_ficha=$1',[req.params.id]);if(f?.id_professor!==req.user.id_professor)return res.status(403).json({error:'Você só pode excluir suas próprias fichas.'});}const rows=await q(`DELETE FROM ${table} WHERE ${models[table][0]}=$1 RETURNING *`,[req.params.id]);if(!rows.length)return res.status(404).json({error:'Registro não encontrado.'});res.json({ok:true});});
app.use('/api',(req,res)=>res.status(404).json({error:'Operação não encontrada.'}));
app.use(express.static(path.join(root,'public')));
app.use((err,req,res,next)=>{let message=err.message;if(err.code==='23505'){const constraint=err.constraint||'';message=constraint.includes('usuario_login')?'Este nome de usuário já está em uso.':constraint.includes('cpf')?'CPF já cadastrado.':constraint.includes('email')?'E-mail já cadastrado.':constraint.includes('matricula')?'Este aluno já possui uma matrícula vigente.':constraint.includes('presenca')?'A presença deste aluno já foi registrada hoje.':'Não é possível repetir o mesmo exercício na ficha.';}else if(err.code==='23503')message='Operação bloqueada: existem registros vinculados ou uma referência não existe.';else if(['23502','23514','22001','22007','22008','22P02','22003'].includes(err.code))message='Confira os campos obrigatórios, datas, CPF (11 dígitos) e valores positivos.';else if(err.code){console.error(err);message='Não foi possível concluir a operação.';}res.status(err.status||400).json({error:message});});
if(process.env.NODE_ENV!=='test'){
 const mailTimer=setInterval(()=>finance.runEmailQueue().catch(()=>console.error('Falha no processamento da fila financeira.')),30000);mailTimer.unref();
 finance.runEmailQueue().catch(()=>console.error('Falha no processamento da fila financeira.'));
 const server=app.listen(Number(process.env.PORT||3000),process.env.HOST||'127.0.0.1',()=>console.log(`Signy disponível na porta ${process.env.PORT||3000}`));
 let stopping=false;
 const shutdown=()=>{if(stopping)return;stopping=true;clearInterval(mailTimer);const deadline=setTimeout(()=>process.exit(1),25000);deadline.unref();server.close(async()=>{try{await db.close();process.exit(0);}catch{process.exit(1);}});};
 process.on('SIGTERM',shutdown);process.on('SIGINT',shutdown);
}
