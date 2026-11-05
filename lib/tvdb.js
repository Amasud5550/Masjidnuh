/**
 * Storage for the TV screen: settings (one row in `settings`) and slides.
 * Slide pictures are split into 90 KB parts so every database statement stays small.
 */
import { db } from './db.js';
import { TV_DEFAULTS } from './tv.js';

const PART = 90_000;

export async function getTvSettings(env) {
  const row = await (await db(env)).prepare("SELECT data, updated_by, updated_at FROM settings WHERE id = 'tv'").first();
  if (!row) return { ...TV_DEFAULTS, updatedBy: null, updatedAt: null };
  return { ...TV_DEFAULTS, ...JSON.parse(row.data), updatedBy: row.updated_by, updatedAt: row.updated_at };
}

export async function saveTvSettings(env, value, email) {
  const now = new Date().toISOString();
  await (await db(env)).prepare("INSERT INTO settings (id, data, updated_by, updated_at) VALUES ('tv', ?1, ?2, ?3) ON CONFLICT(id) DO UPDATE SET data = ?1, updated_by = ?2, updated_at = ?3")
    .bind(JSON.stringify(value), email, now).run();
  return { ...value, updatedBy: email, updatedAt: now };
}

function shape(r) {
  const d = JSON.parse(r.data);
  return {
    id: r.id, ...d, sort: r.sort,
    image: r.image_version ? `/api/slides/${r.id}/image?v=${r.image_version}` : null,
    updatedBy: r.updated_by, updatedAt: r.updated_at
  };
}

export async function listSlides(env, { enabledOnly = false } = {}) {
  const { results } = await (await db(env)).prepare('SELECT id, data, sort, image_version, updated_by, updated_at FROM slides ORDER BY sort, id').all();
  const all = results.map(shape);
  return enabledOnly ? all.filter(s => s.enabled) : all;
}

export async function countSlides(env) {
  const r = await (await db(env)).prepare('SELECT COUNT(*) AS n FROM slides').first();
  return r ? r.n : 0;
}

async function writeImage(d, id, image) {
  const stmts = [d.prepare('DELETE FROM slide_images WHERE slide_id = ?1').bind(id)];
  for (let i = 0, part = 0; i < image.bytes.length; i += PART, part++) {
    stmts.push(d.prepare('INSERT INTO slide_images (slide_id, part, data) VALUES (?1, ?2, ?3)').bind(id, part, image.bytes.slice(i, i + PART)));
  }
  stmts.push(d.prepare('UPDATE slides SET image_mime = ?1, image_version = ?2 WHERE id = ?3').bind(image.mime, Date.now(), id));
  await d.batch(stmts);
}

export async function createSlide(env, value, image, email) {
  const d = await db(env);
  const max = await d.prepare('SELECT COALESCE(MAX(sort), 0) AS m FROM slides').first();
  const now = new Date().toISOString();
  const r = await d.prepare('INSERT INTO slides (data, sort, updated_by, updated_at) VALUES (?1, ?2, ?3, ?4) RETURNING id')
    .bind(JSON.stringify(value), (max ? max.m : 0) + 1, email, now).first();
  if (image) await writeImage(d, r.id, image);
  return getSlide(env, r.id);
}

export async function getSlide(env, id) {
  const r = await (await db(env)).prepare('SELECT id, data, sort, image_version, updated_by, updated_at FROM slides WHERE id = ?1').bind(id).first();
  return r ? shape(r) : null;
}

export async function updateSlide(env, id, value, image, email) {
  const d = await db(env);
  const res = await d.prepare('UPDATE slides SET data = ?1, updated_by = ?2, updated_at = ?3 WHERE id = ?4')
    .bind(JSON.stringify(value), email, new Date().toISOString(), id).run();
  if (!res.meta || !res.meta.changes) return null;
  if (image) await writeImage(d, id, image);
  return getSlide(env, id);
}

export async function deleteSlide(env, id) {
  const d = await db(env);
  await d.batch([
    d.prepare('DELETE FROM slide_images WHERE slide_id = ?1').bind(id),
    d.prepare('DELETE FROM slides WHERE id = ?1').bind(id)
  ]);
}

export async function reorderSlides(env, ids) {
  const d = await db(env);
  await d.batch(ids.map((id, i) => d.prepare('UPDATE slides SET sort = ?1 WHERE id = ?2').bind(i + 1, id)));
}

export async function readImage(env, id) {
  const d = await db(env);
  const meta = await d.prepare('SELECT image_mime FROM slides WHERE id = ?1').bind(id).first();
  if (!meta || !meta.image_mime) return null;
  const { results } = await d.prepare('SELECT data FROM slide_images WHERE slide_id = ?1 ORDER BY part').bind(id).all();
  if (!results.length) return null;
  const parts = results.map(r => new Uint8Array(r.data));
  const out = new Uint8Array(parts.reduce((n, p) => n + p.length, 0));
  let o = 0; for (const p of parts) { out.set(p, o); o += p.length; }
  return { mime: meta.image_mime, bytes: out };
}
