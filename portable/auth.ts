import {AsyncLocalStorage} from 'node:async_hooks';
export type User={userId:string;displayName:string;email:string;fullName:string|null};
export const identity=new AsyncLocalStorage<User|null>();
export async function getChatGPTUser(){return identity.getStore()||null;}
const encoder=new TextEncoder();
const encode=(data:Uint8Array)=>btoa(String.fromCharCode(...data)).replace(/=/g,'').replace(/\+/g,'-').replace(/\//g,'_');
const decode=(data:string)=>Uint8Array.from(atob(data.replace(/-/g,'+').replace(/_/g,'/')),c=>c.charCodeAt(0));
async function key(secret:string){if(secret.length<32)throw Error('Configura APP_SESSION_SECRET con al menos 32 caracteres.');return crypto.subtle.importKey('raw',encoder.encode(secret),{name:'HMAC',hash:'SHA-256'},false,['sign','verify']);}
export async function issueToken(user:User,secret:string,scope='session',now=Date.now()){
 const payload=encode(encoder.encode(JSON.stringify({user,scope,exp:now+8*60*60*1000})));
 return payload+'.'+encode(new Uint8Array(await crypto.subtle.sign('HMAC',await key(secret),encoder.encode(payload))));
}
export async function verifyToken(token:string,secret:string,scope='session',now=Date.now()):Promise<User|null>{
 try{const parts=token.split('.');if(parts.length!==2||token.length>3000)return null;
 if(!await crypto.subtle.verify('HMAC',await key(secret),decode(parts[1]),encoder.encode(parts[0])))return null;
 const payload=JSON.parse(new TextDecoder().decode(decode(parts[0])));
 if(payload.scope!==scope||!Number.isFinite(payload.exp)||payload.exp<=now||payload.exp>now+9*60*60*1000||!payload.user?.userId)return null;
 return payload.user;}catch{return null;}
}
export async function samePassword(a:string,b:string){
 if(!a||!b||a.length>256)return false;
 const [x,y]=await Promise.all([a,b].map(s=>crypto.subtle.digest('SHA-256',encoder.encode(s))));
 const aa=new Uint8Array(x),bb=new Uint8Array(y);let diff=0;for(let i=0;i<aa.length;i++)diff|=aa[i]^bb[i];return diff===0;
}
