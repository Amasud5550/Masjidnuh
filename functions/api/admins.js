import { json, requireAdmin, errorResponse } from '../../lib/guard.js';
import { listAdmins, addAdmin, removeAdmin, owners, normEmail } from '../../lib/db.js';

const EMAIL = /^[^\s@<>"]{1,64}@[^\s@<>"]{1,190}\.[a-z]{2,}$/i;

// GET /api/admins  (admins only)
export async function onRequestGet(context) {
  const auth = await requireAdmin(context);
  if (auth instanceof Response) return auth;
  try { return json(await listAdmins(context.env)); } catch (e) { return errorResponse(e); }
}

// POST /api/admins  { email }  (admins only)
export async function onRequestPost(context) {
  const auth = await requireAdmin(context);
  if (auth instanceof Response) return auth;
  let body; try { body = await context.request.json(); } catch { return json({ error: 'The request body must be JSON.' }, 400); }
  const email = normEmail(body && body.email);
  if (!EMAIL.test(email)) return json({ error: 'Enter a valid email address, like name@outlook.com.' }, 400);
  try {
    const list = await listAdmins(context.env);
    if (list.some(a => a.email === email)) return json({ error: `${email} is already an admin.` }, 409);
    if (list.length >= 50) return json({ error: 'You can have up to 50 admins.' }, 400);
    await addAdmin(context.env, email, auth.user.email);
    return json(await listAdmins(context.env), 201);
  } catch (e) { return errorResponse(e); }
}

// DELETE /api/admins?email=  (admins only)
export async function onRequestDelete(context) {
  const auth = await requireAdmin(context);
  if (auth instanceof Response) return auth;
  const email = normEmail(new URL(context.request.url).searchParams.get('email'));
  if (owners(context.env).includes(email)) return json({ error: 'Owners are set in the Cloudflare settings (ADMIN_EMAILS) and can only be removed there.' }, 400);
  if (email === normEmail(auth.user.email)) return json({ error: 'You can’t remove yourself. Ask another admin to do it.' }, 400);
  try { await removeAdmin(context.env, email); return json(await listAdmins(context.env)); }
  catch (e) { return errorResponse(e); }
}
