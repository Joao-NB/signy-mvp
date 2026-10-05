import {requirePermission} from './permissions.mjs';
export function experienceModule(app,db){
 const q=async(sql,params=[]) => (await db.query(sql,params)).rows;
 app.post('/api/attendance/:id/exit',requirePermission('write','presenca'),async(req,res)=>{const [row]=await q("UPDATE presenca SET saida_em=NOW() WHERE id_presenca=$1 AND saida_em IS NULL AND data_presenca+hora_entrada BETWEEN LOCALTIMESTAMP-INTERVAL '24 hours' AND LOCALTIMESTAMP RETURNING *",[req.params.id]);if(!row)return res.status(409).json({error:'Presença não encontrada, saída já registrada ou entrada fora das últimas 24 horas.'});res.json(row);});
 app.get('/api/student',async(req,res)=>{
  if(req.user.perfil!=='aluno'||!req.user.id_aluno)return res.status(403).json({error:'Área exclusiva do aluno.'});const id=req.user.id_aluno;
  const [result]=await q(`SELECT
   (SELECT row_to_json(a) FROM (SELECT nome,email,telefone FROM aluno WHERE id_aluno=$1) a) AS aluno,
   COALESCE((SELECT json_agg(f) FROM (SELECT ft.id_ficha,ft.descricao,p.nome AS professor,COALESCE((SELECT json_agg(e) FROM (SELECT fe.ordem,fe.series,fe.repeticoes,fe.carga_sugerida,fe.observacao,ex.nome,ex.grupo_muscular,ex.descricao,ex.video_url FROM ficha_exercicio fe JOIN exercicio ex USING(id_exercicio) WHERE fe.id_ficha=ft.id_ficha ORDER BY fe.ordem) e),'[]') AS exercicios FROM ficha_treino ft JOIN professor p USING(id_professor) WHERE ft.id_aluno=$1 AND ft.ativa ORDER BY ft.id_ficha DESC) f),'[]') AS fichas,
   COALESCE((SELECT json_agg(p) FROM (SELECT data_presenca,hora_entrada,saida_em FROM presenca WHERE id_aluno=$1 ORDER BY data_presenca DESC LIMIT 90) p),'[]') AS presencas,
   COALESCE((SELECT json_agg(m) FROM (SELECT ms.id_mensalidade,ms.competencia,ms.valor,ms.vencimento,CASE WHEN ms.situacao='pendente' AND ms.vencimento<CURRENT_DATE THEN 'atraso' ELSE ms.situacao END AS status FROM mensalidade ms JOIN matricula mt USING(id_matricula) WHERE mt.id_aluno=$1 ORDER BY ms.vencimento DESC LIMIT 36) m),'[]') AS mensalidades,
   TO_CHAR(CURRENT_DATE,'YYYY-MM-DD') AS hoje`,[id]);res.json(result);
 });
 app.get('/api/reports',requirePermission('reports'),async(req,res)=>{
  const from=String(req.query.from||''),to=String(req.query.to||'');if(!/^\d{4}-\d{2}-\d{2}$/.test(from)||!/^\d{4}-\d{2}-\d{2}$/.test(to)||from>to)throw Error('Informe um período válido.');
  const [result]=await q(`WITH cohort AS (SELECT DISTINCT id_aluno FROM matricula WHERE data_inicio<$1::date AND data_fim>=$1::date AND (situacao<>'cancelada' OR cancelada_em>=$1::date)) SELECT
   (SELECT COUNT(DISTINCT id_aluno)::int FROM matricula WHERE situacao='ativa' AND CURRENT_DATE BETWEEN data_inicio AND data_fim) AS ativos,
   (SELECT COUNT(*)::int FROM matricula WHERE data_inicio BETWEEN $1::date AND $2::date) AS matriculas,
   (SELECT COUNT(DISTINCT id_aluno)::int FROM matricula WHERE data_inicio BETWEEN $1::date AND $2::date) AS pessoas,
   (SELECT COUNT(*)::int FROM matricula WHERE situacao='cancelada' AND COALESCE(cancelada_em,atualizado_em)::date BETWEEN $1::date AND $2::date) AS cancelamentos,
   (SELECT COUNT(*)::int FROM presenca WHERE data_presenca BETWEEN $1::date AND $2::date) AS presencas,
   (SELECT ROUND(AVG(EXTRACT(EPOCH FROM (saida_em-((data_presenca+hora_entrada) AT TIME ZONE current_setting('TimeZone')))))/60,1) FROM presenca WHERE saida_em IS NOT NULL AND data_presenca BETWEEN $1::date AND $2::date) AS permanencia,
   (SELECT COUNT(*)::int FROM presenca WHERE saida_em IS NOT NULL AND data_presenca BETWEEN $1::date AND $2::date) AS saidas,
   (SELECT COUNT(*)::int FROM cohort) AS base_retencao,
   (SELECT COUNT(*)::int FROM cohort c WHERE EXISTS(SELECT 1 FROM matricula m WHERE m.id_aluno=c.id_aluno AND (m.situacao<>'cancelada' OR m.cancelada_em::date>$2::date) AND m.data_inicio<=$2::date AND m.data_fim>=$2::date)) AS retidos,
   (SELECT COUNT(DISTINCT m.id_aluno)::int FROM mensalidade ms JOIN matricula m USING(id_matricula) WHERE ms.situacao='pendente' AND ms.vencimento<CURRENT_DATE) AS inadimplentes,
   COALESCE((SELECT json_agg(d) FROM (SELECT TO_CHAR(data_presenca,'YYYY-MM-DD') AS dia,COUNT(*)::int AS total FROM presenca WHERE data_presenca BETWEEN $1::date AND $2::date GROUP BY data_presenca ORDER BY data_presenca) d),'[]') AS frequencia,
   COALESCE((SELECT json_agg(h) FROM (SELECT EXTRACT(HOUR FROM hora_entrada)::int AS hora,COUNT(*)::int AS total FROM presenca WHERE data_presenca BETWEEN $1::date AND $2::date GROUP BY hora ORDER BY hora) h),'[]') AS horarios,
   COALESCE((SELECT json_agg(f) FROM (SELECT TO_CHAR(date_trunc('month',confirmado_em),'YYYY-MM') AS mes,SUM(valor) AS recebido FROM pagamento WHERE situacao='confirmado' AND confirmado_em::date BETWEEN $1::date AND $2::date GROUP BY mes ORDER BY mes) f),'[]') AS financeiro`,[from,to]);
  res.json({...result,from,to});
 });
}
