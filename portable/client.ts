const prefix=import.meta.env.VITE_APP_NAME||'app';
const tokenKey=prefix+':session';
const nativeFetch=window.fetch.bind(window);
export function apiBase(){const config=(window as any).APP_CONFIG?.apiBase;const value=String(config||localStorage.getItem(prefix+':api')||'').trim().replace(/\/$/,'');if(!value)return '';try{const u=new URL(value);if(u.protocol!=='https:'&&!['localhost','127.0.0.1'].includes(u.hostname))return '';if(u.username||u.password)return '';return u.origin;}catch{return '';}}
export function saveApi(value:string){const url=new URL(value);if(url.protocol!=='https:'&&!['localhost','127.0.0.1'].includes(url.hostname))throw Error('Usa una URL HTTPS para la API.');localStorage.setItem(prefix+':api',url.origin);}
export function session(){try{return JSON.parse(sessionStorage.getItem(tokenKey)||'null');}catch{return null;}}
export function logout(){sessionStorage.removeItem(tokenKey);location.href=import.meta.env.BASE_URL;}
export async function login(username:string,password:string){const r=await nativeFetch(apiBase()+'/api/auth/login',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({username,password}),credentials:'omit'});const data=await r.json();if(!r.ok)throw Error(data.error||'No se pudo iniciar sesión');sessionStorage.setItem(tokenKey,JSON.stringify(data));return data;}
function imageUrl(value:string){if(!value.startsWith('/api/image?')&&!value.startsWith('/api/shared-image?'))return value;const u=new URL(value,apiBase());if(u.pathname==='/api/image'){const s=session();if(s?.imageToken)u.searchParams.set('image_token',s.imageToken);}return u.toString();}
function mapImages(value:any):any{if(typeof value==='string')return imageUrl(value);if(Array.isArray(value))return value.map(mapImages);if(value&&typeof value==='object')return Object.fromEntries(Object.entries(value).map(([k,v])=>[k,mapImages(v)]));return value;}
// Keep database values as relative keys; image-scoped tokens never persist.
function unmapImages(value:any):any{if(typeof value==='string'&&apiBase()&&value.startsWith(apiBase()+'/api/image?')){const u=new URL(value);u.searchParams.delete('image_token');return u.pathname+u.search;}if(Array.isArray(value))return value.map(unmapImages);if(value&&typeof value==='object')return Object.fromEntries(Object.entries(value).map(([k,v])=>[k,unmapImages(v)]));return value;}
export function installApiTransport(){window.fetch=async(input:RequestInfo|URL,init?:RequestInit)=>{
 const url=typeof input==='string'?input:input instanceof URL?input.toString():input.url;
 if(!url.startsWith('/api/'))return nativeFetch(input,init);
 if(!apiBase())return Response.json({error:'Configura la URL de tu API.'},{status:503});
 const headers=new Headers(input instanceof Request?input.headers:undefined);new Headers(init?.headers).forEach((v,k)=>headers.set(k,v));
 const current=session();if(current?.token)headers.set('Authorization','Bearer '+current.token);
 let body=init?.body;if(typeof body==='string'&&headers.get('Content-Type')?.includes('application/json')){try{body=JSON.stringify(unmapImages(JSON.parse(body)));}catch{}}
 const r=await nativeFetch(apiBase()+url,{...init,body,headers,credentials:'omit'});
 if(r.headers.get('Content-Type')?.includes('application/json')){const raw=await r.json();if(r.ok&&url==='/api/data'&&typeof body==='string'){const join=JSON.parse(body);if(join.action==='join'){const seeded=await nativeFetch(apiBase()+'/api/plan',{method:'POST',headers,body:JSON.stringify({password:join.password}),credentials:'omit'});if(!seeded.ok)return seeded;}}const data=mapImages(raw);return new Response(JSON.stringify(data),{status:r.status,headers:r.headers});}return r;
};}
