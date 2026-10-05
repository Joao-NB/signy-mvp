import bcrypt from 'bcryptjs';
import {connectDatabase} from '../database.mjs';
import {fileURLToPath} from 'node:url';
const login=process.env.SIGNY_ADMIN_LOGIN,senha=process.env.SIGNY_ADMIN_PASSWORD;
if(!login||!senha||Buffer.byteLength(senha)<10||Buffer.byteLength(senha)>72)throw Error('Defina SIGNY_ADMIN_LOGIN e SIGNY_ADMIN_PASSWORD (10 a 72 bytes) no ambiente.');
const db=await connectDatabase(fileURLToPath(new URL('..',import.meta.url)));
try{const changed=await db.transaction(async tx=>{const result=await tx.query('UPDATE usuario SET senha_hash=$1,aprovado=TRUE WHERE login=$2 AND perfil=\'administrador\' RETURNING id',[await bcrypt.hash(senha,12),login]);if(!result.rows.length)throw Error('Conta administrativa não encontrada.');await tx.query('DELETE FROM sessao WHERE id_usuario=$1',[result.rows[0].id]);return result.rows.length;});console.log(`${changed} conta administrativa recuperada. A senha não será exibida.`);}finally{await db.close();}
