import test from 'node:test';
import assert from 'node:assert';
import { validate } from '../lib/validate.js';
import { makeSession, getSession, makeOAuthCookie, getOAuthCookie } from '../lib/session.js';
import { safeNext } from '../lib/page.js';

const env = { SESSION_SECRET: 'test-secret-0123456789abcdef0123456789abcdef' };
const reqWith = setCookie => new Request('https://masjidnuh.ca/', { headers: { Cookie: setCookie.split(';')[0] } });
const good = () => ({
  method: 'ISNA', asr: 'standard', adjust: {},
  schedules: [{ from: '2026-01-01', iqamah: { fajr: { type: 'after', value: 20 }, dhuhr: { type: 'fixed', value: '13:30' }, asr: { type: 'after', value: 15 }, maghrib: { type: 'after', value: 5 }, isha: { type: 'after', value: 10 } } }],
  jumuah: [{ label: 'Khutbah', time: '13:15' }], ramadanStart: '2027-02-08', announcement: { on: true, text: 'Eid prayer at 8:30 am' }
});

test('valid settings pass and unknown fields are dropped', () => {
  const b = good(); b.evil = '<script>';
  const { value, errors } = validate(b);
  assert.equal(errors, undefined);
  assert.equal(value.evil, undefined);
});
test('bad times, methods and adjustments are rejected', () => {
  const b = good(); b.schedules[0].iqamah.dhuhr.value = '25:99'; b.method = 'Nope'; b.adjust = { fajr: 90 };
  assert.equal(validate(b).errors.length, 3);
});
test('duplicate schedule dates are rejected', () => {
  const b = good(); b.schedules.push({ ...b.schedules[0] });
  assert.ok(validate(b).errors);
});
test('an empty announcement is turned off', () => {
  const b = good(); b.announcement = { on: true, text: '  ' };
  assert.equal(validate(b).value.announcement.on, false);
});
test('session cookie round-trips', async () => {
  const s = await getSession(reqWith(await makeSession({ email: 'a@b.ca', name: 'A' }, env.SESSION_SECRET)), env);
  assert.equal(s.email, 'a@b.ca');
});
test('a tampered session cookie is rejected', async () => {
  const c = (await makeSession({ email: 'a@b.ca', name: 'A' }, env.SESSION_SECRET)).split(';')[0];
  const [name, val] = c.split('='); const [body, sig] = val.split('.');
  const forged = btoa(JSON.stringify({ email: 'evil@x.com', exp: Date.now() + 1e7 })).replace(/=+$/, '') + '.' + sig;
  assert.equal(await getSession(new Request('https://x/', { headers: { Cookie: `${name}=${forged}` } }), env), null);
  assert.equal(await getSession(new Request('https://x/', { headers: { Cookie: `${name}=${body}.AAAA` } }), env), null);
});
test('a session signed with another secret is rejected', async () => {
  const c = await makeSession({ email: 'a@b.ca' }, 'another-secret-0123456789abcdef0123456789');
  assert.equal(await getSession(reqWith(c), env), null);
});
test('sign-in state cookie round-trips', async () => {
  const c = await makeOAuthCookie({ state: 's1', nonce: 'n1', verifier: 'v1', next: '/admin/' }, env.SESSION_SECRET);
  assert.equal((await getOAuthCookie(reqWith(c), env)).state, 's1');
});
test('a short SESSION_SECRET is refused', async () => {
  await assert.rejects(makeSession({ email: 'a@b.ca' }, 'short'));
});
test('redirects only go to paths on this site', () => {
  assert.equal(safeNext('/admin/'), '/admin/');
  assert.equal(safeNext('//evil.example'), '/admin/');
  assert.equal(safeNext('https://evil.example'), '/admin/');
  assert.equal(safeNext('/\\evil.example'), '/admin/');
});

