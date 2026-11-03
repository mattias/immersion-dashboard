// Builds the Android app: a Trusted Web Activity, which is the published web app opened in Chrome
// as an app of its own. Google sign-in works there, unlike in an embedded web view.
//   node tools/android.mjs            generate android/ from the live web manifest and build a signed APK
//   node tools/android.mjs --bygg     build only, from the android/ that is already there
// Needs JDK 17 (JAVA_HOME or ~/.jdks/jdk-17*) and the Android SDK (ANDROID_HOME).
// The signing key lives outside the repository, in ~/.android-keys. Keep a backup: updates must be signed with the same key.
import { existsSync, readdirSync, readFileSync, writeFileSync, mkdirSync, copyFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join, resolve } from 'node:path';
import { randomBytes } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { TwaManifest, TwaGenerator, ConsoleLog } from '@bubblewrap/core';

const MANIFEST = 'https://mattias.github.io/immersion-dashboard/manifest.webmanifest';
const PAKET = 'io.github.mattias.immersiondashboard';
const VERSION = JSON.parse(readFileSync('package.json', 'utf8')).version;
const KOD = Number(process.env.ANDROID_VERSION_CODE || 1);
const MAPP = resolve('android');

const jdkar = join(homedir(), '.jdks');
const jdk = process.env.JAVA_HOME?.includes('17') ? process.env.JAVA_HOME
  : existsSync(jdkar) && readdirSync(jdkar).filter(n => n.startsWith('jdk-17')).map(n => join(jdkar, n))[0];
const sdk = process.env.ANDROID_HOME || join(process.env.LOCALAPPDATA || '', 'Android', 'Sdk');
if (!jdk || !existsSync(sdk)) throw new Error('Needs JDK 17 and the Android SDK, see the top of this file.');

const nycklar = join(homedir(), '.android-keys');
const nyckel = join(nycklar, 'immersion-dashboard.jks'), losen = join(nycklar, 'immersion-dashboard.json');
if (!existsSync(nyckel)) {
  mkdirSync(nycklar, { recursive: true });
  const ks = randomBytes(18).toString('base64url');
  execFileSync(join(jdk, 'bin', 'keytool'), ['-genkeypair', '-keystore', nyckel, '-alias', 'immersion', '-keyalg', 'RSA', '-keysize', '2048',
    '-validity', '10000', '-storepass', ks, '-keypass', ks, '-dname', 'CN=Immersion Dashboard'], { stdio: 'inherit' });
  writeFileSync(losen, JSON.stringify({ storepass: ks, keypass: ks }));
  console.log(`New signing key: ${nyckel}. Back it up together with ${losen}.`);
}
const { storepass, keypass } = JSON.parse(readFileSync(losen, 'utf8'));

const log = new ConsoleLog('android');
if (!process.argv.includes('--bygg')) {
  const twa = await TwaManifest.fromWebManifest(MANIFEST);
  Object.assign(twa, { packageId: PAKET, launcherName: '旅の記録', appVersionName: VERSION, appVersionCode: KOD,
    signingKey: { path: nyckel, alias: 'immersion' }, enableNotifications: false, fallbackType: 'customtabs', minSdkVersion: 24 });
  await new TwaGenerator().createTwaProject(MAPP, twa, log);
  await twa.saveToFile(join(MAPP, 'twa-manifest.json'));
}

