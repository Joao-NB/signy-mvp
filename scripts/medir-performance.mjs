import { performance } from 'node:perf_hooks';
import { mkdir, writeFile } from 'node:fs/promises';
process.env.NODE_ENV='test';process.env.OPEN_ACCESS='false';process.env.DATA_DIR='memory://';process.env.ADMIN_PASSWORD='MedicaoLocal123!';delete process.env.DATABASE_URL;
const {app,db}=await import('../server.mjs');
const server=app.listen(0,'127.0.0.1');await new Promise(r=>server.once('listening',r));
const base=`http://127.0.0.1:${server.address().port}/api`;
const samples={bootstrap:[],login:[],overview:[],data:[],logout:[]};let cookie='';
async function measure(route,method='GET',body){const start=performance.now();const res=await fetch(base+'/'+route,{method,headers:{Cookie:cookie,'Content-Type':'application/json'},...(body?{body:JSON.stringify(body)}:{})});await res.json();if(!res.ok)throw Error(`${route}: ${res.status}`);if(route==='login')cookie=res.headers.get('set-cookie').split(';')[0];samples[route].push(performance.now()-start);}
try{
 for(let i=0;i<6;i++){await measure('bootstrap');await measure('login','POST',{login:'admin',senha:'MedicaoLocal123!'});await measure('overview');await measure('data');await measure('logout','POST');}
 const result={environment:'Node + PGlite em memória, localhost, banco vazio, 5 amostras após aquecimento; não mede Render/Neon',at:new Date().toISOString(),metrics:Object.fromEntries(Object.entries(samples).map(([k,v])=>{const sorted=v.slice(1).sort((a,b)=>a-b);return[k,{medianMs:+sorted[2].toFixed(2),p95Ms:+sorted.at(-1).toFixed(2)}]}))};
 await mkdir('test-results',{recursive:true});await writeFile(`test-results/performance-${process.argv[2]||'atual'}.json`,JSON.stringify(result,null,2));console.log(JSON.stringify(result,null,2));
}finally{await new Promise(r=>server.close(r));await db.close();}
