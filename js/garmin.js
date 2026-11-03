// Sleep from Garmin Connect. The script below runs on connect.garmin.com in the app's Garmin window,
// with the session the user signed in with, and hands the nights back through garmin_svar.
import { avrunda } from './calc.js';

// fran: first day to fetch, or null to fetch everything there is. till: the last day.
export function garminSkript(fran, till) {
  return `(${sidan.toString()})(${JSON.stringify(fran)}, ${JSON.stringify(till)})`;
}

// Runs inside Garmin's page, so it may only use what that page has.
async function sidan(fran, till) {
  const svara = d => window.__TAURI_INTERNALS__.invoke('garmin_svar', { data: JSON.stringify(d) });
  const DAG = 864e5, iso = t => new Date(t).toISOString().slice(0, 10);
  const csrf = document.querySelector('meta[name="csrf-token"]')?.content;
  let bas = null;
  async function hamta(vag) {
    let status = 0;
    for (const b of bas ? [bas] : ['/gc-api', '/modern/proxy']) {
      const r = await fetch(b + vag, { credentials: 'include', headers: { Accept: 'application/json', NK: 'NT', ...(csrf ? { 'connect-csrf-token': csrf } : {}) } });
      status = r.status;
      if (r.ok) { bas = b; return r.status === 204 ? null : r.json(); }
      if (r.status === 404 && bas) return null;
    }
    const e = new Error('Garmin answered ' + status);
    e.inloggning = status === 401 || status === 403;
    throw e;
  }
  try {
    const profil = await hamta('/userprofile-service/socialProfile');
    const namn = encodeURIComponent(profil.displayName);
    const natter = {};
    const natt = async d => {
      const j = await hamta(`/wellness-service/wellness/dailySleepData/${namn}?date=${d}&nonSleepBufferMinutes=60`);
      const x = j?.dailySleepDTO;
      if (x?.sleepTimeSeconds) natter[d] = { s: x.sleepTimeSeconds, p: x.sleepScores?.overall?.value ?? null, in: x.sleepStartTimestampLocal || null, ut: x.sleepEndTimestampLocal || null };
      return !!x?.sleepTimeSeconds;
    };
    const slut = Date.parse(till + 'T12:00:00Z');
    if (fran) {
      for (let t = Date.parse(fran + 'T12:00:00Z'); t <= slut; t += DAG) await natt(iso(t));
    } else {
      // Everything: backwards a week at a time until 90 days in a row without sleep, at most 25 years.
      let tomma = 0;
      for (let t = slut; tomma < 90 && t > slut - 9131 * DAG; t -= 7 * DAG) {
        const vecka = [...Array(7)].map((_, i) => iso(t - i * DAG));
        const fanns = await Promise.all(vecka.map(natt));
        tomma = fanns.some(Boolean) ? 0 : tomma + 7;
      }
    }
    svara({ natter });
  } catch (e) {
    svara({ fel: String(e.message || e), inloggning: !!e.inloggning });
  }
}

// The local clock time of a timestamp that Garmin already gives in local time.
const klockslag = ms => ms ? new Date(ms).toISOString().slice(11, 16) : '';

// Nights in the same form as the sleep CSV: hours with two decimals, as garmin.py writes them.
export function garminNatter(natter) {
  const ut = {};
  for (const [d, n] of Object.entries(natter || {})) ut[d] = { h: avrunda(n.s / 3600, 2), p: n.p ?? null, in: klockslag(n.in), ut: klockslag(n.ut) };
  return ut;
}
