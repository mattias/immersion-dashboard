// Draws the dashboard from the combined days. app.js calls visa() whenever the data or settings change.
import { datum } from './calc.js';

const ALLA_KAT = [['anki', 'Anki'], ['bok', 'Books'], ['spel', 'Games and VNs'], ['manga', 'Manga'], ['titta', 'Anime and video'], ['lyssna', 'Listening practice']];
let D = {}, KAT = ALLA_KAT, IDAG = datum(new Date()), FORSTA = IDAG, MAL = 120, ANKI = true, SOMN = false, startad = false;
const FARG = { anki: 'var(--anki)', bok: 'var(--bok)', spel: 'var(--spel)', manga: 'var(--manga)', titta: 'var(--titta)', lyssna: 'var(--lyssna)' };
const VYER = [['dag', 'Day'], ['vecka', 'Week'], ['manad', 'Month'], ['ar', 'Year'], ['allt', 'All']];
const MANAD = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
const VDAG = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
const $ = id => document.getElementById(id);
const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

const iso = t => new Date(t).toISOString().slice(0, 10);
const tal = s => Date.parse(s + 'T00:00:00Z');
const plus = (s, n) => iso(tal(s) + n * 864e5);
const vd = s => (new Date(tal(s)).getUTCDay() + 6) % 7;
const manSlut = s => { const d = new Date(tal(s)); return iso(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0)); };
const manFlytt = (s, n) => { const d = new Date(tal(s)); return iso(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + n, 1)); };
function veckonr(s) {
  const t = plus(s, 3 - vd(s));
  const jan4 = t.slice(0, 4) + '-01-04';
  return 1 + Math.round((tal(t) - tal(plus(jan4, -vd(jan4)))) / 6048e5);
}
const fmtDag = s => `${+s.slice(8)} ${MANAD[+s.slice(5, 7) - 1]} ${s.slice(0, 4)}`;
const fmtKort = s => `${+s.slice(8)} ${MANAD[+s.slice(5, 7) - 1].slice(0, 3)}`;

function tid(m) {
  m = Math.round(m);
  if (m < 60) return `${m} min`;
  return m % 60 && m < 6000 ? `${Math.floor(m / 60)} h ${m % 60} min` : `${Math.round(m / 60)} h`;
}
const siffra = n => Math.round(n).toLocaleString('en-GB');

let vy = 'vecka', valt = IDAG, matt = 'tid';

function period(v, s) {
  if (v === 'dag') {
    const m = plus(s, -vd(s));
    const b = [...Array(7)].map((_, i) => { const d = plus(m, i); return { fran: d, till: d, kort: VDAG[i], gas: 'dag' }; });
    return { fran: s, till: s, namn: fmtDag(s), hinkar: b, bak: plus(s, -1), fram: plus(s, 1), jmf: [plus(s, -1), plus(s, -1)], jmfNamn: 'the day before' };
  }
  if (v === 'vecka') {
    const m = plus(s, -vd(s));
    const b = [...Array(7)].map((_, i) => { const d = plus(m, i); return { fran: d, till: d, kort: `${VDAG[i]} ${+d.slice(8)}`, gas: 'dag' }; });
    return { fran: m, till: plus(m, 6), namn: `Week ${veckonr(m)}, ${fmtKort(m)} to ${fmtKort(plus(m, 6))}`, hinkar: b, bak: plus(m, -7), fram: plus(m, 7), jmf: [plus(m, -7), plus(m, -1)], jmfNamn: 'the week before' };
  }
  if (v === 'manad') {
    const f = s.slice(0, 8) + '01', t = manSlut(f), b = [];
    for (let d = f; d <= t; d = plus(d, 1)) b.push({ fran: d, till: d, kort: String(+d.slice(8)), gas: 'dag' });
    const p = manFlytt(f, -1);
    return { fran: f, till: t, namn: `${MANAD[+f.slice(5, 7) - 1]} ${f.slice(0, 4)}`, hinkar: b, bak: p, fram: manFlytt(f, 1), jmf: [p, manSlut(p)], jmfNamn: 'the month before' };
  }
  if (v === 'ar') {
    const y = s.slice(0, 4), b = MANAD.map((n, i) => { const f = `${y}-${String(i + 1).padStart(2, '0')}-01`; return { fran: f, till: manSlut(f), kort: n.slice(0, 3), gas: 'manad' }; });
    return { fran: y + '-01-01', till: y + '-12-31', namn: y, hinkar: b, bak: `${+y - 1}-01-01`, fram: `${+y + 1}-01-01`, jmf: [`${+y - 1}-01-01`, `${+y - 1}-12-31`], jmfNamn: 'the year before' };
  }
  const b = [];
  for (let f = FORSTA.slice(0, 8) + '01'; f <= IDAG; f = manFlytt(f, 1)) b.push({ fran: f, till: manSlut(f), kort: f.slice(5, 7) === '01' ? f.slice(0, 4) : MANAD[+f.slice(5, 7) - 1][0].toUpperCase(), gas: 'manad' });
  return { fran: FORSTA, till: IDAG, namn: 'All time', hinkar: b };
}

