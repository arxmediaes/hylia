export const planId='arx-q4-2026-v2';
type PlanEvent={id:string;calendar:string;[key:string]:unknown};
export async function importPlan(db:D1Database, plan:PlanEvent[],oldPlan:PlanEvent[]){
 const previous=await db.prepare('SELECT id FROM plan_imports WHERE id=?').bind(planId).first();
 let archived=0,preserved=0;
 if(!previous){
  const existing=(await db.prepare('SELECT id,calendar,data FROM events WHERE space=?').bind('arx').all<{id:string;calendar:string;data:string}>()).results;
  const old=new Map(oldPlan.map(({id,calendar,...data})=>[id,{calendar,data}]));
  const unchanged=existing.filter(row=>{const original=old.get(row.id);if(!original)return false;try{const data=JSON.parse(row.data);const same=row.calendar===original.calendar&&JSON.stringify(Object.entries(data).sort())===JSON.stringify(Object.entries(original.data).sort());if(!same)preserved++;return same}catch{preserved++;return false}});
  const now=new Date().toISOString();const archiveWrites:D1PreparedStatement[]=[];
  for(let i=0;i<unchanged.length;i+=25){
   const group=unchanged.slice(i,i+25);const where='space=? AND ('+group.map(()=>'(id=? AND data=?)').join(' OR ')+')';
   const args=group.flatMap(x=>[x.id,x.data]);
   archiveWrites.push(db.prepare('INSERT OR IGNORE INTO plan_archives(id,space,calendar,data,archived) SELECT id,space,calendar,data,? FROM events WHERE '+where).bind(now,'arx',...args));
   archiveWrites.push(db.prepare('DELETE FROM events WHERE '+where).bind('arx',...args));
  }
  const writes=[
   db.prepare('INSERT OR IGNORE INTO spaces(id,name) VALUES(?,?)').bind('arx','ARX'),
   db.prepare('INSERT OR IGNORE INTO calendars(id,space,name,color) VALUES(?,?,?,?)').bind('arx-plan-media-2026','arx','ARX Media · Plan','#a78bfa'),
   db.prepare('INSERT OR IGNORE INTO calendars(id,space,name,color) VALUES(?,?,?,?)').bind('arx-plan-wow-2026','arx','WOW Invitaciones · Plan','#c79ab9'),
   ...archiveWrites,
   ...plan.map(({id,calendar,...event})=>db.prepare('INSERT OR IGNORE INTO events(id,space,calendar,data) VALUES(?,?,?,?)').bind(id,'arx',calendar,JSON.stringify(event))),
   db.prepare('INSERT OR IGNORE INTO plan_imports(id,created) VALUES(?,?)').bind(planId,now)
  ];
  await db.batch(writes);archived=unchanged.length;
 }
 const summary=await db.prepare('SELECT calendar,COUNT(*) AS total FROM events WHERE space=? AND calendar IN (?,?) GROUP BY calendar').bind('arx','arx-plan-media-2026','arx-plan-wow-2026').all();
 return {ok:true,imported:!previous,plan:planId,archived,preserved,calendars:summary.results};
}
