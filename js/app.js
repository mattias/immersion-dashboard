// Ties the app together: settings, where each source is, syncing, setup, export and import.
// Runs both as the Windows app (reads AppData directly) and as the web app (folder handles, or data synced from the computer).
import { kombinera } from './calc.js';
import { lasAnki, lasAnkiConnect, lasGsm, lasLasare, lasMokuro, lasMpv, lasWebb, lasSomn, Kallfel } from './sources.js';
import { hamta, spara, radera, installningar, mapp, harBehorighet } from './store.js';
import { visa, sattBild } from './view.js';
import { APP, invoke, appMapp, appFil, ankiConnectViaApp } from './plattform.js';
import * as moln from './moln.js';
import { garminSkript, garminNatter } from './garmin.js';
import { datum } from './calc.js';

const $ = id => document.getElementById(id);
const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const SYS = /Mac|iPhone|iPad/.test(navigator.platform) ? 'mac' : /Win/.test(navigator.platform) ? 'win' : 'linux';
const MAPPAR = APP || 'showDirectoryPicker' in window;
const MOBIL = !MAPPAR && /Android|iPhone|iPad|Mobile/.test(navigator.userAgent);

// The sources in the order they are combined. When two sources have the same title on the same day, the largest entry counts.
// appdata: browsers may not open this folder on Windows and Mac, only the Windows app can.
const KALLOR = [
  { id: 'anki', namn: 'Anki', text: 'Reviews, time in Anki and mined cards.', typ: 'mapp', appdata: true,
    sokvag: { win: '%APPDATA%\\Anki2', mac: '~/Library/Application Support/Anki2', linux: '~/.local/share/Anki2' } },
  { id: 'gsm', namn: 'GameSentenceMiner', text: 'Visual novels and games read with GSM.', typ: 'mapp', appdata: true,
    sokvag: { win: '%APPDATA%\\GameSentenceMiner', mac: '~/.config/GameSentenceMiner', linux: '~/.config/GameSentenceMiner' } },
  { id: 'lasare', namn: 'Google Drive: ttu, yatsu, Hoshi Reader and Mokuro', text: 'Books and manga, through the folders these readers sync to Google Drive.', typ: 'mapp',
    sokvag: { win: 'G:\\My Drive', mac: '~/Google Drive/My Drive', linux: '~/GoogleDrive' },
    hjalp: 'Needs Google Drive for desktop. Choose the top of your Drive, the folder that holds ttu-reader-data, Hoshi Reader or mokuro-reader.' },
  { id: 'mokuro', namn: 'Mokuro without Google Drive', text: 'Manga read on reader.mokuro.app, from a file you download. Not needed if Mokuro syncs to Google Drive.', typ: 'fil' },
  { id: 'mpv', namn: 'immersion-mpv', text: 'Anime and video watched in mpv with immersion-mpv.', typ: 'mapp', appdata: true,
    sokvag: { win: '%APPDATA%\\immersion-mpv', mac: '~/.config/immersion-mpv', linux: '~/.config/immersion-mpv' } },
  { id: 'webb', namn: 'Netflix, YouTube and Twitch', text: 'Japanese video watched in the browser with the Immersion Web extension, and in the apps on an Android phone.', typ: 'drive' },
  { id: 'garmin', namn: 'Garmin Connect', text: 'Sleep per night from your Garmin watch.', typ: 'garmin' },
  { id: 'somn', namn: 'Sleep from a file', text: 'Hours of sleep per night from a CSV file, for watches other than Garmin.', typ: 'fil' }
];
const MOKURO_RAD = "(()=>{const a=document.createElement('a');a.href=URL.createObjectURL(new Blob([localStorage.volumes]));a.download='mokuro-volumes.json';a.click()})()";
const SPARRAD = SYS === 'win' || SYS === 'mac';

let S, STD = {}, synkar = false, bildUrl = null, senastSynk = 0;
const status = {};