function summa(fran, till) {
  const r = { min: { anki: 0, bok: 0, spel: 0, manga: 0, titta: 0, lyssna: 0 }, tecken: { bok: 0, spel: 0, manga: 0, titta: 0, lyssna: 0 }, rep: 0, ok: 0, test: 0, nya: 0, minade: 0, somn: [], poang: [], aktiva: 0, titlar: new Map(), lekar: new Map() };
  for (let d = fran; d <= till; d = plus(d, 1)) {
    const x = D[d];
    if (!x) continue;
    if (x.akt.length || x.anki) r.aktiva++;
    if (x.anki) {
      r.min.anki += x.anki.m; r.rep += x.anki.r; r.ok += x.anki.ok; r.test += x.anki.t; r.nya += x.anki.n;
      for (const [k, v] of Object.entries(x.anki.d)) r.lekar.set(k, (r.lekar.get(k) || 0) + v);
    }
    r.minade += x.minade || 0;
    if (x.somn) { r.somn.push(x.somn.h); if (x.somn.p != null) r.poang.push(x.somn.p); }
    for (const a of x.akt) {
      r.min[a.k] += a.m; r.tecken[a.k] += a.c;
      const k = a.k + a.t;
      if (!r.titlar.has(k)) r.titlar.set(k, { k: a.k, t: a.t, s: new Set(), e: new Set(), c: 0, m: 0, dagar: 0 });
      const t = r.titlar.get(k);
      t.c += a.c; t.m += a.m; t.dagar++; t.s.add(a.s); (a.e || []).forEach(e => t.e.add(e));
    }
  }
  r.tid = Object.values(r.min).reduce((a, b) => a + b, 0);
  r.alla = Object.values(r.tecken).reduce((a, b) => a + b, 0);
  return r;
}

const harImm = d => D[d] && D[d].akt.some(a => a.m >= 1);
const harAnki = d => D[d] && D[d].anki && D[d].anki.r > 0;
function streak(test) {
  let d = test(IDAG) ? IDAG : plus(IDAG, -1), nu = 0;
  while (test(d)) { nu++; d = plus(d, -1); }
  let max = 0, loppet = 0, slut = '';
  for (let x = FORSTA; x <= IDAG; x = plus(x, 1)) {
    loppet = test(x) ? loppet + 1 : 0;
    if (loppet > max) { max = loppet; slut = x; }
  }
  return { nu, max, slut };
}

const prickar = test => `<div class="prickar" title="The last seven days">${[6, 5, 4, 3, 2, 1, 0].map(i => `<i class="${test(plus(IDAG, -i)) ? 'p' : ''}"></i>`).join('')}</div>`;
function ritaStreaks() {
  const tile = (e, test, tom) => {
    const s = streak(test), klar = test(IDAG);
    const langst = s.nu === s.max ? 'longest so far' : `longest ${siffra(s.max)}, ended ${fmtKort(s.slut)}`;
    return `<div class="streak"><div class="etikett">${e}</div><div class="stort">${siffra(s.nu)}<small>${s.nu === 1 ? 'day' : 'days'}</small></div>
      <div class="liten ${klar ? 'klar' : ''}">${klar ? '✦ Done for today' : tom} · ${langst}</div>${prickar(test)}</div>`;
  };
  $('streaks').innerHTML = (ANKI ? tile('Anki', harAnki, 'Not done yet today') : '') + tile('Immersion', harImm, 'Reading, games, manga, watching or listening');
  $('streaks').style.gridTemplateColumns = ANKI ? '' : '1fr';
}

// Today's immersion against the daily goal, without Anki.
function ritaIdag() {
  const s = summa(IDAG, IDAG), imm = s.tid - s.min.anki, R = 74, O = 2 * Math.PI * R;
  $('ring').innerHTML = `<svg viewBox="0 0 170 170"><defs><linearGradient id="rg" x1="0" x2="1"><stop offset="0" stop-color="#dcc08a"/><stop offset="1" stop-color="#7fd4b0"/></linearGradient></defs>
    <circle cx="85" cy="85" r="${R}" fill="none" stroke="rgba(255,255,255,.07)" stroke-width="9"/>
    <circle cx="85" cy="85" r="${R}" fill="none" stroke="url(#rg)" stroke-width="9" stroke-linecap="round" stroke-dasharray="${O * Math.min(1, imm / MAL)} ${O}" style="filter:drop-shadow(0 0 6px rgba(220,192,138,.6))"/></svg>
    <div class="mitt"><b>${Math.round(imm)}</b><small>min of ${MAL}</small></div>`;
  $('idagrader').innerHTML = KAT.map(([k, n]) => `<div class="idagrad"><span><span class="prick" style="background:${FARG[k]};color:${FARG[k]}"></span>${n}</span><span>${s.min[k] ? tid(s.min[k]) : '–'}</span></div>`).join('')
    + `<div class="idagrad"><span>Characters</span><span>${siffra(s.alla)}</span></div>`;
}

