import {writeFile,mkdir} from 'node:fs/promises';
import {spawnSync} from 'node:child_process';
const required=['CLOUDFLARE_API_TOKEN','CLOUDFLARE_ACCOUNT_ID','APP_USERS_JSON','APP_SESSION_SECRET','APP_ORIGIN'];
const project=JSON.parse(await (await import('node:fs/promises')).readFile('package.json','utf8')).name.startsWith('hylia')?'hylia':'hyrule';
if(project==='hyrule')required.push('PULSE_ENCRYPTION_KEY');else required.push('ARX_PASSWORD');
for(const name of required)if(!process.env[name])throw Error('Configura '+name+' en GitHub Actions.');
if(process.env.APP_SESSION_SECRET.length<32)throw Error('APP_SESSION_SECRET requiere 32 caracteres como mínimo.');
if(project==='hyrule'&&process.env.PULSE_ENCRYPTION_KEY.length<32)throw Error('PULSE_ENCRYPTION_KEY requiere 32 caracteres como mínimo.');
const users=JSON.parse(process.env.APP_USERS_JSON);if(!Array.isArray(users)||!users.length||users.some(u=>!u.username||typeof u.password!=='string'||u.password.length<12))throw Error('APP_USERS_JSON debe incluir usuarios con claves de al menos 12 caracteres.');
const account=process.env.CLOUDFLARE_ACCOUNT_ID;
async function cf(path,init={}){const r=await fetch('https://api.cloudflare.com/client/v4/accounts/'+account+path,{...init,headers:{Authorization:'Bearer '+process.env.CLOUDFLARE_API_TOKEN,'Content-Type':'application/json',...init.headers}});const data=await r.json();if(!r.ok||!data.success)throw Error('Cloudflare no pudo configurar '+path+': '+(data.errors||[]).map(e=>e.message).join('; '));return data.result;}
const dbName=project+'-github';
let db=(await cf('/d1/database?per_page=100')).find(d=>d.name===dbName);
if(!db)db=await cf('/d1/database',{method:'POST',body:JSON.stringify({name:dbName})});
const config={name:project+'-api',main:'dist/worker.js',compatibility_date:'2026-10-23',compatibility_flags:['nodejs_compat'],d1_databases:[{binding:'DB',database_name:dbName,database_id:db.uuid,migrations_dir:'migrations'}],vars:{APP_ORIGIN:process.env.APP_ORIGIN}};
await mkdir('worker',{recursive:true});await writeFile('worker/wrangler.generated.json',JSON.stringify(config,null,2));
const cli='node_modules/wrangler/bin/wrangler.js';
function run(args,input){const r=spawnSync(process.execPath,[cli,...args],{stdio:input?['pipe','inherit','inherit']:'inherit',input});if(r.error)throw r.error;if(r.status!==0)throw Error('Falló Wrangler. Revisa el registro de Actions.');}
run(['d1','migrations','apply','DB','--remote','--config','worker/wrangler.generated.json']);
run(['deploy','--config','worker/wrangler.generated.json']);
const secrets={APP_USERS_JSON:process.env.APP_USERS_JSON,APP_SESSION_SECRET:process.env.APP_SESSION_SECRET,...(project==='hylia'?{ARX_PASSWORD:process.env.ARX_PASSWORD}:{PULSE_ENCRYPTION_KEY:process.env.PULSE_ENCRYPTION_KEY})};
run(['secret','bulk','--config','worker/wrangler.generated.json'],JSON.stringify(secrets));
console.log('API desplegada. Copia su URL workers.dev en config.js o VITE_API_BASE. Nunca copies secretos al frontend.');