const klockslag = t => new Date(t).toLocaleString('en-GB', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
const molnFinns = () => APP ? !!STD.google : moln.finns;

function meddela(text, ms = 6000) {
  const m = $('meddelande');
  m.textContent = text;
  m.hidden = false;
  clearTimeout(meddela.t);
  meddela.t = setTimeout(() => { m.hidden = true; }, ms);
}

let sqlLaddas;
function sql() {
  return sqlLaddas ||= new Promise((ok, fel) => {
    const s = document.createElement('script');
    s.src = 'vendor/sql-wasm.js';
    s.onload = () => initSqlJs({ locateFile: f => 'vendor/' + f }).then(ok, fel);
    s.onerror = () => fel(new Error('Could not load sql.js.'));
    document.head.appendChild(s);
  });
}

const valfritt = k => ({ ...S.kallor[k], paus: S.paus, maxFart: S.maxFart });
const appSokvag = k => S.kallor[k.id].sokvag || STD[k.id] || '';

// Where the source's data is: a folder or file adapter, or null when it is not set up on this device.
async function plats(k, fraga) {
  if (k.typ === 'garmin') return APP ? 'garmin' : null;
  if (k.typ === 'drive') return molnFinns() ? 'drive' : null;
  if (k.typ === 'garmin') return r ? `<span class="status ok">✓ ${Object.keys(r.somn || {}).length} nights${last}</span>` : '<span class="status">Not fetched yet</span>';
  if (APP) {
    const p = appSokvag(k);
    if (!p) return null;
    return k.typ === 'fil' ? appFil(p) : appMapp(p);
  }
  if (!MAPPAR) return null;
  const h = await hamta('handtag:' + k.id);
  if (!h) return null;
  if (!await harBehorighet(h, fraga)) return 'vantar';
  return k.typ === 'fil' ? await h.getFile() : mapp(h);
}

async function lasAnkiKalla(p, o) {
  const connect = o => lasAnkiConnect(o, APP ? ankiConnectViaApp : fetch);
  if (o.lage === 'connect') return connect(o);
  try {
    if (!p) throw new Kallfel('No Anki folder found.');
    const r = await lasAnki(p, o, await sql());
    status.profiler = r.profiler;
    status.profil = r.profil;
    return r;
  } catch (e) {
    // AnkiConnect is the backup when the collection file cannot be read.
    if (!APP) throw e;
    try { return { ...await connect(o), via: 'AnkiConnect' }; } catch { throw e; }
  }
}

// The first time everything Garmin has; after that from three days before the last night fetched, since watches sync late.
async function lasGarmin(fraga) {
  const forra = await hamta('resultat:garmin');
  const kanda = Object.keys(forra?.somn || {}).sort();
  const fran = kanda.length ? datum(new Date(Date.parse(kanda.at(-1) + 'T12:00:00') - 3 * 864e5)) : null;
  const svar = JSON.parse(await invoke('garmin_hamta', { skript: garminSkript(fran, datum(new Date())), visa: fraga }));
  if (svar.fel) throw new Kallfel('Garmin: ' + svar.fel);
  return { akt: [], anki: {}, minade: {}, somn: { ...forra?.somn, ...garminNatter(svar.natter) } };
}

let fragaNu = false, tokenNu = null;
function las(k, p) {
  const o = valfritt(k.id);
  if (k.id === 'anki') return lasAnkiKalla(p, o);
  if (k.id === 'gsm') return sql().then(SQL => lasGsm(p, { ...o, bort: o.bort.split(',').map(x => x.trim()).filter(Boolean) }, SQL));
  if (k.id === 'lasare') return lasLasare(p, o);
  if (k.id === 'mokuro') return lasMokuro(p, o);
  if (k.id === 'somn') return lasSomn(p);
  if (k.id === 'garmin') return lasGarmin(fragaNu);
  if (k.id === 'webb') return lasWebb(async namn => {
    if (APP) return invoke('drive_las', { namn, fraga: fragaNu });
    const t = await tokenNu;
    if (!t) throw new Kallfel('Press ↻ to fetch from Google Drive.');
    if (t instanceof Error) throw new Kallfel(t.message);
    return moln.hamtaText(t, namn);
  });
  return lasMpv(p);
}

// fraga: the user clicked, so the browser may ask for permission and Google may ask to sign in.
async function synka(fraga) {
  if (synkar) return;
  synkar = true;
  senastSynk = Date.now();
  $('synk').classList.add('snurrar');
  const medMoln = molnFinns() && S.moln.pa;
  // Immersion Web is read from Drive even when the dashboard's own copy is not synced.
  const behoverToken = !APP && moln.finns && (medMoln || S.kallor.webb.pa);
  const webbToken = behoverToken && (fraga || moln.harToken()) ? moln.begarToken().catch(e => e) : null;
  const fel = [];
  let lastes = 0, vantar = false;
  fragaNu = fraga;
  tokenNu = webbToken;
  try {
    // Permissions first, while the click still counts as a user gesture.
    const platser = {};
    for (const k of KALLOR) {
      if (!S.kallor[k.id].pa) continue;
      const p = await plats(k, fraga);
      if (p === 'vantar') { vantar = true; status[k.id] = { fel: 'Waiting for permission. Click sync to allow.' }; } else platser[k.id] = p;
    }
    for (const k of KALLOR) {
      if (!S.kallor[k.id].pa || !(k.id in platser)) continue;
      if (!platser[k.id] && !(k.id === 'anki' && (APP || S.kallor.anki.lage === 'connect'))) continue;
      // Google may only ask to sign in after a click, so until then the last result read is shown.
      if (k.typ === 'drive' && !APP && !webbToken) { status[k.id] = { fel: 'Press ↻ to fetch from Google Drive.' }; continue; }
      try {
        const r = await las(k, platser[k.id]);
        await spara('resultat:' + k.id, { akt: r.akt, anki: r.anki, minade: r.minade, somn: r.somn, tid: Date.now(), har: true });
        status[k.id] = { ok: true, via: r.via };
        lastes++;
      } catch (e) {
        console.error(e);
        status[k.id] = { fel: e.message };
        fel.push(`${k.namn}: ${e.message}`);
      }
    }
    if (medMoln && (APP || webbToken)) await synkaMoln(fraga, webbToken).catch(e => {
      console.error(e);
      status.moln = { fel: e.message };
      if (fraga || !/not signed in/.test(e.message)) fel.push('Google Drive: ' + e.message);
    });
    else if (medMoln && !APP && !fraga) status.moln = { fel: 'Press ↻ to fetch from Google Drive.' };
  } finally {
    synkar = false;
    $('synk').classList.remove('snurrar');
    $('synk').toggleAttribute('data-vantar', vantar);
  }
  await ritaOm(fel[0]);
  if (fel.length) meddela(fel.join(' · '), 10000);
  else if (fraga && !lastes && !medMoln) meddela('Nothing to sync yet. Choose your sources in Settings.');
  if ($('dialog').open) ritaDialog();
}

// Newest result per source wins, then everything goes back up.
async function synkaMoln(fraga, webbToken) {
  let data, id, token;
  if (APP) data = JSON.parse(await invoke('drive_hamta', { fraga }) || 'null');
  else {
    token = await webbToken;
    if (token instanceof Error) throw token;
    ({ id, data } = await moln.hamta(token));
  }
  for (const [k, r] of Object.entries(data?.resultat || {})) {
    if (!S.kallor[k]) continue;
    const har = await hamta('resultat:' + k);
    if (!har || r.tid > har.tid) await spara('resultat:' + k, { ...r, har: false });
  }
  const ut = await exportera();
  if (APP) await invoke('drive_spara', { data: JSON.stringify(ut) });
  else await moln.spara(token, id, ut);
  S.moln.senast = Date.now();
  status.moln = { ok: true, kallor: Object.keys(data?.resultat || {}).length };
  await spara('installningar', S);
}

async function ritaOm(fel) {
  const res = [];
  let senast = 0;
  for (const k of KALLOR) {
    const r = await hamta('resultat:' + k.id);
    // The tick means "read on this device". What another device read and synced is always shown,
    // so a phone with every source unticked still shows the computer's data.
    if (r && (S.kallor[k.id].pa || r.har === false)) { res.push(r); senast = Math.max(senast, r.tid); }
  }
  visa(kombinera(res), { mal: S.mal, uppdaterad: senast ? klockslag(senast) : '', fel });
}

async function exportera() {
  const resultat = {};
  for (const k of KALLOR) {
    const r = await hamta('resultat:' + k.id);
    if (r) resultat[k.id] = { akt: r.akt, anki: r.anki, minade: r.minade, somn: r.somn, tid: r.tid };
  }
  const { valkommen, ...installning } = S;
  return { app: 'immersion-dashboard', version: 1, exporterad: new Date().toISOString(), installningar: installning, resultat };
}

async function importera(fil) {
  let j;
  try { j = JSON.parse(await fil.text()); } catch { throw new Error('That file is not JSON.'); }
  if (j?.app !== 'immersion-dashboard') throw new Error('That file was not exported from this dashboard.');
  if (j.installningar) {
    const behall = { valkommen: true, kallor: S.kallor, moln: S.moln };
    S = { ...S, ...j.installningar, ...behall };
  }
  for (const [k, r] of Object.entries(j.resultat || {})) {
    if (!S.kallor[k]) continue;
    await spara('resultat:' + k, { ...r, har: false });
    S.kallor[k].pa = true;
  }
  await spara('installningar', S);
  await ritaOm();
}

function ladda(namn, data, typ = 'application/json') {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([data], { type: typ }));
  a.download = namn;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}

