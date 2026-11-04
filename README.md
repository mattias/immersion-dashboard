# 旅の記録 · Immersion Dashboard

A private dashboard for Japanese learners. It gathers what you read, play, watch and review
from the apps you already use and shows it by day, week, month and year: time, characters,
streaks, a year calendar, the titles you spent time on, your Anki reviews and, if you like,
your sleep. You can also make an image of any period to share.

There is no server and no account. Your data stays on your devices. If you want the dashboard
on your phone too, a copy goes to a hidden app folder in **your own** Google Drive.

It comes in two forms that share the same code:

- **The Windows app** reads your apps' data where it already is, in `%APPDATA%`. It finds the
  usual folders by itself, so setting it up is mostly clicking Start.
- **The web app** at https://mattias.github.io/immersion-dashboard/ runs in any browser and installs as an app on Android, iPhone and desktop.
  On a phone it shows what your computer read.

Browsers are not allowed to open folders inside `%APPDATA%` (or `~/Library/Application Support`
on a Mac), which is where Anki, GameSentenceMiner and immersion-mpv keep their data. That is
why the Windows app exists.

## Getting started

### On Windows

1. Download the installer from [Releases](https://github.com/mattias/immersion-dashboard/releases/latest), run it and open the app. It is not code-signed, so Windows may ask you to confirm (More info → Run anyway).
2. The apps it found are already ticked. Untick any you do not want, choose a Mokuro or sleep
   file if you use those, and optionally a background image.
3. Press **Start the journey**.

The app reads everything again each time you open it, and ↻ does it on demand. The cog opens
the settings.

### On your phone

1. In the Windows app, turn on **Sync between devices** and sync once. Your browser opens so
   you can sign in with Google.
2. On Android, install the app from [Releases](https://github.com/mattias/immersion-dashboard/releases/latest)
   (`Immersion-Dashboard-…apk`; allow installing apps from your browser when asked). On an
   iPhone, open the web app in Safari and choose Share → Add to Home Screen.
3. Turn on **Sync between devices** there too and press ↻.

The Android app is the web app opened by Chrome as an app of its own (a Trusted Web Activity), so
it needs Chrome on the phone and is always up to date with the website.

### In a browser on a computer

The web app can read the Google Drive folder and the Mokuro and sleep files in Chrome or Edge.
For Anki it can use AnkiConnect (see below). For GameSentenceMiner and immersion-mpv on
Windows, use the Windows app.

## Sources

| App | What it adds | Where the data is |
| --- | --- | --- |
| **Anki** | Reviews, time, retention, new cards, cards mined per day, reviews per deck | `%APPDATA%\Anki2` |
| **GameSentenceMiner** | Visual novels and games | `%APPDATA%\GameSentenceMiner` |
| **Rubi for Vita** | Games read on the PS Vita with [Rubi](https://github.com/bee-san/Rubi_for_vita) | `rubi-history.csv`, which the Vita app Rubi Drive Sync uploads to the folder **Immersion Dashboard** in My Drive, or `history.csv` copied from the Vita to a folder |
| **ttu Ebook Reader, yatsu, Hoshi Reader, Mokuro** | Books and manga | The folders these readers sync to Google Drive, through Google Drive for desktop |
| **Mokuro without Google Drive** | Manga read on reader.mokuro.app | A `mokuro-volumes.json` file, see below |
| **immersion-mpv** | Anime and video watched in mpv | `%APPDATA%\immersion-mpv` |
| **Netflix, YouTube and Twitch** | Japanese video on Netflix, YouTube and Twitch | The [Immersion Web](https://github.com/mattias/immersion-web) browser extension, and **Watching** in the Android app for the YouTube, YouTube Music, Netflix and Twitch apps, both through the app folder in your Google Drive |
| **Garmin Connect** | Sleep: hours and score per night | Signing in to Garmin Connect, Windows app only |
| **Sleep from a file** | Hours and score per night | A CSV file, see below |

Every source is optional. Kinds of activity you have no data for are hidden, and sleep only
shows up when there is sleep data.

**Anki** is read from `collection.anki2`, so Anki can stay open or be closed. Reviews that
Anki has not written to the main file yet (they sit in `collection.anki2-wal`) are included.
The dashboard never writes to the collection. With several profiles, the one used most
recently is read; you can pick another under Options. If the collection file cannot be found,
the Windows app asks **AnkiConnect** instead, and you can choose to always use AnkiConnect.
AnkiConnect cannot see reviews of cards you have deleted, so totals can be lower that way. In a
browser, AnkiConnect needs the page's address in `webCorsOriginList` in the AnkiConnect config.

**Mokuro** with Google Drive sync turned on in the reader is read from `mokuro-reader/volume-data.json` in your Drive folder. Without it, Mokuro keeps its data inside the reader's own browser storage. On reader.mokuro.app, open
the console (F12 → Console) and run the line shown in the settings. It downloads
`mokuro-volumes.json`. Choose that file, and save new downloads over it. The dashboard reads
it again on every sync.

**Garmin Connect** has no API that apps may use freely. The Windows app opens Garmin Connect's
own sign-in page in a window instead. You sign in there, two-step codes included, and that
page then fetches your sleep with your own session. The dashboard never sees your password, and
the Garmin page may call nothing in the app except handing back the nights. The first sync
fetches every night Garmin has; after that only new nights, from three days before the last
one fetched, since watches sync late.

**Rubi for Vita** saves every line it reads automatically in `ux0:data/VitaJPOverlay/history.csv`
on the Vita (only in **Read text: Automatically**). The Vita app Rubi Drive Sync uploads it as
`rubi-history.csv` to the folder **Immersion Dashboard** in My Drive, and the dashboard reads it
from there when it syncs with Google (the web app, the Android app and the Windows app). The Windows
app also finds that folder by itself through Google Drive for desktop. Without the Vita app, copy the
file with VitaShell, over FTP or USB, to a folder and choose that folder. Every CSV in it that is a
Rubi history counts, and a line found in several copies counts once, so older copies can stay.

**Sleep from a file** is for other watches: a CSV with one night per row, a `date` (or `datum`)
column, an `hours` (or `timmar`) column and optionally `score`, `bedtime` and `wake`.

### Options

- **Anki:** which decks count as mined cards (names ending in `Mining` by default), the hour a
  new day starts (4, like Anki), the profile and AnkiConnect.
- **GameSentenceMiner:** games to leave out, such as `GSM Helper, Discord`.
- **Readers:** turn ttu, yatsu and Hoshi on or off one by one.
- **General:** daily goal, the longest pause that still counts as reading (180 seconds) and the
  highest believable reading speed (20,000 characters per hour). Text skipped through faster
  than that is capped.

### How the numbers are counted

- The same book synced to several folders or read in several readers is counted once per day:
  the entry with the most characters wins.
- GameSentenceMiner days come from its daily summary. Days it has not summarised yet are
  counted from the text lines, without pauses longer than the pause limit.
- Rubi lines count the characters Rubi counts (kanji, kana, letters and digits). The reading time
  is Rubi's own adaptive rule, the one its △ view uses: each line gets the time until the next line
  of the same game, at most 2.5 times what your reading pace would take for it, 2 s to 5 minutes.
  Runs of skipped text count nothing. So pauses never count whole, and the pause limit is not used.
- Mokuro page turns count new characters only, so paging back and forth does not add text.
- immersion-mpv rows are increments and are summed per file and day.
- Immersion Web counts only time when the video plays with sound and no ad runs, and only videos
  it knows are Japanese. Videos are summed per channel (YouTube, Twitch) or show (Netflix) and day.
- Anki's day changes at 04:00. Everything else uses midnight.

## Your data

- The Windows app reads only the source folders and files you see in the settings, and never
  immersion-mpv's `secrets.json`. It writes nothing to them.
- Sync between devices uses the `drive.appdata` permission: one file in a hidden folder that
  only this app can see. The Immersion Web extension puts its own file, `immersion-web.json`, in
  the same folder, and the Android app puts `immersion-phone.json` there. The dashboard reads both.
- It also asks for `drive.file`, which only reaches files this project's own apps created: here
  `rubi-history.csv`, which Rubi Drive Sync keeps in My Drive, because Google lets a console sign in
  with a code only for that permission. It cannot see anything else in your Drive.
- Watching in the Android app needs notification access, only to see what other apps play
  (their media sessions); it reads no notifications. On a phone where the app was not installed
  from a store, first allow restricted settings: App info → ⋮ → Allow restricted settings.
  YouTube videos, and songs and podcasts in YouTube Music, count by themselves when the title or
  the channel, artist or podcast has kana or kanji. Twitch gives only the
  channel name and Netflix only the episode, in the app's display language, so those count once
  you mark them as Japanese in Watching.
- Settings → Your data → **Export JSON** saves everything the dashboard has read, and
  **Import JSON** brings it into another device. **Erase everything** removes all data,
  settings and the background image.
- The repository contains no personal data and no artwork. Your background image is stored
  only on your device.

## Hosting and building

The web app is plain static files: HTML, CSS, JavaScript modules and
[sql.js](https://github.com/sql-js/sql.js) in `vendor/`, with no build step. Any static host
works, for example GitHub Pages from the main branch.

```bash
npm install
npm run serve        # the web app on http://localhost:8642
npm run app:dev      # the Windows app, while developing
npm run app:build    # the Windows installer in src-tauri/target/release/bundle/nsis
node tools/android.mjs   # the Android app in tmp/, from the published web manifest
```

The Android build needs JDK 17 and the Android SDK. Its signing key is created on first run in
`~/.android-keys`, outside the repository; keep a backup, since updates must use the same key.
For the app to open without Chrome's address bar, `https://<user>.github.io/.well-known/assetlinks.json`
must list the key's fingerprint; the build writes that file to `android/assetlinks.json`.

The Windows app is built with [Tauri](https://tauri.app). It needs Rust and the WebView2
runtime, which Windows 10 and 11 already have.

### Updates

Both apps look for a newer release on GitHub and ask before they update.

- **Windows** checks at start. The installer is signed with the updater key in
  `~/.tauri-keys/immersion-dashboard.key`, whose public half is in `tauri.conf.json`. Keep a backup:
  without it, installed apps cannot update. `npm run app:build` signs when the key is there and
  writes `tmp/Immersion-Dashboard-<version>-x64-setup.exe` and `tmp/latest.json`. Upload both to
  the release; the apps read `latest.json` from the latest release.
- **Android** checks at most twice a day, from the Watching service and screen, and shows a
  notification. **Update now** in Watching downloads the APK and opens Android's installer. The
  dashboard itself is the website, so only Watching needs the APK to be current. Build with
  `ANDROID_VERSION_CODE` one higher than the last release.

### Sync between devices: Google Cloud setup

Both forms of the app must use OAuth clients from the **same** Google Cloud project, because the
hidden app folder belongs to the project.

1. In [Google Cloud Console](https://console.cloud.google.com/), create a project and enable the
   **Google Drive API**.
2. Set up Google Auth Platform (External) with the scopes
   `https://www.googleapis.com/auth/drive.appdata` and `https://www.googleapis.com/auth/drive.file`. For your own use, leave it in **Testing** and
   add your account under Test users; no branding or privacy policy is needed, but the Windows
   app asks you to sign in again every 7 days. To let anyone sign in, publish it; Google then
   wants a home page, a privacy policy and a verified domain, but no security review, since the
   scope is non-sensitive.
3. Create an OAuth client of type **Web application** with your site, for example
   `https://you.github.io`, as an authorised JavaScript origin. Put its client ID in `config.js`.
4. Create an OAuth client of type **Desktop app**, download its JSON and save it as
   `tmp/google-desktop.json` (never committed). `npm run app:build` builds it into the app. You
   can also point `GOOGLE_DESKTOP_JSON` at the file.

Client IDs are not secrets, and Google treats the secret of a desktop client as public too,
since it ships inside the program. Without these the sync option is simply hidden.

## Development

```bash
npm test                              # JavaScript tests
cargo test --manifest-path src-tauri/Cargo.toml
```

The calculation rules live in `js/calc.js` as pure functions, and the sources in
`js/sources.js` read folders through a small adapter, so the same code runs in the browser, the
Windows app and Node. `tools/compare.mjs` reads real folders from disk and compares the result
day by day against a `data.js` from the earlier Python version of this dashboard.

| File | Purpose |
| --- | --- |
| `js/calc.js` | Counting rules for every source |
| `js/sources.js` | Reads Anki, GSM, Rubi, the readers, Mokuro, immersion-mpv, Immersion Web and sleep |
| `js/sqlite.js` | Opens SQLite files with sql.js and applies the `-wal` file |
| `js/store.js` | IndexedDB storage and the browser's folder adapter |
| `js/plattform.js` | The Windows app's folder adapter and AnkiConnect bridge |
| `js/view.js` | Draws the dashboard and the share image |
| `js/app.js` | Setup, settings, syncing, export and import |
| `js/moln.js` | Google Drive sync in the browser |
| `js/garmin.js` | The script that fetches sleep on Garmin Connect's page |
| `src-tauri/src/lib.rs` | The Windows app: reading files, folder dialogs, AnkiConnect, Google sign-in and Drive |
| `src-tauri/src/garmin.rs` | The Garmin Connect window |
| `sw.js` | Offline support for the web app |

## Licence

MIT. sql.js is MIT licensed, see `vendor/sql.js-LICENSE`.
