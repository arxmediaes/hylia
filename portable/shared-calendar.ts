import {env} from 'cloudflare:workers';
export async function GET(req:Request){
 const token=new URL(req.url).searchParams.get('token')||'';
 const share=await env.DB.prepare('SELECT calendar,space FROM studio_links WHERE id=? AND kind=?').bind(token,'read').first<any>();
 if(!share)return Response.json({error:'El enlace no está disponible.'},{status:404});
 const calendar=await env.DB.prepare('SELECT name FROM calendars WHERE id=? AND space=?').bind(share.calendar,share.space).first<any>();
 if(!calendar)return Response.json({error:'Calendario no disponible.'},{status:404});
 const rows=await env.DB.prepare('SELECT data FROM events WHERE calendar=? AND space=?').bind(share.calendar,share.space).all();
 const tasks=rows.results.map((row:any)=>JSON.parse(row.data)).map((task:any)=>({...task,image:task.image?'/api/shared-image?token='+encodeURIComponent(token)+'&key='+encodeURIComponent(new URL(task.image,'https://site.local').searchParams.get('key')||''):''}));
 return Response.json({calendar,tasks},{headers:{'Cache-Control':'no-store'}});
}