async function visaBakgrund() {
  const b = await hamta('bakgrund');
  if (bildUrl) URL.revokeObjectURL(bildUrl);
  bildUrl = b ? URL.createObjectURL(b) : null;
  sattBild(bildUrl);
}

// ---- Setup and settings ----

async function kallStatus(k) {
  const o = S.kallor[k.id], r = await hamta('resultat:' + k.id), st = status[k.id];
  if (st?.fel) return `<span class="status fel">${esc(st.fel)}</span>`;
  const last = r ? ` · read ${klockslag(r.tid)}${st?.via ? ' through ' + st.via : ''}` : '';
  if (k.id === 'anki' && o.lage === 'connect') return r ? `<span class="status ok">✓ AnkiConnect${last}</span>` : '<span class="status">Not read yet</span>';
  if (k.typ === 'drive') return r ? `<span class="status ok">✓ Google Drive${last}</span>` : '<span class="status">Not read yet</span>';
  if (APP) {
    const p = appSokvag(k);
    if (p) return `<span class="status ok">✓ <code>${esc(p)}</code>${last}</span>`;
  } else {
    const h = await hamta('handtag:' + k.id);
    if (h) return `<span class="status ok">✓ ${esc(h.name)}${last}</span>`;
  }
  if (r && !r.har) return `<span class="status ok">✓ From your other device · ${klockslag(r.tid)}</span>`;
  if (APP && k.id === 'anki') return '<span class="status">No Anki folder found. AnkiConnect is used if Anki is open.</span>';
  return `<span class="status">${k.typ === 'fil' ? 'No file chosen' : APP ? 'Not found in the usual place' : 'No folder chosen'}</span>`;
}