function dekor() {
  let st = '';
  for (let i = 0; i < 140; i++) st += `<circle cx="${Math.random() * 1600}" cy="${Math.random() * 600}" r="${Math.random() * 1.4 + .2}" opacity="${Math.random() * .7 + .2}"/>`;
  $('stjarnor').innerHTML = st;
  let a = '';
  for (let i = 0; i < 90; i++) { const y = 850 + Math.random() * 150; a += `<circle cx="${Math.random() * 1600}" cy="${y}" r="${4 + (y - 850) / 14}" fill="url(#blomma)" opacity=".85"/>`; }
  $('ang').innerHTML = a;
  for (let i = 0; i < 14; i++) {
    const b = document.createElement('div');
    b.className = 'blad';
    b.style.left = Math.random() * 110 + 'vw';
    b.style.animationDuration = 14 + Math.random() * 16 + 's';
    b.style.animationDelay = -Math.random() * 30 + 's';
    b.style.scale = .6 + Math.random() * .8;
    document.body.appendChild(b);
  }
}

function delta(nu, da, text) {
  if (da == null || !da || !isFinite(nu)) return '<span class="delta">&nbsp;</span>';
  const p = Math.round((nu - da) / da * 100);
  if (!p) return `<span class="delta">Same as ${text}</span>`;
  return `<span class="delta ${p > 0 ? 'upp' : ''}">${p > 0 ? '▲' : '▼'} ${Math.abs(p)} % vs ${text}</span>`;
}

function ritaNyckeltal(p, s) {
  const j = p.jmf ? summa(...p.jmf) : null;
  const ret = x => x.test ? x.ok / x.test * 100 : null;
  const snitt = a => a.length ? a.reduce((x, y) => x + y, 0) / a.length : null;
  const r = ret(s), sn = snitt(s.somn);
  const nt = (e, v, dl) => `<div class="nt kort"><span class="etikett">${e}</span><b>${v}</b>${dl || '<span class="delta">&nbsp;</span>'}</div>`;
  const dl = (a, b) => j ? delta(a, b, p.jmfNamn) : '';
  const tiles = [
    nt(ANKI ? 'Total time' : 'Immersion', tid(s.tid), dl(s.tid, j?.tid)),
    ANKI && nt('Immersion', tid(s.tid - s.min.anki), dl(s.tid - s.min.anki, j && j.tid - j.min.anki)),
    nt('Characters', siffra(s.alla), dl(s.alla, j?.alla)),
    ANKI && nt('Reviews', siffra(s.rep), dl(s.rep, j?.rep)),
    ANKI && nt('Retention', r == null ? '–' : `${r.toFixed(1)} %`, j && r != null && ret(j) != null ? `<span class="delta ${r >= ret(j) ? 'upp' : ''}">${r >= ret(j) ? '▲' : '▼'} ${Math.abs(r - ret(j)).toFixed(1)} points vs ${p.jmfNamn}</span>` : ''),
    ANKI && nt('New cards', siffra(s.nya), dl(s.nya, j?.nya)),
    ANKI && nt('Mined cards', siffra(s.minade), dl(s.minade, j?.minade)),
    SOMN ? nt('Sleep per night', sn == null ? '–' : `${sn.toFixed(1)} h`, s.poang.length ? `<span class="delta">Score ${Math.round(snitt(s.poang))}</span>` : '')
      : nt('Active days', siffra(s.aktiva), dl(s.aktiva, j?.aktiva))
  ];
  if (!ANKI) tiles.splice(2, 0, nt('Average per day', tid(s.tid / Math.max(1, dagarI(p))), ''));
  $('nyckeltal').innerHTML = tiles.filter(Boolean).join('');
}

