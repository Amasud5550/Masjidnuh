import { getOAuthCookie, clearOAuthCookie, makeSession } from '../../lib/session.js';
import { redeemCode } from '../../lib/microsoft.js';
import { messagePage } from '../../lib/page.js';
import { groupIds, groupMode, owners } from '../../lib/db.js';

// GET /auth/callback  <-  Microsoft sends the person back here after sign-in
export async function onRequestGet({ request, env }) {
  const url = new URL(request.url);
  const retry = { href: '/auth/login', label: 'Try signing in again' };
  const home = { href: '/', label: 'Back to the website' };

  if (url.searchParams.get('error')) {
    const cancelled = url.searchParams.get('error') === 'access_denied';
    return messagePage(cancelled ? 'Sign-in cancelled' : 'Microsoft couldn’t sign you in',
      cancelled ? 'You didn’t finish signing in. You can try again whenever you’re ready.' : (url.searchParams.get('error_description') || 'Microsoft returned an error.').split('\n')[0].slice(0, 200),
      { status: 400, primary: retry, secondary: home });
  }

  const saved = await getOAuthCookie(request, env);
  const code = url.searchParams.get('code'), state = url.searchParams.get('state');
  if (!saved || !code || state !== saved.state) {
    return messagePage('Sign-in link expired', 'This sign-in took too long or was opened in a different browser. Start again from the sign-in button.', { status: 400, primary: retry, secondary: home });
  }

  let user;
  try { user = await redeemCode(env, request, code, saved.verifier, saved.nonce); }
  catch (e) {
    console.error('Microsoft sign-in failed', e.message);
    return messagePage('Microsoft couldn’t sign you in', 'Something went wrong while finishing sign-in. Try again, and if it keeps happening, check the Microsoft sign-in settings for this site.', { status: 502, primary: retry, secondary: home });
  }

  // Keep only the allowed groups this person belongs to
  const allowed = groupIds(env);
  const grps = user.groups.filter(g => allowed.includes(g));
  if (groupMode(env) && !grps.length && user.groupsOverflow && !owners(env).includes(user.email)) {
    return messagePage('Your account is in too many groups', 'Microsoft didn’t send your group list because your account belongs to a very large number of groups. Ask your Microsoft 365 admin to set the app’s groups claim to “Groups assigned to the application”.', { status: 403, secondary: home });
  }

  const headers = new Headers({ Location: saved.next || '/admin/', 'Cache-Control': 'no-store' });
  headers.append('Set-Cookie', await makeSession({ email: user.email, name: user.name, grps }, env.SESSION_SECRET));
  headers.append('Set-Cookie', clearOAuthCookie());
  return new Response(null, { status: 302, headers });
}