import { isAdmin, groupMode } from '../lib/db.js';
const genv = { ADMIN_EMAILS: 'owner@masjidnuh.ca', ADMIN_GROUP_IDS: '11111111-AAAA-4aaa-8aaa-aaaaaaaaaaaa, 22222222-bbbb-4bbb-8bbb-bbbbbbbbbbbb' };
test('group mode lets in members of an allowed group only', async () => {
  assert.equal(groupMode(genv), true);
  assert.equal(await isAdmin(genv, { email: 'a@m.ca', grps: ['11111111-aaaa-4aaa-8aaa-aaaaaaaaaaaa'] }), true);
  assert.equal(await isAdmin(genv, { email: 'b@m.ca', grps: ['99999999-0000-4000-8000-000000000000'] }), false);
  assert.equal(await isAdmin(genv, { email: 'c@m.ca', grps: [] }), false);
  assert.equal(await isAdmin(genv, { email: 'c@m.ca' }), false);
});
test('owners always get in, even without a group', async () => {
  assert.equal(await isAdmin(genv, { email: 'Owner@MasjidNuh.ca', grps: [] }), true);
});
test('removing a group from ADMIN_GROUP_IDS revokes access for existing sessions', async () => {
  const s = { email: 'a@m.ca', grps: ['22222222-bbbb-4bbb-8bbb-bbbbbbbbbbbb'] };
  assert.equal(await isAdmin(genv, s), true);
  assert.equal(await isAdmin({ ...genv, ADMIN_GROUP_IDS: '11111111-aaaa-4aaa-8aaa-aaaaaaaaaaaa' }, s), false);
});

import { validateTv, validateSlide } from '../lib/tv.js';
test('TV settings: valid values pass, bad ones are rejected', () => {
  const ok = validateTv({ ticker: ['Hello', '  ', 'World'], prayerScreen: { on: true, minutes: 8 }, jumuahMinutes: 40, donateSlide: { on: true, title: 'Give', link: 'https://donorchoice.ca/embedded/masjidnuh' }, hijriAdjust: -1, clock24: true });
  assert.equal(ok.errors, undefined);
  assert.deepEqual(ok.value.ticker, ['Hello', 'World']);
  const bad = validateTv({ prayerScreen: { minutes: 99 }, jumuahMinutes: 2, hijriAdjust: 5, donateSlide: { on: true, link: 'javascript:alert(1)' } });
  assert.equal(bad.errors.length, 4);
});
test('slides: text needs a title, image needs a picture, links must be https', () => {
  assert.ok(validateSlide({ kind: 'text', title: '' }, { creating: true }).errors);
  assert.ok(validateSlide({ kind: 'image', title: 'x' }, { creating: true }).errors);
  assert.ok(validateSlide({ kind: 'text', title: 'Hi', link: 'http://x.example' }, { creating: true }).errors);
  assert.ok(validateSlide({ kind: 'text', title: 'Hi', start: '2026-12-10', end: '2026-12-01' }, { creating: true }).errors);
  const v = validateSlide({ kind: 'text', title: 'Youth night', body: 'Pizza', link: 'https://example.org/a', seconds: 15 }, { creating: true });
  assert.equal(v.errors, undefined); assert.equal(v.value.seconds, 15);
});
test('slides: pictures are decoded, and anything that is not an image is refused', () => {
  const png = 'data:image/png;base64,' + btoa(String.fromCharCode(137, 80, 78, 71, 13, 10, 26, 10));
  const v = validateSlide({ kind: 'image', image: png }, { creating: true });
  assert.equal(v.image.mime, 'image/png'); assert.equal(v.image.bytes[1], 80);
  assert.ok(validateSlide({ kind: 'image', image: 'data:text/html;base64,PHNjcmlwdD4=' }, { creating: true }).errors);
  const huge = 'data:image/jpeg;base64,' + btoa('x'.repeat(1_600_000));
  assert.ok(validateSlide({ kind: 'image', image: huge }, { creating: true }).errors);
});
