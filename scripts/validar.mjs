import {readdir,readFile} from 'node:fs/promises';
import {spawnSync} from 'node:child_process';
for(const dir of ['.','public','scripts','tests']){
 for(const file of await readdir(dir))if(/\.(mjs|js)$/.test(file)){const r=spawnSync(process.execPath,['--check',`${dir}/${file}`],{stdio:'inherit'});if(r.status!==0)process.exit(r.status||1);}
}
const manifest=JSON.parse(await readFile('public/manifest.webmanifest','utf8'));
if(manifest.icons.length<2)throw Error('Ícones PWA ausentes.');
console.log('JavaScript e manifesto validados.');
