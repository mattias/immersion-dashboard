// The Windows app (Tauri) reads folders through its own commands; the browser uses folder handles.
export const APP = !!window.__TAURI__;
export const invoke = (cmd, args) => window.__TAURI__.core.invoke(cmd, args);

const sep = p => p.includes('/') && !p.includes('\\') ? '/' : '\\';
const join = (a, b) => a.replace(/[\\/]+$/, '') + sep(a) + b;
const namn = p => p.replace(/[\\/]+$/, '').split(/[\\/]/).pop();

export function appFil(sokvag, lastModified = 0) {
  const bytes = () => invoke('las', { sokvag });
  return {
    name: namn(sokvag),
    lastModified,
    arrayBuffer: async () => { const b = await bytes(); return b instanceof ArrayBuffer ? b : new Uint8Array(b).buffer; },
    text: async () => new TextDecoder().decode(await bytes())
  };
}

// Same interface as mapp() in store.js.
export function appMapp(sokvag) {
  return {
    name: namn(sokvag),
    entries: () => invoke('lista', { sokvag }),
    async file(n) {
      const p = join(sokvag, n);
      const t = await invoke('typ', { sokvag: p });
      return t?.kind === 'file' ? appFil(p, t.mtime) : null;
    },
    async dir(n) {
      const p = join(sokvag, n);
      return (await invoke('typ', { sokvag: p }))?.kind === 'directory' ? appMapp(p) : null;
    }
  };
}

// AnkiConnect through the app, so the request carries no browser origin.
export const ankiConnectViaApp = async (url, init) => {
  const text = await invoke('anki_connect', { url, kropp: init.body });
  return { status: 200, json: async () => JSON.parse(text) };
};
