import { readImage } from '../../../../lib/tvdb.js';

// GET /api/slides/:id/image?v=…  (public) — the slide's picture
export async function onRequestGet(context) {
  const { request, env, params } = context;
  if (!/^\d{1,9}$/.test(String(params.id))) return new Response('Not found', { status: 404 });
  const cache = typeof caches !== 'undefined' ? caches.default : null;
  if (cache) { const hit = await cache.match(request); if (hit) return hit; }
  try {
    const img = await readImage(env, Number(params.id));
    if (!img) return new Response('Not found', { status: 404, headers: { 'Cache-Control': 'no-store' } });
    const versioned = new URL(request.url).searchParams.has('v');
    const res = new Response(img.bytes, { headers: {
      'Content-Type': img.mime,
      'Cache-Control': versioned ? 'public, max-age=31536000, immutable' : 'public, max-age=300',
      'X-Content-Type-Options': 'nosniff'
    } });
    if (cache && versioned) context.waitUntil(cache.put(request, res.clone()));
    return res;
  } catch (e) {
    console.error(e);
    return new Response('Could not load the picture', { status: 500 });
  }
}
