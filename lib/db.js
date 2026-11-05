/**
 * Storage in Cloudflare D1. Tables are created automatically on first use.
 */
let ready = null;

export function db(env) {
  if (!env.DB) throw new Error('The D1 database is not connected. Add a D1 binding named DB in the Pages project settings.');
  if (!ready) {
    ready = env.DB.batch([
      env.DB.prepare('CREATE TABLE IF NOT EXISTS settings (id TEXT PRIMARY KEY, data TEXT NOT NULL, updated_by TEXT, updated_at TEXT)'),
      env.DB.prepare('CREATE TABLE IF NOT EXISTS history (id INTEGER PRIMARY KEY AUTOINCREMENT, data TEXT NOT NULL, updated_by TEXT, updated_at TEXT)'),
      env.DB.prepare('CREATE TABLE IF NOT EXISTS admins (email TEXT PRIMARY KEY, added_by TEXT, added_at TEXT)'),
      env.DB.prepare('CREATE TABLE IF NOT EXISTS slides (id INTEGER PRIMARY KEY AUTOINCREMENT, data TEXT NOT NULL, sort INTEGER NOT NULL DEFAULT 0, image_mime TEXT, image_version INTEGER, updated_by TEXT, updated_at TEXT)'),
      env.DB.prepare('CREATE TABLE IF NOT EXISTS slide_images (slide_id INTEGER NOT NULL, part INTEGER NOT NULL, data BLOB NOT NULL, PRIMARY KEY (slide_id, part))')
    ]).catch(e => { ready = null; throw e; });
  }
  return ready.then(() => env.DB);
}

export async function getSettings(env) {
  const row = await (await db(env)).prepare("SELECT data FROM settings WHERE id = 'current'").first();
  return row ? JSON.parse(row.data) : null;
}

export async function saveSettings(env, settings, email) {
  const d = await db(env);
  const now = new Date().toISOString();
  const doc = { ...settings, updatedBy: email, updatedAt: now };
  const data = JSON.stringify(doc);
  await d.batch([
    d.prepare("INSERT INTO settings (id, data, updated_by, updated_at) VALUES ('current', ?1, ?2, ?3) ON CONFLICT(id) DO UPDATE SET data = ?1, updated_by = ?2, updated_at = ?3").bind(data, email, now),
    d.prepare('INSERT INTO history (data, updated_by, updated_at) VALUES (?1, ?2, ?3)').bind(data, email, now),
    d.prepare('DELETE FROM history WHERE id NOT IN (SELECT id FROM history ORDER BY id DESC LIMIT 100)')
  ]);
  return doc;
}

export async function getHistory(env, limit = 15) {
  const { results } = await (await db(env)).prepare('SELECT data, updated_by, updated_at FROM history ORDER BY id DESC LIMIT ?1').bind(limit).all();
  return results.map(r => ({ updatedBy: r.updated_by, updatedAt: r.updated_at, settings: JSON.parse(r.data) }));
}

/* ---------- admins ---------- */
export const normEmail = e => String(e || '').trim().toLowerCase();
export function owners(env) { return String(env.ADMIN_EMAILS || '').split(/[,;\s]+/).map(normEmail).filter(Boolean); }

/** Entra group object IDs allowed in (ADMIN_GROUP_IDS). When set, access is by group only. */
export function groupIds(env) { return String(env.ADMIN_GROUP_IDS || '').split(/[,;\s]+/).map(g => g.trim().toLowerCase()).filter(Boolean); }
export const groupMode = env => groupIds(env).length > 0;

/**
 * Is this signed-in person an admin?
 * - Owners in ADMIN_EMAILS always are.
 * - With ADMIN_GROUP_IDS set: only members of those groups (checked at sign-in).
 * - Otherwise: people added in the dashboard's Admins list.
 */
export async function isAdmin(env, session) {
  const email = normEmail(session && session.email);
  if (!email) return false;
  if (owners(env).includes(email)) return true;
  if (groupMode(env)) {
    const allowed = groupIds(env);
    return Array.isArray(session.grps) && session.grps.some(g => allowed.includes(g));
  }
  const row = await (await db(env)).prepare('SELECT email FROM admins WHERE email = ?1').bind(email).first();
  return !!row;
}

export async function listAdmins(env) {
  const own = owners(env).map(email => ({ email, owner: true }));
  if (groupMode(env)) return own;
  const { results } = await (await db(env)).prepare('SELECT email, added_by, added_at FROM admins ORDER BY email').all();
  const extra = results.filter(r => !own.some(o => o.email === r.email)).map(r => ({ email: r.email, owner: false, addedBy: r.added_by, addedAt: r.added_at }));
  return own.concat(extra);
}

export async function addAdmin(env, email, by) {
  await (await db(env)).prepare('INSERT INTO admins (email, added_by, added_at) VALUES (?1, ?2, ?3) ON CONFLICT(email) DO NOTHING')
    .bind(normEmail(email), by, new Date().toISOString()).run();
}
export async function removeAdmin(env, email) {
  await (await db(env)).prepare('DELETE FROM admins WHERE email = ?1').bind(normEmail(email)).run();
}