function ritaDiagram(p) {
  const box = $('diagram'), B = box.clientWidth || 800, H = 250, ml = 48, mb = 26, mt = 8;
  const kats = matt === 'tid' ? KAT : KAT.filter(([k]) => k !== 'anki');
  const rad = p.hinkar.map(h => ({ h, s: summa(h.fran, h.till) }));
  const v = (s, k) => matt === 'tid' ? s.min[k] : s.tecken[k];
  const tot = r => kats.reduce((a, [k]) => a + v(r.s, k), 0);
  const topp = Math.max(...rad.map(tot), 1);
  const steg = ticks(topp, matt === 'tid');
  const ymax = steg[steg.length - 1], y = t => mt + (H - mt - mb) * (1 - t / ymax);
  const n = rad.length, bw = (B - ml) / n, w = Math.max(3, Math.min(bw - 4, 42));
  let s = `<svg height="${H}" viewBox="0 0 ${B} ${H}" role="img" aria-label="Bars per ${p.hinkar[0].gas === 'dag' ? 'day' : 'month'}. The same numbers are in the table further down.">`;
  for (const t of steg) s += `<line x1="${ml}" x2="${B}" y1="${y(t)}" y2="${y(t)}" stroke="${t ? 'var(--grid)' : 'var(--axis)'}"/><text x="${ml - 8}" y="${y(t) + 4}" text-anchor="end" font-size="12" fill="var(--muted)" style="font-variant-numeric:tabular-nums">${matt === 'tid' ? (ymax >= 120 ? t / 60 + ' h' : t + ' min') : kortTal(t)}</text>`;
  const var2 = Math.ceil(n / Math.floor((B - ml) / 30));
  rad.forEach((r, i) => {
    const x = ml + i * bw + (bw - w) / 2, valdDag = vy === 'dag' && r.h.fran !== valt;
    s += `<g class="stapel" tabindex="0" role="button" data-i="${i}" aria-label="${esc(r.h.kort)}"><rect class="fond" x="${ml + i * bw}" y="${mt}" width="${bw}" height="${H - mt - mb}" fill="transparent" rx="6"/>`;
    let bas = 0;
    const synliga = kats.filter(([k]) => v(r.s, k) > 0);
    synliga.forEach(([k], j) => {
      const h = y(bas) - y(bas + v(r.s, k));
      const top = j === synliga.length - 1, gap = j ? 2 : 0;
      const hh = Math.max(1, h - gap), yy = y(bas + v(r.s, k));
      const rr = top ? Math.min(4, hh, w / 2) : 0;
      s += `<path opacity="${valdDag ? .4 : 1}" fill="${FARG[k]}" d="M${x},${yy + hh} V${yy + rr} q0,${-rr} ${rr},${-rr} H${x + w - rr} q${rr},0 ${rr},${rr} V${yy + hh} Z"/>`;
      bas += v(r.s, k);
    });
    if (i % var2 === 0) s += `<text x="${x + w / 2}" y="${H - 8}" text-anchor="middle" font-size="12" fill="${r.h.fran === valt && vy === 'dag' ? 'var(--ink)' : 'var(--muted)'}">${esc(r.h.kort)}</text>`;
    s += '</g>';
  });
  box.innerHTML = s + '</svg>';
  box.querySelectorAll('.stapel').forEach(g => {
    const r = rad[+g.dataset.i];
    const visa = e => tips(e, `<strong>${r.h.fran === r.h.till ? fmtDag(r.h.fran) : MANAD[+r.h.fran.slice(5, 7) - 1] + ' ' + r.h.fran.slice(0, 4)}</strong>` + kats.map(([k, n]) => `<div><span><span class="prick" style="background:${FARG[k]};color:${FARG[k]}"></span>${n}</span><span>${matt === 'tid' ? tid(v(r.s, k)) : siffra(v(r.s, k))}</span></div>`).join(''));
    g.addEventListener('mousemove', visa);
    g.addEventListener('focus', () => { const b = g.getBoundingClientRect(); visa({ clientX: b.right, clientY: b.top + 40 }); });
    g.addEventListener('mouseleave', gom); g.addEventListener('blur', gom);
    const ga = () => { gom(); gaTill(r.h.gas, r.h.fran); };
    g.addEventListener('click', ga);
    g.addEventListener('keydown', e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); ga(); } });
  });
}

function ticks(m, tidsmatt) {
  const bas = tidsmatt && m >= 120 ? 60 : 1;
  const r = m / bas / 4, e = 10 ** Math.floor(Math.log10(r)), f = r / e;
  const s = (f <= 1 ? 1 : f <= 2 ? 2 : f <= 5 ? 5 : 10) * e * bas, ut = [];
  for (let t = 0; t < m + s; t += s) ut.push(t);
  return ut;
}
const kortTal = t => t >= 1000 ? `${t / 1000} k` : String(t);

function tips(e, html) {
  const t = $('tips');
  t.innerHTML = html; t.style.display = 'block';
  const b = t.getBoundingClientRect();
  t.style.left = Math.min(e.clientX + 14, innerWidth - b.width - 10) + 'px';
  t.style.top = Math.max(10, Math.min(e.clientY + 14, innerHeight - b.height - 10)) + 'px';
}
const gom = () => { $('tips').style.display = 'none'; };

