// Calculation rules shared by every source. Pure functions, so the same code runs in the browser and in Node tests.

export const DAG_MS = 864e5;

const pad = n => String(n).padStart(2, '0');
export const datum = d => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;

// Local calendar day for a Unix time in seconds.
export const lokal = sek => datum(new Date(sek * 1000));

// Local day with a rollover hour, like Anki where the day changes at 04:00.
export function dagMedByte(ms, timme) {
  const t = new Date(ms);
  if (t.getHours() >= timme) return datum(t);
  return datum(new Date(t.getFullYear(), t.getMonth(), t.getDate() - 1, 12));
}

// Same title regardless of width and spacing, so one book from several readers counts once.
export const norm = s => String(s).normalize('NFKC').replace(/[\s　]/g, '');

// Python's round(): rounds the exact binary value, and only true ties go to the even neighbour.
export function avrunda(x, d = 1) {
  const exakt = Math.abs(x).toFixed(100), i = exakt.indexOf('.') + d + 1;
  if (exakt[i] === '5' && /^0*$/.test(exakt.slice(i + 1))) {
    const m = Math.trunc(Math.abs(x) * 10 ** d), upp = m % 2 === 1;
    return Math.sign(x) * (m + (upp ? 1 : 0)) / 10 ** d;
  }
  return Number(x.toFixed(d));
}

// Collects activity per day. The largest entry per (type, title) wins, because the same book
// can be synced to several folders and must not be summed.
export class Dagar {
  constructor() { this.d = new Map(); }

  dag(dag) {
    if (!this.d.has(dag)) this.d.set(dag, { akt: new Map() });
    return this.d.get(dag);
  }

  akt(dag, typ, titel, tecken, minuter, kalla, avsnitt) {
    if (tecken <= 0 && minuter < 0.5) return;
    const a = this.dag(dag).akt, k = typ + '\u0000' + norm(titel);
    if (!a.has(k) || tecken > a.get(k).c) a.set(k, { k: typ, t: titel, c: Math.trunc(tecken), m: avrunda(minuter, 1), s: kalla });
    if (avsnitt && avsnitt.length && a.has(k)) a.get(k).e = [...avsnitt].sort((x, y) => x - y);
  }

  // Adds the stored result of one source.
  lagg(res) {
    for (const r of res.akt || []) this.akt(...r);
    for (const [dag, a] of Object.entries(res.anki || {})) this.dag(dag).anki = a;
    for (const [dag, n] of Object.entries(res.minade || {})) {
      const d = this.dag(dag);
      d.minade = (d.minade || 0) + n;
    }
    for (const [dag, x] of Object.entries(res.somn || {})) this.dag(dag).somn = x;
  }

  json() {
    const ut = {};
    for (const dag of [...this.d.keys()].sort()) {
      const d = this.d.get(dag), o = { akt: [...d.akt.values()].sort((a, b) => b.m - a.m) };
      if (d.anki) o.anki = d.anki;
      if (d.minade) o.minade = d.minade;
      if (d.somn) o.somn = d.somn;
      ut[dag] = o;
    }
    return ut;
  }
}

export function kombinera(resultat) {
  const d = new Dagar();
  for (const r of resultat) if (r) d.lagg(r);
  return d.json();
}

// Builds one source result. akt() records calls in order; the max rule is applied when results are combined.
export function nyttResultat() {
  const r = { akt: [], anki: {}, minade: {}, somn: {} };
  r.lagg = (dag, typ, titel, tecken, minuter, kalla, avsnitt) => {
    if (tecken <= 0 && minuter < 0.5) return;
    const rad = [dag, typ, titel, Math.trunc(tecken), minuter, kalla];
    if (avsnitt && avsnitt.length) rad.push(avsnitt);
    r.akt.push(rad);
  };
  return r;
}
export const rent = r => ({ akt: r.akt, anki: r.anki, minade: r.minade, somn: r.somn });

// Anki revlog rows: [id, cid, ease, ms, type, did, odid] sorted by id.
export function ankiDagar(rader, lekar, timme, borttagen = 'Deleted cards') {
  const ut = {}, sett = new Set();
  for (const [id, cid, ease, ms, typ, did, odid] of rader) {
    if (typ === 4 || ease === 0) continue;
    const dag = dagMedByte(id, timme);
    const a = ut[dag] ||= { r: 0, m: 0, n: 0, ok: 0, t: 0, d: {} };
    a.r++;
    a.m += ms / 60000;
    if (!sett.has(cid)) {
      sett.add(cid);
      if (typ === 0) a.n++;
    }
    if (typ === 1) { a.t++; a.ok += ease > 1 ? 1 : 0; }
    const namn = (lekar.get(odid || did) ?? borttagen).split('::').pop();
    a.d[namn] = (a.d[namn] || 0) + 1;
  }
  for (const a of Object.values(ut)) a.m = avrunda(a.m, 1);
  return ut;
}