const sokvagRad = text => `<div class="sokvag">Folder: <code>${esc(text)}</code><button type="button" data-kopiera="${esc(text)}">Copy</button></div>`;

function falt(k) {
  const o = S.kallor[k.id];
  if (k.id === 'anki') {
    const prof = (status.profiler || []).length > 1 ? `<label>Profile<select data-k="anki.profil">${status.profiler.map(p => `<option ${p === (o.profil || status.profil) ? 'selected' : ''}>${esc(p)}</option>`).join('')}</select></label>` : '';
    return `<label>Mined cards come from decks ending in<input type="text" data-k="anki.mining" value="${esc(o.mining)}"></label>
      <label>New day starts at (hour)<input type="number" min="0" max="23" data-k="anki.rollover" value="${o.rollover}"></label>${prof}
      <label class="val"><input type="checkbox" data-k="anki.wal" ${o.wal ? 'checked' : ''}>Include reviews Anki has not saved to disk yet</label>
      <label class="val"><input type="checkbox" data-k="anki.lage" data-varde="connect" ${o.lage === 'connect' ? 'checked' : ''}>Always use AnkiConnect instead of the collection file</label>`;
  }
  if (k.id === 'gsm') return `<label>Games to leave out (comma separated)<input type="text" data-k="gsm.bort" value="${esc(o.bort)}"></label>`;
  if (k.id === 'lasare') return ['ttu', 'yatsu', 'hoshi', 'mokuro'].map(x => `<label class="val"><input type="checkbox" data-k="lasare.${x}" ${o[x] ? 'checked' : ''}>${{ ttu: 'ttu Ebook Reader', yatsu: 'yatsu', hoshi: 'Hoshi Reader', mokuro: 'Mokuro' }[x]}</label>`).join('');
  return '';
}

