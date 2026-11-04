import { clearSession } from '../../lib/session.js';
import { safeNext } from '../../lib/page.js';

// GET /auth/logout?next=/  ->  signs out of this site
export async function onRequestGet({ request }) {
  const n = new URL(request.url).searchParams.get('next');
  return new Response(null, { status: 302, headers: { Location: n ? safeNext(n) : '/', 'Set-Cookie': clearSession(), 'Cache-Control': 'no-store' } });
}
