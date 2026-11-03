// Runs the Tauri CLI with the Google desktop client from a downloaded client JSON, when there is one.
// The file is never committed: GOOGLE_DESKTOP_JSON, or tmp/google-desktop.json by default.
// A build with the updater's signing key (~/.tauri-keys, outside the repository) also signs the installer and writes
// tmp/latest.json, which the app reads from the latest GitHub release to find updates.
import { copyFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
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

const args = process.argv.slice(2);
const nyckel = join(homedir(), '.tauri-keys', 'immersion-dashboard.key');
const signera = args[0] === 'build' && existsSync(nyckel);
mkdirSync('tmp', { recursive: true });
if (signera) {
  env.TAURI_SIGNING_PRIVATE_KEY = readFileSync(nyckel, 'utf8');
  env.TAURI_SIGNING_PRIVATE_KEY_PASSWORD ??= '';
  writeFileSync('tmp/updater.conf.json', JSON.stringify({ bundle: { createUpdaterArtifacts: true } }));
  args.push('--config', 'tmp/updater.conf.json');
  console.log('Updates: signed');
} else if (args[0] === 'build') console.log(`Updates: off (no ${nyckel})`);

const r = spawnSync('npx', ['tauri', ...args], { stdio: 'inherit', env, shell: true });
if (r.status === 0 && signera) {
  const version = JSON.parse(readFileSync('src-tauri/tauri.conf.json', 'utf8')).version;
  const exe = join('src-tauri/target/release/bundle/nsis', `Immersion Dashboard_${version}_x64-setup.exe`);
  const namn = `Immersion-Dashboard-${version}-x64-setup.exe`;
  copyFileSync(exe, join('tmp', namn));
  writeFileSync('tmp/latest.json', JSON.stringify({
    version,
    pub_date: new Date().toISOString(),
    platforms: { 'windows-x86_64': {
      signature: readFileSync(exe + '.sig', 'utf8'),
      url: `https://github.com/mattias/immersion-dashboard/releases/download/v${version}/${namn}`,
    } },
  }, null, 2));
  console.log(`Installer: tmp/${namn}\nUpdate file: tmp/latest.json (upload both to the release v${version})`);
}
process.exit(r.status ?? 1);