function filHjalp(k) {
  if (k.id === 'mokuro') return `<p class="liten">Mokuro keeps its data inside the reader. On reader.mokuro.app, open the browser console (F12 → Console), paste this line and press Enter. It downloads <code>mokuro-volumes.json</code>.</p>
    <div class="sokvag"><code>${esc(MOKURO_RAD)}</code><button type="button" data-kopiera="${esc(MOKURO_RAD)}">Copy</button></div>
    <p class="liten">Choose the file here. Every sync reads it again, so save new downloads over the same file.</p>`;
  return `<p class="liten">One row per night with a <code>date</code> (or <code>datum</code>) column and an <code>hours</code> (or <code>timmar</code>) column. A <code>score</code> column is used too. Every sync reads the file again.</p>`;
}

async function kallKort(k) {
  const o = S.kallor[k.id];
  let val = '';
  const connect = k.id === 'anki' && o.lage === 'connect';
  const knapp = `<button type="button" class="knapp" data-valj="${k.id}">${k.typ === 'fil' ? 'Choose file' : APP ? 'Choose another folder' : 'Choose folder'}</button>`;
  if (k.typ === 'garmin') {
    val += APP ? `<p class="liten">The first sync opens Garmin Connect's own sign-in page in a window. The dashboard never sees your password. It fetches every night Garmin has the first time, then only new nights.</p><div class="valrad">${await kallStatus(k)}${await hamta('resultat:garmin') ? '<button type="button" class="knapp tyst" id="garminOm">Fetch all nights again</button>' : ''}</div>`
      : `<p class="varning">Garmin can only be read by the Windows app${molnFinns() ? ', which syncs it here through Google Drive' : ''}.</p>`;
  } else if (k.typ === 'drive') {
    val += molnFinns() ? `<p class="liten">Install <a href="https://github.com/mattias/immersion-web" target="_blank" rel="noopener">Immersion Web</a> in Vivaldi, Chrome or Edge and sign in with Google there. It counts only time when the video plays with sound, and uploads Japanese watching to the same hidden app folder in your Drive. The dashboard fetches it when you sync.</p><p class="liten">On Android, the 旅の記録 app counts the YouTube, Netflix and Twitch apps too: open <a href="intent://watching#Intent;scheme=immersiondashboard;package=io.github.mattias.immersiondashboard;end">Watching</a> (also its own icon) and connect Google Drive there.</p><div class="valrad">${await kallStatus(k)}</div>`
      : '<p class="varning">Needs Google Drive, which this copy of the dashboard has no client ID for.</p>';
  } else if (connect) {
    val += APP ? '<p class="liten">Anki must be open when you sync. Reviews of cards you have deleted are not included.</p>'
      : `<p class="liten">In Anki, open Tools → Add-ons → AnkiConnect → Config and add <code>"${esc(location.origin)}"</code> to <code>webCorsOriginList</code>, then restart Anki. Anki must be open when you sync. Reviews of deleted cards are not included.</p>`;
    val += `<div class="falt"><label>AnkiConnect address<input type="url" data-k="anki.url" value="${esc(o.url)}"></label><label>API key (if you set one)<input type="text" data-k="anki.nyckel" value="${esc(o.nyckel)}"></label></div>
      <div class="valrad">${await kallStatus(k)}</div>`;
  } else if (APP) {
    if (k.typ === 'fil') val += filHjalp(k);
    else if (k.hjalp && !appSokvag(k)) val += `<p class="liten">${esc(k.hjalp)}</p>`;
    val += `<div class="valrad">${await kallStatus(k)}${knapp}</div>`;
  } else if (!MAPPAR) {
    val += `<p class="varning">This device cannot read folders. ${molnFinns() ? 'Turn on <b>Sync between devices</b> below to see what your computer read.' : 'Import a file exported from your computer under Settings.'}</p>`;
  } else if (k.appdata && SPARRAD) {
    val += `<p class="varning">Browsers may not open <code>${esc(k.sokvag[SYS])}</code>. Use the Windows app, which reads it directly${molnFinns() ? ' and syncs to this browser through Google Drive' : ''}.${k.id === 'anki' ? ' Or tick <i>Always use AnkiConnect</i> under Options.' : ''}</p>`;
  } else if (k.typ === 'fil') {
    val += `${filHjalp(k)}<div class="valrad">${knapp}${await kallStatus(k)}</div>`;
  } else {
    val += `${k.hjalp ? `<p class="liten">${esc(k.hjalp)}</p>` : ''}${sokvagRad(k.sokvag[SYS])}
      <div class="valrad">${knapp}${await kallStatus(k)}</div>`;
  }
  const f = falt(k);
  if (f) val += `<details><summary>Options</summary><div class="falt">${f}</div></details>`;
  return `<div class="kalla ${o.pa ? 'pa' : ''}"><label><input type="checkbox" data-pa="${k.id}" ${o.pa ? 'checked' : ''}><b>${esc(k.namn)}</b><span class="liten">${esc(k.text)}</span></label><div class="detalj">${val}</div></div>`;
}

