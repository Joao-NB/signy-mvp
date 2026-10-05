import {mkdir,copyFile,cp,readFile} from 'node:fs/promises';
const files=['server.mjs','database.mjs','schema.sql','permissions.mjs','telemetry.mjs','account-flows.mjs','financial.mjs','experience.mjs','package-lock.json'];
await mkdir('dist',{recursive:true});
for(const file of files)await copyFile(file,`dist/${file}`);
await cp('public','dist/public',{recursive:true});
const {writeFile}=await import('node:fs/promises');
const pkg=JSON.parse(await readFile('package.json','utf8'));pkg.scripts={start:pkg.scripts.start};
await writeFile('dist/package.json',JSON.stringify(pkg,null,2));
console.log('Pacote de produção disponível em dist/. Execute npm ci --omit=dev e npm start nessa pasta.');
