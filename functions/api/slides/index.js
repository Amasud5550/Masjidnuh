import { json, requireAdmin, errorResponse } from '../../../lib/guard.js';
import { listSlides, createSlide, countSlides } from '../../../lib/tvdb.js';
import { validateSlide, MAX_SLIDES } from '../../../lib/tv.js';

// GET /api/slides  (admins only) — every slide, including ones that are off
export async function onRequestGet(context) {
  const auth = await requireAdmin(context);
  if (auth instanceof Response) return auth;
  try { return json(await listSlides(context.env)); } catch (e) { return errorResponse(e); }
}

// POST /api/slides  (admins only) — add a slide
export async function onRequestPost(context) {
  const auth = await requireAdmin(context);
  if (auth instanceof Response) return auth;
  let body; try { body = await context.request.json(); } catch { return json({ error: 'The request body must be JSON.' }, 400); }
  const { value, image, errors } = validateSlide(body, { creating: true });
  if (errors) return json({ error: 'This slide can’t be saved yet.', details: errors }, 400);
  try {
    if (await countSlides(context.env) >= MAX_SLIDES) return json({ error: `You can have up to ${MAX_SLIDES} slides. Delete an old one first.` }, 400);
    return json(await createSlide(context.env, value, image, auth.user.email), 201);
  } catch (e) { return errorResponse(e); }
}
