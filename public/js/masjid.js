/*
 * Masjid Nuh: shared prayer-time engine and settings model.
 * Used by the public site (index.html) and the admin dashboard (admin/index.html).
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.Masjid = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  const TZ = 'America/Toronto';
  const LOCATION = { lat: 42.9018, lng: -78.9196 }; // 35 Queen St, Fort Erie
  const PRAYERS = ['fajr', 'dhuhr', 'asr', 'maghrib', 'isha'];
  const ALL = ['fajr', 'sunrise', 'dhuhr', 'asr', 'maghrib', 'isha'];
  const NAMES = { fajr: 'Fajr', sunrise: 'Sunrise', dhuhr: 'Dhuhr', asr: 'Asr', maghrib: 'Maghrib', isha: 'Isha' };
  const AR = { fajr: 'الفجر', sunrise: 'الشروق', dhuhr: 'الظهر', asr: 'العصر', maghrib: 'المغرب', isha: 'العشاء' };

  const METHODS = {
    ISNA: { label: 'ISNA (North America)', fajr: 15, isha: 15 },
    MWL: { label: 'Muslim World League', fajr: 18, isha: 17 },
    Egypt: { label: 'Egyptian General Authority', fajr: 19.5, isha: 17.5 },
    Karachi: { label: 'University of Islamic Sciences, Karachi', fajr: 18, isha: 18 },
    Moonsighting: { label: 'Fixed 18° (Moonsighting style)', fajr: 18, isha: 18 }
  };

  const DEFAULTS = {
    version: 1,
    method: 'ISNA',
    asr: 'standard',               // 'standard' (Shafi'i, Maliki, Hanbali) or 'hanafi'
    adjust: { fajr: 0, sunrise: 0, dhuhr: 0, asr: 0, maghrib: 0, isha: 0 },
    schedules: [{
      from: '2026-01-01',
      iqamah: {
        fajr: { type: 'after', value: 20 },
        dhuhr: { type: 'fixed', value: '13:30' },
        asr: { type: 'after', value: 15 },
        maghrib: { type: 'after', value: 5 },
        isha: { type: 'after', value: 10 }
      }
    }],
    jumuah: [{ label: 'Khutbah', time: '13:15' }, { label: 'Prayer', time: '13:45' }],
    ramadanStart: '2027-02-08',
    announcement: { on: false, text: '' },
    updatedBy: null,
    updatedAt: null
  };

  const clone = o => JSON.parse(JSON.stringify(o));

  /* ---------- astronomy (PrayTimes-style) ---------- */
  function rawTimes(y, m, d, lat, lng, fajrAngle, ishaAngle, asrFactor) {
    const D2R = Math.PI / 180, R2D = 180 / Math.PI;
    const sin = x => Math.sin(x * D2R), cos = x => Math.cos(x * D2R), tan = x => Math.tan(x * D2R);
    const asin = x => Math.asin(x) * R2D, acos = x => Math.acos(Math.max(-1, Math.min(1, x))) * R2D;
    const atan2 = (a, b) => Math.atan2(a, b) * R2D, acot = x => Math.atan(1 / x) * R2D;
    const fix = (a, b) => { a = a - b * Math.floor(a / b); return a < 0 ? a + b : a; };
    let Y = y, M = m; if (M <= 2) { Y -= 1; M += 12; }
    const A = Math.floor(Y / 100), B = 2 - A + Math.floor(A / 4);
    const jd = Math.floor(365.25 * (Y + 4716)) + Math.floor(30.6001 * (M + 1)) + d + B - 1524.5 - lng / 360;
    function sun(j) {
      const D = j - 2451545.0;
      const g = fix(357.529 + 0.98560028 * D, 360), q = fix(280.459 + 0.98564736 * D, 360);
      const L = fix(q + 1.915 * sin(g) + 0.020 * sin(2 * g), 360);
      const e = 23.439 - 0.00000036 * D;
      const RA = atan2(cos(e) * sin(L), cos(L)) / 15;
      return { decl: asin(sin(e) * sin(L)), eqt: q / 15 - fix(RA, 24) };
    }
    const midDay = t => fix(12 - sun(jd + t).eqt, 24);
    function angleTime(angle, t, ccw) {
      const decl = sun(jd + t).decl, noon = midDay(t);
      const T = acos((-sin(angle) - sin(decl) * sin(lat)) / (cos(decl) * cos(lat))) / 15;
      return noon + (ccw ? -T : T);
    }
    const asrTime = (f, t) => angleTime(-acot(f + tan(Math.abs(lat - sun(jd + t).decl))), t);
    let t = { fajr: 5, sunrise: 6, dhuhr: 12, asr: 13, maghrib: 18, isha: 18 };
    for (let i = 0; i < 2; i++) {
      const p = {}; for (const k in t) p[k] = t[k] / 24;
      t = {
        fajr: angleTime(fajrAngle, p.fajr, true),
        sunrise: angleTime(0.833, p.sunrise, true),
        dhuhr: midDay(p.dhuhr),
        asr: asrTime(asrFactor, p.asr),
        maghrib: angleTime(0.833, p.maghrib),
        isha: angleTime(ishaAngle, p.isha)
      };
    }
    const out = {}, base = Date.UTC(y, m - 1, d);
    for (const k in t) out[k] = base + Math.round((t[k] - lng / 15 + (k === 'dhuhr' ? 1 / 60 : 0)) * 60) * 60000;
    return out; // epoch ms
  }

  /* ---------- timezone helpers ---------- */
  const dtf = new Intl.DateTimeFormat('en-CA', { timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23', weekday: 'short' });
  function parts(date) {
    const o = {};
    dtf.formatToParts(date).forEach(p => { const n = Number(p.value); o[p.type] = isNaN(n) ? p.value : n; });
    return o; // {year, month, day, hour, minute, second, weekday}
  }
  function offsetMs(ms) { const p = parts(new Date(ms)); return Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second) - Math.floor(ms / 1000) * 1000; }
  /** A Date for wall-clock HH:MM on y-m-d in the masjid's timezone. */
  function zoned(y, m, d, hhmm) {
    const [h, mi] = hhmm.split(':').map(Number);
    const guess = Date.UTC(y, m - 1, d, h, mi);
    let ms = guess - offsetMs(guess);
    ms = guess - offsetMs(ms);
    return new Date(ms);
  }
  const ymd = (y, m, d) => `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
  function todayParts(now) { const p = parts(now || new Date()); return { y: p.year, m: p.month, d: p.day, weekday: p.weekday }; }
  function addDays(y, m, d, n) { const t = new Date(Date.UTC(y, m - 1, d + n)); return { y: t.getUTCFullYear(), m: t.getUTCMonth() + 1, d: t.getUTCDate() }; }

  function fmt(date) {
    return date.toLocaleTimeString('en-CA', { timeZone: TZ, hour: 'numeric', minute: '2-digit', hour12: true })
      .replace(/\s?([ap])\.?\s?m\.?/i, (_, a) => ' ' + a.toLowerCase() + 'm');
  }
  function fmt24(date) { const p = parts(date); return String(p.hour).padStart(2, '0') + ':' + String(p.minute).padStart(2, '0'); }

  /* ---------- settings ---------- */
  function normalize(s) {
    const out = clone(DEFAULTS);
    if (!s || typeof s !== 'object') return out;
    for (const k of ['method', 'asr', 'ramadanStart', 'updatedBy', 'updatedAt']) if (s[k] != null) out[k] = s[k];
    if (s.adjust) for (const k of ALL) if (typeof s.adjust[k] === 'number') out.adjust[k] = s.adjust[k];
    if (Array.isArray(s.schedules) && s.schedules.length) out.schedules = clone(s.schedules).sort((a, b) => a.from.localeCompare(b.from));
    if (Array.isArray(s.jumuah)) out.jumuah = clone(s.jumuah);
    if (s.announcement) out.announcement = { on: !!s.announcement.on, text: String(s.announcement.text || '') };
    if (!METHODS[out.method]) out.method = 'ISNA';
    return out;
  }
  /** The iqamah schedule in force on a given date (latest one starting on or before it). */
  function scheduleFor(settings, dateStr) {
    let active = settings.schedules[0];
    for (const sc of settings.schedules) if (sc.from <= dateStr) active = sc;
    return active;
  }

  /** Adhan and iqamah times for a calendar date in Fort Erie. */
  function day(settings, y, m, d) {
    const meth = METHODS[settings.method] || METHODS.ISNA;
    const raw = rawTimes(y, m, d, LOCATION.lat, LOCATION.lng, meth.fajr, meth.isha, settings.asr === 'hanafi' ? 2 : 1);
    const adhan = {};
    for (const k of ALL) adhan[k] = new Date(raw[k] + (settings.adjust[k] || 0) * 60000);
    const dateStr = ymd(y, m, d);
    const sched = scheduleFor(settings, dateStr);
    const iqamah = {}, warnings = {};
    for (const k of PRAYERS) {
      const rule = sched.iqamah[k] || { type: 'after', value: 0 };
      if (rule.type === 'fixed') {
        const t = zoned(y, m, d, rule.value);
        if (t < adhan[k]) { iqamah[k] = adhan[k]; warnings[k] = 'before-adhan'; }
        else iqamah[k] = t;
        if (k !== 'isha' && k !== 'fajr') {
          const nextK = PRAYERS[PRAYERS.indexOf(k) + 1];
          if (iqamah[k] >= adhan[nextK]) warnings[k] = 'after-next';
        }
      } else iqamah[k] = new Date(adhan[k].getTime() + (Number(rule.value) || 0) * 60000);
    }
    const jumuah = (settings.jumuah || []).map(j => ({ label: j.label, at: zoned(y, m, d, j.time) }));
    return { date: dateStr, adhan, iqamah, jumuah, schedule: sched, warnings };
  }

  async function load(url) {
    try {
      const ctrl = typeof AbortController !== 'undefined' ? new AbortController() : null;
      const timer = ctrl && setTimeout(() => ctrl.abort(), 4000);
      const res = await fetch(url || '/api/settings', { cache: 'no-store', signal: ctrl && ctrl.signal });
      if (timer) clearTimeout(timer);
      if (!res.ok) throw new Error(res.status);
      return { settings: normalize(await res.json()), live: true };
    } catch (e) {
      return { settings: normalize(null), live: false };
    }
  }

  return { TZ, LOCATION, PRAYERS, ALL, NAMES, AR, METHODS, DEFAULTS, clone, normalize, scheduleFor, day, load, fmt, fmt24, parts, zoned, ymd, todayParts, addDays };
});
