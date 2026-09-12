import express from 'express';
import { connectDatabase } from './database.mjs';
import bcrypt from 'bcryptjs';
import { randomBytes, createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
const root=path.dirname(fileURLToPath(import.meta.url));
export const db=await connectDatabase(root);
await db.exec(readFileSync(path.join(root,'schema.sql'),'utf8'));
const q=async(sql,params=[]) => (await db.query(sql,params)).rows;
if(!(await q('SELECT id FROM usuario LIMIT 1')).length){
 if(process.env.ADMIN_PASSWORD){
  if(Buffer.byteLength(process.env.ADMIN_PASSWORD)<10||Buffer.byteLength(process.env.ADMIN_PASSWORD)>72)throw Error('ADMIN_PASSWORD deve ter entre 10 e 72 bytes.');
  await q('INSERT INTO usuario(nome,login,senha_hash) VALUES($1,$2,$3)',['Administrador','admin',await bcrypt.hash(process.env.ADMIN_PASSWORD,12)]);
 }else console.log('Primeiro acesso pendente: crie a conta administrativa pela página inicial.');
}
const models={aluno:['id_aluno','nome','cpf','data_nascimento','sexo','telefone','email'],professor:['id_professor','nome','cpf','telefone','email','especialidade','data_admissao'],plano:['id_plano','nome','descricao','valor_mensal','duracao_meses','ativo'],exercicio:['id_exercicio','nome','grupo_muscular','descricao'],ficha_treino:['id_ficha','id_aluno','id_professor','descricao','ativa'],matricula:['id_matricula','id_aluno','id_plano','data_inicio'],presenca:['id_presenca','id_aluno']};
export const app=express();
if(process.env.TRUST_PROXY_HOPS){const hops=Number(process.env.TRUST_PROXY_HOPS);if(!Number.isInteger(hops)||hops<1||hops>5)throw Error('TRUST_PROXY_HOPS inválido.');app.set('trust proxy',hops);}
app.disable('x-powered-by');
app.get('/healthz',async(req,res)=>{try{await q('SELECT 1');res.json({ok:true});}catch{res.status(503).json({ok:false});}});
app.use((req,res,next)=>{res.set({'X-Content-Type-Options':'nosniff','Referrer-Policy':'same-origin','Content-Security-Policy':"default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' data:; frame-ancestors 'none'; base-uri 'self'; form-action 'self'"}); if(req.path.startsWith('/api'))res.set('Cache-Control','no-store'); next();});
app.use(express.json({limit:'100kb'}));
app.use('/api',(req,res,next)=>{if(!['GET','HEAD'].includes(req.method)&&req.headers.origin&&req.headers.origin!==`${req.protocol}://${req.headers.host}`)return res.status(403).json({error:'Origem da requisição não permitida.'});next();});
const sessions=req=>{const match=(req.headers.cookie||'').match(/(?:^|; )signy=([^;]+)/); return match?createHash('sha256').update(match[1]).digest('hex'):'';};
const attempts=new Map();
const accountData=body=>{
 const nome=String(body.nome||'').trim(),login=String(body.login||'').trim().toLowerCase(),senha=String(body.senha||body.nova||'');
 if(nome.length<2||nome.length>150)throw Error('Informe um nome de 2 a 150 caracteres.');
 if(!/^[a-z0-9._-]{3,100}$/.test(login))throw Error('O usuário deve ter de 3 a 100 caracteres e usar apenas letras, números, ponto, hífen ou sublinhado.');
 if(Buffer.byteLength(senha)<10||Buffer.byteLength(senha)>72)throw Error('Use uma senha de 10 a 72 bytes.');
 return {nome,login,senha};
};
const issueSession=async(res,user,secure)=>{const token=randomBytes(32).toString('hex');await q("DELETE FROM sessao WHERE expira < NOW()");await q("INSERT INTO sessao VALUES($1,$2,NOW()+INTERVAL '8 hours')",[createHash('sha256').update(token).digest('hex'),user.id]);res.set('Set-Cookie',`signy=${token}; HttpOnly; SameSite=Strict; Path=/; Max-Age=28800${secure?'; Secure':''}`).json({id:user.id,nome:user.nome,login:user.login});};
app.get('/api/setup-status',async(req,res)=>res.json({required:!(await q('SELECT id FROM usuario LIMIT 1')).length}));
app.post('/api/setup',async(req,res)=>{
 const values=accountData(req.body);
 const user=await db.transaction(async tx=>{await tx.query('LOCK TABLE usuario IN EXCLUSIVE MODE');if((await tx.query('SELECT id FROM usuario LIMIT 1')).rows.length){const error=Error('A conta inicial já foi criada.');error.status=409;throw error;}return (await tx.query('INSERT INTO usuario(nome,login,senha_hash) VALUES($1,$2,$3) RETURNING id,nome,login',[values.nome,values.login,await bcrypt.hash(values.senha,12)])).rows[0];});
 await issueSession(res,user,req.secure);
});
app.post('/api/demo-claim',async(req,res)=>{
 const supplied=createHash('sha256').update(String(req.body.token||'')).digest('hex');
 if(supplied!=='8a5d7a920e4f1a39780a3fa2055891cfac189b44fdfdeafac6aaa896b6bb94ce')return res.sendStatus(404);
 const values=accountData(req.body);
 if((await q("SELECT id FROM usuario WHERE login='demonstracao' LIMIT 1")).length)return res.status(409).json({error:'A conta de demonstração já foi criada.'});
 const user=(await q('INSERT INTO usuario(nome,login,senha_hash) VALUES($1,$2,$3) RETURNING id,nome,login',[values.nome,values.login,await bcrypt.hash(values.senha,12)]))[0];
 res.status(201).json({id:user.id,nome:user.nome,login:user.login});
});
app.post('/api/login',async(req,res)=>{
 const key=req.ip, now=Date.now(), attempt=attempts.get(key); if(attempt&&attempt.until>now&&attempt.count>=10)return res.status(429).json({error:'Muitas tentativas. Aguarde 15 minutos.'});
 const user=(await q('SELECT * FROM usuario WHERE login=$1',[String(req.body.login||'').trim().toLowerCase()]))[0];
 if(!user||!await bcrypt.compare(String(req.body.senha||''),user.senha_hash)){const a=attempt&&attempt.until>now?attempt:{count:0,until:now+900000};a.count++;attempts.set(key,a);return res.status(401).json({error:'Usuário ou senha incorretos.'});}
 attempts.delete(key);await issueSession(res,user,req.secure);
});
app.use('/api',async(req,res,next)=>{try{const user=(await q('SELECT u.id,u.nome,u.login FROM sessao s JOIN usuario u ON u.id=s.id_usuario WHERE token=$1 AND expira>NOW()',[sessions(req)]))[0];if(!user)return res.status(401).json({error:'Entre na sua conta para continuar.'});req.user=user;next();}catch(e){next(e);}});
app.get('/api/me',(req,res)=>res.json(req.user));
app.post('/api/logout',async(req,res)=>{await q('DELETE FROM sessao WHERE token=$1',[sessions(req)]);res.set('Set-Cookie','signy=; HttpOnly; SameSite=Strict; Path=/; Max-Age=0').json({ok:true});});
app.post('/api/password',async(req,res)=>{const u=(await q('SELECT * FROM usuario WHERE id=$1',[req.user.id]))[0];if(!await bcrypt.compare(String(req.body.atual||''),u.senha_hash))throw Error('Senha atual incorreta.');if(typeof req.body.nova!=='string'||Buffer.byteLength(req.body.nova)<10||Buffer.byteLength(req.body.nova)>72)throw Error('Use uma senha de 10 a 72 bytes.');await q('UPDATE usuario SET senha_hash=$1 WHERE id=$2',[await bcrypt.hash(req.body.nova,12),u.id]);await q('DELETE FROM sessao WHERE id_usuario=$1 AND token<>$2',[u.id,sessions(req)]);res.json({ok:true});});
app.put('/api/account',async(req,res)=>{
 const values=accountData({nome:req.body.nome,login:req.body.login,senha:req.body.nova||req.body.atual});
 const currentPassword=String(req.body.atual||'');
 const updated=await db.transaction(async tx=>{const u=(await tx.query('SELECT * FROM usuario WHERE id=$1 FOR UPDATE',[req.user.id])).rows[0];if(!u||!await bcrypt.compare(currentPassword,u.senha_hash))throw Error('Senha atual incorreta.');const hash=req.body.nova?await bcrypt.hash(values.senha,12):u.senha_hash;return (await tx.query('UPDATE usuario SET nome=$1,login=$2,senha_hash=$3 WHERE id=$4 RETURNING id,nome,login',[values.nome,values.login,hash,u.id])).rows[0];});
 await q('DELETE FROM sessao WHERE id_usuario=$1 AND token<>$2',[updated.id,sessions(req)]);res.json(updated);
});
async function expire(tx=db){await tx.query("UPDATE matricula SET situacao='vencida' WHERE situacao='ativa' AND data_fim<CURRENT_DATE");}
app.get('/api/data',async(req,res)=>{await expire();const data={};for(const [table,[pk]]of Object.entries(models))data[table]=await q(`SELECT * FROM ${table} ORDER BY ${pk} DESC`);data.ficha_exercicio=await q('SELECT * FROM ficha_exercicio ORDER BY ordem,id_ficha_exercicio');data.hoje=(await q("SELECT TO_CHAR(CURRENT_DATE,'YYYY-MM-DD') AS hoje"))[0].hoje;res.json(data);});
function clean(table,body){const data={};for(const key of models[table].slice(1)){if(body[key]!==undefined)data[key]=typeof body[key]==='string'?body[key].trim()||null:body[key];}if('cpf'in data)data.cpf=String(data.cpf||'').replace(/\D/g,'');if(data.email){data.email=data.email.toLowerCase();if(!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(data.email))throw Error('Informe um e-mail válido.');}for(const key of ['nome','descricao','grupo_muscular'])if(key in data&&data[key]===null&&!(key==='descricao'&&['plano','exercicio'].includes(table)))throw Error('Preencha os campos obrigatórios.');return data;}
async function insert(tx,table,data){const keys=Object.keys(data);return (await tx.query(`INSERT INTO ${table} (${keys.join(',')}) VALUES (${keys.map((_,i)=>'$'+(i+1)).join(',')}) RETURNING *`,Object.values(data))).rows[0];}
async function exercises(tx,id,list){if(!Array.isArray(list)||!list.length||list.length>100)throw Error('Adicione pelo menos um exercício à ficha.');await tx.query('DELETE FROM ficha_exercicio WHERE id_ficha=$1',[id]);for(const item of list){await insert(tx,'ficha_exercicio',{id_ficha:id,id_exercicio:item.id_exercicio,ordem:item.ordem,series:item.series,repeticoes:item.repeticoes,carga_sugerida:item.carga_sugerida===''?null:item.carga_sugerida,observacao:item.observacao||null});}}
app.post('/api/:table',async(req,res)=>{const table=req.params.table;if(!models[table])return res.sendStatus(404);const data=clean(table,req.body);
 const result=await db.transaction(async tx=>{await expire(tx);
 if(table==='matricula'){const plan=(await tx.query('SELECT * FROM plano WHERE id_plano=$1 AND ativo=TRUE FOR SHARE',[data.id_plano])).rows[0];if(!plan)throw Error('Selecione um plano ativo.');const dates=(await tx.query("SELECT ($1::date + make_interval(months => $2::integer))::date AS fim, $1::date>CURRENT_DATE AS futura, ($1::date + make_interval(months => $2::integer))::date<CURRENT_DATE AS vencida",[data.data_inicio,plan.duracao_meses])).rows[0];if(dates.futura)throw Error('A data de início não pode ser futura neste MVP.');data.data_fim=dates.fim;data.situacao=dates.vencida?'vencida':'ativa';}
 if(table==='presenca'){const current=(await tx.query("SELECT id_matricula FROM matricula WHERE id_aluno=$1 AND situacao='ativa' AND data_inicio<=CURRENT_DATE AND data_fim>=CURRENT_DATE FOR SHARE",[data.id_aluno])).rows[0];if(!current)throw Error('Presença bloqueada: aluno sem matrícula vigente.');}
 if(table==='aluno'&&data.data_nascimento&&String(data.data_nascimento)>new Date().toISOString().slice(0,10))throw Error('A data de nascimento não pode ser futura.');
 const row=await insert(tx,table,data);if(table==='ficha_treino')await exercises(tx,row.id_ficha,req.body.exercicios||[]);return row;
 });res.status(201).json(result);
});
app.put('/api/:table/:id',async(req,res)=>{const table=req.params.table;if(!models[table]||table==='presenca')return res.sendStatus(404);const pk=models[table][0],data=clean(table,req.body);if(table==='matricula'){if(req.body.situacao!=='cancelada')throw Error('Uma matrícula só pode ser cancelada.');for(const k of Object.keys(data))delete data[k];data.situacao='cancelada';}
 if(table==='aluno'&&data.data_nascimento&&String(data.data_nascimento)>new Date().toISOString().slice(0,10))throw Error('A data de nascimento não pode ser futura.');
 const result=await db.transaction(async tx=>{await expire(tx);if(table==='matricula'){const old=(await tx.query('SELECT situacao FROM matricula WHERE id_matricula=$1',[req.params.id])).rows[0];if(!old||old.situacao!=='ativa')throw Error('Somente matrículas ativas podem ser canceladas.');}const keys=Object.keys(data);if(!keys.length)throw Error('Nenhuma alteração informada.');const row=(await tx.query(`UPDATE ${table} SET ${keys.map((k,i)=>`${k}=$${i+1}`).join(',')} WHERE ${pk}=$${keys.length+1} RETURNING *`,[...Object.values(data),req.params.id])).rows[0];if(!row)throw Error('Registro não encontrado.');if(table==='ficha_treino')await exercises(tx,row.id_ficha,req.body.exercicios||[]);return row;});res.json(result);
});
app.delete('/api/:table/:id',async(req,res)=>{const table=req.params.table;if(!['aluno','professor','exercicio','ficha_treino'].includes(table))return res.status(400).json({error:'Este registro deve ser mantido no histórico.'});const rows=await q(`DELETE FROM ${table} WHERE ${models[table][0]}=$1 RETURNING *`,[req.params.id]);if(!rows.length)return res.status(404).json({error:'Registro não encontrado.'});res.json({ok:true});});
app.use('/api',(req,res)=>res.status(404).json({error:'Operação não encontrada.'}));
app.use(express.static(path.join(root,'public')));
app.use((err,req,res,next)=>{let message=err.message;if(err.code==='23505'){const constraint=err.constraint||'';message=constraint.includes('usuario_login')?'Este nome de usuário já está em uso.':constraint.includes('cpf')?'CPF já cadastrado.':constraint.includes('email')?'E-mail já cadastrado.':constraint.includes('matricula')?'Este aluno já possui uma matrícula vigente.':constraint.includes('presenca')?'A presença deste aluno já foi registrada hoje.':'Não é possível repetir o mesmo exercício na ficha.';}else if(err.code==='23503')message='Operação bloqueada: existem registros vinculados ou uma referência não existe.';else if(['23502','23514','22001','22007','22008','22P02','22003'].includes(err.code))message='Confira os campos obrigatórios, datas, CPF (11 dígitos) e valores positivos.';else if(err.code){console.error(err);message='Não foi possível concluir a operação.';}res.status(err.status||400).json({error:message});});
if(process.env.NODE_ENV!=='test'){
 const server=app.listen(Number(process.env.PORT||3000),process.env.HOST||'127.0.0.1',()=>console.log(`Signy disponível na porta ${process.env.PORT||3000}`));
 let stopping=false;
 const shutdown=()=>{if(stopping)return;stopping=true;const deadline=setTimeout(()=>process.exit(1),25000);deadline.unref();server.close(async()=>{try{await db.close();process.exit(0);}catch{process.exit(1);}});};
 process.on('SIGTERM',shutdown);process.on('SIGINT',shutdown);
}
