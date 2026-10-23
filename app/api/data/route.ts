import {env} from 'cloudflare:workers';
import {getChatGPTUser} from '../../chatgpt-auth';
import {validateTask,checkGraph,duration,type Task} from '../../../lib/planning';
export const dynamic='force-dynamic';
const json=(d:unknown,s=200)=>Response.json(d,{status:s,headers:{'Cache-Control':'no-store'}});
async function member(user:string,space:string){return env.DB!.prepare('SELECT * FROM members WHERE user=? AND space=?').bind(user,space).first();}
export async function GET(req:Request){const u=await getChatGPTUser();if(!u)return json({error:'Inicia sesión para continuar'},401);const space=new URL(req.url).searchParams.get('space');if(!space)return json({spaces:(await env.DB!.prepare('SELECT spaces.*, members.name AS profile FROM spaces JOIN members ON spaces.id=members.space WHERE members.user=?').bind(u.userId).all()).results});if(!await member(u.userId,space))return json({error:'Sin acceso'},403);return json({calendars:(await env.DB!.prepare('SELECT * FROM calendars WHERE space=?').bind(space).all()).results,events:(await env.DB!.prepare('SELECT * FROM events WHERE space=?').bind(space).all()).results.map((e:any)=>({...JSON.parse(e.data),duration:duration(JSON.parse(e.data)),revision:JSON.parse(e.data).revision||0,id:e.id,calendar:e.calendar}))});}
export async function POST(req:Request){
 const u=await getChatGPTUser();if(!u)return json({error:'Inicia sesión'},401);
 const origin=req.headers.get('origin');if(origin&&origin!==new URL(req.url).origin)return json({error:'Sin acceso'},403);
 try{const b=await req.json() as any;const id=crypto.randomUUID();
 if(b.action==='join'){if(!['diego','ricardo'].includes(String(b.name).toLowerCase())||!(env as any).ARX_PASSWORD||b.password!==(env as any).ARX_PASSWORD)return json({error:'Usuario o clave incorrectos'},403);await env.DB!.batch([env.DB!.prepare('INSERT OR IGNORE INTO spaces(id,name) VALUES(?,?)').bind('arx','ARX'),env.DB!.prepare('INSERT OR IGNORE INTO calendars(id,space,name,color) VALUES(?,?,?,?)').bind('arx-general','arx','Contenido ARX','#ad8bc9'),env.DB!.prepare('INSERT OR REPLACE INTO members(id,user,space,name) VALUES(?,?,?,?)').bind(u.userId+':arx',u.userId,'arx',b.name)]);return json({id:'arx'});}
 if(b.action==='space'){if(!String(b.name||'').trim())return json({error:'Escribe un nombre'},400);await env.DB!.batch([env.DB!.prepare('INSERT INTO spaces VALUES(?,?)').bind(id,b.name.slice(0,80)),env.DB!.prepare('INSERT INTO members VALUES(?,?,?,?)').bind(crypto.randomUUID(),u.userId,id,u.displayName),env.DB!.prepare('INSERT INTO calendars VALUES(?,?,?,?)').bind(crypto.randomUUID(),id,'Mi calendario','#ad8bc9')]);return json({id});}
 if(!await member(u.userId,b.space))return json({error:'Sin acceso'},403);
 const existing=(await env.DB!.prepare('SELECT id,calendar,data FROM events WHERE space=?').bind(b.space).all()).results as {id:string;calendar:string;data:string}[];
 if(b.action==='calendar'){if(!String(b.name||'').trim())throw Error('Escribe un nombre.');await env.DB!.prepare('INSERT INTO calendars VALUES(?,?,?,?)').bind(id,b.space,String(b.name).slice(0,80),/^#[a-f\d]{6}$/i.test(b.color)?b.color:'#ad8bc9').run();return json({id});}
 if(b.action==='delete'){if(existing.some(e=>(JSON.parse(e.data).dependsOn||[]).includes(b.id)))return json({error:'Otra tarea depende de esta. Retira esa dependencia antes de eliminarla.'},409);await env.DB!.prepare('DELETE FROM events WHERE id=? AND space=?').bind(b.id,b.space).run();return json({ok:true});}
 if(b.action==='event'||b.action==='batch'){
 const raw=b.action==='event'?[b]:b.events;if(!Array.isArray(raw)||!raw.length||raw.length>60)throw Error('Guarda entre 1 y 60 tareas a la vez.');
 const calendars=(await env.DB!.prepare('SELECT id FROM calendars WHERE space=?').bind(b.space).all()).results.map(c=>c.id);
 const seen=new Set<string>();const writes:D1PreparedStatement[]=[];const changed:Task[]=[];
 for(const input of raw){const key=String(input.id||crypto.randomUUID());if(seen.has(key))throw Error('Hay tareas repetidas.');seen.add(key);const prior=existing.find(e=>e.id===key);if(b.action==='batch'&&b.mode==='update'&&!prior)return json({error:'Una tarea cambió o se eliminó. Actualiza el calendario.'},409);if(b.action==='batch'&&b.mode==='create'&&prior)throw Error('Una tarea ya existe.');const valid=validateTask(input);if(!calendars.includes(valid.calendar))throw Error('El calendario no pertenece a este espacio.');const old=prior?JSON.parse(prior.data):null;if(prior&&Number(input.revision||0)!==Number(old.revision||0))return json({error:'Otra persona modificó una tarea. Actualiza antes de guardar.'},409);const data=JSON.stringify({...valid,revision:(old?.revision||0)+1});changed.push({...valid,id:key});
 if(prior)writes.push(env.DB!.prepare('UPDATE events SET calendar=?,data=? WHERE id=? AND space=?').bind(valid.calendar,data,key,b.space));else writes.push(env.DB!.prepare('INSERT INTO events VALUES(?,?,?,?)').bind(key,b.space,valid.calendar,data));}
 checkGraph([...existing.filter(e=>!seen.has(e.id)).map(e=>({...JSON.parse(e.data),duration:duration(JSON.parse(e.data)),revision:JSON.parse(e.data).revision||0,id:e.id,calendar:e.calendar})),...changed]);
 await env.DB!.batch(writes);return json({ok:true,ids:changed.map(t=>t.id)});
 }
 return json({error:'Acción inválida'},400);
 }catch(e:any){return json({error:e.message||'No se pudo guardar. Intenta otra vez.'},400);}
}