const NIVA = [[1, '#26406e'], [45, '#3a64a8'], [90, '#5b8fe0'], [135, '#82acf0'], [180, '#a9c9ff']];
function ritaKalender(p) {
  const ar = p.till > IDAG ? IDAG.slice(0, 4) : p.till.slice(0, 4);
  const start = `${ar}-01-01`, slut = `${ar}-12-31`, f = plus(start, -vd(start));
  $('kalrubrik').textContent = ar;
  $('skala').innerHTML = 'Less ' + NIVA.map(n => `<span style="background:${n[1]}"></span>`).join('') + ' More';
  let h = '', kol = 0;
  for (let v = f; v <= slut; v = plus(v, 7), kol++) {
    const m = plus(v, 6);
    const man = m.slice(8) <= '07' && m >= start && m <= slut;
    h += `<i style="grid-column:${kol + 1}">${man ? MANAD[+m.slice(5, 7) - 1].slice(0, 3) : ''}</i>`;
    for (let i = 0; i < 7; i++) {
      const d = plus(v, i);
      if (d < start || d > slut || d > IDAG) continue;
      const s = summa(d, d), n = [...NIVA].reverse().find(x => s.tid >= x[0]);
      h += `<button style="grid-column:${kol + 1};grid-row:${i + 2}${n ? ';background:' + n[1] : ''}" class="${d >= p.fran && d <= p.till && vy !== 'ar' && vy !== 'allt' ? 'val' : ''}${n === NIVA[4] ? ' topp' : ''}" data-d="${d}" aria-label="${fmtDag(d)}: ${tid(s.tid)}"></button>`;
    }
  }
  const k = $('kal');
  k.innerHTML = h;
  // The squares grow so the year fills the width of the card.
  k.style.setProperty('--c', Math.max(10, Math.min(20, Math.floor(($('kalbox').clientWidth - 3 * kol) / kol))) + 'px');
  // On a narrow screen the year scrolls sideways; start at the recent weeks.
  $('kalbox').scrollLeft = $('kalbox').scrollWidth;
  k.onclick = e => { if (e.target.dataset.d) gaTill('dag', e.target.dataset.d); };
  k.onmousemove = e => {
    const d = e.target.dataset.d;
    if (!d) return gom();
    const s = summa(d, d);
    tips(e, `<strong>${fmtDag(d)}</strong>` + KAT.filter(([x]) => s.min[x]).map(([x, n]) => `<div><span>${n}</span><span>${tid(s.min[x])}</span></div>`).join('') + (s.tid ? '' : '<div>No activity</div>'));
  };
  k.onmouseleave = gom;
}

function ritaListor(s) {
  const t = [...s.titlar.values()].sort((a, b) => b.m - a.m);
  const max = Math.max(...t.map(x => x.m), 1);
  const namn = Object.fromEntries(KAT);
  $('titlar').innerHTML = t.length ? t.map(x => {
    const fart = x.m >= 5 && x.c ? ` · ${siffra(x.c / x.m * 60)} characters per hour` : '';
    return `<div class="post"><span class="prick" style="background:${FARG[x.k]};color:${FARG[x.k]}"></span><div class="namn" title="${esc(x.t)}">${esc(x.t)}</div><div class="tid">${tid(x.m)}</div>
      <div class="matt"><span style="width:${x.m / max * 100}%;background:${FARG[x.k]}"></span></div>
      <div class="mer">${namn[x.k]}${x.e.size ? ` · episode${x.e.size > 1 ? 's' : ''} ${[...x.e].sort((a, b) => a - b).join(", ")}` : ""} ${x.k === "lyssna" ? "" : `· ${siffra(x.c)} ${x.k === "titta" ? "characters heard" : "characters"}`}${fart}${x.dagar > 1 ? ` · ${x.dagar} days` : ''} · ${[...x.s].join(', ')}</div></div>`;
  }).join('') : '<div class="tom">No reading, games or watching this period.</div>';
  const l = [...s.lekar.entries()].sort((a, b) => b[1] - a[1]);
  const lmax = l.length ? l[0][1] : 1;
  $('ankilista').innerHTML = l.length ? l.map(([k, v]) => `<div class="post"><div class="namn">${esc(k)}</div><div class="tid">${siffra(v)}</div><div class="matt"><span style="width:${v / lmax * 100}%;background:var(--anki)"></span></div></div>`).join('') + `<div class="post"><div class="namn liten">Time in Anki</div><div class="tid">${tid(s.min.anki)}</div></div>` : '<div class="tom">No reviews this period.</div>';
}

function ritaTabell(p) {
  let rader = p.hinkar.filter(h => h.fran <= IDAG);
  if (vy === 'dag') rader = [{ fran: p.fran, till: p.fran, gas: 'dag' }];
  rader = rader.slice().reverse();
  $('tabellrubrik').textContent = rader[0]?.gas === 'manad' ? 'Month by month' : vy === 'dag' ? 'The day in numbers' : 'Day by day';
  const c = (m) => m ? tid(m) : '–';
  const kol = [['anki', 'Anki'], ['rep', 'Reviews'], ...KAT.slice(1)].filter(([k]) => ANKI || (k !== 'anki' && k !== 'rep'));
  $('tabell').innerHTML = `<table><thead><tr><th>Period</th>${kol.map(([, n]) => `<th>${n}</th>`).join('')}<th>Characters</th>${SOMN ? '<th>Sleep</th>' : ''}</tr></thead><tbody>` + rader.map(h => {
    const s = summa(h.fran, h.till);
    const namn = h.gas === 'dag' ? `${VDAG[vd(h.fran)]} ${fmtKort(h.fran)}` : `${MANAD[+h.fran.slice(5, 7) - 1]} ${h.fran.slice(0, 4)}`;
    return `<tr tabindex="0" data-g="${h.gas}" data-f="${h.fran}"><td>${namn}</td>${kol.map(([k]) => `<td>${k === 'rep' ? (s.rep ? siffra(s.rep) : '–') : c(s.min[k])}</td>`).join('')}<td>${s.alla ? siffra(s.alla) : '–'}</td>${SOMN ? `<td>${s.somn.length ? (s.somn.reduce((a, b) => a + b, 0) / s.somn.length).toFixed(1) + ' h' : '–'}</td>` : ''}</tr>`;
  }).join('') + '</tbody></table>';
  const ga = e => { const r = e.target.closest('tr[data-f]'); if (r) gaTill(r.dataset.g, r.dataset.f); };
  $('tabell').onclick = ga;
  $('tabell').onkeydown = e => { if (e.key === 'Enter') ga(e); };
}

