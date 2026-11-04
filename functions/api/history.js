import { json, requireAdmin, errorResponse } from '../../lib/guard.js';
import { getHistory } from '../../lib/db.js';

// GET /api/history  (admins only) — recent saves, newest first
export async function onRequestGet(context) {
  const auth = await requireAdmin(context);
  if (auth instanceof Response) return auth;
  try { return json(await getHistory(context.env, 15)); } catch (e) { return errorResponse(e); }
}
