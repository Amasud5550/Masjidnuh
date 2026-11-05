import { json } from '../../lib/guard.js';
import { getSession } from '../../lib/session.js';
import { isAdmin, owners, groupMode } from '../../lib/db.js';

// GET /api/me — who is signed in (used by the dashboard and the access page)
export async function onRequestGet({ request, env }) {
  let s = null;
  try { s = await getSession(request, env); } catch { /* sign-in not configured */ }
  const accessMode = groupMode(env) ? 'groups' : 'emails';
  if (!s) return json({ signedIn: false, accessMode });
  let admin = false;
  try { admin = await isAdmin(env, s); } catch { /* database not connected */ }
  return json({ signedIn: true, email: s.email, name: s.name, isAdmin: admin, isOwner: owners(env).includes(s.email), accessMode });
}