// The share image is drawn on a 1600×900 canvas, which suits Discord, for the period the page shows.
let BILD = null;
function rundad(c, x, y, w, h, r) { c.beginPath(); c.roundRect(x, y, w, h, r); }
function glas(c, x, y, w, h) {
  rundad(c, x, y, w, h, 18);
  c.fillStyle = 'rgba(16, 22, 38, .80)'; c.fill();
  c.strokeStyle = 'rgba(214, 222, 255, .16)'; c.lineWidth = 1.5; c.stroke();
  // The gold corners from the cards on the page.
  c.strokeStyle = 'rgba(222, 190, 120, .55)';
  c.beginPath(); c.moveTo(x + 9, y + 27); c.lineTo(x + 9, y + 17); c.arcTo(x + 9, y + 9, x + 17, y + 9, 8); c.lineTo(x + 27, y + 9); c.stroke();
  c.beginPath(); c.moveTo(x + w - 9, y + h - 27); c.lineTo(x + w - 9, y + h - 17); c.arcTo(x + w - 9, y + h - 9, x + w - 17, y + h - 9, 8); c.lineTo(x + w - 27, y + h - 9); c.stroke();
}
const farg = k => getComputedStyle(document.documentElement).getPropertyValue('--' + k).trim();
function sten(c, x, y, f) { c.save(); c.translate(x, y); c.rotate(Math.PI / 4); c.shadowColor = f; c.shadowBlur = 8; c.fillStyle = f; c.fillRect(-5, -5, 10, 10); c.restore(); }
function klipp(c, t, w) { if (c.measureText(t).width <= w) return t; while (t && c.measureText(t + '…').width > w) t = t.slice(0, -1); return t + '…'; }

