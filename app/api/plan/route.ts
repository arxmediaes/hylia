import {env} from 'cloudflare:workers';
import plan from './plan.json';
import oldPlan from './plan-v1.json';
import {importPlan} from './import';
export const dynamic='force-dynamic';
export async function POST(req:Request){
 const origin=req.headers.get('origin');
 if(origin&&origin!==new URL(req.url).origin)return Response.json({error:'Sin acceso'},{status:403});
 try{
  const b=await req.json() as {password?:string};
  if(!(env as any).ARX_PASSWORD||b.password!==(env as any).ARX_PASSWORD)return Response.json({error:'Sin acceso'},{status:403});
  if(!env.DB)return Response.json({error:'Base de datos no disponible'},{status:503});
  return Response.json(await importPlan(env.DB,plan,oldPlan),{headers:{'Cache-Control':'no-store'}});
 }catch{return Response.json({error:'No se pudo cargar el plan'},{status:500});}
}
