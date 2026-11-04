import { json, requireAdmin, errorResponse } from '../../lib/guard.js';
import { getSettings, saveSettings } from '../../lib/db.js';
import { validate } from '../../lib/validate.js';

// GET /api/settings  (public) — the website reads its prayer settings here
export async function onRequestGet({ env }) {
  try {
    const s = await getSettings(env);
    if (!s) return json({ error: 'No settings saved yet. The site will use its built-in defaults.' }, 404);
    return json(s, 200, { 'Cache-Control': 'public, max-age=30' });
  } catch (e) { return errorResponse(e); }
}

// PUT /api/settings  (admins only)
export async function onRequestPut(context) {
  const auth = await requireAdmin(context);
  if (auth instanceof Response) return auth;
  let body;
  try { body = await context.request.json(); } catch { return json({ error: 'The request body must be JSON.' }, 400); }
  const { value, errors } = validate(body);
  if (errors) return json({ error: 'Some settings are not valid.', details: errors }, 400);
  try { return json(await saveSettings(context.env, value, auth.user.email)); }
  catch (e) { return errorResponse(e); }
}
