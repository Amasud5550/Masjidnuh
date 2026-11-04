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
