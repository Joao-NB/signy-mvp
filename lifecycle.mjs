import {permissions} from './permissions.mjs';
const entries={aluno:['id_aluno','arquivado_em'],professor:['id_professor','arquivado_em'],exercicio:['id_exercicio','arquivado_em'],plano:['id_plano','ativo'],ficha_treino:['id_ficha','ativa']};
export function lifecycleModule(app,db){
 async function change(req,res,active){
  const table=req.params.table,definition=entries[table];
  if(!definition)return res.status(400).json({error:'Este registro permanece no histórico. Matrículas são encerradas e renovadas por uma nova matrícula.'});
  if(!permissions[req.user.perfil]?.write.includes(table))return res.status(403).json({error:'Seu perfil não permite esta alteração.'});
  if(typeof active!=='boolean')throw Error('Informe se o cadastro deve ser reativado ou desativado.');
  const [pk,column]=definition;
  const row=await db.transaction(async tx=>{
   const record=(await tx.query(`SELECT * FROM ${table} WHERE ${pk}=$1 FOR UPDATE`,[req.params.id])).rows[0];
   if(!record){const error=Error('Cadastro não encontrado.');error.status=404;throw error;}
   if(table==='ficha_treino'&&req.user.perfil==='professor'&&record.id_professor!==req.user.id_professor){const error=Error('Você só pode alterar suas próprias fichas.');error.status=403;throw error;}
   if(table==='ficha_treino'&&active){
    const [student]=(await tx.query('SELECT arquivado_em FROM aluno WHERE id_aluno=$1 FOR SHARE',[record.id_aluno])).rows;
    if(student?.arquivado_em)throw Error('Reative o cadastro do aluno antes de reativar a ficha.');
   }
   if(table==='aluno'&&!active){
    // Contracts and charges are retained; ending access never forgives outstanding balances.
    await tx.query("UPDATE matricula SET situacao='vencida' WHERE id_aluno=$1 AND situacao='ativa' AND data_fim<CURRENT_DATE",[record.id_aluno]);
    await tx.query("UPDATE matricula SET situacao='cancelada',cancelada_em=NOW() WHERE id_aluno=$1 AND situacao='ativa'",[record.id_aluno]);
    await tx.query('UPDATE ficha_treino SET ativa=FALSE WHERE id_aluno=$1 AND ativa',[record.id_aluno]);
   }
   return (await tx.query(`UPDATE ${table} SET ${column}=${column==='arquivado_em'?(active?'NULL':'COALESCE(arquivado_em,NOW())'):'$2'} WHERE ${pk}=$1 RETURNING *`,column==='arquivado_em'?[req.params.id]:[req.params.id,active])).rows[0];
  });
  res.json({ok:true,registro:row});
 }
 app.post('/api/lifecycle/:table/:id',(req,res)=>change(req,res,req.body.ativo));
 // Legacy deletion clients now preserve the record too; no public removal path purges history.
 app.delete('/api/:table/:id',(req,res)=>change(req,res,false));
}
