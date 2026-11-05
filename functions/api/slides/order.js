import { json, requireAdmin, errorResponse } from '../../../lib/guard.js';
import { listSlides, reorderSlides } from '../../../lib/tvdb.js';

// POST /api/slides/order  { ids: [3, 1, 2] }  (admins only)
export async function onRequestPost(context) {
  const auth = await requireAdmin(context);
  if (auth instanceof Response) return auth;
  let body; try { body = await context.request.json(); } catch { return json({ error: 'The request body must be JSON.' }, 400); }
  const ids = Array.isArray(body && body.ids) ? body.ids : null;
  try {
    const existing = (await listSlides(context.env)).map(s => s.id);
    if (!ids || ids.length !== existing.length || !ids.every(id => existing.includes(id)) || new Set(ids).size !== ids.length) {
      return json({ error: 'The slide list changed. Reload the page and try again.' }, 409);
    }
    await reorderSlides(context.env, ids);
    return json(await listSlides(context.env));
  } catch (e) { return errorResponse(e); }
}
