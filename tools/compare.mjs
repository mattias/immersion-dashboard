// Reads the sources from disk with the app's own code and compares day by day against a data.js
// from the old Python dashboard. Example:
//   node tools/compare.mjs --data ../anki-plan/dashboard/data.js --anki "%APPDATA%/Anki2" --gsm ... --drive "G:/My Drive" --mokuro volumes.json --mpv ...
import { readFile, writeFile } from 'node:fs/promises';
import initSqlJs from 'sql.js';
import { kombinera, norm } from '../js/calc.js';
import { lasAnki, lasGsm, lasLasare, lasMokuro, lasMpv, lasSomn } from '../js/sources.js';
import { nodeMapp } from './nodedir.mjs';

const arg = {};
for (let i = 2; i < process.argv.length; i++) {
  const k = process.argv[i].replace(/^--/, '');
  arg[k] = process.argv[i + 1]?.startsWith('--') || i + 1 >= process.argv.length ? true : process.argv[++i];
}
const o = { rollover: 4, mining: 'Mining', wal: !arg['no-wal'], profil: arg.profil || '', paus: 180, maxFart: 20000, bort: ['GSM Helper', 'Discord'], ttu: true, yatsu: true, hoshi: true, mokuro: !arg.mokuro };
const SQL = await initSqlJs();
const res = [];
const tid = async (namn, f) => { const t = Date.now(); const r = await f(); console.log(`${namn}: ${Date.now() - t} ms`); return r; };
if (arg.anki) res.push(await tid('anki', () => lasAnki(nodeMapp(arg.anki), o, SQL)));
if (arg.gsm) res.push(await tid('gsm', () => lasGsm(nodeMapp(arg.gsm), o, SQL)));
if (arg.drive) res.push(await tid('drive', () => lasLasare(nodeMapp(arg.drive), o)));
if (arg.mokuro) res.push(await tid('mokuro', async () => lasMokuro({ text: () => readFile(arg.mokuro, 'utf8') }, o)));
if (arg.mpv) res.push(await tid('mpv', () => lasMpv(nodeMapp(arg.mpv))));
if (arg.somn) res.push(await tid('somn', async () => lasSomn({ text: () => readFile(arg.somn, 'utf8') })));
const js = kombinera(res);
// --export file: the same results as an export file that the app can import.
if (arg.export) {
  const ids = ['anki', 'gsm', 'lasare', 'mokuro', 'mpv', 'somn'].filter(k => arg[{ lasare: 'drive' }[k] || k]);
  const resultat = Object.fromEntries(ids.map((k, i) => [k, { akt: res[i].akt, anki: res[i].anki, minade: res[i].minade, somn: res[i].somn, tid: Date.now() }]));
  await writeFile(arg.export, JSON.stringify({ app: 'immersion-dashboard', version: 1, exporterad: new Date().toISOString(), resultat }));
}
if (!arg.data) process.exit(0);

const txt = await readFile(arg.data, 'utf8');
const py = JSON.parse(txt.slice(txt.indexOf('{'), txt.lastIndexOf('}') + 1)).dagar;
const tom = d => !d || (!d.akt?.length && !d.anki && !d.minade && !d.somn);
let fel = 0, lika = 0;
const visa = (dag, vad) => { fel++; if (fel <= 60) console.log(dag, vad); };
for (const dag of [...new Set([...Object.keys(js), ...Object.keys(py)])].sort()) {
  const a = js[dag], b = py[dag];
  if (tom(a) && tom(b)) continue;
  let ok = true;
  const akt = d => new Map((d?.akt || []).map(x => [x.k + '|' + norm(x.t), x]));
  const ja = akt(a), pb = akt(b);
  for (const k of new Set([...ja.keys(), ...pb.keys()])) {
    const x = ja.get(k), y = pb.get(k);
    const s = z => z ? `${z.c} tecken ${z.m} min ${z.s}${z.e ? ' ep ' + z.e : ''}` : '–';
    if (s(x) !== s(y)) { ok = false; visa(dag, `${k}: js ${s(x)} | py ${s(y)}`); }
  }
  const anki = d => d?.anki ? JSON.stringify({ ...d.anki, d: Object.fromEntries(Object.entries(d.anki.d).map(([k, v]) => [k === 'Borttagna kort' ? 'Deleted cards' : k, v]).sort()) }) : '–';
  if (anki(a) !== anki(b)) { ok = false; visa(dag, `anki: js ${anki(a)} | py ${anki(b)}`); }
  if ((a?.minade || 0) !== (b?.minade || 0)) { ok = false; visa(dag, `minade: js ${a?.minade} | py ${b?.minade}`); }
  const somn = d => d?.somn ? JSON.stringify(d.somn) : '–';
  if (somn(a) !== somn(b)) { ok = false; visa(dag, `somn: js ${somn(a)} | py ${somn(b)}`); }
  if (ok) lika++;
}
console.log(`\n${lika} days equal, ${fel} differences`);
process.exitCode = fel ? 1 : 0;
