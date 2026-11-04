/**
 * Microsoft sign-in (OpenID Connect authorization code flow with PKCE).
 *
 * Settings (Cloudflare Pages > Settings > Variables and Secrets):
 *   MS_CLIENT_ID      Application (client) ID from the Entra app registration
 *   MS_CLIENT_SECRET  Client secret value from the app registration (store as a secret)
 *   MS_TENANT         "common" (any Microsoft account, the default), "organizations",
 *                     "consumers", or your directory (tenant) ID to allow only your organization
 */
export const authority = env => (env.MS_AUTHORITY || 'https://login.microsoftonline.com').replace(/\/$/, '');
export const tenant = env => env.MS_TENANT || 'common';
export const redirectUri = request => new URL('/auth/callback', request.url).toString();

export function authorizeUrl(env, request, { state, nonce, challenge }) {
  const u = new URL(`${authority(env)}/${tenant(env)}/oauth2/v2.0/authorize`);
  u.search = new URLSearchParams({
    client_id: env.MS_CLIENT_ID,
    response_type: 'code',
    redirect_uri: redirectUri(request),
    response_mode: 'query',
    scope: 'openid profile email',
    state, nonce,
    code_challenge: challenge,
    code_challenge_method: 'S256',
    prompt: 'select_account'
  }).toString();
  return u.toString();
}

/**
 * Exchanges the code for tokens and returns the signed-in user.
 * The ID token comes straight from Microsoft's token endpoint over HTTPS, in exchange for
 * our client secret, so its claims can be trusted without a separate signature check
 * (OpenID Connect Core 1.0, section 3.1.3.7). We still check audience, issuer, expiry and nonce.
 */
export async function redeemCode(env, request, code, verifier, nonce) {
  const res = await fetch(`${authority(env)}/${tenant(env)}/oauth2/v2.0/token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: env.MS_CLIENT_ID,
      client_secret: env.MS_CLIENT_SECRET,
      grant_type: 'authorization_code',
      code,
      redirect_uri: redirectUri(request),
      code_verifier: verifier,
      scope: 'openid profile email'
    })
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok || !body.id_token) throw new Error('Token exchange failed: ' + (body.error_description || body.error || res.status));

  const payload = JSON.parse(new TextDecoder().decode(Uint8Array.from(atob(body.id_token.split('.')[1].replace(/-/g, '+').replace(/_/g, '/')), c => c.charCodeAt(0))));
  const now = Math.floor(Date.now() / 1000);
  if (payload.aud !== env.MS_CLIENT_ID) throw new Error('ID token audience does not match');
  if (!String(payload.iss || '').startsWith(authority(env) + '/') || !String(payload.iss).endsWith('/v2.0')) throw new Error('ID token issuer is not Microsoft');
  if (!payload.exp || payload.exp < now - 60) throw new Error('ID token has expired');
  if (payload.nonce !== nonce) throw new Error('ID token nonce does not match');

  const email = String(payload.email || payload.preferred_username || '').trim().toLowerCase();
  if (!email.includes('@')) throw new Error('Microsoft did not return an email address for this account');
  return { email, name: payload.name || email };
}
