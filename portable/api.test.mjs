import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFile,readdir} from 'node:fs/promises';
import {createRequire} from 'node:module';
const require=createRequire(import.meta.url);
let mfModule;try{mfModule=require('miniflare')}catch{mfModule=createRequire(require.resolve('wrangler'))('miniflare')}
const {Miniflare}=mfModule;
const name=JSON.parse(await readFile('package.json','utf8')).name.startsWith('hylia')?'hylia':'hyrule';
const password='local-smoke-test-strong-password';
test(name+': authenticated API, persistence, scopes, CORS and original handlers',async()=>{
 const mf=new Miniflare({modules:true,scriptPath:'worker/dist/worker.js',compatibilityDate:'2026-05-01',compatibilityFlags:['nodejs_compat'],d1Databases:['DB'],r2Buckets:['BUCKET'],bindings:{APP_ORIGIN:'https://example.github.io',APP_USERS_JSON:JSON.stringify([{username:'ricardo',name:'Ricardo',password},{username:'other',name:'Other',password}]),APP_SESSION_SECRET:'local-session-secret-used-only-in-smoke-tests-123456',PULSE_ENCRYPTION_KEY:'local-cipher-secret-used-only-in-smoke-tests-123456',ARX_PASSWORD:password}});
 try{
  const db=await mf.getD1Database('DB');
  for(const file of (await readdir('worker/migrations')).filter(n=>n.endsWith('.sql')).sort()){
   const sql=await readFile('worker/migrations/'+file,'utf8');
   for(const statement of sql.replace(/--> statement-breakpoint/g,'').split(';').map(s=>s.trim()).filter(Boolean))await db.prepare(statement).run();
  }
  const call=(path,{token,method='GET',body,origin='https://example.github.io'}={})=>mf.dispatchFetch('https://api.example.test'+path,{method,headers:{Origin:origin,...(token?{Authorization:'Bearer '+token}:{}),...(body?{'Content-Type':'application/json'}:{})},...(body?{body:JSON.stringify(body)}:{})});
  assert.equal((await call('/api/health')).status,200);
  assert.equal((await call('/api/health',{origin:'https://evil.example'})).status,403);
  assert.equal((await call('/api/auth/me')).status,401);
  assert.equal((await call('/api/auth/login',{method:'POST',body:{username:'ricardo',password:'bad'}})).status,401);
  const login=await call('/api/auth/login',{method:'POST',body:{username:'ricardo',password}});assert.equal(login.status,200);assert.equal(login.headers.get('Access-Control-Allow-Origin'),'https://example.github.io');
  const session=await login.json();assert.ok(session.token);assert.ok(session.imageToken);const token=session.token;
  assert.equal((await call('/api/auth/me',{token})).status,200);
  assert.equal((await call('/api/auth/me',{token:session.imageToken})).status,401);
  assert.equal((await call('/api/auth/me',{token:token.slice(0,-8)+'tampered'})).status,401);
  assert.equal((await call('/api/auth/me?image_token='+session.imageToken)).status,401);
  const other=await (await call('/api/auth/login',{method:'POST',body:{username:'other',password}})).json();
  if(name==='hylia'){
   const joined=await call('/api/data',{token,method:'POST',body:{action:'join',name:'Ricardo',password}});assert.equal(joined.status,200);
   const plan=await call('/api/plan',{token,method:'POST',body:{password}});assert.equal(plan.status,200);
   const data=await (await call('/api/data?space=arx',{token})).json();assert.ok(data.calendars.length>=3);assert.ok(data.events.length>20);
   const r=await call('/api/data',{token,method:'POST',body:{action:'event',space:'arx',calendar:'arx-general',title:'Prueba local',date:'2026-11-01',status:'Pendiente',text:'nota',owner:'Ricardo',format:'Contenido'}});assert.equal(r.status,200);
   assert.equal((await call('/api/data?space=arx',{token:other.token})).status,403);
   const board=await call('/api/studio',{token,method:'POST',body:{action:'board',space:'arx',title:'Referencias'}});assert.equal(board.status,200);
   const sharing=await (await call('/api/studio',{token,method:'POST',body:{action:'link',space:'arx',kind:'read',calendar:'arx-general'}})).json();
   const shared=await call('/api/shared-calendar?token='+sharing.id);assert.equal(shared.status,200);assert.equal((await shared.json()).tasks.length,1);
   const joinOther=await call('/api/studio',{token:other.token,method:'POST',body:{action:'accept',token:sharing.id}});assert.equal(joinOther.status,404);
   await call('/api/studio',{token,method:'POST',body:{action:'revoke',space:'arx',id:sharing.id}});
   assert.equal((await call('/api/shared-calendar?token='+sharing.id)).status,404);
   const event=(await (await call('/api/data?space=arx',{token})).json()).events.find(e=>e.title==='Prueba local');assert.ok(event);
   const update=await call('/api/data',{token,method:'POST',body:{...event,action:'event',space:'arx',title:'Actualizada'}});assert.equal(update.status,200);
   const stale=await call('/api/data',{token,method:'POST',body:{...event,action:'event',space:'arx',title:'No sobrescribir'}});assert.equal(stale.status,409);
  }else{
   const data=await call('/api/state',{token});assert.equal(data.status,200);
   const save=await call('/api/state',{token,method:'POST',body:{state:{trades:[],experiments:[],marker:'portable'},revision:0}});assert.equal(save.status,200);
   assert.equal((await (await call('/api/state',{token})).json()).state.marker,'portable');
   assert.equal((await (await call('/api/state',{token:other.token})).json()).state,null);
   assert.equal((await (await call('/api/state?profile=secondary',{token})).json()).state,null);
   const swing=await call('/api/binance-v2-swing',{token});assert.equal(swing.status,200);assert.ok((await swing.json()).round);
  }
 }finally{await mf.dispose();}
});