// Absolute, so the links also work in the Windows and Android apps.
const SIDA = 'https://mattias.github.io/immersion-dashboard/';
const SIDOR = ['about', 'privacy', 'terms'].map((s, i) => `<a href="${SIDA}${s}.html" target="_blank" rel="noopener">${['About', 'Privacy', 'Terms'][i]}</a>`).join(' · ');

async function molnKort() {
  if (!molnFinns()) return '';
  const inloggad = APP ? await invoke('google_inloggad') : moln.harToken();
  const text = APP ? 'After each sync, a copy goes to a hidden app folder in your own Google Drive. Open the dashboard on your phone and turn this on there too, and it shows what this computer read.'
    : 'Shows what your computer read. The Windows app puts a copy in a hidden app folder in your own Google Drive, and this device fetches it when you sync.';
  return `<h3>端末の同期 <small>Sync between devices</small></h3>
    <div class="kalla ${S.moln.pa ? 'pa' : ''}"><label><input type="checkbox" data-moln ${S.moln.pa ? 'checked' : ''}><b>Google Drive</b><span class="liten">${text} The dashboard sees nothing else in your Drive.</span></label>
    <div class="detalj"><div class="valrad">${status.moln?.fel ? `<span class="status fel">${esc(status.moln.fel)}</span>` : `<span class="status ${S.moln.senast ? 'ok' : ''}">${S.moln.senast ? '✓ Synced ' + klockslag(S.moln.senast) + (status.moln?.kallor != null ? ` · ${status.moln.kallor} sources in Drive` : '') : inloggad ? 'Signed in' : 'You sign in with Google the first time you sync.'}</span>`}
    ${APP && inloggad ? '<button type="button" class="knapp tyst" id="loggaUt">Sign out</button>' : ''}</div></div></div>`;
}