async function ritaDelning() {
  const SER = '"Cormorant Garamond", serif', MIN = '"Shippori Mincho", serif', SAN = '"Zen Kaku Gothic New", sans-serif';
  await Promise.all(['700 72px "Shippori Mincho"', '600 40px "Cormorant Garamond"', 'italic 500 28px "Cormorant Garamond"', '500 18px "Zen Kaku Gothic New"'].map(f => document.fonts.load(f, '旅の記録Aa')));
  const W = 1600, H = 900, cv = document.createElement('canvas');
  cv.width = W; cv.height = H;
  const c = cv.getContext('2d');
  const p = period(vy, valt), s = summa(p.fran, p.till);
  c.fillStyle = '#0b1020'; c.fillRect(0, 0, W, H);
  if (BILD) { const k = Math.max(W / BILD.width, H / BILD.height); c.drawImage(BILD, W - BILD.width * k, (H - BILD.height * k) / 2, BILD.width * k, BILD.height * k); }
  let g = c.createLinearGradient(0, 0, W, 0);
  g.addColorStop(0, 'rgba(11,16,32,.93)'); g.addColorStop(.45, 'rgba(11,16,32,.72)'); g.addColorStop(.62, 'rgba(11,16,32,.1)'); g.addColorStop(1, 'rgba(11,16,32,0)');
  c.fillStyle = g; c.fillRect(0, 0, W, H);
  g = c.createLinearGradient(0, H * .6, 0, H); g.addColorStop(0, 'rgba(11,16,32,0)'); g.addColorStop(1, 'rgba(11,16,32,.6)');
  c.fillStyle = g; c.fillRect(0, 0, W, H);

  c.fillStyle = '#e4e8f2'; c.font = `700 72px ${MIN}`; c.shadowColor = 'rgba(160,190,255,.45)'; c.shadowBlur = 24;
  c.fillText('旅の記録', 64, 122); c.shadowBlur = 0;
  c.fillStyle = '#dcc08a'; c.font = `italic 500 28px ${SER}`; c.fillText(p.namn, 66, 166);

  // Key figures and streaks
  const ret = s.test ? `${(s.ok / s.test * 100).toFixed(1)} %` : '–', sa = streak(harAnki), si = streak(harImm);
  const dagar = n => `${siffra(n)} ${n === 1 ? 'day' : 'days'}`;
  const rutor = ANKI ? [['Immersion', tid(s.tid - s.min.anki)], ['Characters', siffra(s.alla)], ['Anki reviews', siffra(s.rep)],
    ['Retention', ret], ['Anki streak', dagar(sa.nu)], ['Immersion streak', dagar(si.nu)]]
    : [['Immersion', tid(s.tid)], ['Characters', siffra(s.alla)], ['Active days', siffra(s.aktiva)],
      ['Average per day', tid(s.tid / Math.max(1, dagarI(p)))], ['Titles', siffra(s.titlar.size)], ['Immersion streak', dagar(si.nu)]];
  rutor.forEach(([e, v], i) => {
    const x = 64 + (i % 3) * 266, y = 200 + Math.floor(i / 3) * 122;
    glas(c, x, y, 250, 106);
    c.fillStyle = '#8e97ad'; c.font = `500 16px ${SAN}`; c.fillText(e, x + 22, y + 38);
    c.fillStyle = '#eef1f8'; c.font = `600 40px ${SER}`; c.fillText(v, x + 22, y + 84);
  });

  // Bars per day or month
  const bx = 64, by = 462, bw = 440, bh = 374;
  glas(c, bx, by, bw, bh);
  c.fillStyle = '#e4e8f2'; c.font = `700 22px ${MIN}`; c.fillText('旅の歩み', bx + 24, by + 46);
  const rad = p.hinkar.map(h => summa(h.fran, h.till)), topp = Math.max(1, ...rad.map(r => r.tid));
  const x0 = bx + 28, x1 = bx + bw - 28, y0 = by + bh - 46, y1 = by + 80, steg = (x1 - x0) / rad.length, w = Math.max(3, Math.min(28, steg - 6));
  c.strokeStyle = 'rgba(214,222,255,.18)'; c.lineWidth = 1; c.beginPath(); c.moveTo(x0, y0 + .5); c.lineTo(x1, y0 + .5); c.stroke();
  const var2 = Math.ceil(rad.length / 12);
  rad.forEach((r, i) => {
    const x = x0 + i * steg + (steg - w) / 2;
    let bas = 0;
    const lager = KAT.filter(([k]) => r.min[k] > 0);
    lager.forEach(([k], j) => {
      const h = r.min[k] / topp * (y0 - y1), rr = Math.min(4, w / 2);
      rundad(c, x, y0 - bas - h, w, Math.max(1, h - (j ? 2 : 0)), j === lager.length - 1 ? [rr, rr, 0, 0] : 0);
      c.fillStyle = farg(k); c.fill();
      bas += h;
    });
    if (i % var2 === 0) { c.fillStyle = '#8e97ad'; c.font = `400 13px ${SAN}`; c.textAlign = 'center'; c.fillText(p.hinkar[i].kort, x + w / 2, y0 + 24); c.textAlign = 'left'; }
  });

  // Titles
  const tx = 520, tw = 326;
  glas(c, tx, by, tw, bh);
  c.fillStyle = '#e4e8f2'; c.font = `700 22px ${MIN}`; c.fillText('旅路', tx + 24, by + 46);
  const titlar = [...s.titlar.values()].sort((a, b) => b.m - a.m).slice(0, 5);
  if (!titlar.length) { c.fillStyle = '#8e97ad'; c.font = `italic 500 20px ${SER}`; c.fillText('No reading or watching yet.', tx + 24, by + 96); }
  titlar.forEach((t, i) => {
    const y = by + 92 + i * 56;
    sten(c, tx + 30, y - 6, farg(t.k));
    c.fillStyle = '#eef1f8'; c.font = `500 17px ${MIN}`; c.fillText(klipp(c, t.t, tw - 140), tx + 48, y);
    c.fillStyle = '#c4cadb'; c.font = `500 15px ${SAN}`; c.textAlign = 'right'; c.fillText(tid(t.m), tx + tw - 24, y); c.textAlign = 'left';
    c.fillStyle = '#8e97ad'; c.font = `400 13px ${SAN}`; c.fillText(`${Object.fromEntries(KAT)[t.k]} · ${siffra(t.c)} characters`, tx + 48, y + 21);
  });

  c.fillStyle = 'rgba(238,241,248,.8)'; c.font = `italic 500 18px ${SER}`; c.textAlign = 'right';
  c.fillText(`言葉を集める旅 · ${fmtDag(IDAG)}`, W - 40, H - 32); c.textAlign = 'left';
  return cv;
}

async function visaDelning() {
  $('delstatus').textContent = '';
  const cv = await ritaDelning();
  const blob = await new Promise(ok => cv.toBlob(ok, 'image/png'));
  $('delbild').src = URL.createObjectURL(blob);
  $('delning').hidden = false;
  $('kopiera').focus();
  $('kopiera').onclick = async () => {
    try {
      await navigator.clipboard.write([new ClipboardItem({ 'image/png': blob })]);
      $('delstatus').textContent = 'Copied. Paste it in Discord with Ctrl+V.';
    } catch { $('delstatus').textContent = 'Could not copy here. Use Download instead.'; }
  };
  $('spara').onclick = () => {
    const a = document.createElement('a');
    a.href = $('delbild').src; a.download = `tabi-no-kiroku-${vy}-${valt}.png`; a.click();
  };
}
const stangDelning = () => { $('delning').hidden = true; $('dela').focus(); };

function gaTill(v, d) { vy = v; valt = d; rita(); }

