import { randomToken, sha256, makeOAuthCookie } from '../../lib/session.js';
import { authorizeUrl } from '../../lib/microsoft.js';
import { messagePage, safeNext } from '../../lib/page.js';

// GET /auth/login?next=/admin/  ->  Microsoft sign-in page
export async function onRequestGet({ request, env }) {
  if (!env.MS_CLIENT_ID || !env.MS_CLIENT_SECRET || !env.SESSION_SECRET) {
    return messagePage('Sign-in isn’t set up yet', 'The site is missing its Microsoft sign-in settings. Add MS_CLIENT_ID, MS_CLIENT_SECRET and SESSION_SECRET in the Cloudflare Pages settings, then redeploy.', { status: 500, secondary: { href: '/', label: 'Back to the website' } });
  }
  const next = safeNext(new URL(request.url).searchParams.get('next'));
  const state = randomToken(), nonce = randomToken(), verifier = randomToken(48);
  const challenge = await sha256(verifier);
  return new Response(null, {
    status: 302,
    headers: {
      Location: authorizeUrl(env, request, { state, nonce, challenge }),
      'Set-Cookie': await makeOAuthCookie({ state, nonce, verifier, next }, env.SESSION_SECRET),
      'Cache-Control': 'no-store'
    }
  });
}