export function minadeDagar(notid) {
  const ut = {};
  for (const nid of notid) { const d = lokal(nid / 1000); ut[d] = (ut[d] || 0) + 1; }
  return ut;
}

// GameSentenceMiner: rollup rows [date, gameId, chars, seconds], line rows [gameId, timestamp, length].
export function gsmResultat(namn, rollup, lines, o) {
  const r = nyttResultat(), bort = new Set(o.bort), titel = g => namn.get(g) || 'Unknown game';
  let sista = '';
  for (const [dag, g, c, s] of rollup) {
    if (dag > sista) sista = dag;
    if (bort.has(titel(g))) continue;
    const m = Number(s || 0) / 60;
    // Skipped text is captured too, so speed is capped.
    r.lagg(dag, 'spel', titel(g), Math.min(Math.trunc(c || 0), Math.trunc(m / 60 * o.maxFart)), m, 'GSM');
  }
  // GSM only rolls a day up afterwards, so later days are counted from the lines.
  const per = new Map();
  for (const [g, ts, n] of lines) {
    const dag = lokal(ts);
    if (dag <= sista) continue;
    const k = dag + '\u0000' + g;
    if (!per.has(k)) per.set(k, { dag, g, c: 0, s: 0, sist: null });
    const p = per.get(k);
    p.c += n || 0;
    if (p.sist) p.s += Math.min(ts - p.sist, o.paus);
    p.sist = ts;
  }
  for (const p of per.values()) if (!bort.has(titel(p.g))) r.lagg(p.dag, 'spel', titel(p.g), p.c, p.s / 60, 'GSM');
  return rent(r);
}

// ttu and yatsu statistics_*.json rows.
export function ttuResultat(r, rader, kalla) {
  for (const x of rader) r.lagg(x.dateKey, 'bok', x.title, x.charactersRead || 0, (x.readingTime || 0) / 60, kalla);
}

// One Hoshi Reader state file (parsed JSON).
export function hoshiResultat(r, j) {
  const titel = j.metadata.value.title, per = new Map();
  for (const s of Object.values(j.sessions || {})) {
    const v = s.value;
    if (v && (v.readingTime || 0) > 0) {
      const d = lokal(v.startedAt / 1000);
      if (!per.has(d)) per.set(d, [0, 0]);
      const p = per.get(d);
      p[0] += v.charactersRead || 0;
      p[1] += v.readingTime;
    }
  }
  for (const [dag, [c, s]] of per) r.lagg(dag, 'bok', titel, c, s / 60, 'Hoshi');
}

const jmfLista = (a, b) => {
  for (let i = 0; i < Math.min(a.length, b.length); i++) if (a[i] !== b[i]) return a[i] < b[i] ? -1 : 1;
  return a.length - b.length;
};

export const mokuroTitel = t => t.replace(/\[[^\]]*\]|\([^)]*\)|（[^）]*）(?=\s*\[)/g, '').replace(/\s+/g, ' ').trim() || t;

// Mokuro's "volumes" object from reader.mokuro.app.
export function mokuroResultat(volymer, o) {
  const r = nyttResultat();
  for (const v of Object.values(volymer || {})) {
    if (!v || typeof v !== 'object' || Array.isArray(v) || v.deletedOn || !v.volume_title) continue;
    const titel = mokuroTitel(v.volume_title);
    const turer = [...(v.recentPageTurns || [])].sort(jmfLista);
    const per = new Map();
    let hogst = turer.length ? turer[0][2] : 0;
    for (let i = 1; i < turer.length; i++) {
      const a = turer[i - 1], b = turer[i], d = lokal(b[0] / 1000);
      if (!per.has(d)) per.set(d, [0, 0]);
      const p = per.get(d);
      // Paging back and forward again is not new text.
      p[0] += Math.max(0, b[2] - hogst);
      hogst = Math.max(hogst, b[2]);
      p[1] += Math.min((b[0] - a[0]) / 1000, o.paus) / 60;
    }
    // Mokuro prunes old page turns, so the rest of the volume's totals go on the last day.
    if (per.size) {
      const sist = [...per.keys()].sort().pop(), sum = i => [...per.values()].reduce((x, p) => x + p[i], 0);
      const c = Math.max(0, (v.chars || 0) - sum(0)), m = Math.max(0, (v.timeReadInMinutes || 0) - sum(1));
      per.get(sist)[0] += c;
      per.get(sist)[1] += m;
    }
    for (const [dag, [c, m]] of per) if (m >= 1) r.lagg(dag, 'manga', titel, Math.min(c, Math.trunc(m / 60 * o.maxFart)), m, 'Mokuro');
  }
  return rent(r);
}