function rita() {
  gom();
  const p = period(vy, valt), s = summa(p.fran, p.till);
  $('period').textContent = p.namn;
  $('bak').disabled = !p.bak || (p.jmf && p.jmf[1] < FORSTA);
  $('fram').disabled = !p.fram || p.fram > IDAG;
  $('vyer').querySelectorAll('button').forEach(b => b.setAttribute('aria-pressed', b.dataset.v === vy));
  $('matt').querySelectorAll('button').forEach(b => b.setAttribute('aria-pressed', b.dataset.v === matt));
  $('diagramrubrik').textContent = p.hinkar[0].gas === 'dag' ? 'Per day' : 'Per month';
  ritaNyckeltal(p, s); ritaDiagram(p); ritaKalender(p); ritaListor(s); ritaTabell(p);
  try { history.replaceState(null, '', `#${vy}/${valt}`); } catch {}
}

// Days with any data in the period, counted up to today.
function dagarI(p) {
  const f = p.fran < FORSTA ? FORSTA : p.fran, t = p.till > IDAG ? IDAG : p.till;
  return f > t ? 0 : Math.round((tal(t) - tal(f)) / 864e5) + 1;
}

function koppla() {
  $('vyer').innerHTML = VYER.map(([v, n]) => `<button data-v="${v}">${n}</button>`).join('');
  $('matt').innerHTML = '<button data-v="tid">Time</button><button data-v="tecken">Characters</button>';
  $('vyer').onclick = e => { if (e.target.dataset.v) gaTill(e.target.dataset.v, valt); };
  $('matt').onclick = e => { if (e.target.dataset.v) { matt = e.target.dataset.v; rita(); } };
  const steg = n => { const p = period(vy, valt), d = n < 0 ? p.bak : p.fram; if (d && d <= IDAG && !(n < 0 && $('bak').disabled)) gaTill(vy, d); };
  $('bak').onclick = () => steg(-1);
  $('fram').onclick = () => steg(1);
  $('idag').onclick = () => gaTill('dag', IDAG);
  $('dela').onclick = visaDelning;
  $('delstang').onclick = stangDelning;
  $('delning').onclick = e => { if (e.target === $('delning')) stangDelning(); };
  addEventListener('keydown', e => {
    if (!$('delning').hidden) { if (e.key === 'Escape') stangDelning(); return; }
    if (document.querySelector('dialog[open]') || e.target.closest('input, select, textarea')) return;
    if (e.key === 'ArrowLeft') steg(-1);
    if (e.key === 'ArrowRight') steg(1);
  });
  let t; addEventListener('resize', () => { clearTimeout(t); t = setTimeout(rita, 120); });
  const lasHash = () => { const m = location.hash.match(/^#(dag|vecka|manad|ar|allt)\/(\d{4}-\d\d-\d\d)$/); if (m) { vy = m[1]; valt = m[2]; } };
  addEventListener('hashchange', () => { lasHash(); rita(); });
  lasHash(); dekor();
}

// dagar: the combined days. o: { mal, uppdaterad, fel }.
export function visa(dagar, o = {}) {
  D = dagar;
  IDAG = datum(new Date());
  // Sleep can go back years before any immersion, so only activity decides where All starts.
  const nycklar = Object.keys(D).filter(d => D[d].akt.length || D[d].anki).sort();
  FORSTA = nycklar[0] && nycklar[0] < IDAG ? nycklar[0] : IDAG;
  MAL = o.mal || 120;
  const finns = new Set(Object.values(D).flatMap(d => [...d.akt.map(a => a.k), ...(d.anki ? ['anki'] : [])]));
  // Only the kinds you actually have are shown. Without any data, everything is shown.
  KAT = finns.size ? ALLA_KAT.filter(([k]) => finns.has(k)) : ALLA_KAT;
  ANKI = !finns.size || finns.has('anki');
  // Sleep is shown only when there is sleep data.
  SOMN = Object.values(D).some(d => d.somn);
  $('ankikort').hidden = !ANKI;
  $('sistarad').classList.toggle('tvA', ANKI);
  $('tomstart').hidden = Object.values(D).some(d => d.akt.length || d.anki);
  if (!startad) { startad = true; koppla(); }
  if (valt > IDAG) valt = IDAG;
  $('uppdaterad').innerHTML = `${fmtDag(IDAG)}<span>${o.uppdaterad ? 'updated ' + esc(o.uppdaterad) : ''}</span>${o.fel ? `<span class="fel">${esc(o.fel)}</span>` : ''}`;
  $('legend').innerHTML = KAT.map(([k, n]) => `<span><span class="prick" style="background:${FARG[k]};color:${FARG[k]}"></span>${n}</span>`).join('');
  ritaIdag(); ritaStreaks(); rita();
}

// The background image: an object URL, or null for the night scene.
export function sattBild(url) {
  BILD = null;
  $('bild').style.backgroundImage = '';
  if (!url) return;
  const bild = new Image();
  bild.onload = () => { $('bild').style.backgroundImage = `url("${url}")`; BILD = bild; };
  bild.src = url;
}