async function ritaDialog() {
  const d = $('dialog'), forsta = !S.valkommen, rull = d.scrollTop;
  const kort = (await Promise.all(KALLOR.map(kallKort))).join('');
  const molnDel = await molnKort();
  const var_ = APP ? 'on this computer' : 'in this browser';
  d.innerHTML = `<form method="dialog" class="inre">
    <div class="korthuvud"><h2 id="dialogrubrik"><b>${forsta ? '旅の始まり' : '設定'}</b> ${forsta ? 'Welcome' : 'Settings'}</h2>${forsta ? '' : '<button class="pil" value="stang" aria-label="Close">×</button>'}</div>
    ${forsta ? `<p class="ingress">This dashboard gathers the Japanese you read, play, watch and review from the apps you already use. Everything stays ${var_}${molnFinns() ? ', unless you turn on sync between devices' : ''}.</p>
      <p>${APP ? 'The apps found on this computer are already ticked. Untick any you do not want.' : MOBIL ? 'On a phone the dashboard shows what your computer read.' : 'Tick the apps you use and show the dashboard where their data is.'} You can change this any time under the cog.</p>` : ''}
    ${MOBIL ? molnDel : ''}
    <h3>源 <small>Sources</small></h3>
    ${kort}
    ${MOBIL ? '' : molnDel}
    <h3>背景 <small>Background</small></h3>
    <div class="bildval"><div class="miniatyr" style="${bildUrl ? `background-image:url('${bildUrl}')` : ''}"></div>
      <div><p class="liten">Pick any picture you like. It stays on this device. Without one you get the night scene.</p>
      <div class="valrad"><button type="button" class="knapp" id="valjBild">Choose image</button>${bildUrl ? '<button type="button" class="knapp tyst" id="taBortBild">Use the night scene</button>' : ''}</div></div></div>
    <details ${forsta ? '' : 'open'}><summary style="margin-top:22px">Goal and advanced</summary><div class="falt">
      <label>Daily immersion goal (minutes)<input type="number" min="5" step="5" data-k="mal" value="${S.mal}"></label>
      <label>Pauses longer than this do not count (seconds)<input type="number" min="30" data-k="paus" value="${S.paus}"></label>
      <label>Highest believable reading speed (characters per hour)<input type="number" min="1000" step="1000" data-k="maxFart" value="${S.maxFart}"></label>
    </div></details>
    ${forsta ? '' : `<h3>記録 <small>Your data</small></h3>
    <p class="liten">Export saves everything the dashboard has read as one JSON file. Import it on another device to bring your history along.</p>
    <div class="valrad"><button type="button" class="knapp tyst" id="exportera">Export JSON</button><button type="button" class="knapp tyst" id="importera">Import JSON</button><button type="button" class="knapp tyst" id="raderaAllt">Erase everything</button></div>`}
  </form>
  <div class="fot"><span class="liten">${forsta ? '<button type="button" class="knapp tyst" id="importera">I have an export file</button>' : 'Changes are saved as you make them.'} ${SIDOR}</span>
    <button type="button" class="knapp stor" id="klar">${forsta ? 'Start the journey' : 'Sync now'}</button></div>`;
  d.scrollTop = rull;
}

async function oppnaDialog() {
  await ritaDialog();
  if (!$('dialog').open) $('dialog').showModal();
}

function valjFil(accept) {
  return new Promise(ok => {
    const i = document.createElement('input');
    i.type = 'file';
    i.accept = accept;
    i.onchange = () => ok(i.files[0] || null);
    i.click();
  });
}

function sattVarde(nyckel, v) {
  const [a, b] = nyckel.split('.');
  if (b) S.kallor[a][b] = v; else S[a] = v;
}

async function valjPlats(k) {
  if (APP) {
    const p = await invoke('valj', { fil: k.typ === 'fil' });
    if (p) S.kallor[k.id].sokvag = p;
    return !!p;
  }
  const id = 'immersion-' + k.id;
  const typer = k.id === 'somn' ? { 'text/csv': ['.csv'] } : { 'application/json': ['.json'] };
  const h = k.typ === 'fil' ? (await showOpenFilePicker({ id, types: [{ description: k.namn, accept: typer }] }))[0] : await showDirectoryPicker({ id, mode: 'read' });
  await spara('handtag:' + k.id, h);
  return true;
}

