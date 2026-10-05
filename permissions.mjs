export const permissions={
 administrador:{read:['aluno','professor','plano','matricula','ficha_treino','exercicio','presenca'],write:['aluno','professor','plano','matricula','ficha_treino','exercicio','presenca'],users:true,finance:true,reports:true},
 recepcionista:{read:['aluno','professor','plano','matricula','ficha_treino','exercicio','presenca'],write:['aluno','matricula','presenca'],users:false,finance:true,reports:false},
 professor:{read:['aluno','professor','plano','matricula','ficha_treino','exercicio','presenca'],write:['ficha_treino','exercicio','presenca'],users:false,finance:false,reports:false},
 aluno:{read:[],write:[],users:false,finance:false,reports:false},
};
export const publicUser=u=>({id:u.id,nome:u.nome,login:u.login,perfil:u.perfil,id_aluno:u.id_aluno,id_professor:u.id_professor,permissions:permissions[u.perfil]||permissions.aluno});
export function requirePermission(key,table){return(req,res,next)=>{const p=permissions[req.user?.perfil];if(!p||(table?!p[key]?.includes(table):!p[key]))return res.status(403).json({error:'Seu perfil não tem permissão para esta operação.'});next();};}
