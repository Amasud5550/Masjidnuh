/**
 * TV screen: settings and slide validation.
 * Everything sent from the dashboard is checked here before it is stored.
 */
const DATE = /^\d{4}-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$/;
export const MAX_IMAGE_BYTES = 1_500_000;
export const MAX_SLIDES = 40;

export const TV_DEFAULTS = {
  prayerScreen: { on: true, minutes: 10 },
  jumuahMinutes: 45,
  ticker: [
    'Please silence your phone inside the prayer hall.',
    'Welcome to Masjid Nuh. Everyone is welcome to visit and ask questions.'
  ],
  donateSlide: { on: true, title: 'Support your masjid', link: 'https://donorchoice.ca/embedded/masjidnuh' },
  hijriAdjust: 0,
  clock24: false
};

function httpsUrl(v) {
  if (!v) return '';
  try { const u = new URL(String(v).trim()); return u.protocol === 'https:' && String(v).length <= 400 ? u.toString() : null; }
  catch { return null; }
}
const text = (v, max) => String(v == null ? '' : v).replace(/\s+/g, ' ').trim().slice(0, max);
const multiline = (v, max) => String(v == null ? '' : v).replace(/\r/g, '').replace(/[ \t]+/g, ' ').replace(/\n{3,}/g, '\n\n').trim().slice(0, max);

export function validateTv(input) {
  const errors = [];
  const fail = (p, m) => errors.push(`${p}: ${m}`);
  if (!input || typeof input !== 'object') return { errors: ['body: must be a JSON object'] };
  const out = {};

  const ps = input.prayerScreen || {};
  const mins = ps.minutes == null ? 10 : ps.minutes;
  if (!Number.isInteger(mins) || mins < 1 || mins > 30) fail('prayerScreen.minutes', 'must be 1 to 30 minutes');
  out.prayerScreen = { on: ps.on !== false, minutes: Number.isInteger(mins) ? mins : 10 };

  const jm = input.jumuahMinutes == null ? 45 : input.jumuahMinutes;
  if (!Number.isInteger(jm) || jm < 10 || jm > 120) fail('jumuahMinutes', 'must be 10 to 120 minutes');
  out.jumuahMinutes = Number.isInteger(jm) ? jm : 45;

  if (input.ticker != null && !Array.isArray(input.ticker)) fail('ticker', 'must be a list of messages');
  const lines = (Array.isArray(input.ticker) ? input.ticker : []).map(l => text(l, 200)).filter(Boolean);
  if (lines.length > 12) fail('ticker', 'can have up to 12 messages');
  if ((Array.isArray(input.ticker) ? input.ticker : []).some(l => String(l || '').trim().length > 160)) fail('ticker', 'each message must be 160 characters or fewer');
  out.ticker = lines.slice(0, 12);

  const ds = input.donateSlide || {};
  const link = httpsUrl(ds.link);
  if (link === null) fail('donateSlide.link', 'must be a web address starting with https://');
  out.donateSlide = { on: ds.on !== false && !!link, title: text(ds.title, 80) || 'Support your masjid', link: link || '' };

  const ha = input.hijriAdjust == null ? 0 : input.hijriAdjust;
  if (!Number.isInteger(ha) || ha < -2 || ha > 2) fail('hijriAdjust', 'must be -2 to 2 days');
  out.hijriAdjust = Number.isInteger(ha) ? ha : 0;

  out.clock24 = !!input.clock24;
  return errors.length ? { errors } : { value: out };
}

/**
 * Validates a slide. Returns { value, image? } or { errors }.
 * image is { mime, bytes } when a new picture was sent.
 */
export function validateSlide(input, { creating }) {
  const errors = [];
  const fail = (p, m) => errors.push(`${p}: ${m}`);
  if (!input || typeof input !== 'object') return { errors: ['body: must be a JSON object'] };
  const out = {};

  out.kind = input.kind;
  if (!['image', 'text'].includes(out.kind)) fail('kind', 'must be image or text');

  const rawTitle = String(input.title || '').trim();
  const rawBody = String(input.body || '').trim();
  if (rawTitle.length > 90) fail('title', 'must be 90 characters or fewer');
  if (rawBody.length > 420) fail('body', 'must be 420 characters or fewer');
  out.title = text(rawTitle, 90);
  out.body = multiline(rawBody, 420);
  if (out.kind === 'text' && !out.title) fail('title', 'a text slide needs a title');

  const link = httpsUrl(input.link);
  if (link === null) fail('link', 'must be a web address starting with https://');
  out.link = link || '';
  out.linkLabel = text(input.linkLabel, 40);

  for (const k of ['start', 'end']) {
    const v = input[k] || '';
    if (v && !DATE.test(v)) fail(k, 'must be a date like 2026-11-20');
    out[k] = v || '';
  }
  if (out.start && out.end && out.end < out.start) fail('end', 'must be on or after the start date');

  const sec = input.seconds == null ? 12 : input.seconds;
  if (!Number.isInteger(sec) || sec < 5 || sec > 60) fail('seconds', 'must be 5 to 60 seconds');
  out.seconds = Number.isInteger(sec) ? sec : 12;
  out.enabled = input.enabled !== false;

  let image;
  if (input.image) {
    const m = /^data:(image\/(?:jpeg|png|webp));base64,([A-Za-z0-9+/=]+)$/.exec(String(input.image));
    if (!m) fail('image', 'must be a JPEG, PNG or WebP picture');
    else {
      let bytes;
      try { bytes = Uint8Array.from(atob(m[2]), c => c.charCodeAt(0)); } catch { fail('image', 'could not be read'); }
      if (bytes && bytes.length > MAX_IMAGE_BYTES) fail('image', 'is too large. Use a picture under 1.5 MB');
      else if (bytes) image = { mime: m[1], bytes };
    }
  }
  if (creating && out.kind === 'image' && !image) fail('image', 'an image slide needs a picture');

  return errors.length ? { errors } : { value: out, image };
}
