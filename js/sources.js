// Reads each source into a result of the form { akt, anki, minade }.
// Folders come in through a small adapter (see mapp() in store.js and tools/nodedir.mjs), so the same code runs in Node.
import { ankiDagar, minadeDagar, gsmResultat, ttuResultat, hoshiResultat, mokuroResultat, mpvResultat, webbResultat, somnResultat, nyttResultat, rent } from './calc.js';
import { oppna, rader } from './sqlite.js';

const vanta = ms => new Promise(ok => setTimeout(ok, ms));
const bytes = async f => f ? new Uint8Array(await f.arrayBuffer()) : null;
const text = async f => (await f.text()).replace(/^﻿/, '');

export class Kallfel extends Error {}

// Anki: either the profile folder itself or the Anki2 folder with one profile per subfolder.
export async function ankiProfil(dir, profil) {
  if (await dir.file('collection.anki2')) return { dir, profiler: [] };
  const profiler = [], andrad = {};
  for (const e of await dir.entries()) {
    if (e.kind !== 'directory') continue;
    const d = await dir.dir(e.name), f = d && await d.file('collection.anki2');
    if (f) { profiler.push(e.name); andrad[e.name] = f.lastModified || 0; }
  }
  if (!profiler.length) throw new Kallfel('No collection.anki2 here. Choose the Anki2 folder or a profile folder inside it.');
  profiler.sort();
  // Without a chosen profile, the one used most recently.
  const namn = profiler.includes(profil) ? profil : profiler.reduce((a, b) => andrad[b] > andrad[a] ? b : a);
  return { dir: await dir.dir(namn), profiler, profil: namn };
}

export async function lasAnki(dir, o, SQL) {
  const p = await ankiProfil(dir, o.profil);
  const fil = await bytes(await p.dir.file('collection.anki2'));
  const wal = o.wal === false ? null : await bytes(await p.dir.file('collection.anki2-wal'));
  const db = oppna(SQL, fil, wal);
  try {
    const lekar = new Map(rader(db, 'select id, name from decks').map(([id, n]) => [id, String(n).replaceAll('\x1f', '::')]));
    const rev = rader(db, 'select r.id, r.cid, r.ease, r.time, r.type, c.did, c.odid from revlog r left join cards c on c.id = r.cid order by r.id');
    const not = rader(db, "select distinct n.id from notes n join cards c on c.nid = n.id join decks d on d.id = c.did where d.name like '%' || ?", [o.mining]);
    return { akt: [], anki: ankiDagar(rev, lekar, o.rollover), minade: o.mining ? minadeDagar(not.map(r => r[0])) : {}, profil: p.profil, profiler: p.profiler };
  } finally { db.close(); }
}

// AnkiConnect: no SQL, so reviews are read per deck. Only deck names from deckNames are used,
// because cardReviews creates a deck that does not exist.
export async function lasAnkiConnect(o, hamta = fetch) {
  const anrop = async (action, params) => {
    let svar;
    try {
      svar = await hamta(o.url, { method: 'POST', body: JSON.stringify({ action, version: 6, params, ...(o.nyckel ? { key: o.nyckel } : {}) }) });
    } catch { throw new Kallfel(`Could not reach AnkiConnect at ${o.url}. Is Anki open, and is this page's address in webCorsOriginList?`); }
    if (svar.status === 403) throw new Kallfel('AnkiConnect refused this page. Add its address to webCorsOriginList in the AnkiConnect config.');
    const j = await svar.json();
    if (j.error) throw new Kallfel('AnkiConnect: ' + j.error);
    return j.result;
  };
  const namn = await anrop('deckNames');
  const ider = await anrop('deckNamesAndIds');
  const lekar = new Map(Object.entries(ider).map(([n, id]) => [id, n]));
  const alla = [];
  for (const lek of namn) {
    for (const [id, cid, , ease, , , , ms, typ] of await anrop('cardReviews', { deck: lek, startID: 0 })) alla.push([id, cid, ease, ms, typ, ider[lek], 0]);
  }
  alla.sort((a, b) => a[0] - b[0]);
  const mining = namn.filter(n => n.toLowerCase().endsWith(o.mining.toLowerCase()));
  const not = new Set();
  for (const n of mining) for (const id of await anrop('findNotes', { query: `"deck:${n.replaceAll('"', '\\"')}" -"deck:${n.replaceAll('"', '\\"')}::*"` })) not.add(id);
  return { akt: [], anki: ankiDagar(alla, lekar, o.rollover), minade: o.mining ? minadeDagar(not) : {} };
}