function kopplaDialog() {
  const d = $('dialog');
  // Enter in a field must not close the dialog; only the × button does.
  d.addEventListener('submit', e => { if (e.submitter?.value !== 'stang') e.preventDefault(); });
  d.addEventListener('change', async e => {
    const t = e.target;
    let omrita = false;
    if (t.dataset.pa) {
      S.kallor[t.dataset.pa].pa = t.checked;
      delete status[t.dataset.pa];
      omrita = true;
    } else if ('moln' in t.dataset) {
      S.moln.pa = t.checked;
      if (t.checked && !APP) moln.forbered();
      omrita = true;
    } else if (t.dataset.varde) {
      sattVarde(t.dataset.k, t.checked ? t.dataset.varde : 'fil');
      delete status.anki;
      omrita = true;
    } else if (t.dataset.k) {
      sattVarde(t.dataset.k, t.type === 'checkbox' ? t.checked : t.type === 'number' ? Number(t.value) : t.value);
    } else return;
    await spara('installningar', S);
    if (omrita) await ritaDialog();
    await ritaOm();
  });
  d.addEventListener('click', async e => {
    const t = e.target.closest('button');
    if (!t) return;
    try {
      if (t.dataset.kopiera) {
        await navigator.clipboard.writeText(t.dataset.kopiera);
        t.textContent = 'Copied';
      } else if (t.dataset.valj) {
        const k = KALLOR.find(x => x.id === t.dataset.valj);
        if (await valjPlats(k)) {
          S.kallor[k.id].pa = true;
          await spara('installningar', S);
          delete status[k.id];
          await ritaDialog();
        }
      } else if (t.id === 'garminOm') {
        await radera('resultat:garmin');
        await synka(true);
      } else if (t.id === 'loggaUt') {
        await invoke('google_logga_ut');
        await ritaDialog();
      } else if (t.id === 'valjBild') {
        const f = await valjFil('image/*');
        if (f) { await spara('bakgrund', f); await visaBakgrund(); await ritaDialog(); }
      } else if (t.id === 'taBortBild') {
        await radera('bakgrund');
        await visaBakgrund();
        await ritaDialog();
      } else if (t.id === 'exportera') {
        ladda(`immersion-dashboard-${new Date().toISOString().slice(0, 10)}.json`, JSON.stringify(await exportera()));
      } else if (t.id === 'importera') {
        const f = await valjFil('application/json,.json');
        if (f) { await importera(f); await ritaDialog(); meddela('Imported.'); }
      } else if (t.id === 'raderaAllt') {
        if (!confirm(`Erase all data, settings and the background image ${APP ? 'from this app' : 'from this browser'}?`)) return;
        if (APP) await invoke('google_logga_ut');
        indexedDB.deleteDatabase('immersion-dashboard');
        location.reload();
      } else if (t.id === 'klar') {
        S.valkommen = true;
        await spara('installningar', S);
        d.close();
        await synka(true);
      }
    } catch (err) {
      if (err?.name !== 'AbortError') meddela(err?.message || String(err));
    }
  });
}

async function start() {
  S = await installningar();
  if (APP) {
    STD = await invoke('standard');
    // First start: tick the apps found in their usual places.
    if (!S.valkommen) for (const k of KALLOR) if (STD[k.id]) S.kallor[k.id].pa = true;
  }
  kopplaDialog();
  $('synk').onclick = () => synka(true);
  $('installningar').onclick = oppnaDialog;
  $('kommIgang').onclick = oppnaDialog;
  await visaBakgrund();
  await ritaOm();
  if (!APP && moln.finns && S.moln.pa) moln.forbered();
  if (!S.valkommen) return oppnaDialog();
  // Reads again on every start, so most days need no click at all.
  await synka(false);
  addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible' && Date.now() - senastSynk > 10 * 6e4) synka(false); });
}

if (!APP && 'serviceWorker' in navigator && location.protocol !== 'file:') navigator.serviceWorker.register('sw.js').catch(() => {});
start();
