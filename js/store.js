// Everything is kept in this browser's IndexedDB: settings, folder permissions, source results and the background image.

const DB = 'immersion-dashboard', KV = 'kv';
let oppnad;

function db() {
  return oppnad ||= new Promise((ok, fel) => {
    const r = indexedDB.open(DB, 1);
    r.onupgradeneeded = () => r.result.createObjectStore(KV);
    r.onsuccess = () => ok(r.result);
    r.onerror = () => fel(r.error);
  });
}

async function steg(lage, gor) {
  const d = await db();
  return new Promise((ok, fel) => {
    const t = d.transaction(KV, lage), r = gor(t.objectStore(KV));
    t.oncomplete = () => ok(r?.result);
    t.onerror = () => fel(t.error);
  });
}

export const hamta = k => steg('readonly', s => s.get(k));
export const spara = (k, v) => steg('readwrite', s => s.put(v, k));
export const radera = k => steg('readwrite', s => s.delete(k));

export const STANDARD = {
  v: 1,
  valkommen: false,
  mal: 120,
  paus: 180,
  maxFart: 20000,
  kallor: {
    anki: { pa: false, lage: 'fil', rollover: 4, mining: 'Mining', wal: true, profil: '', url: 'http://127.0.0.1:8765', nyckel: '' },
    gsm: { pa: false, bort: 'GSM Helper, Discord' },
    rubi: { pa: false },
    lasare: { pa: false, ttu: true, yatsu: true, hoshi: true, mokuro: true },
    mokuro: { pa: false },
    mpv: { pa: false },
    webb: { pa: false },
    garmin: { pa: false },
    somn: { pa: false }
  },
  moln: { pa: false }
};

// sokvag: a folder or file chosen in the Windows app; empty means the usual place.
export async function installningar() {
  const s = await hamta('installningar');
  const ut = structuredClone(STANDARD);
  if (!s) return ut;
  for (const [k, v] of Object.entries(s)) if (k !== 'kallor') ut[k] = v;
  for (const [k, v] of Object.entries(s.kallor || {})) if (ut.kallor[k]) Object.assign(ut.kallor[k], v);
  return ut;
}

// Wraps a FileSystemDirectoryHandle in the small interface the sources use.
export function mapp(h) {
  return {
    name: h.name,
    async entries() {
      const ut = [];
      for await (const e of h.values()) ut.push({ name: e.name, kind: e.kind });
      return ut;
    },
    async file(n) {
      try { return await (await h.getFileHandle(n)).getFile(); } catch { return null; }
    },
    async dir(n) {
      try { return mapp(await h.getDirectoryHandle(n)); } catch { return null; }
    }
  };
}

export async function harBehorighet(h, fraga) {
  if (await h.queryPermission({ mode: 'read' }) === 'granted') return true;
  return fraga && await h.requestPermission({ mode: 'read' }) === 'granted';
}
