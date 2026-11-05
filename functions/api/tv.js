import { json, requireAdmin, errorResponse } from '../../lib/guard.js';
import { getTvSettings, saveTvSettings, listSlides } from '../../lib/tvdb.js';
import { validateTv } from '../../lib/tv.js';

// GET /api/tv  (public) — everything the TV screen needs apart from prayer settings
export async function onRequestGet({ env }) {
  try {
    const [settings, slides] = await Promise.all([getTvSettings(env), listSlides(env, { enabledOnly: true })]);
    const pub = slides.map(({ updatedBy, updatedAt, enabled, sort, ...s }) => s);
    return json({ settings, slides: pub }, 200, { 'Cache-Control': 'public, max-age=30' });
  } catch (e) { return errorResponse(e); }
}

// PUT /api/tv  (admins only) — TV settings
export async function onRequestPut(context) {
  const auth = await requireAdmin(context);
  if (auth instanceof Response) return auth;
  let body; try { body = await context.request.json(); } catch { return json({ error: 'The request body must be JSON.' }, 400); }
  const { value, errors } = validateTv(body);
  if (errors) return json({ error: 'Some TV settings are not valid.', details: errors }, 400);
  try { return json(await saveTvSettings(context.env, value, auth.user.email)); }
  catch (e) { return errorResponse(e); }
}