export async function lasGsm(dir, o, SQL) {
  const f = await dir.file('gsm.db');
  if (!f) throw new Kallfel('No gsm.db here. Choose the GameSentenceMiner folder.');
  const db = oppna(SQL, await bytes(f), await bytes(await dir.file('gsm.db-wal')));
  try {
    const namn = new Map(rader(db, 'select id, title_original from games'));
    const rollup = rader(db, 'select date, game_id, total_characters, total_reading_time_seconds from game_daily_rollup');
    const lines = rader(db, 'select game_id, timestamp, length(line_text) from game_lines order by timestamp');
    return gsmResultat(namn, rollup, lines, o);
  } finally { db.close(); }
}

const efterNamn = (a, b) => a.name < b.name ? -1 : a.name > b.name ? 1 : 0;

// The Google Drive folder synced to the computer: ttu, yatsu, Hoshi Reader and Mokuro keep their data there.
export async function lasLasare(dir, o) {
  const r = nyttResultat();
  let hittat = false;
  for (const m of (await dir.entries()).filter(e => e.kind === 'directory').sort(efterNamn)) {
    const t = /^(ttu|yatsu)-reader-data/.exec(m.name);
    if (!t || !o[t[1]]) continue;
    hittat = true;
    const md = await dir.dir(m.name);
    for (const bok of (await md.entries()).filter(e => e.kind === 'directory').sort(efterNamn)) {
      const bd = await md.dir(bok.name);
      for (const f of (await bd.entries()).filter(e => e.kind === 'file' && /^statistics_.*\.json$/.test(e.name)).sort(efterNamn)) {
        ttuResultat(r, JSON.parse(await text(await bd.file(f.name)) || '[]'), t[1]);
      }
    }
  }
  const hoshi = o.hoshi && await dir.dir('Hoshi Reader');
  const state = hoshi && await hoshi.dir('state');
  if (state) {
    hittat = true;
    for (const f of (await state.entries()).filter(e => e.kind === 'file').sort(efterNamn)) {
      if (!/\.(json|b64)$/.test(f.name) || f.name === '.shelves.json') continue;
      const t = (await text(await state.file(f.name))).trim();
      const j = JSON.parse(t.startsWith('{') ? t : new TextDecoder().decode(Uint8Array.from(atob(t), c => c.charCodeAt(0))));
      hoshiResultat(r, j);
    }
  }
  // Mokuro's own Google Drive sync keeps the same volumes as the reader.
  const mok = o.mokuro && await dir.dir('mokuro-reader');
  const vd = mok && await mok.file('volume-data.json');
  if (vd) {
    hittat = true;
    r.akt.push(...mokuroResultat(JSON.parse(await text(vd)), o).akt);
  }
  if (!hittat) throw new Kallfel('Found no ttu-reader-data, yatsu-reader-data, Hoshi Reader or mokuro-reader folder here. Choose the top of your Google Drive (My Drive).');
  return rent(r);
}

// A file with Mokuro's volumes: the localStorage value from reader.mokuro.app.
export async function lasMokuro(fil, o) {
  let j;
  try { j = JSON.parse(await text(fil)); } catch { throw new Kallfel('The Mokuro file is not valid JSON.'); }
  if (j && typeof j.volumes === 'string') j = JSON.parse(j.volumes);
  return mokuroResultat(j, o);
}

// Sleep: a CSV file with one night per row.
export async function lasSomn(fil) {
  try { return somnResultat(await text(fil)); } catch (e) { throw new Kallfel(e.message); }
}

// immersion-mpv: stats.jsonl is missing for a moment while it is compacted. Nothing else in the folder is read.
export async function lasMpv(dir) {
  for (let i = 0; i < 5; i++) {
    const f = await dir.file('stats.jsonl');
    if (f) return mpvResultat(await text(f));
    await vanta(1000);
  }
  throw new Kallfel('No stats.jsonl here. Choose the immersion-mpv folder.');
}

// Netflix, YouTube and Twitch: the files the Immersion Web extension and the Android app put in the dashboard's app folder
// in Google Drive. hamtaText(name) gives a file's text, or null when there is no such file.
export const WEBBFILER = ['immersion-web.json', 'immersion-phone.json'];
export async function lasWebb(hamtaText) {
  let texter;
  // The Windows app's commands fail with plain text, not an Error.
  try { texter = await Promise.all(WEBBFILER.map(n => hamtaText(n))); } catch (e) { throw e instanceof Kallfel ? e : new Kallfel('Google Drive: ' + (e?.message || e)); }
  texter = texter.filter(t => t != null);
  if (!texter.length) throw new Kallfel('Nothing uploaded yet. Sign in with Google in the Immersion Web extension, or in Watching in the Android app.');
  try { return webbResultat(...texter); } catch (e) { throw new Kallfel(e.message); }
}
