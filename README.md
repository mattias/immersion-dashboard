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
- **The web app** runs in any browser and installs as an app on Android, iPhone and desktop.
  On a phone it shows what your computer read.

Browsers are not allowed to open folders inside `%APPDATA%` (or `~/Library/Application Support`
on a Mac), which is where Anki, GameSentenceMiner and immersion-mpv keep their data. That is
why the Windows app exists.

## Getting started

### On Windows

1. Install the Windows app and open it.
2. The apps it found are already ticked. Untick any you do not want, choose a Mokuro or sleep
   file if you use those, and optionally a background image.
3. Press **Start the journey**.

The app reads everything again each time you open it, and ↻ does it on demand. The cog opens
the settings.

### On your phone

1. In the Windows app, turn on **Sync between devices** and sync once. Your browser opens so
   you can sign in with Google.
2. Open the web app on your phone and install it (Chrome: ⋮ → Add to home screen or Install
   app; Safari: Share → Add to Home Screen).
3. Turn on **Sync between devices** there too and press ↻.

### In a browser on a computer

The web app can read the Google Drive folder and the Mokuro and sleep files in Chrome or Edge.
For Anki it can use AnkiConnect (see below). For GameSentenceMiner and immersion-mpv on
Windows, use the Windows app.

## Sources

| App | What it adds | Where the data is |
| --- | --- | --- |
| **Anki** | Reviews, time, retention, new cards, cards mined per day, reviews per deck | `%APPDATA%\Anki2` |
| **GameSentenceMiner** | Visual novels and games | `%APPDATA%\GameSentenceMiner` |
| **ttu Ebook Reader, yatsu, Hoshi Reader, Mokuro** | Books and manga | The folders these readers sync to Google Drive, through Google Drive for desktop |
| **Mokuro without Google Drive** | Manga read on reader.mokuro.app | A `mokuro-volumes.json` file, see below |
| **immersion-mpv** | Anime and video watched in mpv | `%APPDATA%\immersion-mpv` |
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
- Mokuro page turns count new characters only, so paging back and forth does not add text.
- immersion-mpv rows are increments and are summed per file and day.
- Anki's day changes at 04:00. Everything else uses midnight.

## Your data

- The Windows app reads only the source folders and files you see in the settings, and never
  immersion-mpv's `secrets.json`. It writes nothing to them.
- Sync between devices uses the `drive.appdata` permission: one file in a hidden folder that
  only this app can see. It cannot see anything else in your Drive.
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
```

The Windows app is built with [Tauri](https://tauri.app). It needs Rust and the WebView2
runtime, which Windows 10 and 11 already have.

### Sync between devices: Google Cloud setup

Both forms of the app must use OAuth clients from the **same** Google Cloud project, because the
hidden app folder belongs to the project.

1. In [Google Cloud Console](https://console.cloud.google.com/), create a project and enable the
   **Google Drive API**.
2. Set up Google Auth Platform (External) with the scope
   `https://www.googleapis.com/auth/drive.appdata`. For your own use, leave it in **Testing** and
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
| `js/sources.js` | Reads Anki, GSM, the readers, Mokuro, immersion-mpv and sleep |
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
