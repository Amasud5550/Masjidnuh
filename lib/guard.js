/**
 * Shared helpers for API routes: JSON responses and the admin check.
 */
import { getSession } from './session.js';
import { isAdmin } from './db.js';

export function json(data, status = 200, headers = {}) {
  return new Response(JSON.stringify(data), { status, headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', ...headers } });
}

/**
 * Returns { user } for a signed-in admin, or a Response to send back.
 * Changes (PUT/POST/DELETE) must also come from this site's own pages.
 */
export async function requireAdmin(context) {
  const { request, env } = context;
  if (!['GET', 'HEAD'].includes(request.method)) {
    const origin = request.headers.get('Origin');
    if (origin !== new URL(request.url).origin) return json({ error: 'This request must come from the Masjid Nuh dashboard.' }, 403);
  }
  const s = await getSession(request, env);
  if (!s) return json({ error: 'Your sign-in has expired. Sign in again to continue.' }, 401);
  if (!(await isAdmin(env, s.email))) return json({ error: 'Your account is not an admin for this site.' }, 403);
  return { user: s };
}

export function errorResponse(e) {
  console.error(e);
  return json({ error: 'Something went wrong on the server. Try again in a minute.' }, 500);
}
