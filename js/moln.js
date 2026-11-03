// Sync between devices: one file in the hidden app folder of the user's own Google Drive.
import { GOOGLE_CLIENT_ID } from '../config.js';

export const finns = !!GOOGLE_CLIENT_ID;
const FIL = 'immersion-dashboard.json', API = 'https://www.googleapis.com', SCOPE = 'https://www.googleapis.com/auth/drive.appdata';
let klient, token = null, utgar = 0, vantar = null;

// Loads Google's sign-in script ahead of time, so the token request can open its popup straight from a click.
export function forbered() {
  if (!finns || klient) return;
  const s = document.createElement('script');
  s.src = 'https://accounts.google.com/gsi/client';
  s.onload = () => {
    klient = google.accounts.oauth2.initTokenClient({
      client_id: GOOGLE_CLIENT_ID,
      scope: SCOPE,
      callback: r => {
        if (r.error) return vantar?.fel(new Error(r.error_description || r.error));
        // Google lets people untick the permission; without it every Drive call is refused.
        if (!google.accounts.oauth2.hasGrantedAllScopes(r, SCOPE)) return vantar?.fel(new Error('Google was not given access to the dashboard\'s app folder. Sync again and tick that box.'));
        token = r.access_token;
        utgar = Date.now() + (r.expires_in - 60) * 1000;
        vantar?.ok(token);
      },
      error_callback: e => vantar?.fel(new Error(e.message || 'Google sign-in was closed.'))
    });
  };
  document.head.appendChild(s);
}

// Must be called directly from a click.
export function begarToken() {
  if (token && Date.now() < utgar) return Promise.resolve(token);
  if (!klient) return Promise.reject(new Error('Google sign-in is still loading. Try again in a moment.'));
  return new Promise((ok, fel) => { vantar = { ok, fel }; klient.requestAccessToken({ prompt: '' }); });
}

export const harToken = () => !!token && Date.now() < utgar;

async function anrop(t, url, init = {}) {
  const r = await fetch(url, { ...init, headers: { Authorization: 'Bearer ' + t, ...(init.headers || {}) } });
  if (!r.ok) {
    if (r.status === 401) token = null;
    throw new Error(`Google Drive answered ${r.status}.`);
  }
  return r;
}

async function hittaFil(t, namn = FIL) {
  const q = encodeURIComponent(`name='${namn}'`);
  const r = await (await anrop(t, `${API}/drive/v3/files?spaces=appDataFolder&q=${q}&fields=files(id)`)).json();
  return r.files?.[0]?.id || null;
}

export async function hamta(t) {
  const id = await hittaFil(t);
  if (!id) return { id: null, data: null };
  return { id, data: await (await anrop(t, `${API}/drive/v3/files/${id}?alt=media`)).json() };
}

// Another app's file in the same app folder, such as the Immersion Web extension's. null when there is none.
export async function hamtaText(t, namn) {
  const id = await hittaFil(t, namn);
  return id ? (await anrop(t, `${API}/drive/v3/files/${id}?alt=media`)).text() : null;
}

export async function spara(t, id, data) {
  const kropp = JSON.stringify(data);
  if (id) return anrop(t, `${API}/upload/drive/v3/files/${id}?uploadType=media`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: kropp });
  const grans = 'immersion' + Math.random().toString(36).slice(2);
  const meta = JSON.stringify({ name: FIL, parents: ['appDataFolder'] });
  const body = `--${grans}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${meta}\r\n--${grans}\r\nContent-Type: application/json\r\n\r\n${kropp}\r\n--${grans}--`;
  return anrop(t, `${API}/upload/drive/v3/files?uploadType=multipart`, { method: 'POST', headers: { 'Content-Type': `multipart/related; boundary=${grans}` }, body });
}
