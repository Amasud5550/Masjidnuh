
/**
 * Validates and cleans settings sent from the admin dashboard.
 * Anything unexpected is rejected rather than stored.
 */
const PRAYERS = ['fajr', 'dhuhr', 'asr', 'maghrib', 'isha'];
const ALL = ['fajr', 'sunrise', 'dhuhr', 'asr', 'maghrib', 'isha'];
const METHODS = ['ISNA', 'MWL', 'Egypt', 'Karachi', 'Moonsighting'];
const TIME = /^([01]\d|2[0-3]):[0-5]\d$/;
const DATE = /^\d{4}-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$/;

function validate(input) {
  const errors = [];
  const fail = (path, msg) => errors.push(`${path}: ${msg}`);
  if (!input || typeof input !== 'object' || Array.isArray(input)) return { errors: ['body: must be a JSON object'] };

  const out = { version: 1 };

  out.method = METHODS.includes(input.method) ? input.method : (fail('method', `must be one of ${METHODS.join(', ')}`), 'ISNA');
  out.asr = ['standard', 'hanafi'].includes(input.asr) ? input.asr : (fail('asr', 'must be standard or hanafi'), 'standard');

  out.adjust = {};
  const adj = input.adjust || {};
  for (const k of ALL) {
    const v = adj[k] == null ? 0 : adj[k];
    if (!Number.isInteger(v) || v < -30 || v > 30) fail(`adjust.${k}`, 'must be a whole number of minutes between -30 and 30');
    out.adjust[k] = Number.isInteger(v) ? v : 0;
  }

  if (!Array.isArray(input.schedules) || input.schedules.length < 1 || input.schedules.length > 40) {
    fail('schedules', 'must have between 1 and 40 entries');
    out.schedules = [];
  } else {
    const seen = new Set();
    out.schedules = input.schedules.map((sc, i) => {
      const p = `schedules[${i}]`;
      const from = sc && sc.from;
      if (!DATE.test(from || '')) fail(`${p}.from`, 'must be a date like 2026-11-10');
      else if (seen.has(from)) fail(`${p}.from`, 'two schedules start on the same date');
      seen.add(from);
      const iq = {};
      for (const k of PRAYERS) {
        const r = sc && sc.iqamah && sc.iqamah[k];
        if (!r || (r.type !== 'after' && r.type !== 'fixed')) { fail(`${p}.iqamah.${k}`, 'type must be after or fixed'); continue; }
        if (r.type === 'after') {
          if (!Number.isInteger(r.value) || r.value < 0 || r.value > 120) fail(`${p}.iqamah.${k}`, 'minutes after adhan must be 0 to 120');
        } else if (!TIME.test(r.value)) fail(`${p}.iqamah.${k}`, 'fixed time must be HH:MM (24-hour)');
        iq[k] = { type: r.type, value: r.value };
      }
      return { from, iqamah: iq };
    }).sort((a, b) => String(a.from).localeCompare(String(b.from)));
  }

  if (!Array.isArray(input.jumuah) || input.jumuah.length > 6) { fail('jumuah', 'must be a list of up to 6 entries'); out.jumuah = []; }
  else out.jumuah = input.jumuah.map((j, i) => {
    const label = String((j && j.label) || '').trim();
    if (!label || label.length > 40) fail(`jumuah[${i}].label`, 'must be 1 to 40 characters');
    if (!TIME.test((j && j.time) || '')) fail(`jumuah[${i}].time`, 'must be HH:MM (24-hour)');
    return { label: label.slice(0, 40), time: j && j.time };
  });

  if (input.ramadanStart && !DATE.test(input.ramadanStart)) fail('ramadanStart', 'must be a date like 2027-02-08');
  out.ramadanStart = input.ramadanStart || null;

  const ann = input.announcement || {};
  const text = String(ann.text || '').trim();
  if (text.length > 280) fail('announcement.text', 'must be 280 characters or fewer');
  out.announcement = { on: !!ann.on && text.length > 0, text: text.slice(0, 280) };

  return errors.length ? { errors } : { value: out };
}

export { validate };
