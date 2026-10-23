import {useEffect,useState} from 'react';
export function SharedCalendar({token}:{token:string}){
 const [data,D]=useState<any>(null),[error,E]=useState('');
 useEffect(()=>{fetch('/api/shared-calendar?token='+encodeURIComponent(token)).then(async r=>{const d=await r.json();if(!r.ok)throw Error(d.error);D(d);}).catch(e=>E(e.message));},[token]);
 if(error)return <main className="shared-page"><h1>Calendario compartido</h1><p role="alert">{error}</p></main>;
 if(!data)return <main className="shared-page"><p>Cargando calendario…</p></main>;
 const tasks=[...data.tasks].sort((a,b)=>a.date.localeCompare(b.date)),months=[...new Set(tasks.map(t=>t.date.slice(0,7)))];
 return <main className="shared-page"><header><a className="brand" href={import.meta.env.BASE_URL}>hylia.</a><span>Calendario compartido · Solo lectura</span></header><h1>{data.calendar.name}</h1>{months.map(month=><details className="shared-month" open key={month}><summary>{new Date(month+'-01T12:00:00').toLocaleDateString('es',{month:'long',year:'numeric'})}</summary><div className="shared-tasks">{tasks.filter(t=>t.date.startsWith(month)).map((t,i)=><article key={i}><small>{t.date} {t.time||''}</small><h2>{t.title}</h2><span className="shared-status">{t.status}</span>{t.image&&<img src={t.image} alt={t.title}/>}<details><summary>Ver detalles</summary><p className="shared-copy">{t.text}</p>{/^https?:\/\//.test(t.link||'')&&<a href={t.link} target="_blank" rel="noopener noreferrer">Abrir referencia</a>}</details></article>)}</div></details>)}</main>;
}