// immersion-mpv stats.jsonl: each line is an increment, so lines are summed per (date, file).
export function mpvResultat(text) {
  const filer = new Map();
  for (const rad of text.split(/\r?\n/)) {
    if (!rad.trim()) continue;
    const x = JSON.parse(rad), k = x.date + '\u0000' + x.file;
    if (!filer.has(k)) filer.set(k, { dag: x.date, fil: x.file, s: 0, c: 0, titel: null, e: null });
    const p = filer.get(k);
    p.s += x.seconds || 0;
    p.c += x.chars || 0;
    // The title AniList recognised wins over earlier guesses.
    if (x.anilist_id || !p.titel) p.titel = x.title || x.file;
    if ('episode' in x) p.e = x.episode;
  }
  const serier = new Map();
  for (const p of filer.values()) {
    const titel = p.titel !== p.fil ? p.titel : p.fil.replace(/\[[^\]]*\]|\([^)]*\)|\.\w+$/g, '').trim();
    const k = p.dag + '\u0000' + titel;
    if (!serier.has(k)) serier.set(k, { dag: p.dag, titel, c: 0, s: 0, e: new Set() });
    const s = serier.get(k);
    s.c += p.c;
    s.s += p.s;
    if (p.e != null && p.s >= 60) s.e.add(p.e);
  }
  const r = nyttResultat();
  for (const s of serier.values()) r.lagg(s.dag, 'titta', s.titel, s.c, s.s / 60, 'mpv', [...s.e]);
  return rent(r);
}

// Immersion Web, the browser extension, and the Android app's watching on the phone: immersion-web.json and
// immersion-phone.json hold totals per (date, site, video), Japanese only, in the same format.
// Videos are summed per series over both files: the channel on YouTube and Twitch, the show on Netflix.
const SAJTER = { youtube: 'YouTube', netflix: 'Netflix', twitch: 'Twitch' };
export function webbResultat(...texter) {
  const entries = texter.flatMap(text => {
    const j = JSON.parse(text);
    if (j?.app !== 'immersion-web' && j?.app !== 'immersion-phone') throw new Error('That file was not written by Immersion Web or the Android app.');
    return j.entries || [];
  });
  const serier = new Map();
  for (const p of entries) {
    const titel = p.series || p.title || SAJTER[p.site] || p.site, k = p.date + '\u0000' + p.site + '\u0000' + titel;
    if (!serier.has(k)) serier.set(k, { dag: p.date, kalla: SAJTER[p.site] || p.site, titel, c: 0, s: 0, e: new Set() });
    const s = serier.get(k);
    s.c += p.chars || 0;
    s.s += p.seconds || 0;
    if (Number.isInteger(p.episode) && p.seconds >= 60) s.e.add(p.episode);
  }
  const r = nyttResultat();
  for (const s of serier.values()) r.lagg(s.dag, 'titta', s.titel, s.c, s.s / 60, s.kalla, [...s.e]);
  return rent(r);
}

// Sleep per night from a CSV file, such as the one garmin.py writes. Swedish or English column names.
export function somnResultat(text) {
  const rader = text.replace(/^\uFEFF/, '').split(/\r?\n/).filter(r => r.trim());
  if (!rader.length) return rent(nyttResultat());
  const delar = r => r.split(/[,;\t]/).map(x => x.trim().replace(/^"|"$/g, ''));
  const rubrik = delar(rader[0]).map(x => x.toLowerCase());
  const kol = (...n) => rubrik.findIndex(x => n.includes(x));
  const [d, h, p, i, u] = [kol('datum', 'date', 'calendardate'), kol('timmar', 'hours', 'sleep_hours'), kol('poang', 'score', 'sleep_score'), kol('somnade', 'bedtime', 'start'), kol('vaknade', 'wake', 'end')];
  if (d < 0 || h < 0) throw new Error('The sleep file needs a date column (datum or date) and an hours column (timmar or hours).');
  const r = nyttResultat();
  for (const rad of rader.slice(1)) {
    const x = delar(rad), timmar = parseFloat(x[h]);
    if (!/^\d{4}-\d\d-\d\d$/.test(x[d]) || x[h] === '' || !Number.isFinite(timmar)) continue;
    const poang = p >= 0 && x[p] !== '' ? parseInt(x[p], 10) : null;
    r.somn[x[d]] = { h: timmar, p: Number.isFinite(poang) ? poang : null, in: i >= 0 ? x[i] : '', ut: u >= 0 ? x[u] : '' };
  }
  return rent(r);
}
