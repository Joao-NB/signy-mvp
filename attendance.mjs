import {requirePermission} from './permissions.mjs';
const fail=(message,status=400)=>Object.assign(Error(message),{status});
const number=(v,min,max)=>typeof v==='number'&&Number.isFinite(v)&&v>=min&&v<=max;
export function distanceMeters(lat,lon,targetLat,targetLon){
 const rad=v=>v*Math.PI/180,a=Math.sin(rad(targetLat-lat)/2)**2+Math.cos(rad(lat))*Math.cos(rad(targetLat))*Math.sin(rad(targetLon-lon)/2)**2;
 return 6371000*2*Math.atan2(Math.sqrt(a),Math.sqrt(Math.max(0,1-a)));
}
export function validateLocation(body,config,now=Date.now()){
 if(!body||typeof body!=='object'||Array.isArray(body))throw fail('Envie sua localização atual para registrar a presença.');
 if(!number(body.latitude,-90,90)||!number(body.longitude,-180,180)||!number(body.accuracy,0.1,100000))throw fail('Não foi possível obter uma localização válida. Tente novamente.');
 if(!number(body.timestamp,now-60000,now+10000))throw fail('A localização expirou. Obtenha sua localização novamente.');
 if(body.accuracy>Math.min(config.precisao_maxima,config.raio_metros))throw fail('Não foi possível confirmar sua localização com precisão suficiente. Ative a localização e tente em um local com melhor sinal. Se continuar, peça ajuda na recepção.');
 const distance=distanceMeters(body.latitude,body.longitude,Number(config.latitude),Number(config.longitude));
 if(distance>config.raio_metros)throw fail('Você está fora da área permitida para registrar presença. Tente novamente na academia.');
 // Se a margem de erro cruza a borda, pedir uma medição melhor, sem ampliar o raio.
 if(distance+body.accuracy>config.raio_metros)throw fail('Sua localização está próxima do limite e não pôde ser confirmada. Tente novamente com melhor sinal ou procure a recepção.');
}
export function attendanceModule(app,db){
 app.get('/api/academy/settings',requirePermission('users'),async(req,res)=>res.json((await db.query('SELECT * FROM configuracao_academia WHERE id=1')).rows[0]||null));
 app.put('/api/academy/settings',requirePermission('users'),async(req,res)=>{
  if(!req.body||typeof req.body!=='object'||Array.isArray(req.body))throw fail('Informe os dados de configuração da academia.');
  const {latitude,longitude,raio_metros,precisao_maxima,abertura,fechamento}=req.body,nome=String(req.body.nome||'').trim();
  if(nome.length<2||nome.length>150)throw fail('Informe o nome da academia (2 a 150 caracteres).');
  if(!number(latitude,-90,90)||!number(longitude,-180,180))throw fail('Informe latitude e longitude válidas.');
  if(!Number.isInteger(raio_metros)||!number(raio_metros,10,1000)||!Number.isInteger(precisao_maxima)||!number(precisao_maxima,5,150)||precisao_maxima>raio_metros)throw fail('Informe raio de 10 a 1000 metros e precisão de 5 a 150 metros, menor ou igual ao raio.');
  const time=v=>typeof v==='string'&&/^([01]\d|2[0-3]):[0-5]\d$/.test(v);
  if(!time(abertura)||!time(fechamento)||abertura>=fechamento)throw fail('Informe os horários de abertura e fechamento no mesmo dia.');
  const result=await db.query(`INSERT INTO configuracao_academia(id,nome,latitude,longitude,raio_metros,precisao_maxima,abertura,fechamento) VALUES(1,$1,$2,$3,$4,$5,$6,$7)
   ON CONFLICT(id) DO UPDATE SET nome=EXCLUDED.nome,latitude=EXCLUDED.latitude,longitude=EXCLUDED.longitude,raio_metros=EXCLUDED.raio_metros,precisao_maxima=EXCLUDED.precisao_maxima,abertura=EXCLUDED.abertura,fechamento=EXCLUDED.fechamento RETURNING *`,[nome,latitude,longitude,raio_metros,precisao_maxima,abertura,fechamento]);res.json(result.rows[0]);
 });
 app.post('/api/student/checkin',async(req,res)=>{
  if(req.user.perfil!=='aluno'||!req.user.id_aluno)throw fail('Registro mobile exclusivo do aluno autenticado.',403);
  if(!req.body||typeof req.body!=='object'||Array.isArray(req.body))throw fail('Envie sua localização atual para registrar a presença.');
  if('id_aluno' in req.body)throw fail('A presença é registrada somente para sua própria conta.',403);
  if(!req.secure&&process.env.NODE_ENV==='production')throw fail('Use uma conexão HTTPS para registrar presença.',400);
  const result=await db.transaction(async tx=>{
   const config=(await tx.query('SELECT * FROM configuracao_academia WHERE id=1 FOR SHARE')).rows[0];
   if(!config)throw fail('O check-in ainda não foi configurado pela academia. Registre sua presença na recepção.',503);
   validateLocation(req.body,config);
   const clock=(await tx.query('SELECT LOCALTIME BETWEEN $1::time AND $2::time AS aberto',[config.abertura,config.fechamento])).rows[0];
   if(!clock.aberto)throw fail('O check-in está disponível somente no horário de funcionamento da academia.');
   const enrollment=(await tx.query("SELECT id_matricula FROM matricula WHERE id_aluno=$1 AND situacao='ativa' AND CURRENT_DATE BETWEEN data_inicio AND data_fim FOR SHARE",[req.user.id_aluno])).rows[0];
   if(!enrollment)throw fail('Sua matrícula não está vigente. Procure a recepção.');
   const row=(await tx.query('INSERT INTO presenca(id_aluno) VALUES($1) ON CONFLICT(id_aluno,data_presenca) DO NOTHING RETURNING *',[req.user.id_aluno])).rows[0];
   if(!row)throw fail('Sua presença já foi registrada hoje.',409);return row;
  });res.status(201).json({message:'Presença registrada. Bom treino!',presenca:result});
 });
}
