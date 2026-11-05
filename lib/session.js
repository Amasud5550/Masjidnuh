/**
 * Signed cookies for the sign-in flow and admin sessions.
 * Cookies are HMAC-SHA256 signed with SESSION_SECRET, so they can't be edited by the browser.
 */
const enc = new TextEncoder();
const SESSION = '__Host-mn_session';
const OAUTH = '__Host-mn_oauth';
export const SESSION_HOURS = 8;

export function b64url(bytes) {
  let s = ''; for (const b of new Uint8Array(bytes)) s += String.fromCharCode(b);
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}
export function b64urlDecode(str) {
  const s = str.replace(/-/g, '+').replace(/_/g, '/') + '==='.slice((str.length + 3) % 4);
  return Uint8Array.from(atob(s), c => c.charCodeAt(0));
}
export const randomToken = (n = 32) => b64url(crypto.getRandomValues(new Uint8Array(n)));
export async function sha256(text) { return b64url(await crypto.subtle.digest('SHA-256', enc.encode(text))); }

async function key(secret) {
  if (!secret || secret.length < 32) throw new Error('SESSION_SECRET must be set to a random value of at least 32 characters.');
  return crypto.subtle.importKey('raw', enc.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign', 'verify']);
}
async function seal(obj, secret) {
  const body = b64url(enc.encode(JSON.stringify(obj)));
  const sig = b64url(await crypto.subtle.sign('HMAC', await key(secret), enc.encode(body)));
  return body + '.' + sig;
}
async function unseal(token, secret) {
  if (!token || token.indexOf('.') < 0) return null;
  const [body, sig] = token.split('.');
  let ok = false;
  try { ok = await crypto.subtle.verify('HMAC', await key(secret), b64urlDecode(sig), enc.encode(body)); } catch { return null; }
  if (!ok) return null;
  try {
    const obj = JSON.parse(new TextDecoder().decode(b64urlDecode(body)));
    return obj.exp && obj.exp > Date.now() ? obj : null;
  } catch { return null; }
}

export function readCookie(request, name) {
  const h = request.headers.get('Cookie') || '';
  for (const part of h.split(/;\s*/)) { const i = part.indexOf('='); if (i > 0 && part.slice(0, i) === name) return part.slice(i + 1); }
  return null;
}
const cookie = (name, value, maxAge) => `${name}=${value}; Path=/; Secure; HttpOnly; SameSite=Lax; Max-Age=${maxAge}`;

export async function makeSession(user, secret) {
  // grps: the allowed Entra groups this person was in when they signed in (signed, so it can't be edited)
  const v = await seal({ email: user.email, name: user.name, grps: user.grps || [], exp: Date.now() + SESSION_HOURS * 3600e3 }, secret);
  return cookie(SESSION, v, SESSION_HOURS * 3600);
}
export async function getSession(request, env) { return unseal(readCookie(request, SESSION), env.SESSION_SECRET); }
export const clearSession = () => cookie(SESSION, '', 0);

export async function makeOAuthCookie(data, secret) { return cookie(OAUTH, await seal({ ...data, exp: Date.now() + 10 * 60e3 }, secret), 600); }
export async function getOAuthCookie(request, env) { return unseal(readCookie(request, OAUTH), env.SESSION_SECRET); }
export const clearOAuthCookie = () => cookie(OAUTH, '', 0);
