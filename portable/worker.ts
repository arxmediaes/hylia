import {identity,issueToken,verifyToken,samePassword,type User} from './auth';
import {routes,project} from './routes';
import {env} from 'cloudflare:workers';
const runtime=()=>env as any;
const json=(body:unknown,status=200)=>Response.json(body,{status,headers:{'Cache-Control':'no-store'}});
function allowed(origin:string|null,url:URL){return !origin||origin===url.origin||String(runtime().APP_ORIGIN||'').split(',').map(x=>x.trim()).includes(origin);}
function cors(response:Response,origin:string|null){const headers=new Headers(response.headers);headers.set('Vary','Origin');headers.set('Cache-Control','no-store, private');headers.set('X-Content-Type-Options','nosniff');headers.set('Referrer-Policy','no-referrer');if(origin){headers.set('Access-Control-Allow-Origin',origin);headers.set('Access-Control-Allow-Headers','Authorization,Content-Type');headers.set('Access-Control-Allow-Methods','GET,POST,PUT,DELETE,OPTIONS');headers.set('Access-Control-Max-Age','600');}return new Response(response.body,{status:response.status,headers});}
async function login(req:Request){
 const e=runtime();if(!e.DB||!e.APP_USERS_JSON||!e.APP_SESSION_SECRET)return json({error:'Configura la base de datos y los secretos de la API.'},503);
 if(Number(req.headers.get('content-length')||0)>4096)return json({error:'Solicitud inválida'},413);
 const raw=await req.text();if(raw.length>4096)return json({error:'Solicitud inválida'},413);
 let body:any;try{body=JSON.parse(raw);}catch{return json({error:'Solicitud inválida'},400);}
 const username=String(body.username||'').trim().toLowerCase();
 const ip=req.headers.get('cf-connecting-ip')||'local';
 const bucket=String(Math.floor(Date.now()/300000));
 // Per-IP and per-user counters also limit attempts spread across isolates.
 for(const id of ['ip:'+ip+':'+bucket,'user:'+username+':'+bucket]){
  await e.DB.prepare('INSERT INTO portable_login_attempts(id,attempts,reset_at) VALUES(?,1,?) ON CONFLICT(id) DO UPDATE SET attempts=attempts+1').bind(id,Date.now()+300000).run();
  const count=await e.DB.prepare('SELECT attempts FROM portable_login_attempts WHERE id=?').bind(id).first();
  if(count.attempts>10)return json({error:'Demasiados intentos. Espera cinco minutos.'},429);
 }
 await e.DB.prepare('DELETE FROM portable_login_attempts WHERE reset_at<?').bind(Date.now()).run();
 let users:any;try{users=JSON.parse(e.APP_USERS_JSON);}catch{return json({error:'APP_USERS_JSON no es válido.'},503);}
 const account=Array.isArray(users)?users.find(x=>String(x.username||'').toLowerCase()===username):null;
 if(!account||typeof body.password!=='string'||!await samePassword(body.password,String(account.password||'')))return json({error:'Usuario o clave incorrectos.'},401);
 if(String(account.password).length<12)return json({error:'Configura una clave de acceso de al menos 12 caracteres.'},503);
 const user:User={userId:String(account.id||'github:'+username),displayName:String(account.name||username),email:String(account.email||username+'@private.local'),fullName:String(account.name||username)};
 return json({user,token:await issueToken(user,e.APP_SESSION_SECRET),imageToken:await issueToken(user,e.APP_SESSION_SECRET,'images')});
}
export default {async fetch(request:Request){
 const url=new URL(request.url),origin=request.headers.get('origin');
 if(!allowed(origin,url))return json({error:'Origen no autorizado.'},403);
 const finish=(r:Response)=>cors(r,origin);
 if(request.method==='OPTIONS')return finish(new Response(null,{status:204}));
 try{
 if(url.pathname==='/api/health')return finish(json({ok:true,project}));
 if(url.pathname==='/api/auth/login'&&request.method==='POST')return finish(await login(request));
 const bearer=request.headers.get('authorization')?.match(/^Bearer (.+)$/)?.[1]||'';
 let user=await verifyToken(bearer,String(runtime().APP_SESSION_SECRET||''));
 if(!user&&request.method==='GET'&&url.pathname==='/api/image')user=await verifyToken(url.searchParams.get('image_token')||'',String(runtime().APP_SESSION_SECRET||''),'images');
 const publicRoute=request.method==='GET'&&['/api/market','/api/shared-calendar','/api/shared-image'].includes(url.pathname);
 if(!user&&!publicRoute)return finish(json({error:'Inicia sesión para continuar.'},401));
 if(url.pathname==='/api/auth/me')return finish(json({user}));
 if(url.pathname==='/api/site-access')return finish(json({ok:true}));
 const route=(routes as any)[url.pathname],handler=route?.[request.method];
 if(!handler)return finish(json({error:'Ruta no disponible.'},404));
 // Original handlers enforce same-origin writes. Validate the actual caller
 // above, then normalize Origin for the preserved server handlers only.
 const headers=new Headers(request.headers);headers.set('Origin',url.origin);
 for(const name of [...headers.keys()])if(name.startsWith('oai-authenticated-'))headers.delete(name);
 const normalized=new Request(request,{headers});
 const response=await identity.run(user,()=>handler(normalized));
 return finish(response);
 }catch(error){if(error instanceof Response)return finish(error);console.error('API request failed',url.pathname,error instanceof Error?error.message:'unknown');return finish(json({error:'No se pudo completar la solicitud. Revisa la configuración de la API.'},500));}
}};
