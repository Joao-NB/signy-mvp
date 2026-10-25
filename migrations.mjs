import {readdir,readFile} from 'node:fs/promises';
import path from 'node:path';
export async function migrate(db,root){
 await db.exec('CREATE TABLE IF NOT EXISTS schema_migration (versao TEXT PRIMARY KEY, aplicada_em TIMESTAMPTZ NOT NULL DEFAULT NOW())');
 for(const file of (await readdir(path.join(root,'migrations'))).filter(f=>/^\d+.*\.sql$/.test(f)).sort()){
  const sql=await readFile(path.join(root,'migrations',file),'utf8');
  await db.transaction(async tx=>{
   await tx.query('LOCK TABLE schema_migration IN EXCLUSIVE MODE');
   if((await tx.query('SELECT versao FROM schema_migration WHERE versao=$1',[file])).rows.length)return;
   await tx.exec(sql);await tx.query('INSERT INTO schema_migration(versao) VALUES($1)',[file]);
  });
 }
}
