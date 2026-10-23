import {env} from 'cloudflare:workers';

export const MAX_IMAGE_BYTES = 1024 * 1024;
export const IMAGE_TYPES = ['image/png', 'image/jpeg', 'image/webp', 'image/gif'];

export async function storeImage(key: string, file: File) {
  await env.DB!.prepare('INSERT INTO image_objects (key, content_type, data, created_at) VALUES (?, ?, ?, ?)')
    .bind(key, file.type, await file.arrayBuffer(), Date.now()).run();
}

export async function imageResponse(key: string, cacheControl: string) {
  const row = await env.DB!.prepare('SELECT content_type, data FROM image_objects WHERE key = ?')
    .bind(key).first<{content_type: string; data: number[]}>();
  if (!row) return new Response('', {status: 404});
  return new Response(new Uint8Array(row.data), {headers: {
    'Content-Type': row.content_type,
    'Cache-Control': cacheControl,
    'X-Content-Type-Options': 'nosniff',
  }});
}
