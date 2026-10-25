import {readFile} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import path from 'node:path';
import {connectDatabase} from '../database.mjs';
import {migrate} from '../migrations.mjs';

const root=fileURLToPath(new URL('../',import.meta.url));
let db;
try{
 if(!process.env.DATABASE_URL)throw Error('Configure DATABASE_URL em .env antes de migrar o banco remoto. Nenhum banco local será alterado.');
 let target;try{target=new URL(process.env.DATABASE_URL);}catch{throw Error('DATABASE_URL não é uma conexão PostgreSQL válida.');}
 if(!['postgres:','postgresql:'].includes(target.protocol)||!target.hostname||target.pathname==='/')throw Error('DATABASE_URL precisa identificar um servidor e um banco PostgreSQL.');
 db=await connectDatabase(root);
 const exists=(await db.query("SELECT to_regclass('public.schema_migration') IS NOT NULL AS presente")).rows[0].presente;
 const before=exists?(await db.query('SELECT versao FROM schema_migration')).rows.map(r=>r.versao):[];
 await db.exec(await readFile(path.join(root,'schema.sql'),'utf8'));
 await migrate(db,root);
 const versions=(await db.query('SELECT versao FROM schema_migration ORDER BY versao')).rows.map(r=>r.versao);
 const columns=(await db.query("SELECT table_name,column_name FROM information_schema.columns WHERE table_schema='public' AND ((table_name='checkout' AND column_name='preference_id') OR (table_name='pagamento' AND column_name='atualizado_gateway'))")).rows;
 const tables=(await db.query("SELECT to_regclass('public.configuracao_academia') IS NOT NULL AND to_regclass('public.email_envio') IS NOT NULL AS presente")).rows[0];
 if(columns.length!==2||!tables.presente)throw Error('A verificação do esquema não confirmou todas as estruturas esperadas.');
 console.log(JSON.stringify({servidor:target.hostname,banco:decodeURIComponent(target.pathname.slice(1)),migracoes_aplicadas:versions.filter(v=>!before.includes(v)),migracoes_registradas:versions,esquema_verificado:true}));
}catch(error){
 // Erros do driver podem conter a conexão ou SQL: registrar apenas o código.
 console.error(error.code?`Migração não concluída (código ${error.code}). Confira conexão e permissões do banco.`:error instanceof TypeError?'Não foi possível conectar ao banco remoto. Confira DATABASE_URL e o acesso de rede.':error.message);
 process.exitCode=1;
}finally{if(db)await db.close().catch(()=>{});}
