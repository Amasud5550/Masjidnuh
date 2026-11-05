import { json, requireAdmin, errorResponse } from '../../../lib/guard.js';
import { updateSlide, deleteSlide, getSlide } from '../../../lib/tvdb.js';
import { validateSlide } from '../../../lib/tv.js';

const slideId = p => (/^\d{1,9}$/.test(String(p.id)) ? Number(p.id) : null);

// PUT /api/slides/:id  (admins only) — change a slide; send `image` only to replace the picture
export async function onRequestPut(context) {
  const auth = await requireAdmin(context);
  if (auth instanceof Response) return auth;
  const id = slideId(context.params);
  if (!id) return json({ error: 'Slide not found.' }, 404);
  let body; try { body = await context.request.json(); } catch { return json({ error: 'The request body must be JSON.' }, 400); }
  const { value, image, errors } = validateSlide(body, { creating: false });
  if (errors) return json({ error: 'This slide can’t be saved yet.', details: errors }, 400);
  try {
    const current = await getSlide(context.env, id);
    if (!current) return json({ error: 'This slide was deleted by someone else.' }, 404);
    if (value.kind === 'image' && !image && !current.image) return json({ error: 'This slide can’t be saved yet.', details: ['image: an image slide needs a picture'] }, 400);
    return json(await updateSlide(context.env, id, value, image, auth.user.email));
  } catch (e) { return errorResponse(e); }
}

// DELETE /api/slides/:id  (admins only)
export async function onRequestDelete(context) {
  const auth = await requireAdmin(context);
  if (auth instanceof Response) return auth;
  const id = slideId(context.params);
  if (!id) return json({ error: 'Slide not found.' }, 404);
  try { await deleteSlide(context.env, id); return json({ ok: true }); }
  catch (e) { return errorResponse(e); }
}
