import {env} from 'cloudflare:workers';import {MAX_IMAGE_BYTES,imageResponse,storeImage} from '../../d1-images';import {getChatGPTUser} from '../../chatgpt-auth';
export async function POST(req:Request){const u=await getChatGPTUser();if(!u)return new Response('',{status:401});const space=new URL(req.url).searchParams.get('space')||'';if(!await env.DB!.prepare('SELECT id FROM members WHERE user=? AND space=?').bind(u.userId,space).first())return new Response('',{status:403});const form=await boundedForm(req);if(form instanceof Response)return form;const f=form.get('file');if(!f||typeof f==='string'||!f.size||!['image/png','image/jpeg','image/webp','image/gif'].includes(f.type)||f.size>MAX_IMAGE_BYTES)return Response.json({error:'Usa JPG, PNG, WebP o GIF de hasta 1 MB'},{status:400});const key=space+'/'+crypto.randomUUID();await storeImage(key,f);return Response.json({url:'/api/image?key='+encodeURIComponent(key)});}
export async function GET(req:Request){const u=await getChatGPTUser();if(!u)return new Response('',{status:401});const key=new URL(req.url).searchParams.get('key')||'';if(!await env.DB!.prepare('SELECT id FROM members WHERE user=? AND space=?').bind(u.userId,key.split('/')[0]).first())return new Response('',{status:403});return imageResponse(key,'private, max-age=300');}

async function boundedForm(req:Request):Promise<FormData|Response>{
 const limit=MAX_IMAGE_BYTES+64*1024;
 const reject=()=>Response.json({error:'Usa JPG, PNG, WebP o GIF de hasta 1 MB'},{status:413});
 if(Number(req.headers.get('content-length')||0)>limit)return reject();
 const reader=req.body?.getReader();
 if(!reader)return Response.json({error:'Selecciona una imagen'},{status:400});
 const chunks:Uint8Array[]=[];let size=0;
 while(true){const {done,value}=await reader.read();if(done)break;size+=value.byteLength;if(size>limit){await reader.cancel();return reject();}chunks.push(value);}
 const body=new Uint8Array(size);let offset=0;for(const chunk of chunks){body.set(chunk,offset);offset+=chunk.byteLength;}
 try{return await new Response(body,{headers:{'Content-Type':req.headers.get('content-type')||''}}).formData();}
 catch{return Response.json({error:'No se pudo leer la imagen'},{status:400});}
}