// Watching on the phone (android/app/src/main/java/.../titta) lives outside what Bubblewrap generates,
// so the manifest entries and dependencies are put back after every regeneration.
const TITTA_MANIFEST = `
        <!-- Watching on the phone: counts Japanese video, music and podcasts in YouTube, YouTube Music, Netflix and Twitch. -->
        <service android:name=".titta.TittaTjanst"
            android:label="旅の記録 · Watching"
            android:exported="true"
            android:permission="android.permission.BIND_NOTIFICATION_LISTENER_SERVICE">
            <intent-filter>
                <action android:name="android.service.notification.NotificationListenerService" />
            </intent-filter>
        </service>

        <activity android:name=".titta.TittaAktivitet"
            android:label="旅の記録 · Watching"
            android:icon="@mipmap/ic_launcher"
            android:theme="@android:style/Theme.Material"
            android:taskAffinity=".titta"
            android:exported="true">
            <intent-filter>
                <action android:name="android.intent.action.MAIN" />
                <category android:name="android.intent.category.LAUNCHER" />
            </intent-filter>
            <intent-filter>
                <action android:name="android.intent.action.VIEW" />
                <category android:name="android.intent.category.DEFAULT" />
                <category android:name="android.intent.category.BROWSABLE" />
                <data android:scheme="immersiondashboard" android:host="watching" />
            </intent-filter>
        </activity>
`;
const TITTA_BEROENDEN = `
    // Watching on the phone: Google Drive sign-in, and org.json for the JVM unit tests.
    implementation 'com.google.android.gms:play-services-auth:21.3.0'
    testImplementation 'junit:junit:4.13.2'
    testImplementation 'org.json:json:20240303'
`;
const manifestFil = join(MAPP, 'app', 'src', 'main', 'AndroidManifest.xml'), gradleFil = join(MAPP, 'app', 'build.gradle');
const manifest = readFileSync(manifestFil, 'utf8'), gradle = readFileSync(gradleFil, 'utf8');
let nyManifest = manifest;
// A Trusted Web Activity needs no network of its own (Chrome does that), but the Drive upload does.
if (!nyManifest.includes('android.permission.INTERNET')) nyManifest = nyManifest.replace(/(\n\s*<application)/, '\n    <uses-permission android:name="android.permission.INTERNET" />\n$1');
// Updating the app itself: a notification when a new version is out, and opening the downloaded APK in Android's installer.
for (const r of ['android.permission.POST_NOTIFICATIONS', 'android.permission.REQUEST_INSTALL_PACKAGES']) {
  if (!nyManifest.includes(r)) nyManifest = nyManifest.replace(/(\n\s*<application)/, `\n    <uses-permission android:name="${r}" />\n$1`);
}
if (!nyManifest.includes('TittaTjanst')) nyManifest = nyManifest.replace(/(\n\s*<\/application>)/, TITTA_MANIFEST + '$1');
if (nyManifest !== manifest) writeFileSync(manifestFil, nyManifest);
if (!gradle.includes('play-services-auth')) writeFileSync(gradleFil, gradle.replace(/(dependencies \{[^]*?)(\n\}\s*)$/, '$1' + TITTA_BEROENDEN + '$2'));

// Gradle by full path: Windows may be set not to run programs from the current folder.
execFileSync(join(MAPP, process.platform === 'win32' ? 'gradlew.bat' : 'gradlew'), ['testReleaseUnitTest', 'assembleRelease'], { cwd: MAPP, stdio: 'inherit', shell: process.platform === 'win32', env: { ...process.env, JAVA_HOME: jdk, ANDROID_HOME: sdk } });
const osignerad = join(MAPP, 'app', 'build', 'outputs', 'apk', 'release', 'app-release-unsigned.apk');
const justerad = join(MAPP, 'app-release-aligned.apk'), klar = join(MAPP, 'app-release-signed.apk');
// zipalign and apksigner from the newest build-tools installed.
const bt = join(sdk, 'build-tools', readdirSync(join(sdk, 'build-tools')).sort((a, b) => a.localeCompare(b, 'en', { numeric: true })).pop());
const win = process.platform === 'win32';
execFileSync(join(bt, win ? 'zipalign.exe' : 'zipalign'), ['-f', '-p', '4', osignerad, justerad], { stdio: 'inherit' });
execFileSync(join(bt, win ? 'apksigner.bat' : 'apksigner'), ['sign', '--ks', nyckel, '--ks-key-alias', 'immersion', '--ks-pass', 'env:KS', '--key-pass', 'env:KS2', '--out', klar, justerad],
  { stdio: 'inherit', shell: win, env: { ...process.env, JAVA_HOME: jdk, PATH: join(jdk, 'bin') + (win ? ';' : ':') + process.env.PATH, KS: storepass, KS2: keypass } });
mkdirSync('tmp', { recursive: true });
copyFileSync(klar, join('tmp', `Immersion-Dashboard-${VERSION}.apk`));

// The fingerprint that /.well-known/assetlinks.json on mattias.github.io must list for the app to run without a URL bar.
const lista = execFileSync(join(jdk, 'bin', 'keytool'), ['-list', '-v', '-keystore', nyckel, '-alias', 'immersion', '-storepass', storepass]).toString();
const sha = /SHA256:\s*([0-9A-F:]+)/.exec(lista)?.[1];
writeFileSync(join(MAPP, 'assetlinks.json'), JSON.stringify([{ relation: ['delegate_permission/common.handle_all_urls'],
  target: { namespace: 'android_app', package_name: PAKET, sha256_cert_fingerprints: [sha] } }], null, 2) + '\n');
console.log(`APK: tmp/Immersion-Dashboard-${VERSION}.apk\nSHA-256: ${sha}`);
