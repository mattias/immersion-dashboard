// Runs the Tauri CLI with the Google desktop client from a downloaded client JSON, when there is one.
// The file is never committed: GOOGLE_DESKTOP_JSON, or tmp/google-desktop.json by default.
import { existsSync, readFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
const fil = process.env.GOOGLE_DESKTOP_JSON || 'tmp/google-desktop.json';
const env = { ...process.env };
if (existsSync(fil)) {
  const j = JSON.parse(readFileSync(fil, 'utf8'));
  const k = j.installed || j.web || {};
  env.GOOGLE_DESKTOP_CLIENT_ID = k.client_id;
  env.GOOGLE_DESKTOP_CLIENT_SECRET = k.client_secret;
  console.log('Google sync: on');
} else console.log(`Google sync: off (no ${fil})`);
const r = spawnSync('npx', ['tauri', ...process.argv.slice(2)], { stdio: 'inherit', env, shell: true });
process.exit(r.status ?? 1);
