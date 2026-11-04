import { getSession } from '../../lib/session.js';
import { isAdmin } from '../../lib/db.js';
import { messagePage } from '../../lib/page.js';

// Everything under /admin requires a signed-in admin.
export async function onRequest(context) {
  const { request, env, next } = context;
  let s = null;
  try { s = await getSession(request, env); } catch (e) {
    return messagePage('Sign-in isn’t set up yet', 'SESSION_SECRET is missing or too short in the Cloudflare Pages settings.', { status: 500 });
  }
  if (!s) {
    const u = new URL(request.url);
    return new Response(null, { status: 302, headers: { Location: '/auth/login?next=' + encodeURIComponent(u.pathname + u.search), 'Cache-Control': 'no-store' } });
  }
  let ok = false;
  try { ok = await isAdmin(env, s.email); } catch (e) {
    console.error(e);
    return messagePage('The dashboard can’t reach its database', 'Check that a D1 database is bound to this Pages project with the variable name DB.', { status: 500 });
  }
  if (!ok) {
    const page = await env.ASSETS.fetch(new URL('/403', request.url));
    return new Response(page.body, { status: 403, headers: { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' } });
  }
  const res = await next();
  const out = new Response(res.body, res);
  out.headers.set('Cache-Control', 'no-store');
  out.headers.set('X-Robots-Tag', 'noindex');
  return out;
}
