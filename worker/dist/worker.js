var __defProp = Object.defineProperty;
var __export = (target, all) => {
  for (var name in all)
    __defProp(target, name, { get: all[name], enumerable: true });
};

// portable/auth.ts
import { AsyncLocalStorage } from "node:async_hooks";
var identity = new AsyncLocalStorage();
async function getChatGPTUser() {
  return identity.getStore() || null;
}
var encoder = new TextEncoder();
var encode = (data) => btoa(String.fromCharCode(...data)).replace(/=/g, "").replace(/\+/g, "-").replace(/\//g, "_");
var decode = (data) => Uint8Array.from(atob(data.replace(/-/g, "+").replace(/_/g, "/")), (c) => c.charCodeAt(0));
async function key(secret) {
  if (secret.length < 32) throw Error("Configura APP_SESSION_SECRET con al menos 32 caracteres.");
  return crypto.subtle.importKey("raw", encoder.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign", "verify"]);
}
async function issueToken(user, secret, scope = "session", now = Date.now()) {
  const payload = encode(encoder.encode(JSON.stringify({ user, scope, exp: now + 8 * 60 * 60 * 1e3 })));
  return payload + "." + encode(new Uint8Array(await crypto.subtle.sign("HMAC", await key(secret), encoder.encode(payload))));
}
async function verifyToken(token, secret, scope = "session", now = Date.now()) {
  try {
    const parts = token.split(".");
    if (parts.length !== 2 || token.length > 3e3) return null;
    if (!await crypto.subtle.verify("HMAC", await key(secret), decode(parts[1]), encoder.encode(parts[0]))) return null;
    const payload = JSON.parse(new TextDecoder().decode(decode(parts[0])));
    if (payload.scope !== scope || !Number.isFinite(payload.exp) || payload.exp <= now || payload.exp > now + 9 * 60 * 60 * 1e3 || !payload.user?.userId) return null;
    return payload.user;
  } catch {
    return null;
  }
}
async function samePassword(a, b) {
  if (!a || !b || a.length > 256) return false;
  const [x, y] = await Promise.all([a, b].map((s) => crypto.subtle.digest("SHA-256", encoder.encode(s))));
  const aa = new Uint8Array(x), bb = new Uint8Array(y);
  let diff = 0;
  for (let i = 0; i < aa.length; i++) diff |= aa[i] ^ bb[i];
  return diff === 0;
}

// app/api/data/route.ts
var route_exports = {};
__export(route_exports, {
  GET: () => GET,
  POST: () => POST,
  dynamic: () => dynamic
});
import { env } from "cloudflare:workers";

// lib/planning.ts
var iso = (d) => `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}-${String(d.getUTCDate()).padStart(2, "0")}`;
var minutes = (s = "09:00") => Number(s.slice(0, 2)) * 60 + Number(s.slice(3, 5));
var duration = (e) => e.duration || Math.min(480, Math.max(15, Number(e.text?.match(/Tiempo orientativo: (\d+) min/i)?.[1]) || 60));
function validateTask(b) {
  if (!b.title?.trim() || b.title.length > 180) throw Error("Escribe un t\xEDtulo de hasta 180 caracteres.");
  if (!/^\d{4}-\d{2}-\d{2}$/.test(b.date) || isNaN(Date.parse(b.date)) || iso(/* @__PURE__ */ new Date(b.date + "T12:00:00Z")) !== b.date) throw Error("La fecha no es v\xE1lida.");
  if (!["Pendiente", "En proceso", "Completado"].includes(b.status)) throw Error("Revisa el estado.");
  if (b.time && !/^([01]\d|2[0-3]):[0-5]\d$/.test(b.time)) throw Error("Revisa la hora.");
  const d = b.duration == null ? 60 : Number(b.duration);
  if (!Number.isInteger(d) || d < 15 || d > 480) throw Error("La duraci\xF3n debe estar entre 15 y 480 minutos.");
  if (b.time && minutes(b.time) + d > 1440) throw Error("El bloque debe terminar dentro del mismo d\xEDa.");
  const deps = Array.isArray(b.dependsOn) ? [...new Set(b.dependsOn.map(String))].slice(0, 15) : [];
  return { calendar: String(b.calendar || ""), title: b.title.trim(), date: b.date, status: b.status, text: String(b.text || "").slice(0, 12e3), summary: String(b.summary || "").slice(0, 400), link: /^https?:\/\//.test(b.link) ? String(b.link).slice(0, 2e3) : "", image: /^\/api\/image\?key=/.test(b.image) ? String(b.image).slice(0, 600) : "", format: String(b.format || "Contenido").slice(0, 60), owner: String(b.owner || "").slice(0, 100), duration: d, time: b.time || "", dependsOn: deps, fixed: b.fixed == null ? b.format === "Tiempo protegido" : Boolean(b.fixed) };
}
function checkGraph(tasks) {
  const map = new Map(tasks.map((t) => [t.id, t]));
  const done = /* @__PURE__ */ new Set(), active = /* @__PURE__ */ new Set();
  function visit(id) {
    if (active.has(id)) throw Error("Estas dependencias forman un ciclo.");
    if (done.has(id)) return;
    active.add(id);
    for (const p of map.get(id)?.dependsOn || []) {
      if (!map.has(p)) throw Error("Una tarea previa no existe en este espacio.");
      visit(p);
    }
    active.delete(id);
    done.add(id);
  }
  for (const t of tasks) if (t.id) visit(t.id);
}

// app/api/data/route.ts
var dynamic = "force-dynamic";
var json = (d, s = 200) => Response.json(d, { status: s, headers: { "Cache-Control": "no-store" } });
async function member(user, space) {
  return env.DB.prepare("SELECT * FROM members WHERE user=? AND space=?").bind(user, space).first();
}
async function GET(req) {
  const u = await getChatGPTUser();
  if (!u) return json({ error: "Inicia sesi\xF3n para continuar" }, 401);
  const space = new URL(req.url).searchParams.get("space");
  if (!space) return json({ spaces: (await env.DB.prepare("SELECT spaces.*, members.name AS profile FROM spaces JOIN members ON spaces.id=members.space WHERE members.user=?").bind(u.userId).all()).results });
  if (!await member(u.userId, space)) return json({ error: "Sin acceso" }, 403);
  return json({ calendars: (await env.DB.prepare("SELECT * FROM calendars WHERE space=?").bind(space).all()).results, events: (await env.DB.prepare("SELECT * FROM events WHERE space=?").bind(space).all()).results.map((e) => ({ ...JSON.parse(e.data), duration: duration(JSON.parse(e.data)), revision: JSON.parse(e.data).revision || 0, id: e.id, calendar: e.calendar })) });
}
async function POST(req) {
  const u = await getChatGPTUser();
  if (!u) return json({ error: "Inicia sesi\xF3n" }, 401);
  const origin = req.headers.get("origin");
  if (origin && origin !== new URL(req.url).origin) return json({ error: "Sin acceso" }, 403);
  try {
    const b = await req.json();
    const id = crypto.randomUUID();
    if (b.action === "join") {
      if (!["diego", "ricardo"].includes(String(b.name).toLowerCase()) || !env.ARX_PASSWORD || b.password !== env.ARX_PASSWORD) return json({ error: "Usuario o clave incorrectos" }, 403);
      await env.DB.batch([env.DB.prepare("INSERT OR IGNORE INTO spaces(id,name) VALUES(?,?)").bind("arx", "ARX"), env.DB.prepare("INSERT OR IGNORE INTO calendars(id,space,name,color) VALUES(?,?,?,?)").bind("arx-general", "arx", "Contenido ARX", "#ad8bc9"), env.DB.prepare("INSERT OR REPLACE INTO members(id,user,space,name) VALUES(?,?,?,?)").bind(u.userId + ":arx", u.userId, "arx", b.name)]);
      return json({ id: "arx" });
    }
    if (b.action === "space") {
      if (!String(b.name || "").trim()) return json({ error: "Escribe un nombre" }, 400);
      await env.DB.batch([env.DB.prepare("INSERT INTO spaces VALUES(?,?)").bind(id, b.name.slice(0, 80)), env.DB.prepare("INSERT INTO members VALUES(?,?,?,?)").bind(crypto.randomUUID(), u.userId, id, u.displayName), env.DB.prepare("INSERT INTO calendars VALUES(?,?,?,?)").bind(crypto.randomUUID(), id, "Mi calendario", "#ad8bc9")]);
      return json({ id });
    }
    if (!await member(u.userId, b.space)) return json({ error: "Sin acceso" }, 403);
    const existing = (await env.DB.prepare("SELECT id,calendar,data FROM events WHERE space=?").bind(b.space).all()).results;
    if (b.action === "calendar") {
      if (!String(b.name || "").trim()) throw Error("Escribe un nombre.");
      await env.DB.prepare("INSERT INTO calendars VALUES(?,?,?,?)").bind(id, b.space, String(b.name).slice(0, 80), /^#[a-f\d]{6}$/i.test(b.color) ? b.color : "#ad8bc9").run();
      return json({ id });
    }
    if (b.action === "delete") {
      if (existing.some((e) => (JSON.parse(e.data).dependsOn || []).includes(b.id))) return json({ error: "Otra tarea depende de esta. Retira esa dependencia antes de eliminarla." }, 409);
      await env.DB.prepare("DELETE FROM events WHERE id=? AND space=?").bind(b.id, b.space).run();
      return json({ ok: true });
    }
    if (b.action === "event" || b.action === "batch") {
      const raw = b.action === "event" ? [b] : b.events;
      if (!Array.isArray(raw) || !raw.length || raw.length > 60) throw Error("Guarda entre 1 y 60 tareas a la vez.");
      const calendars = (await env.DB.prepare("SELECT id FROM calendars WHERE space=?").bind(b.space).all()).results.map((c) => c.id);
      const seen = /* @__PURE__ */ new Set();
      const writes = [];
      const changed = [];
      for (const input of raw) {
        const key2 = String(input.id || crypto.randomUUID());
        if (seen.has(key2)) throw Error("Hay tareas repetidas.");
        seen.add(key2);
        const prior = existing.find((e) => e.id === key2);
        if (b.action === "batch" && b.mode === "update" && !prior) return json({ error: "Una tarea cambi\xF3 o se elimin\xF3. Actualiza el calendario." }, 409);
        if (b.action === "batch" && b.mode === "create" && prior) throw Error("Una tarea ya existe.");
        const valid = validateTask(input);
        if (!calendars.includes(valid.calendar)) throw Error("El calendario no pertenece a este espacio.");
        const old = prior ? JSON.parse(prior.data) : null;
        if (prior && Number(input.revision || 0) !== Number(old.revision || 0)) return json({ error: "Otra persona modific\xF3 una tarea. Actualiza antes de guardar." }, 409);
        const data = JSON.stringify({ ...valid, revision: (old?.revision || 0) + 1 });
        changed.push({ ...valid, id: key2 });
        if (prior) writes.push(env.DB.prepare("UPDATE events SET calendar=?,data=? WHERE id=? AND space=?").bind(valid.calendar, data, key2, b.space));
        else writes.push(env.DB.prepare("INSERT INTO events VALUES(?,?,?,?)").bind(key2, b.space, valid.calendar, data));
      }
      checkGraph([...existing.filter((e) => !seen.has(e.id)).map((e) => ({ ...JSON.parse(e.data), duration: duration(JSON.parse(e.data)), revision: JSON.parse(e.data).revision || 0, id: e.id, calendar: e.calendar })), ...changed]);
      await env.DB.batch(writes);
      return json({ ok: true, ids: changed.map((t) => t.id) });
    }
    return json({ error: "Acci\xF3n inv\xE1lida" }, 400);
  } catch (e) {
    return json({ error: e.message || "No se pudo guardar. Intenta otra vez." }, 400);
  }
}

// app/api/image/route.ts
var route_exports2 = {};
__export(route_exports2, {
  GET: () => GET2,
  POST: () => POST2
});
import { env as env2 } from "cloudflare:workers";
async function POST2(req) {
  const u = await getChatGPTUser();
  if (!u) return new Response("", { status: 401 });
  const space = new URL(req.url).searchParams.get("space") || "";
  if (!await env2.DB.prepare("SELECT id FROM members WHERE user=? AND space=?").bind(u.userId, space).first()) return new Response("", { status: 403 });
  const f = (await req.formData()).get("file");
  if (!f || !["image/png", "image/jpeg", "image/webp", "image/gif"].includes(f.type) || f.size > 5 * 1024 * 1024) return Response.json({ error: "Usa JPG, PNG, WebP o GIF de hasta 5 MB" }, { status: 400 });
  const key2 = space + "/" + crypto.randomUUID();
  await env2.BUCKET.put(key2, await f.arrayBuffer(), { httpMetadata: { contentType: f.type } });
  return Response.json({ url: "/api/image?key=" + encodeURIComponent(key2) });
}
async function GET2(req) {
  const u = await getChatGPTUser();
  if (!u) return new Response("", { status: 401 });
  const key2 = new URL(req.url).searchParams.get("key") || "";
  if (!await env2.DB.prepare("SELECT id FROM members WHERE user=? AND space=?").bind(u.userId, key2.split("/")[0]).first()) return new Response("", { status: 403 });
  const o = await env2.BUCKET.get(key2);
  return o ? new Response(o.body, { headers: { "Content-Type": o.httpMetadata.contentType, "Cache-Control": "private, max-age=300", "X-Content-Type-Options": "nosniff" } }) : new Response("", { status: 404 });
}

// app/api/plan/route.ts
var route_exports3 = {};
__export(route_exports3, {
  POST: () => POST3,
  dynamic: () => dynamic2
});
import { env as env3 } from "cloudflare:workers";

// app/api/plan/plan.json
var plan_default = [
  {
    id: "plan-v2-arx-01",
    calendar: "arx-plan-media-2026",
    title: "Elegir un problema que ARX pueda resolver",
    date: "2026-10-17",
    status: "Pendiente",
    text: "Una oferta concreta, basada en automatizaci\xF3n + IA; audiovisual como una l\xEDnea propia.\n\nQU\xC9 HACER\n\u2022 Revisar los tres pilares actuales: automatizaci\xF3n y flujos, IA, producci\xF3n audiovisual y dise\xF1o. No poner desarrollo web como servicio principal de esta campa\xF1a.\n\u2022 Elegir un caso demostrable: consulta de WhatsApp \u2192 clasificaci\xF3n \u2192 registro \u2192 respuesta. Definir qu\xE9 incluye, qu\xE9 necesita el cliente y c\xF3mo cotizarlo.\n\u2022 Probar el enlace de WhatsApp y el simulador de IA. Detect\xE9 un CTA final con wa.me sin n\xFAmero: comprobar y corregirlo en la web antes de anunciarlo; Hylia no modifica esa web.\n\nIDEA DE CONTENIDO\n\xABEsto todav\xEDa lo haces a mano\xBB: mostrar una tarea repetitiva y su flujo resuelto en 20 segundos. CTA: cu\xE9ntanos tu proceso por WhatsApp.\n\nLISTO CUANDO\nUna ficha comercial breve, un CTA funcional a WhatsApp y una demo elegida.\n\nTiempo orientativo: 75 min. Responsable por asignar.",
    link: "https://arxmedia.es",
    image: "",
    format: "Planificaci\xF3n",
    owner: "Por asignar",
    summary: "Una oferta concreta, basada en automatizaci\xF3n + IA; audiovisual como una l\xEDnea propia."
  },
  {
    id: "plan-v2-wow-02",
    calendar: "arx-plan-wow-2026",
    title: "Dejar clara la elecci\xF3n y la compra",
    date: "2026-10-19",
    status: "Pendiente",
    text: "Vender la experiencia que WOW ofrece hoy, sin a\xF1adir funciones que la colecci\xF3n no anuncia.\n\nQU\xC9 HACER\n\u2022 Revisar El jard\xEDn secreto (\u20AC49 / $49.990 CLP), El primer baile (\u20AC69 / $69.990), La hora dorada (\u20AC89 / $89.990) y A medida (\u20AC149 / $149.990). Referencias comprobadas en la web el 16/10; confirmar antes de cualquier promoci\xF3n.\n\u2022 Comprobar selecci\xF3n \u2192 datos \u2192 revisi\xF3n \u2192 pago \u2192 confirmaci\xF3n con el modo de prueba de cada proveedor; no generar cobros reales para probar. Los endpoints p\xFAblicos de Stripe y Mercado Pago respondieron configured:true el 16/10. Eso confirma configuraci\xF3n, no una compra completada; falta probar el recorrido de pago.\n\u2022 Explicar entrega: colecci\xF3n 48\u201372 h y a medida 6 d\xEDas, desde pago confirmado y datos necesarios. Fotos despu\xE9s seg\xFAn FAQ. No vender RSVP ni otras funciones no publicadas.\n\nLISTO CUANDO\nCompra probada y respuesta breve a \u201Cqu\xE9 recibo, cu\xE1nto cuesta y cu\xE1ndo llega\u201D.\n\nTiempo orientativo: 60 min. Responsable por asignar.",
    link: "https://invitaciones.arxmedia.es",
    image: "",
    format: "Operaci\xF3n",
    owner: "Por asignar",
    summary: "Vender la experiencia que WOW ofrece hoy, sin a\xF1adir funciones que la colecci\xF3n no anuncia."
  },
  {
    id: "plan-v2-arx-03",
    calendar: "arx-plan-media-2026",
    title: "Un bloque de contenido para las dos marcas",
    date: "2026-10-21",
    status: "Pendiente",
    text: "Crear dos piezas \xFAtiles con material que ya tienen, en una sola sesi\xF3n.\n\nQU\xC9 HACER\n\u2022 ARX: capturar una demo de automatizaci\xF3n real o se\xF1alada como demostraci\xF3n; ense\xF1ar entrada, proceso y resultado. Exportar 1 reel y 3 historias. CTA a WhatsApp.\n\u2022 WOW: grabar en m\xF3vil la apertura de El jard\xEDn secreto y el recorrido por fecha, mapa y dress code. Exportar 1 reel y 3 historias. CTA a la demo.\n\u2022 Publicar ARX el 22/10 y WOW el 23/10 cuando est\xE9n revisados. Reutilizar las tomas; no producir tres campa\xF1as distintas.\n\nIDEA DE CONTENIDO\nARX: \xABTu negocio recibe la consulta. El sistema organiza lo dem\xE1s\xBB. WOW: \xABPrimero abren una carta. Despu\xE9s empieza su boda\xBB.\n\nLISTO CUANDO\nDos reels y seis historias listos; publicaciones realizadas o programadas con aprobaci\xF3n.\n\nTiempo orientativo: 120 min. Responsable por asignar.",
    link: "https://arxmedia.es",
    image: "",
    format: "Producci\xF3n",
    owner: "Por asignar",
    summary: "Crear dos piezas \xFAtiles con material que ya tienen, en una sola sesi\xF3n."
  },
  {
    id: "plan-v2-wow-04",
    calendar: "arx-plan-wow-2026",
    title: "Definir un concurso que atraiga a parejas",
    date: "2026-10-26",
    status: "Pendiente",
    text: "Propuesta: una invitaci\xF3n de la colecci\xF3n para una pareja con boda en 2027.\n\nQU\xC9 HACER\n\u2022 Confirmar premio: una invitaci\xF3n a elegir entre los tres dise\xF1os de colecci\xF3n; A medida y extras quedan fuera salvo decisi\xF3n expresa. Fijar revisiones, plazo y coste de personalizaci\xF3n.\n\u2022 Preparar bases y formulario: mayores de 18, Chile/Espa\xF1a propuestos, una entrada por pareja, sin compra obligatoria. Pedir datos m\xEDnimos; bolet\xEDn opcional con consentimiento separado.\n\u2022 Plan propuesto: abrir 2/11 10:00, cerrar 13/11 20:00 y sortear 16/11 19:00, hora Santiago. Revisar reglas vigentes de Instagram y requisitos aplicables; no exigir compartir ni etiquetar para participar.\n\nLISTO CUANDO\nPremio, alcance, bases y formulario aprobados y probados. Si no est\xE1n, mover las fechas antes de anunciarlas.\n\nTiempo orientativo: 90 min. Responsable por asignar.",
    link: "https://invitaciones.arxmedia.es",
    image: "",
    format: "Concurso",
    owner: "Por asignar",
    summary: "Propuesta: una invitaci\xF3n de la colecci\xF3n para una pareja con boda en 2027."
  },
  {
    id: "plan-v2-arx-05",
    calendar: "arx-plan-media-2026",
    title: "Mostrar el lado creativo de ARX",
    date: "2026-10-28",
    status: "Pendiente",
    text: "Equilibrar automatizaci\xF3n con producci\xF3n audiovisual, como presenta la web.\n\nQU\xC9 HACER\n\u2022 Elegir un trabajo autorizado de video, fotograf\xEDa o dise\xF1o y mostrar una decisi\xF3n concreta detr\xE1s del resultado.\n\u2022 Editar 1 reel de proceso y sacar 3 historias del mismo material. Si faltan permisos, usar un proyecto propio identificado.\n\u2022 Publicarlo el 29/10 con CTA a WhatsApp para conversar sobre contenido corporativo. Anotar consultas \xFAtiles, no solo reproducciones.\n\nIDEA DE CONTENIDO\n\xABLo que ves / lo que hubo que decidir\xBB: pieza terminada \u2192 referencia \u2192 encuadre \u2192 montaje. Sin inventar m\xE9tricas de clientes.\n\nLISTO CUANDO\nUna pieza publicada y una selecci\xF3n de clips reutilizables.\n\nTiempo orientativo: 90 min. Responsable por asignar.",
    link: "https://arxmedia.es",
    image: "",
    format: "Producci\xF3n",
    owner: "Por asignar",
    summary: "Equilibrar automatizaci\xF3n con producci\xF3n audiovisual, como presenta la web."
  },
  {
    id: "plan-v2-wow-06",
    calendar: "arx-plan-wow-2026",
    title: "Comparar las tres experiencias de WOW",
    date: "2026-10-30",
    status: "Pendiente",
    text: "Ayudar a elegir por la forma de abrir y recorrer la invitaci\xF3n.\n\nQU\xC9 HACER\n\u2022 Montar un reel con carta/jard\xEDn, tres toques/puertas y llave/atardecer. Nombrar los dise\xF1os actuales.\n\u2022 Mostrar que se personaliza con nombres, fecha y fotos y se comparte mediante un enlace, sin app. Las preguntas previas van al Instagram enlazado en la web.\n\u2022 Publicar con link a colecci\xF3n. \xDAltimo control del concurso: bases, formulario, confirmaci\xF3n, registro y m\xE9todo de sorteo listos.\n\nIDEA DE CONTENIDO\n\xAB\xBFC\xF3mo empieza su invitaci\xF3n?\xBB Tres entradas, una pantalla por dise\xF1o. CTA: prueben las demos.\n\nLISTO CUANDO\nComparativa publicada y decisi\xF3n de lanzar o reprogramar el concurso.\n\nTiempo orientativo: 60 min. Responsable por asignar.",
    link: "https://invitaciones.arxmedia.es",
    image: "",
    format: "Publicaci\xF3n",
    owner: "Por asignar",
    summary: "Ayudar a elegir por la forma de abrir y recorrer la invitaci\xF3n."
  },
  {
    id: "plan-v2-wow-07",
    calendar: "arx-plan-wow-2026",
    title: "Abrir el concurso de WOW",
    date: "2026-11-02",
    status: "Pendiente",
    text: "Lanzar solo si el premio y las bases est\xE1n aprobados.\n\nQU\xC9 HACER\n\u2022 A las 10:00 de Santiago abrir registro y publicar un reel del premio. Fijar enlace a bases y explicar el cierre del 13/11.\n\u2022 Probar una participaci\xF3n de extremo a extremo. Separar entradas v\xE1lidas de suscripciones voluntarias y visitas a demos.\n\u2022 Mantener la colecci\xF3n disponible para comprar; no cerrar la web ni reemplazar todos los contenidos por el sorteo.\n\nLISTO CUANDO\nConcurso publicado, registro probado y una persona encargada de responder dudas.\n\nTiempo orientativo: 45 min. Responsable por asignar.",
    link: "https://invitaciones.arxmedia.es",
    image: "",
    format: "Concurso",
    owner: "Por asignar",
    summary: "Lanzar solo si el premio y las bases est\xE1n aprobados."
  },
  {
    id: "plan-v2-arx-08",
    calendar: "arx-plan-media-2026",
    title: "Grabar una automatizaci\xF3n que se entienda",
    date: "2026-11-04",
    status: "Pendiente",
    text: "Vender una soluci\xF3n visible, no una lista de herramientas.\n\nQU\xC9 HACER\n\u2022 Capturar un caso de formulario o WhatsApp \u2192 clasificaci\xF3n con IA \u2192 datos ordenados. Utilizar datos demo o permiso del cliente.\n\u2022 Grabar voz explicando un solo problema y una sola mejora. Preparar 1 reel + 3 historias y publicar el 5/11.\n\u2022 CTA: contar el proceso manual por WhatsApp. Si el cliente usa sus herramientas actuales, mostrar esa continuidad tal como promete ARX.\n\nIDEA DE CONTENIDO\n\xABLa consulta llega mientras t\xFA est\xE1s trabajando\xBB: pantalla con el flujo resolviendo clasificaci\xF3n y registro. No afirmar que responde cualquier situaci\xF3n sin supervisi\xF3n.\n\nLISTO CUANDO\nUna demo publicada y un ejemplo listo para enviar en una consulta comercial.\n\nTiempo orientativo: 90 min. Responsable por asignar.",
    link: "https://arxmedia.es",
    image: "",
    format: "Producci\xF3n",
    owner: "Por asignar",
    summary: "Vender una soluci\xF3n visible, no una lista de herramientas."
  },
  {
    id: "plan-v2-wow-09",
    calendar: "arx-plan-wow-2026",
    title: "Resolver las dudas que frenan la compra",
    date: "2026-11-06",
    status: "Pendiente",
    text: "Una pieza \xFAtil para vender mientras el concurso sigue abierto.\n\nQU\xC9 HACER\n\u2022 Crear 1 carrusel con tres respuestas reales: recibes un enlace; la colecci\xF3n se personaliza en 48\u201372 h desde pago/datos; no necesitas app.\n\u2022 Aclarar que pueden enviar fotos despu\xE9s como explica la FAQ y que el plazo depende de reunir la informaci\xF3n necesaria.\n\u2022 Publicar y a\xF1adir un recordatorio sencillo del concurso en historias, con fecha y bases.\n\nLISTO CUANDO\nFAQ publicada y enlace de compra/demo f\xE1cil de encontrar.\n\nTiempo orientativo: 45 min. Responsable por asignar.",
    link: "https://invitaciones.arxmedia.es",
    image: "",
    format: "Publicaci\xF3n",
    owner: "Por asignar",
    summary: "Una pieza \xFAtil para vender mientras el concurso sigue abierto."
  },
  {
    id: "plan-v2-arx-10",
    calendar: "arx-plan-media-2026",
    title: "Decidir qu\xE9 vender en Black Friday",
    date: "2026-11-09",
    status: "Pendiente",
    text: "Ofrecer algo que pueda entregarse con margen y agenda real.\n\nQU\xC9 HACER\n\u2022 Elegir una sola propuesta entre automatizaci\xF3n acotada o producci\xF3n audiovisual. El precio y el alcance se cotizan: la web no publica una tarifa fija de esos servicios.\n\u2022 Calcular horas, revisiones, herramientas externas y capacidad. Elegir beneficio por reserva o pack cerrado; no descontar sin conocer el coste.\n\u2022 Grabar una explicaci\xF3n breve de la oferta y preparar dos respuestas a objeciones. Si se pauta, aprobar antes presupuesto y l\xEDmite de gasto.\n\nLISTO CUANDO\nUna oferta aprobada y una respuesta comercial para WhatsApp; si no conviene, mantener venta habitual.\n\nTiempo orientativo: 75 min. Responsable por asignar.",
    link: "https://arxmedia.es",
    image: "",
    format: "Ventas",
    owner: "Por asignar",
    summary: "Ofrecer algo que pueda entregarse con margen y agenda real."
  },
  {
    id: "plan-v2-wow-11",
    calendar: "arx-plan-wow-2026",
    title: "Preparar venta y recordatorio del concurso",
    date: "2026-11-11",
    status: "Pendiente",
    text: "Usar una sola sesi\xF3n para las piezas de noviembre.\n\nQU\xC9 HACER\n\u2022 Grabar El primer baile y La hora dorada en m\xF3vil. Explicar el efecto de apertura y los datos \xFAtiles del evento.\n\u2022 Definir si habr\xE1 beneficio Black Friday sobre la colecci\xF3n: precio final, vigencia y margen aprobados antes de comunicar. No suponer que ya existe una reserva comercial para bodas futuras.\n\u2022 Exportar 1 reel de producto y 3 historias; una recuerda el cierre del concurso el 13/11 a las 20:00.\n\nIDEA DE CONTENIDO\n\xABLa informaci\xF3n est\xE1. La sorpresa tambi\xE9n\xBB. Mostrar apertura \u2192 fecha \u2192 mapa \u2192 enlace para compartir.\n\nLISTO CUANDO\nPiezas listas y oferta decidida; ninguna promoci\xF3n sin condiciones claras.\n\nTiempo orientativo: 90 min. Responsable por asignar.",
    link: "https://invitaciones.arxmedia.es",
    image: "",
    format: "Producci\xF3n",
    owner: "Por asignar",
    summary: "Usar una sola sesi\xF3n para las piezas de noviembre."
  },
  {
    id: "plan-v2-wow-12",
    calendar: "arx-plan-wow-2026",
    title: "Cerrar participaciones sin improvisar",
    date: "2026-11-13",
    status: "Pendiente",
    text: "Dejar el sorteo preparado y trazable.\n\nQU\xC9 HACER\n\u2022 Cerrar registro a las 20:00 de Santiago y conservar copia de entradas.\n\u2022 Aplicar las reglas publicadas para duplicados y validez; documentar exclusiones sin exponer datos personales.\n\u2022 Preparar m\xE9todo aleatorio y suplentes seg\xFAn bases; recordar resultado el 16/11. No a\xF1adir requisitos al final.\n\nLISTO CUANDO\nLista v\xE1lida guardada y procedimiento de selecci\xF3n preparado.\n\nTiempo orientativo: 45 min. Responsable por asignar.",
    link: "https://invitaciones.arxmedia.es",
    image: "",
    format: "Concurso",
    owner: "Por asignar",
    summary: "Dejar el sorteo preparado y trazable."
  },
  {
    id: "plan-v2-wow-13",
    calendar: "arx-plan-wow-2026",
    title: "Sortear y contactar a la pareja ganadora",
    date: "2026-11-16",
    status: "Pendiente",
    text: "Entregar un premio real y una experiencia cuidada.\n\nQU\xC9 HACER\n\u2022 A las 19:00 de Santiago ejecutar el sorteo documentado y guardar evidencia; elegir suplentes seg\xFAn bases.\n\u2022 Contactar por el canal publicado, respetar las 48 h previstas de respuesta y no pedir pagos para reclamar el premio.\n\u2022 Confirmar plantilla y materiales. Publicar solo los datos permitidos y solicitar por separado permiso para mostrar el proyecto.\n\nLISTO CUANDO\nGanador/suplente documentado y siguiente paso de personalizaci\xF3n acordado.\n\nTiempo orientativo: 45 min. Responsable por asignar.",
    link: "https://invitaciones.arxmedia.es",
    image: "",
    format: "Concurso",
    owner: "Por asignar",
    summary: "Entregar un premio real y una experiencia cuidada."
  },
  {
    id: "plan-v2-arx-14",
    calendar: "arx-plan-media-2026",
    title: "Dejar lista la semana comercial",
    date: "2026-11-18",
    status: "Pendiente",
    text: "Una sesi\xF3n corta para tener resueltas oferta y respuestas.\n\nQU\xC9 HACER\n\u2022 ARX: aprobar alcance, precio cotizado, anticipo, cupos reales y plazo; producir 1 reel + 3 historias con CTA WhatsApp.\n\u2022 WOW: preparar una creatividad con beneficio aprobado y acceso a colecci\xF3n. Confirmar que precio y moneda coinciden con pago.\n\u2022 Dejar cuatro mensajes en borrador: apertura, ejemplo, FAQ y cierre. Enviar promociones solo a contactos que las aceptaron; no convertir la lista del concurso en una lista comercial.\n\nLISTO CUANDO\nCreatividades, enlaces y respuestas revisados; agenda de entrega viable para ambas marcas.\n\nTiempo orientativo: 120 min. Responsable por asignar.",
    link: "https://arxmedia.es",
    image: "",
    format: "Producci\xF3n",
    owner: "Por asignar",
    summary: "Una sesi\xF3n corta para tener resueltas oferta y respuestas."
  },
  {
    id: "plan-v2-wow-15",
    calendar: "arx-plan-wow-2026",
    title: "Asegurar premio, pedidos y compra",
    date: "2026-11-20",
    status: "Pendiente",
    text: "Resolver operaci\xF3n antes de traer m\xE1s visitas.\n\nQU\xC9 HACER\n\u2022 Confirmar respuesta del ganador y materiales. Entregar primera versi\xF3n si est\xE1n completos; si falta informaci\xF3n, acordar fecha coherente con las bases.\n\u2022 Probar el checkout y confirmaci\xF3n de la oferta vigente en cada mercado sin realizar cobros reales de prueba.\n\u2022 Comprobar plazo: colecci\xF3n 48\u201372 h; a medida 6 d\xEDas desde pago y datos. La promoci\xF3n no debe convertir A medida en premio ni a\xF1adir funciones no ofrecidas.\n\nLISTO CUANDO\nPremio con fecha acordada, compra comprobada y dudas de entrega resueltas.\n\nTiempo orientativo: 60 min. Responsable por asignar.",
    link: "https://invitaciones.arxmedia.es",
    image: "",
    format: "Entrega",
    owner: "Por asignar",
    summary: "Resolver operaci\xF3n antes de traer m\xE1s visitas."
  },
  {
    id: "plan-v2-arx-16",
    calendar: "arx-plan-media-2026",
    title: "Abrir la propuesta comercial de ARX",
    date: "2026-11-23",
    status: "Pendiente",
    text: "Concentrar la comunicaci\xF3n en un servicio y un siguiente paso.\n\nQU\xC9 HACER\n\u2022 Publicar la oferta aprobada con un ejemplo de automatizaci\xF3n o audiovisual y CTA directo a WhatsApp.\n\u2022 Revisar consultas en dos bloques al d\xEDa; cada una debe tener problema, fecha y siguiente paso. No activar campa\xF1as sin presupuesto aprobado.\n\u2022 Si no se aprob\xF3 beneficio Black Friday, comunicar el servicio habitual y disponibilidad real. No bloquear la web ni inventar cupos.\n\nLISTO CUANDO\nOferta publicada y consultas con respuesta y seguimiento.\n\nTiempo orientativo: 45 min. Responsable por asignar.",
    link: "https://arxmedia.es",
    image: "",
    format: "Ventas",
    owner: "Por asignar",
    summary: "Concentrar la comunicaci\xF3n en un servicio y un siguiente paso."
  },
  {
    id: "plan-v2-wow-17",
    calendar: "arx-plan-wow-2026",
    title: "Mostrar la demo que mejor ayuda a elegir",
    date: "2026-11-25",
    status: "Pendiente",
    text: "Vender con una experiencia clara, no solo con descuento.\n\nQU\xC9 HACER\n\u2022 Publicar 1 reel de la colecci\xF3n con beneficio solo si est\xE1 aprobado; 3 historias resuelven precio, personalizaci\xF3n y entrega.\n\u2022 Revisar recorrido medido: abrir dise\xF1o \u2192 elegir \u2192 revisar pedido \u2192 iniciar pago \u2192 confirmaci\xF3n. La web ya contempla esos eventos con consentimiento de anal\xEDtica.\n\u2022 Distinguir visitas de compras. Si fallan pagos o enlaces, corregir antes de ampliar gasto.\n\nLISTO CUANDO\nDemo publicada, consultas respondidas y recorrido de compra revisado.\n\nTiempo orientativo: 45 min. Responsable por asignar.",
    link: "https://invitaciones.arxmedia.es",
    image: "",
    format: "Publicaci\xF3n",
    owner: "Por asignar",
    summary: "Vender con una experiencia clara, no solo con descuento."
  },
  {
    id: "plan-v2-wow-18",
    calendar: "arx-plan-wow-2026",
    title: "Black Friday: facilitar la decisi\xF3n",
    date: "2026-11-27",
    status: "Pendiente",
    text: "Mantener claridad en producto, precio y plazos.\n\nQU\xC9 HACER\n\u2022 Mostrar oferta aprobada y fecha de cierre del 30/11; no improvisar una promoci\xF3n nueva hoy.\n\u2022 Publicar demo + FAQ + siguiente paso. Comprobar pedidos y confirmaciones; dar plazo real desde pago y datos completos.\n\u2022 En ARX, hacer una comprobaci\xF3n breve de agenda antes de aceptar nuevas reservas. En ambas marcas, no subir presupuesto solo por la fecha.\n\nLISTO CUANDO\nPedidos y consultas atendidos; disponibilidad y condiciones actualizadas.\n\nTiempo orientativo: 45 min. Responsable por asignar.",
    link: "https://invitaciones.arxmedia.es",
    image: "",
    format: "Ventas",
    owner: "Por asignar",
    summary: "Mantener claridad en producto, precio y plazos."
  },
  {
    id: "plan-v2-arx-19",
    calendar: "arx-plan-media-2026",
    title: "Cerrar la promoci\xF3n y ordenar las entregas",
    date: "2026-11-30",
    status: "Pendiente",
    text: "Cerrar la semana comercial sin arrastrar desorden a diciembre.\n\nQU\xC9 HACER\n\u2022 Cyber Monday: recordar cierre solo si fue anunciado y retirar beneficio a la hora acordada.\n\u2022 ARX: confirmar anticipos, alcance y fechas de proyectos. WOW: confirmar pago, informaci\xF3n recibida y entrega de cada invitaci\xF3n.\n\u2022 Guardar reservas/ventas y gasto reales. No extender autom\xE1ticamente la urgencia ni usar \u201Cliquidaci\xF3n de stock\u201D en servicios digitales.\n\nLISTO CUANDO\nPromoci\xF3n cerrada y cada venta con un siguiente paso acordado.\n\nTiempo orientativo: 60 min. Responsable por asignar.",
    link: "https://arxmedia.es",
    image: "",
    format: "Ventas",
    owner: "Por asignar",
    summary: "Cerrar la semana comercial sin arrastrar desorden a diciembre."
  },
  {
    id: "plan-v2-wow-20",
    calendar: "arx-plan-wow-2026",
    title: "Aprender de ventas y concurso",
    date: "2026-12-02",
    status: "Pendiente",
    text: "Elegir qu\xE9 mantener antes de planificar otra campa\xF1a.\n\nQU\xC9 HACER\n\u2022 Comparar participantes v\xE1lidos, altas voluntarias, demos, pagos y ventas. Atribuir compras al concurso solo si existe evidencia.\n\u2022 Revisar coste del premio en horas y confirmar entrega/soporte. Pedir opini\xF3n sin exigir una rese\xF1a positiva.\n\u2022 Cambiar de Black Friday a bodas 2027; quitar piezas caducadas. No convertir la invitaci\xF3n en un regalo navide\xF1o que no es.\n\nLISTO CUANDO\nTres aprendizajes escritos y una demo elegida para diciembre.\n\nTiempo orientativo: 60 min. Responsable por asignar.",
    link: "https://invitaciones.arxmedia.es",
    image: "",
    format: "Revisi\xF3n",
    owner: "Por asignar",
    summary: "Elegir qu\xE9 mantener antes de planificar otra campa\xF1a."
  },
  {
    id: "plan-v2-arx-21",
    calendar: "arx-plan-media-2026",
    title: "Mostrar un proceso real y abrir enero",
    date: "2026-12-04",
    status: "Pendiente",
    text: "Continuar vendiendo automatizaci\xF3n o audiovisual con agenda cre\xEDble.\n\nQU\xC9 HACER\n\u2022 Crear 1 reel de un proceso repetitivo automatizado o una decisi\xF3n audiovisual. Usar un trabajo autorizado o demo identificada.\n\u2022 Reciclar 3 historias y publicar. CTA: conversar sobre el proceso o reservar producci\xF3n para una fecha real.\n\u2022 Revisar capacidad de diciembre antes de ofrecer urgencias. Si no hay hueco, proponer enero con condiciones claras.\n\nLISTO CUANDO\nUna pieza publicada y pr\xF3ximas fechas de trabajo definidas.\n\nTiempo orientativo: 90 min. Responsable por asignar.",
    link: "https://arxmedia.es",
    image: "",
    format: "Producci\xF3n",
    owner: "Por asignar",
    summary: "Continuar vendiendo automatizaci\xF3n o audiovisual con agenda cre\xEDble."
  },
  {
    id: "plan-v2-arx-22",
    calendar: "arx-plan-media-2026",
    title: "Crear una demo que puedas reutilizar al vender",
    date: "2026-12-08",
    status: "Pendiente",
    text: "Reducir la explicaci\xF3n manual de cada consulta comercial.\n\nQU\xC9 HACER\n\u2022 Capturar una demo breve de clasificaci\xF3n de correos, organizaci\xF3n de datos o seguimiento sincronizado, seg\xFAn uno de los servicios reales de ARX.\n\u2022 Preparar 1 reel y 3 historias; guardar tambi\xE9n una versi\xF3n limpia para explicar el servicio en una conversaci\xF3n.\n\u2022 Publicar el 10/12 y revisar la respuesta con la siguiente tanda de consultas. Sin cifras de ahorro no verificadas.\n\nLISTO CUANDO\nUna demo reutilizable y publicaci\xF3n lista.\n\nTiempo orientativo: 90 min. Responsable por asignar.",
    link: "https://arxmedia.es",
    image: "",
    format: "Producci\xF3n",
    owner: "Por asignar",
    summary: "Reducir la explicaci\xF3n manual de cada consulta comercial."
  },
  {
    id: "plan-v2-wow-23",
    calendar: "arx-plan-wow-2026",
    title: "Crear contenido para parejas que planean 2027",
    date: "2026-12-10",
    status: "Pendiente",
    text: "Ense\xF1ar experiencia y utilidad sin saturar de efectos.\n\nQU\xC9 HACER\n\u2022 Grabar el recorrido de El jard\xEDn secreto y una pieza que muestra fecha, mapa y dress code.\n\u2022 Preparar 1 reel y 3 historias; publicar el 11/12 con CTA a demo. Mostrar una interacci\xF3n por toma y texto breve.\n\u2022 No anunciar \u201Creserva la fecha\u201D, RSVP u otros productos/funciones si no forman parte de la oferta vigente.\n\nIDEA DE CONTENIDO\n\xABTodo empieza con un enlace\xBB. Mensaje recibido \u2192 carta \u2192 jard\xEDn \u2192 detalles de la boda.\n\nLISTO CUANDO\nUn reel y tres historias listos y revisados.\n\nTiempo orientativo: 90 min. Responsable por asignar.",
    link: "https://invitaciones.arxmedia.es",
    image: "",
    format: "Producci\xF3n",
    owner: "Por asignar",
    summary: "Ense\xF1ar experiencia y utilidad sin saturar de efectos."
  },
  {
    id: "plan-v2-arx-24",
    calendar: "arx-plan-media-2026",
    title: "Revisar la agenda sin abrir otra campa\xF1a",
    date: "2026-12-11",
    status: "Pendiente",
    text: "Dedicar una revisi\xF3n breve a lo que ya est\xE1 comprometido.\n\nQU\xC9 HACER\n\u2022 Confirmar material pendiente, pr\xF3ximas entregas y revisiones de clientes activos.\n\u2022 Actualizar disponibilidad real de producci\xF3n e implementaciones de enero.\n\u2022 Anotar una objeci\xF3n comercial para el siguiente contenido; no a\xF1adir tareas por a\xF1adir.\n\nLISTO CUANDO\nCada proyecto con fecha y siguiente acci\xF3n claros.\n\nTiempo orientativo: 30 min. Responsable por asignar.",
    link: "https://arxmedia.es",
    image: "",
    format: "Revisi\xF3n",
    owner: "Por asignar",
    summary: "Dedicar una revisi\xF3n breve a lo que ya est\xE1 comprometido."
  },
  {
    id: "plan-v2-arx-25",
    calendar: "arx-plan-media-2026",
    title: "Dejar contenido de ARX listo para fiestas",
    date: "2026-12-15",
    status: "Pendiente",
    text: "Mantener presencia con material preparado, sin producir cada d\xEDa.\n\nQU\xC9 HACER\n\u2022 Editar 1 reel de proceso o portfolio autorizado y sacar 3 historias.\n\u2022 Preparar una pieza breve sobre un trabajo manual que convendr\xEDa resolver en enero. CTA a WhatsApp con horario real de atenci\xF3n.\n\u2022 Programar cuando est\xE9 aprobado y revisar que ning\xFAn mensaje conserve promociones vencidas.\n\nLISTO CUANDO\nContenido de las pr\xF3ximas dos semanas preparado con material reutilizado.\n\nTiempo orientativo: 90 min. Responsable por asignar.",
    link: "https://arxmedia.es",
    image: "",
    format: "Producci\xF3n",
    owner: "Por asignar",
    summary: "Mantener presencia con material preparado, sin producir cada d\xEDa."
  },
  {
    id: "plan-v2-wow-26",
    calendar: "arx-plan-wow-2026",
    title: "Dejar una experiencia lista para compartir",
    date: "2026-12-16",
    status: "Pendiente",
    text: "Llegar a las parejas que se comprometen a fin de a\xF1o.\n\nQU\xC9 HACER\n\u2022 Grabar 1 reel de La hora dorada y preparar 3 historias con personalizaci\xF3n, enlace compartible y entrega.\n\u2022 Preparar publicaci\xF3n del 23/12: \xABSi acaba de llegar el s\xED, aqu\xED puede empezar lo que viene\xBB. CTA a colecci\xF3n.\n\u2022 Revisar nombres, precios y enlace; no prometer entrega durante descansos si no puede cumplirse.\n\nLISTO CUANDO\nUn reel y tres historias aprobados para publicar durante fiestas.\n\nTiempo orientativo: 90 min. Responsable por asignar.",
    link: "https://invitaciones.arxmedia.es",
    image: "",
    format: "Producci\xF3n",
    owner: "Por asignar",
    summary: "Llegar a las parejas que se comprometen a fin de a\xF1o."
  },
  {
    id: "plan-v2-wow-27",
    calendar: "arx-plan-wow-2026",
    title: "Confirmar plazos y atenci\xF3n durante fiestas",
    date: "2026-12-18",
    status: "Pendiente",
    text: "Evitar dudas de entrega sin inventar una garant\xEDa navide\xF1a.\n\nQU\xC9 HACER\n\u2022 Revisar pedidos pagados, datos completos y correcciones pendientes. Confirmar cada fecha comprometida.\n\u2022 Comunicar atenci\xF3n real y explicar desde cu\xE1ndo empieza a contar la entrega. Colecci\xF3n y A medida tienen plazos diferentes.\n\u2022 Comprobar acceso a invitaciones entregadas; acordar individualmente cualquier cambio de fecha.\n\nLISTO CUANDO\nPedidos al d\xEDa y horarios/plazos claros para clientes.\n\nTiempo orientativo: 30 min. Responsable por asignar.",
    link: "https://invitaciones.arxmedia.es",
    image: "",
    format: "Operaci\xF3n",
    owner: "Por asignar",
    summary: "Evitar dudas de entrega sin inventar una garant\xEDa navide\xF1a."
  },
  {
    id: "plan-v2-arx-28",
    calendar: "arx-plan-media-2026",
    title: "Cerrar pendientes y dejar atenci\xF3n organizada",
    date: "2026-12-21",
    status: "Pendiente",
    text: "Bajar carga antes de las fiestas.\n\nQU\xC9 HACER\n\u2022 Confirmar con clientes activos qu\xE9 se entrega y qu\xE9 sigue despu\xE9s de los descansos.\n\u2022 Dejar canal y horario de incidencias para proyectos activos. Probar una respuesta de ausencia si corresponde.\n\u2022 No abrir campa\xF1as nuevas esta semana: utilizar las piezas que ya se prepararon.\n\nLISTO CUANDO\nPendientes con fecha y atenci\xF3n de fiestas definida.\n\nTiempo orientativo: 30 min. Responsable por asignar.",
    link: "https://arxmedia.es",
    image: "",
    format: "Operaci\xF3n",
    owner: "Por asignar",
    summary: "Bajar carga antes de las fiestas."
  },
  {
    id: "plan-v2-wow-29",
    calendar: "arx-plan-wow-2026",
    title: "Publicar el contenido que ya qued\xF3 listo",
    date: "2026-12-23",
    status: "Pendiente",
    text: "Una publicaci\xF3n breve, sin una nueva jornada de producci\xF3n.\n\nQU\xC9 HACER\n\u2022 Publicar la pieza preparada el 16/12 y comprobar la demo enlazada.\n\u2022 Resolver consultas dentro del horario comunicado y usar respuestas ya preparadas.\n\u2022 24 y 25 de diciembre quedan libres de producci\xF3n. No a\xF1adir urgencia falsa para vender.\n\nLISTO CUANDO\nPieza publicada con enlace correcto.\n\nTiempo orientativo: 15 min. Responsable por asignar.",
    link: "https://invitaciones.arxmedia.es",
    image: "",
    format: "Publicaci\xF3n",
    owner: "Por asignar",
    summary: "Una publicaci\xF3n breve, sin una nueva jornada de producci\xF3n."
  },
  {
    id: "plan-v2-arx-30",
    calendar: "arx-plan-media-2026",
    title: "Preparar un caso corto para enero",
    date: "2026-12-28",
    status: "Pendiente",
    text: "Aprovechar trabajo existente en lugar de empezar de cero.\n\nQU\xC9 HACER\n\u2022 Elegir una mejora de automatizaci\xF3n o un trabajo audiovisual autorizado y editar 1 reel corto.\n\u2022 Anotar tres preguntas de contrataci\xF3n y preparar respuestas para las primeras consultas de enero.\n\u2022 Programar despu\xE9s de revisar; no reservar producci\xF3n para el 31/12 ni 1/1.\n\nLISTO CUANDO\nUna pieza preparada y tres respuestas comerciales claras.\n\nTiempo orientativo: 60 min. Responsable por asignar.",
    link: "https://arxmedia.es",
    image: "",
    format: "Producci\xF3n",
    owner: "Por asignar",
    summary: "Aprovechar trabajo existente en lugar de empezar de cero."
  },
  {
    id: "plan-v2-wow-31",
    calendar: "arx-plan-wow-2026",
    title: "Preparar la primera publicaci\xF3n del a\xF1o",
    date: "2026-12-29",
    status: "Pendiente",
    text: "Simplificar la elecci\xF3n para parejas reci\xE9n comprometidas.\n\nQU\xC9 HACER\n\u2022 Con material existente, comparar El primer baile y La hora dorada en un reel de 15\u201320 s.\n\u2022 Preparar 3 historias: elegir, personalizar y compartir. Comprobar que fotos y datos posteriores se explican como en la FAQ.\n\u2022 Dejar la publicaci\xF3n para la primera semana de enero y mantener atenci\xF3n real.\n\nLISTO CUANDO\nUn reel y tres historias listos, sin desarrollar una colecci\xF3n nueva.\n\nTiempo orientativo: 60 min. Responsable por asignar.",
    link: "https://invitaciones.arxmedia.es",
    image: "",
    format: "Producci\xF3n",
    owner: "Por asignar",
    summary: "Simplificar la elecci\xF3n para parejas reci\xE9n comprometidas."
  },
  {
    id: "plan-v2-arx-32",
    calendar: "arx-plan-media-2026",
    title: "Cerrar el a\xF1o con lo esencial",
    date: "2026-12-30",
    status: "Pendiente",
    text: "Una revisi\xF3n compartida para las dos marcas.\n\nQU\xC9 HACER\n\u2022 Revisar entregas, cobros/reservas y soporte pendiente de ARX y WOW.\n\u2022 Anotar lo que funcion\xF3 y una mejora para enero por marca.\n\u2022 Confirmar pr\xF3xima fecha de atenci\xF3n; mover tareas pendientes con criterio en vez de acumularlas.\n\nLISTO CUANDO\nAgenda de vuelta clara, con una prioridad por marca.\n\nTiempo orientativo: 30 min. Responsable por asignar.",
    link: "https://arxmedia.es",
    image: "",
    format: "Revisi\xF3n",
    owner: "Por asignar",
    summary: "Una revisi\xF3n compartida para las dos marcas."
  },
  {
    id: "plan-v2-arx-33",
    calendar: "arx-plan-media-2026",
    title: "Elegir la siguiente mejora de cada cliente",
    date: "2027-01-04",
    status: "Pendiente",
    text: "Proponer continuidad \xFAtil, no una suscripci\xF3n por defecto.\n\nQU\xC9 HACER\n\u2022 Revisar clientes de automatizaci\xF3n, IA y audiovisual de noviembre/diciembre.\n\u2022 Detectar necesidad real: mantenimiento de un flujo, nueva integraci\xF3n o continuidad de contenido. Resolver incidencias antes de ofrecer m\xE1s trabajo.\n\u2022 Preparar una propuesta concreta para los casos que correspondan y definir agenda de enero. Sin env\xEDos masivos no autorizados.\n\nLISTO CUANDO\nClientes priorizados y propuestas con alcance real, no mensajes gen\xE9ricos.\n\nTiempo orientativo: 60 min. Responsable por asignar.",
    link: "https://arxmedia.es",
    image: "",
    format: "Ventas",
    owner: "Por asignar",
    summary: "Proponer continuidad \xFAtil, no una suscripci\xF3n por defecto."
  },
  {
    id: "plan-v2-wow-34",
    calendar: "arx-plan-wow-2026",
    title: "Publicar la comparaci\xF3n y facilitar el encargo",
    date: "2027-01-06",
    status: "Pendiente",
    text: "Volver con contenido preparado, centrado en bodas de 2027.\n\nQU\xC9 HACER\n\u2022 Publicar la pieza del 29/12, con los nombres actuales de dise\xF1os y link a demos.\n\u2022 Resolver dudas: pago \xFAnico, enlace personalizado, fotos despu\xE9s seg\xFAn FAQ y plazos desde pago/datos.\n\u2022 Revisar personalizaciones en curso y qu\xE9 datos faltan antes de aceptar urgencias.\n\nLISTO CUANDO\nComparaci\xF3n publicada y pedidos con siguiente paso claro.\n\nTiempo orientativo: 30 min. Responsable por asignar.",
    link: "https://invitaciones.arxmedia.es",
    image: "",
    format: "Publicaci\xF3n",
    owner: "Por asignar",
    summary: "Volver con contenido preparado, centrado en bodas de 2027."
  },
  {
    id: "plan-v2-wow-35",
    calendar: "arx-plan-wow-2026",
    title: "Detectar una sola mejora de compra",
    date: "2027-01-08",
    status: "Pendiente",
    text: "Reducir una fricci\xF3n observada, no rehacer todo el embudo.\n\nQU\xC9 HACER\n\u2022 Revisar preguntas reales y datos disponibles de abrir dise\xF1o, elegir y pagar.\n\u2022 Elegir un \xFAnico problema: diferencias entre dise\xF1os, dudas de entrega o un paso de pago. Comprobarlo antes de concluir.\n\u2022 Definir una acci\xF3n peque\xF1a para resolverlo. No atribuir abandonos a algo que la medici\xF3n no demuestra.\n\nLISTO CUANDO\nUna mejora concreta decidida y una duda para el pr\xF3ximo reel.\n\nTiempo orientativo: 30 min. Responsable por asignar.",
    link: "https://invitaciones.arxmedia.es",
    image: "",
    format: "Revisi\xF3n",
    owner: "Por asignar",
    summary: "Reducir una fricci\xF3n observada, no rehacer todo el embudo."
  },
  {
    id: "plan-v2-arx-36",
    calendar: "arx-plan-media-2026",
    title: "Mostrar una soluci\xF3n sin hablar en jerga",
    date: "2027-01-12",
    status: "Pendiente",
    text: "Crear contenido alineado con los servicios de la web.\n\nQU\xC9 HACER\n\u2022 Elegir un flujo de formularios, WhatsApp, correo o CRM y mostrar antes/despu\xE9s con datos ficticios se\xF1alados.\n\u2022 Preparar 1 reel + 3 historias. Publicar el 14/1 con CTA a describir su proceso por WhatsApp.\n\u2022 Guardar el ejemplo para usar en conversaciones comerciales. No afirmar beneficios econ\xF3micos sin medici\xF3n.\n\nLISTO CUANDO\nUna demo publicada o programada y lista para explicar el servicio.\n\nTiempo orientativo: 90 min. Responsable por asignar.",
    link: "https://arxmedia.es",
    image: "",
    format: "Producci\xF3n",
    owner: "Por asignar",
    summary: "Crear contenido alineado con los servicios de la web."
  },
  {
    id: "plan-v2-wow-37",
    calendar: "arx-plan-wow-2026",
    title: "Mostrar c\xF3mo una invitaci\xF3n se vuelve suya",
    date: "2027-01-13",
    status: "Pendiente",
    text: "Ense\xF1ar la personalizaci\xF3n con un ejemplo concreto.\n\nQU\xC9 HACER\n\u2022 Grabar nombres, fecha y fotos dentro de una plantilla, con datos demo o permiso de la pareja.\n\u2022 Editar 1 reel y 3 historias; publicar el 15/1. Si se usa el premio del concurso, comprobar autorizaci\xF3n antes.\n\u2022 CTA: elegir un dise\xF1o y ver c\xF3mo encargarlo. No mostrar datos privados sin permiso.\n\nLISTO CUANDO\nUn reel y tres historias listos y revisados.\n\nTiempo orientativo: 90 min. Responsable por asignar.",
    link: "https://invitaciones.arxmedia.es",
    image: "",
    format: "Producci\xF3n",
    owner: "Por asignar",
    summary: "Ense\xF1ar la personalizaci\xF3n con un ejemplo concreto."
  },
  {
    id: "plan-v2-arx-38",
    calendar: "arx-plan-media-2026",
    title: "Resolver posventa antes de vender m\xE1s",
    date: "2027-01-15",
    status: "Pendiente",
    text: "Una revisi\xF3n corta de clientes y del premio entregado.\n\nQU\xC9 HACER\n\u2022 ARX: revisar incidencias y funcionamiento de trabajos entregados. Proponer mejoras solo cuando tengan sentido.\n\u2022 WOW: comprobar dudas y enlaces de pedidos, incluido premio. Pedir opini\xF3n y permiso de uso del resultado de forma separada.\n\u2022 No condicionar soporte ni premio a rese\xF1as positivas. No forzar recompra mensual de invitaciones.\n\nLISTO CUANDO\nIncidencias con soluci\xF3n y solicitudes de opini\xF3n bien planteadas.\n\nTiempo orientativo: 30 min. Responsable por asignar.",
    link: "https://arxmedia.es",
    image: "",
    format: "Revisi\xF3n",
    owner: "Por asignar",
    summary: "Una revisi\xF3n corta de clientes y del premio entregado."
  },
  {
    id: "plan-v2-arx-39",
    calendar: "arx-plan-media-2026",
    title: "Responder la objeci\xF3n m\xE1s repetida",
    date: "2027-01-19",
    status: "Pendiente",
    text: "Ayudar a que un negocio entienda c\xF3mo empezar con ARX.\n\nQU\xC9 HACER\n\u2022 Elegir una duda real: qu\xE9 informaci\xF3n necesitamos, qu\xE9 herramientas conservan o c\xF3mo se define el alcance.\n\u2022 Grabar 1 reel de respuesta y 3 historias con un ejemplo. Publicar el 21/1.\n\u2022 CTA a WhatsApp con una pregunta simple sobre su proceso o necesidad audiovisual.\n\nLISTO CUANDO\nUna objeci\xF3n respondida con contenido reutilizable.\n\nTiempo orientativo: 60 min. Responsable por asignar.",
    link: "https://arxmedia.es",
    image: "",
    format: "Producci\xF3n",
    owner: "Por asignar",
    summary: "Ayudar a que un negocio entienda c\xF3mo empezar con ARX."
  },
  {
    id: "plan-v2-wow-40",
    calendar: "arx-plan-wow-2026",
    title: "Crear una gu\xEDa breve antes de enviar",
    date: "2027-01-20",
    status: "Pendiente",
    text: "Demostrar utilidad y cuidado adem\xE1s de la apertura inmersiva.\n\nQU\xC9 HACER\n\u2022 Preparar carrusel: revisar nombres, fecha, mapa y prueba en m\xF3vil antes de compartir el enlace.\n\u2022 Acompa\xF1ar con 3 historias usando una demo. Publicar el 22/1 sin a\xF1adir funciones no incluidas.\n\u2022 Explicar c\xF3mo consultar cambios o incidencias con la referencia del pedido.\n\nLISTO CUANDO\nUn carrusel y tres historias listos.\n\nTiempo orientativo: 60 min. Responsable por asignar.",
    link: "https://invitaciones.arxmedia.es",
    image: "",
    format: "Producci\xF3n",
    owner: "Por asignar",
    summary: "Demostrar utilidad y cuidado adem\xE1s de la apertura inmersiva."
  },
  {
    id: "plan-v2-wow-41",
    calendar: "arx-plan-wow-2026",
    title: "Revisar capacidad y siguiente contenido",
    date: "2027-01-22",
    status: "Pendiente",
    text: "Mantener un ritmo sostenible antes de abrir nuevas promociones.\n\nQU\xC9 HACER\n\u2022 Comprobar entrega de pedidos y pr\xF3xima fecha real de personalizaci\xF3n.\n\u2022 Revisar qu\xE9 demo ayuda m\xE1s a elegir y qu\xE9 duda sigue frenando compras.\n\u2022 Escoger una sola pieza para febrero. No repetir un concurso por inercia: revisar calidad de participantes y coste.\n\nLISTO CUANDO\nAgenda actualizada y un tema elegido para febrero.\n\nTiempo orientativo: 30 min. Responsable por asignar.",
    link: "https://invitaciones.arxmedia.es",
    image: "",
    format: "Revisi\xF3n",
    owner: "Por asignar",
    summary: "Mantener un ritmo sostenible antes de abrir nuevas promociones."
  },
  {
    id: "plan-v2-arx-42",
    calendar: "arx-plan-media-2026",
    title: "Preparar febrero con el servicio m\xE1s claro",
    date: "2027-01-26",
    status: "Pendiente",
    text: "Repetir lo que gener\xF3 conversaciones \xFAtiles, con una nueva apertura.\n\nQU\xC9 HACER\n\u2022 Elegir automatizaci\xF3n/IA o audiovisual a partir de consultas reales, no solo alcance.\n\u2022 Crear 1 reel y 3 historias con una objeci\xF3n nueva y CTA a WhatsApp.\n\u2022 Revisar agenda, tiempos y coste de entrega antes de proponer nuevas reservas.\n\nLISTO CUANDO\nPrimera pieza de febrero preparada.\n\nTiempo orientativo: 75 min. Responsable por asignar.",
    link: "https://arxmedia.es",
    image: "",
    format: "Producci\xF3n",
    owner: "Por asignar",
    summary: "Repetir lo que gener\xF3 conversaciones \xFAtiles, con una nueva apertura."
  },
  {
    id: "plan-v2-wow-43",
    calendar: "arx-plan-wow-2026",
    title: "Preparar febrero con una demo protagonista",
    date: "2027-01-27",
    status: "Pendiente",
    text: "Mantener una propuesta f\xE1cil de entender.\n\nQU\xC9 HACER\n\u2022 Escoger una experiencia de la colecci\xF3n y crear una apertura distinta con material existente.\n\u2022 Preparar 1 reel y 3 historias que resuelvan la principal duda de compra.\n\u2022 Valorar una colaboraci\xF3n con un proveedor de bodas como siguiente idea; no contactar a nadie autom\xE1ticamente.\n\nLISTO CUANDO\nPrimera pieza de febrero preparada y una mejora priorizada.\n\nTiempo orientativo: 75 min. Responsable por asignar.",
    link: "https://invitaciones.arxmedia.es",
    image: "",
    format: "Producci\xF3n",
    owner: "Por asignar",
    summary: "Mantener una propuesta f\xE1cil de entender."
  },
  {
    id: "plan-v2-arx-44",
    calendar: "arx-plan-media-2026",
    title: "Elegir tres decisiones para el mes siguiente",
    date: "2027-01-29",
    status: "Pendiente",
    text: "Cerrar el ciclo sin acumular otra lista interminable.\n\nQU\xC9 HACER\n\u2022 ARX: revisar consultas cualificadas, reservas, margen y horas de trabajo. WOW: pedidos, demos, entrega y coste del concurso.\n\u2022 Elegir tres decisiones en total: oferta/servicio principal, pieza de contenido y mejora operativa m\xE1s importante.\n\u2022 Archivar lo que ya no aporte y reprogramar solo pendientes relevantes. Actualizar estados con trabajo real, no por llegar la fecha.\n\nLISTO CUANDO\nTres prioridades claras para febrero.\n\nTiempo orientativo: 45 min. Responsable por asignar.",
    link: "https://arxmedia.es",
    image: "",
    format: "Revisi\xF3n",
    owner: "Por asignar",
    summary: "Cerrar el ciclo sin acumular otra lista interminable."
  }
];

// app/api/plan/plan-v1.json
var plan_v1_default = [
  {
    id: "plan-2026-arx-001",
    calendar: "arx-plan-media-2026",
    title: "Aterrizar la oferta de fin de a\xF1o",
    date: "2026-10-17",
    status: "Pendiente",
    text: "OBJETIVO: elegir una oferta principal que podamos vender y entregar entre noviembre y enero.\nHACER: revisar servicios actuales; priorizar un pack de contenido/campa\xF1a para negocios con ventas de fin de a\xF1o. Mantener automatizaci\xF3n de consultas como complemento, no mezclar todos los servicios en el mismo anuncio.\nDEFINIR: entregables, revisiones, plazo, precio y anticipo antes de comunicar. Los precios hist\xF3ricos son referencias, no una oferta aprobada.\nRESULTADO: una ficha comercial breve y una llamada a la acci\xF3n: solicitar diagn\xF3stico o cotizaci\xF3n.\nDuraci\xF3n sugerida: 60\u201390 min. Plan propuesto; todo queda pendiente hasta ejecutarlo.",
    link: "https://arxmedia.es",
    image: "",
    format: "Planificaci\xF3n",
    owner: "Por asignar"
  },
  {
    id: "plan-2026-wow-002",
    calendar: "arx-plan-wow-2026",
    title: "Definir objetivo: reservas de bodas 2027",
    date: "2026-10-17",
    status: "Pendiente",
    text: "OBJETIVO: convertir inter\xE9s en invitaciones de boda para 2027, con mensajes separados para Chile y Espa\xF1a.\nHACER: revisar Jard\xEDn, Puertas, Llave y Custom; comprobar precios, qu\xE9 incluye cada opci\xF3n, moneda, revisiones y plazo real de entrega. Confirmar si se permite reservar hoy y personalizar m\xE1s adelante; no anunciarlo hasta tenerlo resuelto.\nRESULTADO: una ficha con oferta, condiciones y preguntas frecuentes. Priorizar la venta directa de la colecci\xF3n y dejar Custom con agenda propia.\nDuraci\xF3n: 60 min. No aplicar descuentos todav\xEDa.",
    link: "https://invitaciones.arxmedia.es",
    image: "",
    format: "Planificaci\xF3n",
    owner: "Por asignar"
  },
  {
    id: "plan-2026-arx-003",
    calendar: "arx-plan-media-2026",
    title: "Probar el recorrido de consulta a reserva",
    date: "2026-10-19",
    status: "Pendiente",
    text: "Recorrer la web desde m\xF3vil: servicio \u2192 contacto \u2192 respuesta \u2192 propuesta \u2192 anticipo \u2192 agenda. Enviar una consulta de prueba y comprobar que llega al lugar correcto.\nPreparar plantilla de respuesta con tres preguntas: negocio, necesidad y fecha. Crear estados simples: consulta, diagn\xF3stico, propuesta, reserva y entregado.\nDefinir capacidad semanal real de grabaci\xF3n, edici\xF3n y automatizaci\xF3n, incluyendo tiempo de revisiones. Sustituye la l\xF3gica de stock y transportistas del plan de referencia.\nHECHO CUANDO: una consulta de prueba puede llegar hasta una reserva sin pasos ambiguos.",
    link: "https://arxmedia.es",
    image: "",
    format: "Operaci\xF3n",
    owner: "Por asignar"
  },
  {
    id: "plan-2026-wow-004",
    calendar: "arx-plan-wow-2026",
    title: "Probar demos y pago completo en m\xF3vil",
    date: "2026-10-19",
    status: "Pendiente",
    text: "Recorrer cada demo y el proceso de compra de principio a fin. Comprobar nombres, textos, enlaces, legibilidad, formulario previo al pago y confirmaciones.\nVerificar los medios de pago realmente habilitados por mercado: tarjetas/Stripe en internacional y Mercado Pago para Chile si siguen activos. Usar modo de prueba; no cobrar un pedido real para este control.\nComprobar que la oferta elegida coincide con precio, moneda y plazo mostrados. Registrar fallos y corregir antes de destinar presupuesto.\nRESULTADO: checklist de compra y entrega aprobado.",
    link: "https://invitaciones.arxmedia.es",
    image: "",
    format: "Operaci\xF3n",
    owner: "Por asignar"
  },
  {
    id: "plan-2026-arx-005",
    calendar: "arx-plan-media-2026",
    title: "Producci\xF3n: el proceso detr\xE1s del resultado",
    date: "2026-10-20",
    status: "Pendiente",
    text: "BLOQUE DE 2 HORAS. Grabar material para 3 piezas:\n1. Reel: \xABUna campa\xF1a empieza antes de abrir el editor\xBB. Reuni\xF3n/brief \u2192 referencias \u2192 producci\xF3n \u2192 pieza terminada. CTA: solicitar diagn\xF3stico.\n2. Reel: una consulta repetida que una automatizaci\xF3n podr\xEDa resolver; mostrar el antes/despu\xE9s con datos ficticios se\xF1alados como demostraci\xF3n.\n3. Carrusel: qu\xE9 necesitamos saber antes de dise\xF1ar una web orientada a consultas.\nCapturar pantalla, manos, planos de trabajo y voz. Usar trabajos de clientes solo con autorizaci\xF3n; no prometer resultados no medidos.\nENTREGABLE: tres guiones, clips seleccionados y portadas.",
    link: "https://arxmedia.es",
    image: "",
    format: "Producci\xF3n",
    owner: "Por asignar"
  },
  {
    id: "plan-2026-wow-006",
    calendar: "arx-plan-wow-2026",
    title: "Producci\xF3n: la primera reacci\xF3n al abrirla",
    date: "2026-10-21",
    status: "Pendiente",
    text: "BLOQUE DE 90 MIN. Grabar pantalla de las tres experiencias y un m\xF3vil en mano.\nPiezas: 1) sobre que se abre y revela la invitaci\xF3n; 2) puerta: tocar y entrar; 3) llave/l\xE1mparas: descubrir la interacci\xF3n. Mostrar cada experiencia con claridad en los primeros segundos.\nA\xF1adir carrusel \xABQu\xE9 recibe tu invitado\xBB: fecha, mapa, cronograma y confirmaci\xF3n solo si est\xE1n incluidos en la plantilla real.\nCTA: probar una demo y elegir dise\xF1o. No utilizar bodas ficticias como testimonios reales.\nRESULTADO: 3 reels cortos, 1 carrusel y 6 historias base.",
    link: "https://invitaciones.arxmedia.es",
    image: "",
    format: "Producci\xF3n",
    owner: "Por asignar"
  },
  {
    id: "plan-2026-arx-007",
    calendar: "arx-plan-media-2026",
    title: "Publicar: una campa\xF1a empieza antes de editar",
    date: "2026-10-22",
    status: "Pendiente",
    text: "Editar y publicar la primera pieza del bloque del martes. Mostrar 3 pasos reales del proceso y terminar con el resultado visible.\nCopy orientativo: \xABEl contenido se ve al final. El trabajo empieza mucho antes\xBB. Cerrar con una invitaci\xF3n concreta a solicitar diagn\xF3stico.\nPreparar 3 historias: una decisi\xF3n del brief, una toma de producci\xF3n y una pregunta sobre el principal bloqueo del negocio.\nGuardar enlace y registrar consultas \xFAtiles; las visualizaciones por s\xED solas no son el objetivo.",
    link: "https://arxmedia.es",
    image: "",
    format: "Publicaci\xF3n",
    owner: "Por asignar"
  },
  {
    id: "plan-2026-wow-008",
    calendar: "arx-plan-wow-2026",
    title: "Publicar: una invitaci\xF3n que se descubre",
    date: "2026-10-23",
    status: "Pendiente",
    text: "Reel de 12\u201320 s: abrir experiencia \u2192 interacci\xF3n principal \u2192 datos del evento \u2192 CTA a demo. Texto breve: \xABLa invitaci\xF3n tambi\xE9n puede ser parte de la experiencia\xBB.\nPublicar 3\u20134 historias con una prueba distinta y enlace directo a la colecci\xF3n. Separar moneda y mensaje por mercado en piezas de venta.\nMedir visitas a demo, avance a selecci\xF3n y compras; si la medici\xF3n falla, resolverla antes de ampliar anuncios.",
    link: "https://invitaciones.arxmedia.es",
    image: "",
    format: "Publicaci\xF3n",
    owner: "Por asignar"
  },
  {
    id: "plan-2026-arx-009",
    calendar: "arx-plan-media-2026",
    title: "Definir cupos y seguimiento comercial",
    date: "2026-10-23",
    status: "Pendiente",
    text: "Crear una tabla de capacidad con jornadas de producci\xF3n, horas de edici\xF3n y plazas de implementaci\xF3n disponibles hasta diciembre. Publicitar cupos solo si corresponden a esa agenda.\nRevisar consultas recibidas, detectar objeciones y asignar siguiente paso y fecha. Proponer seguimiento amable a quienes lo solicitaron, sin env\xEDos masivos no consentidos.\nRESULTADO: oferta viable y reserva con anticipo/condiciones claras. No ofrecer descuentos que dependan de trabajar por debajo del coste.",
    link: "https://arxmedia.es",
    image: "",
    format: "Ventas",
    owner: "Por asignar"
  },
  {
    id: "plan-2026-wow-010",
    calendar: "arx-plan-wow-2026",
    title: "Dise\xF1ar el concurso: una boda, una experiencia",
    date: "2026-10-24",
    status: "Pendiente",
    text: "PROPUESTA PARA APROBAR: sortear 1 invitaci\xF3n digital de la colecci\xF3n est\xE1ndar, a elecci\xF3n entre las opciones vigentes. Custom, servicios de terceros y extras quedan fuera salvo decisi\xF3n expresa.\nP\xFAblico propuesto: mayores de 18 a\xF1os de Chile o Espa\xF1a con boda durante 2027. Una participaci\xF3n por pareja; sin compra obligatoria.\nCalendario propuesto: apertura 2/11 a las 10:00; cierre 13/11 a las 20:00; sorteo 16/11 a las 19:00, siempre hora de Santiago. Mostrar zona horaria en bases.\nDecidir alcance, revisiones, caducidad, entrega, permiso para usar el resultado y coste en horas. No publicar hasta aprobar bases y premio.",
    link: "https://invitaciones.arxmedia.es",
    image: "",
    format: "Concurso",
    owner: "Por asignar"
  },
  {
    id: "plan-2026-arx-011",
    calendar: "arx-plan-media-2026",
    title: "Preparar registro de inter\xE9s y medici\xF3n",
    date: "2026-10-26",
    status: "Pendiente",
    text: "Crear una landing o bloque breve para negocios interesados en preparar sus campa\xF1as de fin de a\xF1o. Pedir nombre, email, negocio y servicio que necesitan; reducir campos.\nSi se conecta Brevo/n8n, etiquetar origen y campa\xF1a; probar alta, confirmaci\xF3n y baja. Separar el consentimiento comercial del simple env\xEDo de una solicitud.\nMedir consulta cualificada, propuesta y reserva. Definir presupuesto de prueba y p\xE9rdida m\xE1xima aceptable antes de activar campa\xF1as; no hay presupuesto aprobado por este calendario.",
    link: "https://help.brevo.com/hc/es/articles/208771869-Crear-un-formulario-de-suscripci%C3%B3n-en-Brevo",
    image: "",
    format: "Operaci\xF3n",
    owner: "Por asignar"
  },
  {
    id: "plan-2026-wow-012",
    calendar: "arx-plan-wow-2026",
    title: "Concurso: cerrar bases y formulario",
    date: "2026-10-26",
    status: "Pendiente",
    text: "Redactar bases accesibles: organizador/contacto, pa\xEDses, edad, fechas y zona horaria, premio exacto, requisitos, m\xE9todo aleatorio, suplentes, notificaci\xF3n, plazo de respuesta de 48 h y tratamiento de datos.\nPropuesta de entrada: formulario con nombre, email, pa\xEDs, mes de boda y aceptaci\xF3n de bases. Casilla de novedades separada, opcional y sin marcar. No exigir compra, compartir historias ni etiquetar amigos.\nRevisar las reglas vigentes de Instagram y requisitos aplicables antes de publicar; incluir la aclaraci\xF3n de independencia de Instagram y dem\xE1s menciones que correspondan tras esa revisi\xF3n.\nHECHO CUANDO: bases y premio aprobados, formulario probado y datos m\xEDnimos definidos. No son bases legales finales.",
    link: "https://invitaciones.arxmedia.es",
    image: "",
    format: "Concurso",
    owner: "Por asignar"
  },
  {
    id: "plan-2026-arx-013",
    calendar: "arx-plan-media-2026",
    title: "Producci\xF3n: mostrar lo que se pierde sin un sistema",
    date: "2026-10-27",
    status: "Pendiente",
    text: "BLOQUE DE 2 HORAS. Grabar: 1) demo consulta de WhatsApp \u2192 clasificaci\xF3n \u2192 respuesta, sin datos reales; 2) web bonita con CTA confuso frente a recorrido claro; 3) una pieza de portfolio con problema, decisi\xF3n y resultado comprobable.\nPreparar variantes de apertura: \xAB\xBFCu\xE1ntas consultas quedan a medias?\xBB y \xABTu web deber\xEDa facilitar el siguiente paso\xBB.\nRESULTADO: 2 reels de venta, 1 carrusel educativo y material para anuncios. Cifras, marcas o testimonios solo con evidencia y permiso.",
    link: "https://arxmedia.es",
    image: "",
    format: "Producci\xF3n",
    owner: "Por asignar"
  },
  {
    id: "plan-2026-wow-014",
    calendar: "arx-plan-wow-2026",
    title: "Producci\xF3n: colecci\xF3n y concurso",
    date: "2026-10-28",
    status: "Pendiente",
    text: "Preparar reel principal del premio mostrando exactamente la plantilla que puede elegir la persona ganadora y una pieza est\xE1tica con fechas y enlace a bases.\nGrabar 2 demos con aperturas diferentes: emoci\xF3n de recibirla y facilidad de encontrar la informaci\xF3n. Crear historias \xABc\xF3mo participar\xBB con tres pasos sencillos.\nENTREGABLE: reel de lanzamiento, recordatorio, pieza de cierre y plantilla para comunicar resultado. Mantener todo en borrador hasta aprobar premio y bases.",
    link: "https://invitaciones.arxmedia.es",
    image: "",
    format: "Producci\xF3n",
    owner: "Por asignar"
  },
  {
    id: "plan-2026-arx-015",
    calendar: "arx-plan-media-2026",
    title: "Publicar: tu web necesita un siguiente paso claro",
    date: "2026-10-29",
    status: "Pendiente",
    text: "Publicar antes/despu\xE9s del recorrido de una web, con ejemplo real autorizado o demo se\xF1alada. Explicar una sola mejora: CTA visible, formulario breve o propuesta clara.\nCTA: solicitar diagn\xF3stico para una campa\xF1a de noviembre/diciembre. Ofrecer alcance y plazo, no una garant\xEDa de ventas.\nAcompa\xF1ar con historias de preguntas y recoger objeciones para el siguiente bloque de contenido.",
    link: "https://arxmedia.es",
    image: "",
    format: "Publicaci\xF3n",
    owner: "Por asignar"
  },
  {
    id: "plan-2026-wow-016",
    calendar: "arx-plan-wow-2026",
    title: "Publicar: comparar tres formas de invitar",
    date: "2026-10-30",
    status: "Pendiente",
    text: "Carrusel o reel con Jard\xEDn, Puertas y Llave, mostrando la interacci\xF3n distintiva de cada una. Evitar una lista larga de efectos; ense\xF1ar una experiencia por toma.\nCTA: \xABPrueba las demos y elige la que se parece a ustedes\xBB. Dejar link directo a colecci\xF3n y preguntas frecuentes.\nMantener el concurso como invitaci\xF3n secundaria; no desplazar la venta habitual.",
    link: "https://invitaciones.arxmedia.es",
    image: "",
    format: "Publicaci\xF3n",
    owner: "Por asignar"
  },
  {
    id: "plan-2026-arx-017",
    calendar: "arx-plan-media-2026",
    title: "Revisi\xF3n de octubre y prueba de anuncios",
    date: "2026-10-30",
    status: "Pendiente",
    text: "Revisar recorrido web y primeras piezas. Si todo funciona y se aprob\xF3 presupuesto, probar solo dos enfoques creativos con presupuesto peque\xF1o y tope definido. Mantener mercado y oferta comparables.\nMedir coste por consulta cualificada y reservas, adem\xE1s de visitas. Si hay clics sin consultas, revisar oferta/p\xE1gina antes de subir gasto.\nRegistrar referencia inicial y decisi\xF3n: mantener, cambiar creatividad o pausar. No repartir presupuesto entre muchos p\xFAblicos a la vez.",
    link: "https://arxmedia.es",
    image: "",
    format: "Revisi\xF3n",
    owner: "Por asignar"
  },
  {
    id: "plan-2026-wow-018",
    calendar: "arx-plan-wow-2026",
    title: "Control de salida del concurso y campa\xF1a",
    date: "2026-10-31",
    status: "Pendiente",
    text: "Verificar bases accesibles, formulario de prueba, confirmaci\xF3n de participaci\xF3n, almacenamiento, consentimiento separado y proceso de sorteo reproducible.\nConfirmar que el premio cabe en la agenda y que el registro no obliga a aceptar publicidad. Preparar respuestas a dudas y comprobaci\xF3n de duplicados.\nSi algo esencial sigue pendiente, mover lanzamiento y cierre juntos antes de anunciar. No asumir que esta tarea ya est\xE1 aprobada.",
    link: "https://invitaciones.arxmedia.es",
    image: "",
    format: "Revisi\xF3n",
    owner: "Por asignar"
  },
  {
    id: "plan-2026-wow-019",
    calendar: "arx-plan-wow-2026",
    title: "Lanzamiento propuesto del concurso",
    date: "2026-11-02",
    status: "Pendiente",
    text: "SOLO SI EL CONTROL DEL 31/10 EST\xC1 APROBADO. Abrir formulario a las 10:00 de Santiago, publicar reel del premio y fijar acceso a bases.\nMensaje: una pareja podr\xE1 ganar una invitaci\xF3n digital de la colecci\xF3n para su boda de 2027. Explicar sin rodeos c\xF3mo participar y hasta cu\xE1ndo.\nRegistrar origen de entradas, visitas a demos y suscripciones voluntarias por separado. Mantener las compras disponibles con normalidad; no cerrar la web.\nNo se publica nada autom\xE1ticamente desde Hylia.",
    link: "https://invitaciones.arxmedia.es",
    image: "",
    format: "Concurso",
    owner: "Por asignar"
  },
  {
    id: "plan-2026-arx-020",
    calendar: "arx-plan-media-2026",
    title: "Abrir agenda de campa\xF1as de fin de a\xF1o",
    date: "2026-11-02",
    status: "Pendiente",
    text: "Activar la oferta definida en octubre y una p\xE1gina con alcance, ejemplos, fecha de inicio y consulta. Comunicar disponibilidad real para noviembre/diciembre.\nProponer acceso prioritario a agenda a personas que se registren, con beneficio concreto por definir: diagn\xF3stico breve o recurso \xFAtil; no una promesa vaga de descuento.\nSeparar ARX empresas de WOW parejas en mensajes y listas. Preparar seguimiento manual de consultas cualificadas.",
    link: "https://arxmedia.es",
    image: "",
    format: "Ventas",
    owner: "Por asignar"
  },
  {
    id: "plan-2026-arx-021",
    calendar: "arx-plan-media-2026",
    title: "Producci\xF3n: tres decisiones para una campa\xF1a",
    date: "2026-11-03",
    status: "Pendiente",
    text: "Grabar 2 reels y 1 carrusel: 1) una campa\xF1a necesita oferta, p\xE1gina y seguimiento; 2) una automatizaci\xF3n responde una duda mientras trabajas; 3) checklist para preparar noviembre.\nReservar 2 horas. Seleccionar dos ganchos para el mismo servicio y preparar una versi\xF3n con voz y otra visual.\nResultado: contenido de la semana y una creatividad de prueba. CTA \xFAnico: solicitar diagn\xF3stico/cotizaci\xF3n.",
    link: "https://arxmedia.es",
    image: "",
    format: "Producci\xF3n",
    owner: "Por asignar"
  },
  {
    id: "plan-2026-wow-022",
    calendar: "arx-plan-wow-2026",
    title: "Producci\xF3n: dudas antes de comprar",
    date: "2026-11-04",
    status: "Pendiente",
    text: "Grabar respuestas breves: \xBFqu\xE9 datos necesito?, \xBFc\xF3mo ve la invitaci\xF3n el invitado?, \xBFc\xF3mo elegir plantilla? Verificar respuestas contra la oferta real.\nCrear 1 reel de preguntas frecuentes, 1 comparaci\xF3n en m\xF3vil y 3 historias del premio. Diferenciar funciones incluidas de posibles extras.\nReservar 90 minutos y programar publicaci\xF3n del viernes; no inventar testimonios ni reacciones de compradores.",
    link: "https://invitaciones.arxmedia.es",
    image: "",
    format: "Producci\xF3n",
    owner: "Por asignar"
  },
  {
    id: "plan-2026-arx-023",
    calendar: "arx-plan-media-2026",
    title: "Publicar: oferta, p\xE1gina y seguimiento",
    date: "2026-11-05",
    status: "Pendiente",
    text: "Reel con una situaci\xF3n reconocible: llega tr\xE1fico, la oferta no se entiende o nadie da seguimiento. Mostrar c\xF3mo se conectan las tres piezas.\nCTA a diagn\xF3stico breve. Responder comentarios con informaci\xF3n \xFAtil, evitando enviar mensajes comerciales a todos por defecto.\nAnotar consultas cualificadas y objeciones m\xE1s repetidas.",
    link: "https://arxmedia.es",
    image: "",
    format: "Publicaci\xF3n",
    owner: "Por asignar"
  },
  {
    id: "plan-2026-wow-024",
    calendar: "arx-plan-wow-2026",
    title: "Publicar FAQ y primer recordatorio del concurso",
    date: "2026-11-06",
    status: "Pendiente",
    text: "Publicar FAQ de compra con enlace a demos. En historias, recordar el concurso con premio, fecha l\xEDmite y acceso a bases.\nEvitar que todo el perfil sea el sorteo: alternar experiencia del producto, utilidad y participaci\xF3n.\nControl: contar entradas v\xE1lidas y no asumir que participantes equivalen a clientes o suscriptores.",
    link: "https://invitaciones.arxmedia.es",
    image: "",
    format: "Publicaci\xF3n",
    owner: "Por asignar"
  },
  {
    id: "plan-2026-arx-025",
    calendar: "arx-plan-media-2026",
    title: "Revisar consultas y preparar campa\xF1a Black Friday",
    date: "2026-11-09",
    status: "Pendiente",
    text: "Definir propuesta para la semana 23\u201330/11: pack o beneficio por reserva, con precio final, anticipo, cupos reales, condiciones y plazo de entrega.\nPreferir valor adicional acotado a descuentos indiscriminados. Calcular horas de entrega y margen; confirmar qu\xE9 tareas pasan a diciembre.\nPreparar lista de interesados con permiso de contacto. No cerrar la web ni cambiar precios hasta aprobar oferta.",
    link: "https://arxmedia.es",
    image: "",
    format: "Ventas",
    owner: "Por asignar"
  },
  {
    id: "plan-2026-wow-026",
    calendar: "arx-plan-wow-2026",
    title: "Definir oferta Black Friday sin devaluar la colecci\xF3n",
    date: "2026-11-09",
    status: "Pendiente",
    text: "Decidir si conviene precio especial, mejora incluida o beneficio por reserva. Elegir UNA mec\xE1nica y calcular coste de personalizaci\xF3n, soporte y extras.\nMantener condiciones y precios correctos por Chile/Espa\xF1a. Si la reserva para boda futura es viable, definir cu\xE1ndo se entregan datos y cu\xE1nto tiempo se mantiene la plaza.\nResultado: ficha de oferta aprobada con vigencia 23\u201330/11 o decisi\xF3n expl\xEDcita de no hacer promoci\xF3n. Sin beneficio aprobado, no anunciar descuentos.",
    link: "https://invitaciones.arxmedia.es",
    image: "",
    format: "Ventas",
    owner: "Por asignar"
  },
  {
    id: "plan-2026-arx-027",
    calendar: "arx-plan-media-2026",
    title: "Producci\xF3n: un caso contado con claridad",
    date: "2026-11-10",
    status: "Pendiente",
    text: "Reservar 2 horas para una pieza de portfolio: contexto del cliente \u2192 decisi\xF3n creativa/t\xE9cnica \u2192 entrega \u2192 resultado que pueda demostrarse.\nSacar 1 reel, 1 carrusel y 4 clips de historias. Si no hay m\xE9tricas autorizadas, hablar del proceso y de la funci\xF3n entregada.\nPreparar material de lanzamiento comercial de noviembre, dejando huecos de precio/beneficio hasta aprobar la oferta.",
    link: "https://arxmedia.es",
    image: "",
    format: "Producci\xF3n",
    owner: "Por asignar"
  },
  {
    id: "plan-2026-wow-028",
    calendar: "arx-plan-wow-2026",
    title: "Producci\xF3n: la invitaci\xF3n vista por el invitado",
    date: "2026-11-11",
    status: "Pendiente",
    text: "Grabar un recorrido de 15\u201325 s desde el mensaje recibido hasta consultar fecha y ubicaci\xF3n en el m\xF3vil, usando demo identificada.\nProducir tambi\xE9n recordatorio de \xFAltimas 48 h del concurso y una pieza de cierre sin decir todav\xEDa qui\xE9n gan\xF3.\nResultado: 1 reel de producto, 1 recordatorio y 4 historias reutilizables.",
    link: "https://invitaciones.arxmedia.es",
    image: "",
    format: "Producci\xF3n",
    owner: "Por asignar"
  },
  {
    id: "plan-2026-arx-029",
    calendar: "arx-plan-media-2026",
    title: "Publicar caso y abrir consultas de agenda",
    date: "2026-11-12",
    status: "Pendiente",
    text: "Publicar caso autorizado del bloque del martes. Texto concreto: qu\xE9 necesitaba el negocio, qu\xE9 hicimos y qu\xE9 puede ver hoy.\nCTA: consultar disponibilidad para campa\xF1a de diciembre. Mostrar fechas reales de agenda, sin urgencia inventada.\nRegistrar prospectos por servicio y fecha de decisi\xF3n.",
    link: "https://arxmedia.es",
    image: "",
    format: "Publicaci\xF3n",
    owner: "Por asignar"
  },
  {
    id: "plan-2026-wow-030",
    calendar: "arx-plan-wow-2026",
    title: "Concurso: \xFAltimas 24 horas",
    date: "2026-11-12",
    status: "Pendiente",
    text: "Recordar cierre del viernes 13/11 a las 20:00 de Santiago, premio exacto y enlace a bases/formulario.\nComprobar que el formulario sigue funcionando desde m\xF3vil y que no se ha modificado la mec\xE1nica durante la promoci\xF3n.\nEvitar a\xF1adir requisitos nuevos o prometer mayores probabilidades por compartir.",
    link: "https://invitaciones.arxmedia.es",
    image: "",
    format: "Concurso",
    owner: "Por asignar"
  },
  {
    id: "plan-2026-wow-031",
    calendar: "arx-plan-wow-2026",
    title: "Cerrar concurso y consolidar participantes",
    date: "2026-11-13",
    status: "Pendiente",
    text: "A las 20:00 de Santiago cerrar nuevas entradas seg\xFAn bases, conservar copia del registro y anotar cantidad v\xE1lida.\nDepurar duplicados aplicando la regla publicada; registrar motivos de exclusi\xF3n. Asignar identificadores para el sorteo y preparar una lista de suplentes seg\xFAn bases.\nNo mostrar datos personales en publicaciones. Preparar captura o grabaci\xF3n del procedimiento; anunciar que el resultado ser\xE1 el 16/11.",
    link: "https://invitaciones.arxmedia.es",
    image: "",
    format: "Concurso",
    owner: "Por asignar"
  },
  {
    id: "plan-2026-arx-032",
    calendar: "arx-plan-media-2026",
    title: "Dejar lista la comunicaci\xF3n comercial",
    date: "2026-11-13",
    status: "Pendiente",
    text: "Redactar y revisar 4 mensajes para la semana comercial: acceso prioritario, apertura, dudas/ejemplo y cierre. Preparar variantes para propuestas abiertas.\nProbar enlaces, formulario, par\xE1metros de campa\xF1a y plantilla de respuesta. Programar solo despu\xE9s de aprobar oferta, lista y fechas.\nNo hace falta un correo diario: priorizar mensajes relevantes y personas que aceptaron recibirlos.",
    link: "https://arxmedia.es",
    image: "",
    format: "Operaci\xF3n",
    owner: "Por asignar"
  },
  {
    id: "plan-2026-wow-033",
    calendar: "arx-plan-wow-2026",
    title: "Sorteo y contacto con la pareja ganadora",
    date: "2026-11-16",
    status: "Pendiente",
    text: "A las 19:00 de Santiago ejecutar el m\xE9todo aleatorio documentado sobre entradas v\xE1lidas; guardar evidencia y elegir suplentes seg\xFAn bases.\nContactar a la persona ganadora por el canal publicado y conceder las 48 h de respuesta previstas. No pedir datos de pago ni cobrar por recibir el premio.\nComunicar resultado p\xFAblico con los datos m\xEDnimos y seg\xFAn lo autorizado. Confirmar elecci\xF3n de plantilla y materiales necesarios.\nSi no responde, aplicar las bases sin improvisar nuevas reglas.",
    link: "https://invitaciones.arxmedia.es",
    image: "",
    format: "Concurso",
    owner: "Por asignar"
  },
  {
    id: "plan-2026-arx-034",
    calendar: "arx-plan-media-2026",
    title: "Aprobar oferta, cupos y secuencia de ventas",
    date: "2026-11-16",
    status: "Pendiente",
    text: "Control de salida antes de comunicar Black Friday: alcance, beneficio, precio final, moneda, anticipo, cupos verdaderos y plazo de entrega.\nComprobar que una venta adicional sigue siendo viable. Ajustar agenda antes de vender, no despu\xE9s.\nSi no hay oferta aprobada o margen suficiente, mantener la venta habitual y usar la semana para diagn\xF3sticos y reservas.",
    link: "https://arxmedia.es",
    image: "",
    format: "Revisi\xF3n",
    owner: "Por asignar"
  },
  {
    id: "plan-2026-wow-035",
    calendar: "arx-plan-wow-2026",
    title: "Producci\xF3n: elegir una invitaci\xF3n sin complicarse",
    date: "2026-11-17",
    status: "Pendiente",
    text: "Grabar piezas para 20\u201330/11: 1) elegir por experiencia visual; 2) qu\xE9 personalizamos; 3) qu\xE9 necesitas para encargarla.\nCrear 2 versiones de anuncio a partir de la demo que mejor convierta; mantener el mismo destino para comparar.\nPreparar piezas de la oferta solo con beneficio y precio ya aprobados. Reservar 90 minutos.",
    link: "https://invitaciones.arxmedia.es",
    image: "",
    format: "Producci\xF3n",
    owner: "Por asignar"
  },
  {
    id: "plan-2026-arx-036",
    calendar: "arx-plan-media-2026",
    title: "Producci\xF3n: piezas para apertura y objeciones",
    date: "2026-11-17",
    status: "Pendiente",
    text: "Bloque de 2 horas: grabar lanzamiento del pack/oferta aprobada, respuesta a \xABtodav\xEDa no tengo todo listo\xBB y demostraci\xF3n del entregable.\nPreparar 2 reels, 1 carrusel con alcance y 5 historias. Mostrar una forma simple de reservar y lo que ocurre despu\xE9s.\nSeparar beneficios comerciales de promesas de resultados; no garantizar ventas.",
    link: "https://arxmedia.es",
    image: "",
    format: "Producci\xF3n",
    owner: "Por asignar"
  },
  {
    id: "plan-2026-wow-037",
    calendar: "arx-plan-wow-2026",
    title: "Confirmar premio y recoger datos de personalizaci\xF3n",
    date: "2026-11-18",
    status: "Pendiente",
    text: "Comprobar respuesta dentro del plazo de bases. Confirmar plantilla y reunir nombres, fecha, lugar y textos; fijar una fecha de entrega realista.\nSi la boda a\xFAn no tiene todos los datos, documentar un calendario de entrega compatible con lo prometido. El premio no debe perderse por condiciones a\xF1adidas despu\xE9s.\nPedir permiso separado si se quiere mostrar el proyecto como contenido. Si no responde, activar suplente conforme a bases.",
    link: "https://invitaciones.arxmedia.es",
    image: "",
    format: "Concurso",
    owner: "Por asignar"
  },
  {
    id: "plan-2026-wow-038",
    calendar: "arx-plan-wow-2026",
    title: "Preparar correos y control de campa\xF1a",
    date: "2026-11-19",
    status: "Pendiente",
    text: "Redactar 4 piezas de correo: acceso prioritario, apertura de oferta, c\xF3mo elegir plantilla y \xFAltimo d\xEDa. Enviar \xFAnicamente a la lista voluntaria correspondiente a WOW.\nProbar que cada enlace abre la oferta y moneda correctas. Preparar respuestas sobre reserva, entrega, revisiones y fecha de boda.\nLa participaci\xF3n en el concurso no autoriza por s\xED sola recibir publicidad.",
    link: "https://help.brevo.com/hc/es/articles/208771869-Crear-un-formulario-de-suscripci%C3%B3n-en-Brevo",
    image: "",
    format: "Operaci\xF3n",
    owner: "Por asignar"
  },
  {
    id: "plan-2026-arx-039",
    calendar: "arx-plan-media-2026",
    title: "Publicar alcance y comprobar recorrido de reserva",
    date: "2026-11-20",
    status: "Pendiente",
    text: "Publicar pieza que explica qu\xE9 incluye la oferta aprobada y para qui\xE9n tiene sentido. Si sigue pendiente, publicar proceso/portfolio sin promoci\xF3n.\nSimular consulta \u2192 propuesta \u2192 reserva con la nueva oferta. Dejar respuestas r\xE1pidas listas y una persona responsable de revisar consultas.\nConfirmar disponibilidad que se podr\xE1 anunciar el domingo y lunes.",
    link: "https://arxmedia.es",
    image: "",
    format: "Publicaci\xF3n",
    owner: "Por asignar"
  },
  {
    id: "plan-2026-wow-040",
    calendar: "arx-plan-wow-2026",
    title: "Entrega propuesta del premio y prueba final de oferta",
    date: "2026-11-20",
    status: "Pendiente",
    text: "Si la pareja entreg\xF3 datos completos a tiempo, entregar primera versi\xF3n del premio, probarla en m\xF3vil y coordinar revisi\xF3n seg\xFAn alcance aprobado.\nSi faltan datos, registrar nueva fecha acordada y no marcar completado antes de entregar.\nPor separado, comprobar la oferta comercial de noviembre: precios, beneficio, pago y confirmaci\xF3n. Mantener web abierta; no copiar el cierre de tienda del plan de referencia.",
    link: "https://invitaciones.arxmedia.es",
    image: "",
    format: "Entrega",
    owner: "Por asignar"
  },
  {
    id: "plan-2026-arx-041",
    calendar: "arx-plan-media-2026",
    title: "Acceso prioritario a agenda: aviso a interesados",
    date: "2026-11-22",
    status: "Pendiente",
    text: "Propuesta: a las 20:00 de Santiago avisar a interesados con permiso de contacto del beneficio aprobado y las plazas disponibles.\nNo bloquear la web. El acceso prioritario puede ser un enlace o una reserva anticipada real, con condiciones iguales a las anunciadas.\nSi no se aprob\xF3 oferta o no existe una lista v\xE1lida, omitir el env\xEDo y mover la tarea. Hylia solo organiza; no env\xEDa campa\xF1as.",
    link: "https://arxmedia.es",
    image: "",
    format: "Ventas",
    owner: "Por asignar"
  },
  {
    id: "plan-2026-wow-042",
    calendar: "arx-plan-wow-2026",
    title: "Acceso anticipado a la oferta aprobada",
    date: "2026-11-22",
    status: "Pendiente",
    text: "Propuesta: avisar a las 20:00 de Santiago a la lista voluntaria de WOW del beneficio de reserva o compra aprobado.\nMostrar hora y vigencia claramente para cada mercado. Mantener demos y web abiertas. No a\xF1adir participantes del sorteo a esta lista sin su aceptaci\xF3n.\nMedir clic a demo, inicio de compra y venta neta. Omitir el env\xEDo si faltan condiciones aprobadas.",
    link: "https://invitaciones.arxmedia.es",
    image: "",
    format: "Ventas",
    owner: "Por asignar"
  },
  {
    id: "plan-2026-arx-043",
    calendar: "arx-plan-media-2026",
    title: "Apertura comercial: campa\xF1a y agenda",
    date: "2026-11-23",
    status: "Pendiente",
    text: "Publicar oferta final y activar anuncios solo con presupuesto aprobado. Priorizar creatividad ganadora y seguimiento de consultas cualificadas.\nHistorias sugeridas: alcance, ejemplo entregado y pregunta frecuente; 3\u20135 piezas \xFAtiles en el d\xEDa, no cada dos horas por obligaci\xF3n.\nRevisar dos veces al d\xEDa consultas, reservas y capacidad. Pausar captaci\xF3n de servicios que ya no quepan en agenda.",
    link: "https://arxmedia.es",
    image: "",
    format: "Ventas",
    owner: "Por asignar"
  },
  {
    id: "plan-2026-wow-044",
    calendar: "arx-plan-wow-2026",
    title: "Abrir semana de Black Friday",
    date: "2026-11-23",
    status: "Pendiente",
    text: "Lanzar la oferta aprobada en web y redes, con una demo protagonista y condiciones visibles. Confirmar que el beneficio se aplica sin pasos confusos.\nMedir visitas \u2192 demo \u2192 selecci\xF3n \u2192 inicio de pago \u2192 compra. Usar retargeting solo si la medici\xF3n y las audiencias necesarias est\xE1n disponibles y configuradas de forma adecuada.\nNo ampliar presupuesto por tener muchos clics si todav\xEDa no se convierte en ventas.",
    link: "https://invitaciones.arxmedia.es",
    image: "",
    format: "Ventas",
    owner: "Por asignar"
  },
  {
    id: "plan-2026-arx-045",
    calendar: "arx-plan-media-2026",
    title: "Producci\xF3n ligera: respuestas que ayudan a reservar",
    date: "2026-11-24",
    status: "Pendiente",
    text: "Reservar 60 min, sin abrir una producci\xF3n grande en plena campa\xF1a. Grabar 3 respuestas a objeciones reales de la semana: alcance, plazo y siguiente paso.\nPublicar una historia de proceso con autorizaci\xF3n y mostrar la agenda real si quedan plazas.\nActualizar la pieza de preguntas frecuentes a partir de dudas repetidas.",
    link: "https://arxmedia.es",
    image: "",
    format: "Producci\xF3n",
    owner: "Por asignar"
  },
  {
    id: "plan-2026-wow-046",
    calendar: "arx-plan-wow-2026",
    title: "Producci\xF3n ligera: respuestas a dudas reales",
    date: "2026-11-25",
    status: "Pendiente",
    text: "Reservar 45\u201360 min para responder las tres dudas m\xE1s repetidas de compra. Mostrar pantallas concretas: personalizaci\xF3n, experiencia del invitado y c\xF3mo encargar.\nPreparar una pieza para Black Friday y otra para cierre del 30/11 con la oferta vigente.\nNo cambiar la mec\xE1nica ni aumentar la presi\xF3n con cantidades o plazos falsos.",
    link: "https://invitaciones.arxmedia.es",
    image: "",
    format: "Producci\xF3n",
    owner: "Por asignar"
  },
  {
    id: "plan-2026-arx-047",
    calendar: "arx-plan-media-2026",
    title: "Revisar inversi\xF3n, margen y agenda antes del viernes",
    date: "2026-11-26",
    status: "Pendiente",
    text: "Comparar coste por consulta cualificada, propuestas, anticipos y horas comprometidas. Revisar que el beneficio sigue siendo rentable.\nMantener solo anuncios que aporten oportunidades relevantes; no aumentar presupuesto autom\xE1ticamente por la fecha.\nConfirmar con cada reserva alcance y fecha. Si no quedan plazas, comunicar la siguiente fecha disponible con claridad.",
    link: "https://arxmedia.es",
    image: "",
    format: "Revisi\xF3n",
    owner: "Por asignar"
  },
  {
    id: "plan-2026-wow-048",
    calendar: "arx-plan-wow-2026",
    title: "Revisi\xF3n de ventas y entrega antes de Black Friday",
    date: "2026-11-26",
    status: "Pendiente",
    text: "Revisar compras reales, pagos fallidos, consultas pendientes y tiempo de personalizaci\xF3n comprometido. Corregir primero cualquier fallo de checkout.\nSeparar gasto de adquisici\xF3n y participaci\xF3n del concurso; no confundir entradas al sorteo con ventas.\nDecidir mantener, ajustar o pausar inversi\xF3n seg\xFAn margen y capacidad. Los plazos anunciados deben seguir siendo posibles.",
    link: "https://invitaciones.arxmedia.es",
    image: "",
    format: "Revisi\xF3n",
    owner: "Por asignar"
  },
  {
    id: "plan-2026-arx-049",
    calendar: "arx-plan-media-2026",
    title: "Black Friday: oferta y seguimiento de reservas",
    date: "2026-11-27",
    status: "Pendiente",
    text: "VIERNES 27/11. Comunicar el beneficio aprobado, casos reales y fecha de cierre del lunes 30. Contactar solo a propuestas abiertas o interesados que esperan respuesta.\nResponder consultas con alcance y calendario exacto. Hacer 3\u20135 historias \xFAtiles: oferta, ejemplo, duda y siguiente paso.\nRegistrar anticipos y plazas reservadas; no marcar venta por una simple conversaci\xF3n.",
    link: "https://arxmedia.es",
    image: "",
    format: "Ventas",
    owner: "Por asignar"
  },
  {
    id: "plan-2026-wow-050",
    calendar: "arx-plan-wow-2026",
    title: "Black Friday: mostrar, explicar y facilitar compra",
    date: "2026-11-27",
    status: "Pendiente",
    text: "VIERNES 27/11. Publicar la demo m\xE1s clara con beneficio vigente y fecha de finalizaci\xF3n. Mantener enlace directo a colecci\xF3n/pago.\nHistorias: experiencia de apertura, qu\xE9 incluye, c\xF3mo personalizar y consulta frecuente. Responder dudas de compra en bloques de atenci\xF3n definidos.\nValidar pagos y confirmaciones; informar cualquier incidencia real sin prometer plazos imposibles.",
    link: "https://invitaciones.arxmedia.es",
    image: "",
    format: "Ventas",
    owner: "Por asignar"
  },
  {
    id: "plan-2026-arx-051",
    calendar: "arx-plan-media-2026",
    title: "Cyber Monday: cierre y confirmaci\xF3n de agenda",
    date: "2026-11-30",
    status: "Pendiente",
    text: "LUNES 30/11. \xDAltimo d\xEDa de la oferta solo si esta vigencia fue anunciada. Recordar hora exacta de cierre y no extenderla de forma improvisada.\nConfirmar reservas, anticipos, entregables y fechas con cada cliente. Preparar paso a producci\xF3n y lista de espera para enero si hace falta.\nCerrar a la hora comunicada y retirar piezas/promociones caducadas.",
    link: "https://arxmedia.es",
    image: "",
    format: "Ventas",
    owner: "Por asignar"
  },
  {
    id: "plan-2026-wow-052",
    calendar: "arx-plan-wow-2026",
    title: "Cyber Monday: cierre y pedidos ordenados",
    date: "2026-11-30",
    status: "Pendiente",
    text: "LUNES 30/11. Recordatorio final a personas que aceptaron comunicaciones comerciales, con condiciones y hora de cierre de la oferta.\nComprobar pedidos, datos de personalizaci\xF3n y tiempos de entrega. Cerrar promoci\xF3n cuando corresponde; no usar liquidaci\xF3n de stock en un producto digital.\nGuardar resultados separados por pa\xEDs, plantilla y origen para revisar el 2/12.",
    link: "https://invitaciones.arxmedia.es",
    image: "",
    format: "Ventas",
    owner: "Por asignar"
  },
  {
    id: "plan-2026-arx-053",
    calendar: "arx-plan-media-2026",
    title: "Cambiar a diciembre y producir campa\xF1a de cierre de a\xF1o",
    date: "2026-12-01",
    status: "Pendiente",
    text: "Retirar mensajes Black Friday y pasar a campa\xF1as de diciembre/enero. Revisar agenda antes de ofrecer nuevas entregas.\nBLOQUE DE 90 MIN: reel \xABlo que puedes dejar listo antes de enero\xBB, carrusel con pr\xF3ximos pasos de una web/automatizaci\xF3n y una pieza de portfolio autorizada.\nSi el calendario est\xE1 lleno, vender reserva para enero con fecha concreta en lugar de una entrega urgente irreal.",
    link: "https://arxmedia.es",
    image: "",
    format: "Producci\xF3n",
    owner: "Por asignar"
  },
  {
    id: "plan-2026-wow-054",
    calendar: "arx-plan-wow-2026",
    title: "Cambiar a campa\xF1a de bodas 2027",
    date: "2026-12-01",
    status: "Pendiente",
    text: "Retirar Black Friday de banners y publicaciones activas. Cambiar mensaje a parejas que est\xE1n organizando su boda de 2027 o se comprometen en estas fechas.\nProponer como novedad una colecci\xF3n/variaci\xF3n o un pack de reserva solo si hay algo nuevo de verdad y capacidad para entregarlo.\nDefinir l\xEDmites de atenci\xF3n durante fiestas y plazos reales. No trasladar garant\xEDas de env\xEDo navide\xF1o propias de productos f\xEDsicos.",
    link: "https://invitaciones.arxmedia.es",
    image: "",
    format: "Planificaci\xF3n",
    owner: "Por asignar"
  },
  {
    id: "plan-2026-arx-055",
    calendar: "arx-plan-media-2026",
    title: "Balance comercial: qu\xE9 servicio merece repetirse",
    date: "2026-12-02",
    status: "Pendiente",
    text: "Medir consultas cualificadas, propuestas enviadas, reservas con anticipo, facturaci\xF3n y horas comprometidas frente al gasto.\nIdentificar qu\xE9 pieza y oferta trajeron oportunidades \xFAtiles. Anotar aprendizaje, coste de entrega y cambios para enero.\nPreparar agradecimiento con resultados reales y permisos; no afirmar miles de ventas o grandes cifras si no existen.",
    link: "https://arxmedia.es",
    image: "",
    format: "Revisi\xF3n",
    owner: "Por asignar"
  },
  {
    id: "plan-2026-wow-056",
    calendar: "arx-plan-wow-2026",
    title: "Balance de ventas y del concurso",
    date: "2026-12-02",
    status: "Pendiente",
    text: "Separar resultados: participantes v\xE1lidos, suscripciones voluntarias, visitas a demos, inicios de pago, compras y coste de premio en horas.\nCalcular qu\xE9 ocurri\xF3 despu\xE9s del concurso con los datos disponibles; si no hay atribuci\xF3n fiable, no atribuir ventas de forma inventada.\nComprobar entrega del premio y pendientes de pedidos. Guardar 3 aprendizajes para la pr\xF3xima promoci\xF3n.",
    link: "https://invitaciones.arxmedia.es",
    image: "",
    format: "Revisi\xF3n",
    owner: "Por asignar"
  },
  {
    id: "plan-2026-wow-057",
    calendar: "arx-plan-wow-2026",
    title: "Producci\xF3n: de compromiso a primera invitaci\xF3n",
    date: "2026-12-03",
    status: "Pendiente",
    text: "BLOQUE DE 90 MIN. Producir reel \xAB\xBFSe viene boda en 2027?\xBB, recorrido de una plantilla y carrusel con datos que conviene tener listos.\nSi se prepara un \u201Creserva la fecha\u201D, comprobar que ese producto existe y qu\xE9 incluye antes de anunciarlo. Puede ser una propuesta de desarrollo, no una funci\xF3n confirmada.\nResultado: 2 reels, 1 carrusel y 5 historias con CTA a demo/consulta.",
    link: "https://invitaciones.arxmedia.es",
    image: "",
    format: "Producci\xF3n",
    owner: "Por asignar"
  },
  {
    id: "plan-2026-arx-058",
    calendar: "arx-plan-media-2026",
    title: "Publicar: deja listo el siguiente paso de tu negocio",
    date: "2026-12-04",
    status: "Pendiente",
    text: "Publicar pieza de la producci\xF3n del 1/12: una mejora concreta que se puede planificar para enero. Ejemplos: aclarar oferta de la web o ordenar seguimiento de consultas.\nCTA: reservar diagn\xF3stico para enero, con disponibilidad real. Utilizar historias para explicar c\xF3mo es trabajar con ARX y qu\xE9 material debe preparar el cliente.",
    link: "https://arxmedia.es",
    image: "",
    format: "Publicaci\xF3n",
    owner: "Por asignar"
  },
  {
    id: "plan-2026-wow-059",
    calendar: "arx-plan-wow-2026",
    title: "Publicar: una boda en 2027 empieza por aqu\xED",
    date: "2026-12-04",
    status: "Pendiente",
    text: "Mostrar demo de invitaci\xF3n con texto breve para parejas que planifican 2027. Dirigir a la colecci\xF3n, no al concurso ya cerrado.\nComplementar con 3 historias: experiencia, utilidad y c\xF3mo encargar. Si hay proyectos reales publicados, pedir autorizaci\xF3n antes de usar nombres o im\xE1genes.",
    link: "https://invitaciones.arxmedia.es",
    image: "",
    format: "Publicaci\xF3n",
    owner: "Por asignar"
  },
  {
    id: "plan-2026-arx-060",
    calendar: "arx-plan-media-2026",
    title: "Producci\xF3n: mini caso y preguntas de enero",
    date: "2026-12-08",
    status: "Pendiente",
    text: "Reservar 90 minutos para un mini caso de automatizaci\xF3n/web: problema concreto \u2192 funcionamiento \u2192 siguiente paso. Utilizar demo expl\xEDcita si no se puede mostrar un cliente.\nGrabar dos FAQ de contrataci\xF3n y preparar historias con agenda de enero.\nResultado: 1 reel, 1 carrusel y 4 clips. Mantener alcance peque\xF1o por la carga de entregas de diciembre.",
    link: "https://arxmedia.es",
    image: "",
    format: "Producci\xF3n",
    owner: "Por asignar"
  },
  {
    id: "plan-2026-wow-061",
    calendar: "arx-plan-wow-2026",
    title: "Producci\xF3n: una invitaci\xF3n, varios detalles \xFAtiles",
    date: "2026-12-09",
    status: "Pendiente",
    text: "BLOQUE DE 90 MIN. Grabar el recorrido m\xF3vil de fecha, mapa y cronograma solo en dise\xF1os que los tengan. Crear una pieza por utilidad para que la experiencia no parezca solo un efecto visual.\nA\xF1adir 1 reel est\xE9tico de apertura y una gu\xEDa breve para elegir plantilla.\nCTA: probar la demo y consultar condiciones. Preparar contenido para el 11 y el 18/12.",
    link: "https://invitaciones.arxmedia.es",
    image: "",
    format: "Producci\xF3n",
    owner: "Por asignar"
  },
  {
    id: "plan-2026-arx-062",
    calendar: "arx-plan-media-2026",
    title: "Publicar mini caso y revisar entregas",
    date: "2026-12-11",
    status: "Pendiente",
    text: "Publicar mini caso del martes y responder preguntas de contrataci\xF3n. Elegir un resultado que se pueda demostrar, sin cifras decorativas.\nRevisar entregas comprometidas, bloqueos por falta de material y pr\xF3ximas fechas. Pedir al cliente lo que falta con instrucciones claras y una fecha acordada.",
    link: "https://arxmedia.es",
    image: "",
    format: "Publicaci\xF3n",
    owner: "Por asignar"
  },
  {
    id: "plan-2026-wow-063",
    calendar: "arx-plan-wow-2026",
    title: "Publicar: los detalles tambi\xE9n organizan",
    date: "2026-12-11",
    status: "Pendiente",
    text: "Reel o carrusel mostrando c\xF3mo los invitados encuentran la informaci\xF3n del evento dentro de la experiencia.\nCTA a demo. En historias, explicar qu\xE9 necesita la pareja para personalizar y en qu\xE9 momento conviene encargar.\nMantener la venta centrada en bodas, sin convertir el producto en un regalo navide\xF1o que no es.",
    link: "https://invitaciones.arxmedia.es",
    image: "",
    format: "Publicaci\xF3n",
    owner: "Por asignar"
  },
  {
    id: "plan-2026-arx-064",
    calendar: "arx-plan-media-2026",
    title: "Producci\xF3n: material para las dos semanas de fiestas",
    date: "2026-12-15",
    status: "Pendiente",
    text: "BLOQUE DE 2 HORAS. Dejar 2 piezas y 6 historias listas: un aprendizaje de proyecto, una FAQ de servicio y una propuesta para empezar enero con un plan claro.\nConfirmar consentimiento y permisos de portfolio. Revisar cada CTA y fechas para que no queden mensajes de noviembre.\nProgramar cuando est\xE9 aprobado; reservar franjas reales de respuesta durante fiestas.",
    link: "https://arxmedia.es",
    image: "",
    format: "Producci\xF3n",
    owner: "Por asignar"
  },
  {
    id: "plan-2026-wow-065",
    calendar: "arx-plan-wow-2026",
    title: "Producci\xF3n: contenido para compromisos de fin de a\xF1o",
    date: "2026-12-16",
    status: "Pendiente",
    text: "Grabar 2 reels breves de apertura y 1 carrusel \xABLos primeros datos de su boda\xBB. Crear variantes visuales para mostrar estilos distintos de la colecci\xF3n.\nPreparar historias de preguntas frecuentes y atenci\xF3n en fiestas, con plazos previamente confirmados.\nResultado: contenido de 18\u201330/12 listo sin obligarse a grabar en Navidad.",
    link: "https://invitaciones.arxmedia.es",
    image: "",
    format: "Producci\xF3n",
    owner: "Por asignar"
  },
  {
    id: "plan-2026-arx-066",
    calendar: "arx-plan-media-2026",
    title: "Publicar agenda de enero y cerrar pendientes",
    date: "2026-12-18",
    status: "Pendiente",
    text: "Mostrar servicios que pueden reservarse para enero y la forma de iniciar. Indicar primeras fechas reales de trabajo y condiciones de reserva.\nRevisar propuestas abiertas, anticipos pendientes y alcance acordado. Evitar dar por hecho un proyecto solo por intercambio de mensajes.\nCerrar tareas de entrega de diciembre que s\xED est\xE9n terminadas.",
    link: "https://arxmedia.es",
    image: "",
    format: "Ventas",
    owner: "Por asignar"
  },
  {
    id: "plan-2026-wow-067",
    calendar: "arx-plan-wow-2026",
    title: "Publicar selecci\xF3n de estilos y plazos de fiestas",
    date: "2026-12-18",
    status: "Pendiente",
    text: "Carrusel con tres estilos/experiencias reales de la colecci\xF3n y CTA a demos.\nInformar qu\xE9 pedidos pueden entregarse antes de fiestas y cu\xE1les pasan a otra fecha seg\xFAn carga y datos recibidos. No garantizar Nochebuena si no puede cumplirse.\nPreparar respuestas autom\xE1ticas de atenci\xF3n con horario real, sin aparentar disponibilidad permanente.",
    link: "https://invitaciones.arxmedia.es",
    image: "",
    format: "Publicaci\xF3n",
    owner: "Por asignar"
  },
  {
    id: "plan-2026-arx-068",
    calendar: "arx-plan-media-2026",
    title: "Atenci\xF3n de fiestas y continuidad de proyectos",
    date: "2026-12-21",
    status: "Pendiente",
    text: "Confirmar horario de atenci\xF3n, d\xEDas de descanso y responsables. Revisar que clientes con entregas activas sepan la siguiente fecha y qu\xE9 material falta.\nConfigurar respuesta de ausencia si corresponde y dejar un canal para incidencias de proyectos activos.\nSolo automatizar respuestas que se hayan probado; no iniciar env\xEDos masivos nuevos esta semana.",
    link: "https://arxmedia.es",
    image: "",
    format: "Operaci\xF3n",
    owner: "Por asignar"
  },
  {
    id: "plan-2026-wow-069",
    calendar: "arx-plan-wow-2026",
    title: "Revisar pedidos antes de Navidad",
    date: "2026-12-21",
    status: "Pendiente",
    text: "Comprobar pedidos pagados, datos completos, revisiones y entregas. Informar cualquier cambio de fecha de forma individual.\nMostrar plazos reales y horario de atenci\xF3n. Mantener demos y pedidos accesibles aunque la personalizaci\xF3n tenga otra fecha de inicio.\nSeparar urgencias reales de tareas que pueden esperar a la vuelta.",
    link: "https://invitaciones.arxmedia.es",
    image: "",
    format: "Operaci\xF3n",
    owner: "Por asignar"
  },
  {
    id: "plan-2026-wow-070",
    calendar: "arx-plan-wow-2026",
    title: "Publicaci\xF3n programada: si acaba de llegar el s\xED",
    date: "2026-12-23",
    status: "Pendiente",
    text: "Pieza breve y delicada de colecci\xF3n: \xABSi acaba de llegar el s\xED, aqu\xED puede empezar lo que viene\xBB. Mostrar una experiencia completa y CTA a demo.\nPublicar solo si est\xE1 aprobada y revisar enlace antes de salir. No prometer atenci\xF3n inmediata ni entrega en Navidad.\nEl 24 y 25 quedan libres de producci\xF3n; el contenido se prepar\xF3 el 16/12.",
    link: "https://invitaciones.arxmedia.es",
    image: "",
    format: "Publicaci\xF3n",
    owner: "Por asignar"
  },
  {
    id: "plan-2026-arx-071",
    calendar: "arx-plan-media-2026",
    title: "Revisi\xF3n de agenda y producci\xF3n ligera de enero",
    date: "2026-12-28",
    status: "Pendiente",
    text: "Revisar reservas de enero y grabar una pieza ligera: \xABTres cosas que conviene definir antes de lanzar una campa\xF1a\xBB.\nActualizar ficha de servicios y preguntas frecuentes seg\xFAn objeciones de noviembre/diciembre.\nBloque m\xE1ximo de 60\u201390 min. No programar jornadas intensivas en el 31/12 ni 1/1.",
    link: "https://arxmedia.es",
    image: "",
    format: "Producci\xF3n",
    owner: "Por asignar"
  },
  {
    id: "plan-2026-wow-072",
    calendar: "arx-plan-wow-2026",
    title: "Producci\xF3n ligera: elegir y organizar para 2027",
    date: "2026-12-29",
    status: "Pendiente",
    text: "Grabar pantalla de una comparaci\xF3n de dos plantillas y preparar FAQ para parejas reci\xE9n comprometidas. Aprovechar material existente en lugar de crear una colecci\xF3n nueva con prisa.\nProducir 1 reel y 4 historias para la primera semana de enero. Confirmar que cat\xE1logo, precios y plazos siguen correctos.",
    link: "https://invitaciones.arxmedia.es",
    image: "",
    format: "Producci\xF3n",
    owner: "Por asignar"
  },
  {
    id: "plan-2026-arx-073",
    calendar: "arx-plan-media-2026",
    title: "Cierre de a\xF1o con trabajo real",
    date: "2026-12-30",
    status: "Pendiente",
    text: "Publicar una selecci\xF3n breve de trabajo autorizado o una decisi\xF3n creativa aprendida. No presentar renders, demos o cifras inventadas como clientes/resultados reales.\nCTA suave: agenda de enero disponible si existen plazas. Revisar \xFAltimo estado de proyectos y compartir pr\xF3xima fecha de atenci\xF3n.",
    link: "https://arxmedia.es",
    image: "",
    format: "Publicaci\xF3n",
    owner: "Por asignar"
  },
  {
    id: "plan-2026-wow-074",
    calendar: "arx-plan-wow-2026",
    title: "Publicar: su historia contin\xFAa en 2027",
    date: "2026-12-30",
    status: "Pendiente",
    text: "Publicar demo o montaje delicado de estilos de invitaci\xF3n con CTA a colecci\xF3n. Si hay proyecto real autorizado, se puede usar como ejemplo se\xF1alando el contexto.\nNo reutilizar concurso o descuento vencido. Dejar claro c\xF3mo consultar despu\xE9s de las fiestas.",
    link: "https://invitaciones.arxmedia.es",
    image: "",
    format: "Publicaci\xF3n",
    owner: "Por asignar"
  },
  {
    id: "plan-2026-arx-075",
    calendar: "arx-plan-media-2026",
    title: "Reapertura y diagn\xF3stico de cartera",
    date: "2027-01-04",
    status: "Pendiente",
    text: "Revisar proyectos entregados en noviembre/diciembre, incidencias pendientes y agenda de enero.\nAgrupar clientes por siguiente necesidad real: continuidad de contenido, mantenimiento de web o mejora de automatizaci\xF3n. No ofrecer el mismo plan a todos.\nDefinir objetivos del mes por consultas cualificadas, reservas, margen y entregas a tiempo. No importar pol\xEDticas de devoluci\xF3n de productos f\xEDsicos.",
    link: "https://arxmedia.es",
    image: "",
    format: "Planificaci\xF3n",
    owner: "Por asignar"
  },
  {
    id: "plan-2026-wow-076",
    calendar: "arx-plan-wow-2026",
    title: "Reapertura: bodas, entregas y pr\xF3ximas fechas",
    date: "2027-01-04",
    status: "Pendiente",
    text: "Revisar personalizaciones pendientes, revisiones y bodas de los pr\xF3ximos meses. Confirmar qu\xE9 datos faltan y cu\xE1ndo se necesitar\xE1n.\nAdaptar mensajes a parejas que se comprometieron durante fiestas y quieren elegir invitaci\xF3n.\nDefinir soporte y alcance de cambios con las condiciones reales de compra; no anunciar devoluciones de un producto f\xEDsico ni garant\xEDas no aprobadas.",
    link: "https://invitaciones.arxmedia.es",
    image: "",
    format: "Planificaci\xF3n",
    owner: "Por asignar"
  },
  {
    id: "plan-2026-arx-077",
    calendar: "arx-plan-media-2026",
    title: "Producci\xF3n: una marca no empieza de cero cada mes",
    date: "2027-01-05",
    status: "Pendiente",
    text: "Grabar 2 piezas: continuidad del contenido con una estrategia clara y revisi\xF3n de una automatizaci\xF3n despu\xE9s de entregarla.\nCrear un carrusel \xABQu\xE9 revisar antes de contratar\xBB con alcance, tiempos, material y objetivo.\nResultado: 2 reels, 1 carrusel y 4 historias para enero. Mostrar servicios vigentes, no promesas de crecimiento garantizado.",
    link: "https://arxmedia.es",
    image: "",
    format: "Producci\xF3n",
    owner: "Por asignar"
  },
  {
    id: "plan-2026-wow-078",
    calendar: "arx-plan-wow-2026",
    title: "Producci\xF3n: primeras decisiones despu\xE9s del compromiso",
    date: "2027-01-06",
    status: "Pendiente",
    text: "Crear carrusel con orden simple: fecha aproximada, lugar, estilo y datos para invitar. Evitar dar un plazo universal de env\xEDo a todos los invitados; depende del tipo de boda.\nGrabar 2 reels de demos diferentes y una FAQ sobre personalizaci\xF3n. CTA: elegir colecci\xF3n y consultar condiciones.\nMantener tono premium y \xFAtil, con texto breve.",
    link: "https://invitaciones.arxmedia.es",
    image: "",
    format: "Producci\xF3n",
    owner: "Por asignar"
  },
  {
    id: "plan-2026-arx-079",
    calendar: "arx-plan-media-2026",
    title: "Publicar y proponer continuidad a clientes adecuados",
    date: "2027-01-08",
    status: "Pendiente",
    text: "Publicar una pieza del martes y revisar qu\xE9 clientes necesitan una siguiente etapa real.\nProponer continuidad de RRSS, soporte o mejoras con alcance y precio claros. Para comunicaciones promocionales, usar solo contactos que aceptaron recibirlas; separar soporte de publicidad.\nRegistrar propuesta, siguiente paso y fecha. No convertir autom\xE1ticamente a nadie en una suscripci\xF3n.",
    link: "https://arxmedia.es",
    image: "",
    format: "Ventas",
    owner: "Por asignar"
  },
  {
    id: "plan-2026-wow-080",
    calendar: "arx-plan-wow-2026",
    title: "Publicar gu\xEDa para parejas reci\xE9n comprometidas",
    date: "2027-01-08",
    status: "Pendiente",
    text: "Publicar carrusel de primeras decisiones y acompa\xF1ar con historias que permiten probar dos estilos.\nCTA: ver colecci\xF3n o consultar si encaja con su boda. Mantener la informaci\xF3n de compra f\xE1cil de encontrar.\nRevisar dudas nuevas y usarlas para el siguiente bloque de producci\xF3n.",
    link: "https://invitaciones.arxmedia.es",
    image: "",
    format: "Publicaci\xF3n",
    owner: "Por asignar"
  },
  {
    id: "plan-2026-arx-081",
    calendar: "arx-plan-media-2026",
    title: "Producci\xF3n: caso y revisi\xF3n del sistema",
    date: "2027-01-12",
    status: "Pendiente",
    text: "Grabar un caso autorizado de web/automatizaci\xF3n o una demo se\xF1alada. Enfocar en una mejora concreta, no en enumerar herramientas.\nReutilizar en reel, carrusel y 3 historias. Preparar una pieza para explicar la diferencia entre una entrega puntual y un servicio continuo.\nReservar 90 min y guardar material ordenado por proyecto.",
    link: "https://arxmedia.es",
    image: "",
    format: "Producci\xF3n",
    owner: "Por asignar"
  },
  {
    id: "plan-2026-wow-082",
    calendar: "arx-plan-wow-2026",
    title: "Producci\xF3n: detr\xE1s de la personalizaci\xF3n",
    date: "2027-01-13",
    status: "Pendiente",
    text: "Mostrar c\xF3mo cambian nombres, textos y datos en una invitaci\xF3n, con informaci\xF3n demo o permiso de la pareja.\nCrear un reel de proceso y una comparaci\xF3n visual del resultado. Si se muestra el premio del concurso, confirmar permiso de uso antes.\nExplicar una sola decisi\xF3n por pieza; CTA a demo y condiciones de encargo.",
    link: "https://invitaciones.arxmedia.es",
    image: "",
    format: "Producci\xF3n",
    owner: "Por asignar"
  },
  {
    id: "plan-2026-arx-083",
    calendar: "arx-plan-media-2026",
    title: "Seguimiento de entregas y satisfacci\xF3n",
    date: "2027-01-15",
    status: "Pendiente",
    text: "Revisar entregas de noviembre/diciembre con clientes activos: funcionamiento, dudas y pr\xF3ximos pasos. Resolver incidencias antes de proponer m\xE1s servicios.\nPedir testimonio solo si la experiencia fue real y con autorizaci\xF3n de publicaci\xF3n. Registrar aprendizajes de soporte para mejorar onboarding.\nNo hay una devoluci\xF3n especial hasta esta fecha salvo pol\xEDtica que se hubiera aprobado y comunicado expresamente.",
    link: "https://arxmedia.es",
    image: "",
    format: "Revisi\xF3n",
    owner: "Por asignar"
  },
  {
    id: "plan-2026-wow-084",
    calendar: "arx-plan-wow-2026",
    title: "Posventa, premio y recomendaci\xF3n voluntaria",
    date: "2027-01-15",
    status: "Pendiente",
    text: "Confirmar que compradores y pareja ganadora pueden abrir la invitaci\xF3n y conocen los pasos pendientes. Resolver enlaces/textos incorrectos dentro del alcance acordado.\nSolicitar opini\xF3n y permiso para compartir resultado, sin condicionar soporte o premio a una rese\xF1a positiva.\nInvitaciones no es una compra mensual: priorizar experiencia, recomendaci\xF3n voluntaria y servicios adicionales que s\xED necesiten, sin forzar recompra.",
    link: "https://invitaciones.arxmedia.es",
    image: "",
    format: "Revisi\xF3n",
    owner: "Por asignar"
  },
  {
    id: "plan-2026-arx-085",
    calendar: "arx-plan-media-2026",
    title: "Producci\xF3n: una objeci\xF3n, una respuesta \xFAtil",
    date: "2027-01-19",
    status: "Pendiente",
    text: "Elegir tres dudas comerciales reales de enero y grabar respuestas de 15\u201330 s. Ejemplos: material necesario, tiempos y c\xF3mo se valida una pieza.\nPreparar 1 reel principal, 1 FAQ y 4 historias. Mantener CTA a servicio concreto y no mezclar todos los servicios en una sola pieza.\nRevisar que los ejemplos siguen representando la oferta actual.",
    link: "https://arxmedia.es",
    image: "",
    format: "Producci\xF3n",
    owner: "Por asignar"
  },
  {
    id: "plan-2026-wow-086",
    calendar: "arx-plan-wow-2026",
    title: "Producci\xF3n: estilos para bodas diferentes",
    date: "2027-01-20",
    status: "Pendiente",
    text: "Producir reel comparando dos experiencias con la misma informaci\xF3n demo. Mostrar diferencias de interacci\xF3n y estilo sin declarar una mejor para todo el mundo.\nCrear carrusel \xABQu\xE9 revisar antes de enviar\xBB: datos, enlaces, fechas y prueba en distintos m\xF3viles.\nResultado: 1 reel, 1 carrusel y 4 historias para 22\u201329/1.",
    link: "https://invitaciones.arxmedia.es",
    image: "",
    format: "Producci\xF3n",
    owner: "Por asignar"
  },
  {
    id: "plan-2026-arx-087",
    calendar: "arx-plan-media-2026",
    title: "Publicar FAQ y revisar capacidad de febrero",
    date: "2027-01-22",
    status: "Pendiente",
    text: "Publicar la respuesta m\xE1s \xFAtil del bloque del 19/1. Revisar reservas y capacidad real para febrero antes de abrir nuevas fechas.\nSi hay m\xE1s demanda que capacidad, ofrecer lista de espera o fecha concreta con condiciones claras; no hablar de \u201Crotura de stock\u201D.\nRegistrar oportunidades que prefieren esperar y acordar cu\xE1ndo volver a contactar.",
    link: "https://arxmedia.es",
    image: "",
    format: "Ventas",
    owner: "Por asignar"
  },
  {
    id: "plan-2026-wow-088",
    calendar: "arx-plan-wow-2026",
    title: "Publicar: probar antes de enviar",
    date: "2027-01-22",
    status: "Pendiente",
    text: "Publicar checklist visual para revisar la invitaci\xF3n antes de compartirla. Mostrar demo y una prueba m\xF3vil clara.\nEn historias, comparar dos dise\xF1os y dirigir a colecci\xF3n. Si la personalizaci\xF3n est\xE1 llena, informar pr\xF3xima fecha disponible antes de aceptar un pedido urgente.",
    link: "https://invitaciones.arxmedia.es",
    image: "",
    format: "Publicaci\xF3n",
    owner: "Por asignar"
  },
  {
    id: "plan-2026-arx-089",
    calendar: "arx-plan-media-2026",
    title: "Producci\xF3n de febrero y selecci\xF3n de aprendizajes",
    date: "2027-01-26",
    status: "Pendiente",
    text: "Reservar 90 min para dos piezas del servicio que m\xE1s oportunidades \xFAtiles gener\xF3. Preparar un caso o demo y una pieza educativa.\nActualizar guiones con las objeciones reales del trimestre. Mantener lo que ayuda a reservar y descartar formatos que solo aportan alcance sin intenci\xF3n.\nResultado: primera semana de febrero preparada, sin ampliar autom\xE1ticamente gasto.",
    link: "https://arxmedia.es",
    image: "",
    format: "Producci\xF3n",
    owner: "Por asignar"
  },
  {
    id: "plan-2026-wow-090",
    calendar: "arx-plan-wow-2026",
    title: "Producci\xF3n de febrero a partir de las demos ganadoras",
    date: "2027-01-27",
    status: "Pendiente",
    text: "Seleccionar experiencia con m\xE1s pruebas y compras, no solo reproducciones. Crear dos nuevas aperturas para esa demo y una pieza que responda la principal objeci\xF3n.\nDefinir si conviene una colaboraci\xF3n con un proveedor de bodas; preparar propuesta, sin contactar a nadie autom\xE1ticamente.\nMantener el concurso como aprendizaje cerrado, no repetirlo sin revisar calidad de participantes y coste.",
    link: "https://invitaciones.arxmedia.es",
    image: "",
    format: "Producci\xF3n",
    owner: "Por asignar"
  },
  {
    id: "plan-2026-arx-091",
    calendar: "arx-plan-media-2026",
    title: "Cierre del ciclo y plan del siguiente mes",
    date: "2027-01-29",
    status: "Pendiente",
    text: "Comparar octubre\u2013enero: consultas cualificadas, propuestas, reservas, facturaci\xF3n, gasto, margen y horas de entrega.\nElegir tres decisiones para febrero: servicio principal, ritmo de contenido sostenible y capacidad m\xE1xima. Cerrar tareas realmente hechas y reprogramar pendientes con motivo.\nEste calendario es una propuesta de trabajo; los estados se actualizan al ejecutar, no por llegar la fecha.",
    link: "https://arxmedia.es",
    image: "",
    format: "Revisi\xF3n",
    owner: "Por asignar"
  },
  {
    id: "plan-2026-wow-092",
    calendar: "arx-plan-wow-2026",
    title: "Balance: ventas, entregas y pr\xF3xima campa\xF1a",
    date: "2027-01-29",
    status: "Pendiente",
    text: "Comparar colecci\xF3n, mercado y origen: demos, selecciones, pagos, ventas, tiempos de entrega y soporte. Incluir coste del concurso y ventas atribuibles solo cuando haya evidencia.\nElegir tres decisiones para febrero: demo protagonista, mejora de compra y siguiente producci\xF3n. Valorar concurso nuevo solo si el primero atrajo parejas relevantes.\nResolver tareas pendientes antes de sumar promociones. No inventar cifras de \xE9xito para generar urgencia.",
    link: "https://invitaciones.arxmedia.es",
    image: "",
    format: "Revisi\xF3n",
    owner: "Por asignar"
  }
];

// app/api/plan/import.ts
var planId = "arx-q4-2026-v2";
async function importPlan(db, plan, oldPlan) {
  const previous = await db.prepare("SELECT id FROM plan_imports WHERE id=?").bind(planId).first();
  let archived = 0, preserved = 0;
  if (!previous) {
    const existing = (await db.prepare("SELECT id,calendar,data FROM events WHERE space=?").bind("arx").all()).results;
    const old = new Map(oldPlan.map(({ id, calendar, ...data }) => [id, { calendar, data }]));
    const unchanged = existing.filter((row) => {
      const original = old.get(row.id);
      if (!original) return false;
      try {
        const data = JSON.parse(row.data);
        const same = row.calendar === original.calendar && JSON.stringify(Object.entries(data).sort()) === JSON.stringify(Object.entries(original.data).sort());
        if (!same) preserved++;
        return same;
      } catch {
        preserved++;
        return false;
      }
    });
    const now = (/* @__PURE__ */ new Date()).toISOString();
    const archiveWrites = [];
    for (let i = 0; i < unchanged.length; i += 25) {
      const group = unchanged.slice(i, i + 25);
      const where = "space=? AND (" + group.map(() => "(id=? AND data=?)").join(" OR ") + ")";
      const args = group.flatMap((x) => [x.id, x.data]);
      archiveWrites.push(db.prepare("INSERT OR IGNORE INTO plan_archives(id,space,calendar,data,archived) SELECT id,space,calendar,data,? FROM events WHERE " + where).bind(now, "arx", ...args));
      archiveWrites.push(db.prepare("DELETE FROM events WHERE " + where).bind("arx", ...args));
    }
    const writes = [
      db.prepare("INSERT OR IGNORE INTO spaces(id,name) VALUES(?,?)").bind("arx", "ARX"),
      db.prepare("INSERT OR IGNORE INTO calendars(id,space,name,color) VALUES(?,?,?,?)").bind("arx-plan-media-2026", "arx", "ARX Media \xB7 Plan", "#a78bfa"),
      db.prepare("INSERT OR IGNORE INTO calendars(id,space,name,color) VALUES(?,?,?,?)").bind("arx-plan-wow-2026", "arx", "WOW Invitaciones \xB7 Plan", "#c79ab9"),
      ...archiveWrites,
      ...plan.map(({ id, calendar, ...event }) => db.prepare("INSERT OR IGNORE INTO events(id,space,calendar,data) VALUES(?,?,?,?)").bind(id, "arx", calendar, JSON.stringify(event))),
      db.prepare("INSERT OR IGNORE INTO plan_imports(id,created) VALUES(?,?)").bind(planId, now)
    ];
    await db.batch(writes);
    archived = unchanged.length;
  }
  const summary = await db.prepare("SELECT calendar,COUNT(*) AS total FROM events WHERE space=? AND calendar IN (?,?) GROUP BY calendar").bind("arx", "arx-plan-media-2026", "arx-plan-wow-2026").all();
  return { ok: true, imported: !previous, plan: planId, archived, preserved, calendars: summary.results };
}

// app/api/plan/route.ts
var dynamic2 = "force-dynamic";
async function POST3(req) {
  const origin = req.headers.get("origin");
  if (origin && origin !== new URL(req.url).origin) return Response.json({ error: "Sin acceso" }, { status: 403 });
  try {
    const b = await req.json();
    if (!env3.ARX_PASSWORD || b.password !== env3.ARX_PASSWORD) return Response.json({ error: "Sin acceso" }, { status: 403 });
    if (!env3.DB) return Response.json({ error: "Base de datos no disponible" }, { status: 503 });
    return Response.json(await importPlan(env3.DB, plan_default, plan_v1_default), { headers: { "Cache-Control": "no-store" } });
  } catch {
    return Response.json({ error: "No se pudo cargar el plan" }, { status: 500 });
  }
}

// app/api/shared-image/route.ts
var route_exports4 = {};
__export(route_exports4, {
  GET: () => GET3
});
import { env as env4 } from "cloudflare:workers";
async function GET3(req) {
  const p = new URL(req.url).searchParams;
  const token = p.get("token") || "", key2 = p.get("key") || "";
  const s = await env4.DB.prepare("SELECT space,calendar FROM studio_links WHERE id=? AND kind=?").bind(token, "read").first();
  if (!s || key2.split("/")[0] !== s.space) return new Response("", { status: 404 });
  const rows = (await env4.DB.prepare("SELECT data FROM events WHERE space=? AND calendar=?").bind(s.space, s.calendar).all()).results;
  const found = rows.some((r) => {
    try {
      return new URL(JSON.parse(r.data).image, "https://site.local").searchParams.get("key") === key2;
    } catch {
      return false;
    }
  });
  if (!found) return new Response("", { status: 404 });
  const o = await env4.BUCKET.get(key2);
  return o ? new Response(o.body, { headers: { "Content-Type": o.httpMetadata.contentType, "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff" } }) : new Response("", { status: 404 });
}

// app/api/studio/route.ts
var route_exports5 = {};
__export(route_exports5, {
  GET: () => GET4,
  POST: () => POST4
});
import { env as env5 } from "cloudflare:workers";
var json2 = (d, s = 200) => Response.json(d, { status: s, headers: { "Cache-Control": "no-store" } });
async function allowed(user, space) {
  return env5.DB.prepare("SELECT id FROM members WHERE user=? AND space=?").bind(user, space).first();
}
async function GET4(req) {
  const u = await getChatGPTUser();
  if (!u) return json2({ error: "Inicia sesi\xF3n" }, 401);
  const space = new URL(req.url).searchParams.get("space") || "";
  if (!await allowed(u.userId, space)) return json2({ error: "Sin acceso" }, 403);
  return json2({ boards: (await env5.DB.prepare("SELECT * FROM studio_boards WHERE space=?").bind(space).all()).results, refs: (await env5.DB.prepare("SELECT * FROM studio_refs WHERE space=?").bind(space).all()).results.map((r) => ({ ...JSON.parse(r.data), id: r.id, board: r.board })), settings: JSON.parse((await env5.DB.prepare("SELECT data FROM studio_settings WHERE id=?").bind(u.userId + ":" + space).first())?.data || "{}"), links: (await env5.DB.prepare("SELECT * FROM studio_links WHERE space=?").bind(space).all()).results, members: (await env5.DB.prepare("SELECT name FROM members WHERE space=?").bind(space).all()).results });
}
async function POST4(req) {
  const u = await getChatGPTUser();
  if (!u) return json2({ error: "Inicia sesi\xF3n" }, 401);
  const origin = req.headers.get("origin");
  if (origin && origin !== new URL(req.url).origin) return json2({ error: "Sin acceso" }, 403);
  try {
    const b = await req.json();
    if (b.action === "accept") {
      const link = await env5.DB.prepare("SELECT * FROM studio_links WHERE id=? AND kind=?").bind(b.token, "invite").first();
      if (!link) return json2({ error: "La invitaci\xF3n ya no est\xE1 disponible" }, 404);
      if (await allowed(u.userId, link.space)) return json2({ space: link.space });
      await env5.DB.prepare("INSERT OR IGNORE INTO members VALUES(?,?,?,?)").bind(u.userId + ":" + link.space, u.userId, link.space, u.displayName).run();
      return json2({ space: link.space });
    }
    if (!await allowed(u.userId, b.space)) return json2({ error: "Sin acceso" }, 403);
    const id = crypto.randomUUID();
    if (b.action === "board") {
      if (!String(b.title || "").trim()) throw Error("Nombra tu tablero.");
      await env5.DB.prepare("INSERT INTO studio_boards VALUES(?,?,?)").bind(id, b.space, b.title.trim().slice(0, 100)).run();
      return json2({ id });
    }
    if (b.action === "reference") {
      if (!await env5.DB.prepare("SELECT id FROM studio_boards WHERE id=? AND space=?").bind(b.board, b.space).first()) throw Error("Tablero no v\xE1lido.");
      if (!String(b.title || "").trim()) throw Error("Escribe un t\xEDtulo.");
      const data = JSON.stringify({ title: String(b.title).slice(0, 180), text: String(b.text || "").slice(0, 3e3), decision: String(b.decision || "").slice(0, 1e3), image: /^\/api\/image\?key=/.test(b.image) ? String(b.image).slice(0, 600) : "", url: /^https?:\/\//.test(b.url) ? String(b.url).slice(0, 2e3) : "", color: /^#[a-f\d]{6}$/i.test(b.color) ? b.color : "#d5bce8", taskId: String(b.taskId || "").slice(0, 100) });
      if (b.id) await env5.DB.prepare("UPDATE studio_refs SET data=?,board=? WHERE id=? AND space=?").bind(data, b.board, b.id, b.space).run();
      else await env5.DB.prepare("INSERT INTO studio_refs VALUES(?,?,?,?)").bind(id, b.space, b.board, data).run();
      return json2({ id: b.id || id });
    }
    if (b.action === "removeReference") {
      await env5.DB.prepare("DELETE FROM studio_refs WHERE id=? AND space=?").bind(b.id, b.space).run();
      return json2({ ok: true });
    }
    if (b.action === "settings") {
      await env5.DB.prepare("INSERT OR REPLACE INTO studio_settings VALUES(?,?)").bind(u.userId + ":" + b.space, JSON.stringify({ daily: Math.max(60, Math.min(480, Number(b.daily) || 180)), weekends: Boolean(b.weekends) })).run();
      return json2({ ok: true });
    }
    if (b.action === "link") {
      if (!["read", "invite"].includes(b.kind)) throw Error("Tipo de enlace no v\xE1lido.");
      if (b.kind === "read" && !await env5.DB.prepare("SELECT id FROM calendars WHERE id=? AND space=?").bind(b.calendar, b.space).first()) throw Error("Elige un calendario.");
      const token = crypto.randomUUID() + crypto.randomUUID().slice(0, 8);
      await env5.DB.prepare("INSERT INTO studio_links VALUES(?,?,?,?,?)").bind(token, b.space, b.kind === "read" ? b.calendar : null, b.kind, (/* @__PURE__ */ new Date()).toISOString()).run();
      return json2({ id: token });
    }
    if (b.action === "revoke") {
      await env5.DB.prepare("DELETE FROM studio_links WHERE id=? AND space=?").bind(b.id, b.space).run();
      return json2({ ok: true });
    }
    throw Error("Acci\xF3n no v\xE1lida.");
  } catch (e) {
    return json2({ error: e.message || "No se pudo guardar" }, 400);
  }
}

// portable/shared-calendar.ts
var shared_calendar_exports = {};
__export(shared_calendar_exports, {
  GET: () => GET5
});
import { env as env6 } from "cloudflare:workers";
async function GET5(req) {
  const token = new URL(req.url).searchParams.get("token") || "";
  const share = await env6.DB.prepare("SELECT calendar,space FROM studio_links WHERE id=? AND kind=?").bind(token, "read").first();
  if (!share) return Response.json({ error: "El enlace no est\xE1 disponible." }, { status: 404 });
  const calendar = await env6.DB.prepare("SELECT name FROM calendars WHERE id=? AND space=?").bind(share.calendar, share.space).first();
  if (!calendar) return Response.json({ error: "Calendario no disponible." }, { status: 404 });
  const rows = await env6.DB.prepare("SELECT data FROM events WHERE calendar=? AND space=?").bind(share.calendar, share.space).all();
  const tasks = rows.results.map((row) => JSON.parse(row.data)).map((task) => ({ ...task, image: task.image ? "/api/shared-image?token=" + encodeURIComponent(token) + "&key=" + encodeURIComponent(new URL(task.image, "https://site.local").searchParams.get("key") || "") : "" }));
  return Response.json({ calendar, tasks }, { headers: { "Cache-Control": "no-store" } });
}

// portable/routes.ts
var project = "hylia";
var routes = { "/api/data": route_exports, "/api/image": route_exports2, "/api/plan": route_exports3, "/api/shared-image": route_exports4, "/api/studio": route_exports5, "/api/shared-calendar": shared_calendar_exports };

// portable/worker.ts
import { env as env7 } from "cloudflare:workers";
var runtime = () => env7;
var json3 = (body, status = 200) => Response.json(body, { status, headers: { "Cache-Control": "no-store" } });
function allowed2(origin, url) {
  return !origin || origin === url.origin || String(runtime().APP_ORIGIN || "").split(",").map((x) => x.trim()).includes(origin);
}
function cors(response, origin) {
  const headers = new Headers(response.headers);
  headers.set("Vary", "Origin");
  headers.set("Cache-Control", "no-store, private");
  headers.set("X-Content-Type-Options", "nosniff");
  headers.set("Referrer-Policy", "no-referrer");
  if (origin) {
    headers.set("Access-Control-Allow-Origin", origin);
    headers.set("Access-Control-Allow-Headers", "Authorization,Content-Type");
    headers.set("Access-Control-Allow-Methods", "GET,POST,PUT,DELETE,OPTIONS");
    headers.set("Access-Control-Max-Age", "600");
  }
  return new Response(response.body, { status: response.status, headers });
}
async function login(req) {
  const e = runtime();
  if (!e.DB || !e.APP_USERS_JSON || !e.APP_SESSION_SECRET) return json3({ error: "Configura la base de datos y los secretos de la API." }, 503);
  if (Number(req.headers.get("content-length") || 0) > 4096) return json3({ error: "Solicitud inv\xE1lida" }, 413);
  const raw = await req.text();
  if (raw.length > 4096) return json3({ error: "Solicitud inv\xE1lida" }, 413);
  let body;
  try {
    body = JSON.parse(raw);
  } catch {
    return json3({ error: "Solicitud inv\xE1lida" }, 400);
  }
  const username = String(body.username || "").trim().toLowerCase();
  const ip = req.headers.get("cf-connecting-ip") || "local";
  const bucket = String(Math.floor(Date.now() / 3e5));
  for (const id of ["ip:" + ip + ":" + bucket, "user:" + username + ":" + bucket]) {
    await e.DB.prepare("INSERT INTO portable_login_attempts(id,attempts,reset_at) VALUES(?,1,?) ON CONFLICT(id) DO UPDATE SET attempts=attempts+1").bind(id, Date.now() + 3e5).run();
    const count = await e.DB.prepare("SELECT attempts FROM portable_login_attempts WHERE id=?").bind(id).first();
    if (count.attempts > 10) return json3({ error: "Demasiados intentos. Espera cinco minutos." }, 429);
  }
  await e.DB.prepare("DELETE FROM portable_login_attempts WHERE reset_at<?").bind(Date.now()).run();
  let users;
  try {
    users = JSON.parse(e.APP_USERS_JSON);
  } catch {
    return json3({ error: "APP_USERS_JSON no es v\xE1lido." }, 503);
  }
  const account = Array.isArray(users) ? users.find((x) => String(x.username || "").toLowerCase() === username) : null;
  if (!account || typeof body.password !== "string" || !await samePassword(body.password, String(account.password || ""))) return json3({ error: "Usuario o clave incorrectos." }, 401);
  if (String(account.password).length < 12) return json3({ error: "Configura una clave de acceso de al menos 12 caracteres." }, 503);
  const user = { userId: String(account.id || "github:" + username), displayName: String(account.name || username), email: String(account.email || username + "@private.local"), fullName: String(account.name || username) };
  return json3({ user, token: await issueToken(user, e.APP_SESSION_SECRET), imageToken: await issueToken(user, e.APP_SESSION_SECRET, "images") });
}
var worker_default = { async fetch(request) {
  const url = new URL(request.url), origin = request.headers.get("origin");
  if (!allowed2(origin, url)) return json3({ error: "Origen no autorizado." }, 403);
  const finish = (r) => cors(r, origin);
  if (request.method === "OPTIONS") return finish(new Response(null, { status: 204 }));
  try {
    if (url.pathname === "/api/health") return finish(json3({ ok: true, project }));
    if (url.pathname === "/api/auth/login" && request.method === "POST") return finish(await login(request));
    const bearer = request.headers.get("authorization")?.match(/^Bearer (.+)$/)?.[1] || "";
    let user = await verifyToken(bearer, String(runtime().APP_SESSION_SECRET || ""));
    if (!user && request.method === "GET" && url.pathname === "/api/image") user = await verifyToken(url.searchParams.get("image_token") || "", String(runtime().APP_SESSION_SECRET || ""), "images");
    const publicRoute = request.method === "GET" && ["/api/market", "/api/shared-calendar", "/api/shared-image"].includes(url.pathname);
    if (!user && !publicRoute) return finish(json3({ error: "Inicia sesi\xF3n para continuar." }, 401));
    if (url.pathname === "/api/auth/me") return finish(json3({ user }));
    if (url.pathname === "/api/site-access") return finish(json3({ ok: true }));
    const route = routes[url.pathname], handler = route?.[request.method];
    if (!handler) return finish(json3({ error: "Ruta no disponible." }, 404));
    const headers = new Headers(request.headers);
    headers.set("Origin", url.origin);
    for (const name of [...headers.keys()]) if (name.startsWith("oai-authenticated-")) headers.delete(name);
    const normalized = new Request(request, { headers });
    const response = await identity.run(user, () => handler(normalized));
    return finish(response);
  } catch (error) {
    if (error instanceof Response) return finish(error);
    console.error("API request failed", url.pathname, error instanceof Error ? error.message : "unknown");
    return finish(json3({ error: "No se pudo completar la solicitud. Revisa la configuraci\xF3n de la API." }, 500));
  }
} };
export {
  worker_default as default
};
