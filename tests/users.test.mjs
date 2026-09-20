import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

test('cadastro autenticado protege senhas e permite login após reabrir o banco', async () => {
 const folder=await mkdtemp(path.join(tmpdir(),'signy-users-'));
 process.env.NODE_ENV='test';
 process.env.DATA_DIR=folder;
 delete process.env.DATABASE_URL;
 delete process.env.ADMIN_PASSWORD;
 let db,server,base;
 const start=async suffix=>{
  const module=await import(`../server.mjs?users=${suffix}`);
  db=module.db;
  server=module.app.listen(0,'127.0.0.1');
  await new Promise(resolve=>server.once('listening',resolve));
  base=`http://127.0.0.1:${server.address().port}/api`;
 };
 const stop=async()=>{await new Promise(resolve=>server.close(resolve));await db.close();server=null;db=null;};
 const request=async(route,method='GET',body,cookie='')=>{
  const response=await fetch(base+route,{method,headers:{'Content-Type':'application/json',Cookie:cookie},...(body?{body:JSON.stringify(body)}:{})});
  return {status:response.status,body:await response.json(),cookie:response.headers.get('set-cookie')?.split(';')[0]};
 };
 try{
  await start('initial');
  const account={nome:'Recepção',login:'recepcao',senha:'Recepcao123!'};
  assert.equal((await request('/users')).status,401);
  assert.equal((await request('/users','POST',account)).status,401);
  const admin=await request('/setup','POST',{nome:'Gestor',login:'gestor',senha:'GestorSenha123!'});
  assert.equal(admin.status,200);
  assert.equal((await request('/users','POST',{...account,senha:'curta'},admin.cookie)).status,400);
  const created=await request('/users','POST',account,admin.cookie);
  assert.equal(created.status,201);
  assert.deepEqual(Object.keys(created.body).sort(),['id','login','nome']);
  assert.equal(created.cookie,undefined);
  const duplicate=await request('/users','POST',{...account,login:' RECEPCAO '},admin.cookie);
  assert.equal(duplicate.status,400);
  assert.match(duplicate.body.error,/já está em uso/);
  const list=await request('/users','GET',null,admin.cookie);
  assert.equal(list.body.length,2);
  assert.ok(list.body.every(row=>!('senha_hash' in row)));
  assert.equal((await request('/me','GET',null,admin.cookie)).body.login,'gestor');
  const stored=(await db.query('SELECT senha_hash FROM usuario WHERE login=$1',[account.login])).rows[0];
  assert.match(stored.senha_hash,/^\$2[aby]\$12\$/);
  const publicAccount={nome:'Nova pessoa',login:'nova.pessoa',senha:'NovaPessoa123!',confirmacao:'NovaPessoa123!'};
  assert.equal((await request('/register','POST',{...publicAccount,confirmacao:'diferente'})).status,400);
  const registration=await request('/register','POST',{...publicAccount,aprovado:true});
  assert.equal(registration.status,201);
  assert.deepEqual(registration.body,{pending:true});
  assert.equal(registration.cookie,undefined);
  assert.equal((await request('/register','POST',publicAccount)).status,400);
  assert.equal((await request('/login','POST',publicAccount)).status,403);
  const pending=(await request('/users','GET',null,admin.cookie)).body.find(row=>row.login===publicAccount.login);
  assert.equal(pending.aprovado,false);
  assert.equal((await request(`/users/${pending.id}/approve`,'POST')).status,401);
  await stop();
  await start('reopened');
  const login=await request('/login','POST',{login:account.login,senha:account.senha});
  assert.equal(login.status,200);
  assert.equal(login.body.nome,account.nome);
  assert.equal((await request('/login','POST',publicAccount)).status,403);
  assert.equal((await request(`/users/${pending.id}/approve`,'POST',null,login.cookie)).status,200);
  assert.equal((await request('/login','POST',publicAccount)).status,200);
  assert.equal((await request('/setup-status')).body.required,false);
 }finally{
  if(server)await new Promise(resolve=>server.close(resolve));
  if(db)await db.close();
  if(path.dirname(folder)===path.resolve(tmpdir())&&path.basename(folder).startsWith('signy-users-'))await rm(folder,{recursive:true,force:true});
 }
});
