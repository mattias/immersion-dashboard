// The Windows app: the same dashboard as the web app, plus what a browser may not do.
// Reads the source folders in AppData (read only, and never secrets.json), talks to AnkiConnect
// signs in to Google for syncing with the phone through a hidden app folder in the user's Drive,
// and fetches sleep from Garmin Connect (see garmin.rs).
use base64::{engine::general_purpose::URL_SAFE_NO_PAD, Engine};
use rand::RngCore;
use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use sha2::{Digest, Sha256};
use std::path::PathBuf;
use std::sync::Mutex;
use std::time::{Duration, Instant};
use tauri::ipc::Response;
use tauri::{AppHandle, Manager, State};
use tauri_plugin_dialog::{DialogExt, MessageDialogButtons};
use tauri_plugin_updater::UpdaterExt;
use tokio::io::{AsyncReadExt, AsyncWriteExt};

mod garmin;

const GOOGLE_ID: Option<&str> = option_env!("GOOGLE_DESKTOP_CLIENT_ID");
// Google treats the secret of an installed app as public; it cannot be kept secret in a program people download.
const GOOGLE_HEMLIGHET: Option<&str> = option_env!("GOOGLE_DESKTOP_CLIENT_SECRET");
const SCOPE: &str = "https://www.googleapis.com/auth/drive.appdata";
const DRIVEFIL: &str = "immersion-dashboard.json";
// Files other apps of the same Google project put in the app folder, which the dashboard may read.
const ANDRA_DRIVEFILER: [&str; 2] = ["immersion-web.json", "immersion-phone.json"];
const DRIVE_NAMN: [&str; 8] = ["My Drive", "Min enhet", "Meine Ablage", "Mon Drive", "Mi unidad", "Il mio Drive", "Mijn Drive", "マイドライブ"];

#[derive(Default)]
struct Tillstand {
    rotter: Mutex<Vec<PathBuf>>,
    token: Mutex<Option<(String, Instant)>>,
}

#[derive(Serialize)]
struct Post {
    name: String,
    kind: &'static str,
}

fn appdata() -> Option<PathBuf> {
    std::env::var_os("APPDATA").map(PathBuf::from)
}

// Google Drive for desktop mounts the drive as a letter with a localised "My Drive" folder.
fn hitta_drive() -> Option<PathBuf> {
    let mut forsta = None;
    for b in b'A'..=b'Z' {
        for n in DRIVE_NAMN {
            let p = PathBuf::from(format!("{}:\\{}", b as char, n));
            if p.is_dir() {
                if ["Hoshi Reader", "ttu-reader-data", "yatsu-reader-data", "mokuro-reader"].iter().any(|n| p.join(n).is_dir()) {
                    return Some(p);
                }
                forsta.get_or_insert(p);
            }
        }
    }
    forsta
}

fn standard_rotter() -> Vec<PathBuf> {
    let mut v: Vec<PathBuf> = appdata()
        .map(|a| ["Anki2", "GameSentenceMiner", "immersion-mpv"].iter().map(|n| a.join(n)).collect())
        .unwrap_or_default();
    v.extend(hitta_drive());
    v
}

fn rotfil(app: &AppHandle) -> Option<PathBuf> {
    app.path().app_config_dir().ok().map(|d| d.join("folders.json"))
}

fn ladda_rotter(app: &AppHandle) -> Vec<PathBuf> {
    let mut v = standard_rotter();
    if let Some(Ok(t)) = rotfil(app).map(std::fs::read_to_string) {
        if let Ok(lista) = serde_json::from_str::<Vec<PathBuf>>(&t) {
            v.extend(lista);
        }
    }
    v
}

// Only files below the source folders may be read, and immersion-mpv's secrets.json never.
fn tillaten(st: &Tillstand, p: &str) -> Result<PathBuf, String> {
    let p = std::fs::canonicalize(p).map_err(|_| "not found".to_string())?;
    if p.file_name().map(|n| n.eq_ignore_ascii_case("secrets.json")).unwrap_or(false) {
        return Err("not allowed".into());
    }
    let ok = st.rotter.lock().unwrap().iter().any(|r| std::fs::canonicalize(r).map(|r| p.starts_with(r)).unwrap_or(false));
    if ok { Ok(p) } else { Err("outside the source folders".into()) }
}

#[tauri::command]
fn standard() -> Value {
    let finns = |p: Option<PathBuf>| p.filter(|p| p.exists()).map(|p| p.to_string_lossy().into_owned());
    json!({
        "anki": finns(appdata().map(|a| a.join("Anki2"))),
        "gsm": finns(appdata().map(|a| a.join("GameSentenceMiner"))),
        "mpv": finns(appdata().map(|a| a.join("immersion-mpv"))),
        "lasare": finns(hitta_drive()),
        "google": GOOGLE_ID.is_some() && GOOGLE_HEMLIGHET.is_some(),
    })
}

#[tauri::command]
fn lista(st: State<Tillstand>, sokvag: String) -> Result<Vec<Post>, String> {
    let p = tillaten(&st, &sokvag)?;
    let mut ut = Vec::new();
    for e in std::fs::read_dir(p).map_err(|e| e.to_string())?.flatten() {
        let Ok(t) = e.file_type() else { continue };
        if t.is_symlink() { continue; }
        ut.push(Post { name: e.file_name().to_string_lossy().into_owned(), kind: if t.is_dir() { "directory" } else { "file" } });
    }
    Ok(ut)
}

#[tauri::command]
fn typ(st: State<Tillstand>, sokvag: String) -> Option<Value> {
    let p = tillaten(&st, &sokvag).ok()?;
    let mtime = std::fs::metadata(&p).and_then(|m| m.modified()).ok()
        .and_then(|t| t.duration_since(std::time::UNIX_EPOCH).ok()).map(|d| d.as_millis() as u64).unwrap_or(0);
    Some(json!({ "kind": if p.is_dir() { "directory" } else { "file" }, "mtime": mtime }))
}

#[tauri::command]
fn las(st: State<Tillstand>, sokvag: String) -> Result<Response, String> {
    let p = tillaten(&st, &sokvag)?;
    // Anki and GSM keep their databases open, so the file is opened for reading with sharing allowed.
    std::fs::read(p).map(Response::new).map_err(|e| e.to_string())
}

#[tauri::command]
async fn valj(app: AppHandle, st: State<'_, Tillstand>, fil: bool) -> Result<Option<String>, String> {
    let d = app.dialog().file();
    let vald = if fil { d.add_filter("Data", &["json", "csv"]).blocking_pick_file() } else { d.blocking_pick_folder() };
    let Some(p) = vald.and_then(|p| p.into_path().ok()) else { return Ok(None) };
    let mut r = st.rotter.lock().unwrap();
    r.push(p.clone());
    let extra: Vec<&PathBuf> = r.iter().filter(|x| !standard_rotter().contains(x)).collect();
    if let Some(f) = rotfil(&app) {
        let _ = std::fs::create_dir_all(f.parent().unwrap());
        let _ = std::fs::write(f, serde_json::to_string(&extra).unwrap());
    }
    Ok(Some(p.to_string_lossy().into_owned()))
}

// Requests from the app itself carry no browser origin, so webCorsOriginList needs no change.
#[tauri::command]
async fn anki_connect(url: String, kropp: String) -> Result<String, String> {
    let u = url::Url::parse(&url).map_err(|e| e.to_string())?;
    if !matches!(u.host_str(), Some("127.0.0.1") | Some("localhost")) {
        return Err("AnkiConnect must run on this computer".into());
    }
    let svar = reqwest::Client::new().post(u).body(kropp).timeout(Duration::from_secs(60)).send().await
        .map_err(|_| format!("Could not reach AnkiConnect at {url}. Is Anki open?"))?;
    svar.text().await.map_err(|e| e.to_string())
}

// ---- Google sign-in for installed apps: the browser opens, Google sends the code back to a local port. ----

#[derive(Serialize, Deserialize)]
struct Sparad {
    refresh_token: String,
}

fn tokenfil(app: &AppHandle) -> Option<PathBuf> {
    app.path().app_config_dir().ok().map(|d| d.join("google.json"))
}

async fn token_anrop(form: &[(&str, &str)]) -> Result<Value, String> {
    let svar = reqwest::Client::new().post("https://oauth2.googleapis.com/token").form(form).send().await.map_err(|e| e.to_string())?;
    let j: Value = svar.json().await.map_err(|e| e.to_string())?;
    if let Some(f) = j.get("error") {
        return Err(format!("Google: {}", j.get("error_description").unwrap_or(f)));
    }
    Ok(j)
}

async fn logga_in(app: &AppHandle) -> Result<Value, String> {
    let (id, hemlighet) = (GOOGLE_ID.ok_or("No Google client ID in this build")?, GOOGLE_HEMLIGHET.unwrap_or(""));
    let mut b = [0u8; 32];
    rand::thread_rng().fill_bytes(&mut b);
    let verifierare = URL_SAFE_NO_PAD.encode(b);
    let utmaning = URL_SAFE_NO_PAD.encode(Sha256::digest(verifierare.as_bytes()));
    rand::thread_rng().fill_bytes(&mut b);
    let tillstand = URL_SAFE_NO_PAD.encode(&b[..16]);
    let lyssnare = tokio::net::TcpListener::bind("127.0.0.1:0").await.map_err(|e| e.to_string())?;
    let adress = format!("http://127.0.0.1:{}", lyssnare.local_addr().map_err(|e| e.to_string())?.port());
    let mut u = url::Url::parse("https://accounts.google.com/o/oauth2/v2/auth").unwrap();
    u.query_pairs_mut()
        .append_pair("client_id", id).append_pair("redirect_uri", &adress).append_pair("response_type", "code")
        .append_pair("scope", SCOPE).append_pair("code_challenge", &utmaning).append_pair("code_challenge_method", "S256")
        .append_pair("state", &tillstand).append_pair("access_type", "offline").append_pair("prompt", "consent");
    tauri_plugin_opener::open_url(u.as_str(), None::<&str>).map_err(|e| e.to_string())?;
    let kod = tokio::time::timeout(Duration::from_secs(300), async {
        loop {
            let (mut s, _) = lyssnare.accept().await.map_err(|e| e.to_string())?;
            let mut buf = vec![0u8; 8192];
            let n = s.read(&mut buf).await.map_err(|e| e.to_string())?;
            let rad = String::from_utf8_lossy(&buf[..n]).lines().next().unwrap_or("").to_string();
            let Some(vag) = rad.split_whitespace().nth(1) else { continue };
            let q = url::Url::parse(&format!("http://x{vag}")).map_err(|e| e.to_string())?;
            let par: std::collections::HashMap<_, _> = q.query_pairs().into_owned().collect();
            let klar = par.contains_key("code") || par.contains_key("error");
            let text = if par.contains_key("code") { "Signed in. You can close this tab and go back to the dashboard." } else { "Sign-in was cancelled. You can close this tab." };
            let html = format!("<!doctype html><meta charset=utf-8><body style=\"font:16px system-ui;background:#0b1020;color:#eef1f8;display:grid;place-items:center;height:90vh\">{text}</body>");
            let _ = s.write_all(format!("HTTP/1.1 200 OK\r\nContent-Type: text/html; charset=utf-8\r\nContent-Length: {}\r\nConnection: close\r\n\r\n{html}", html.len()).as_bytes()).await;
            if !klar { continue; }
            if par.get("state") != Some(&tillstand) { return Err("Google sign-in did not match. Try again.".to_string()); }
            return par.get("code").cloned().ok_or_else(|| "Google sign-in was cancelled.".to_string());
        }
    }).await.map_err(|_| "Google sign-in timed out.".to_string())??;
    let j = token_anrop(&[("client_id", id), ("client_secret", hemlighet), ("code", &kod), ("code_verifier", &verifierare), ("redirect_uri", &adress), ("grant_type", "authorization_code")]).await?;
    if let (Some(r), Some(f)) = (j.get("refresh_token").and_then(Value::as_str), tokenfil(app)) {
        let _ = std::fs::create_dir_all(f.parent().unwrap());
        let _ = std::fs::write(f, serde_json::to_string(&Sparad { refresh_token: r.into() }).unwrap());
    }
    Ok(j)
}

async fn token(app: &AppHandle, st: &Tillstand, fraga: bool) -> Result<Option<String>, String> {
    if let Some((t, utgar)) = st.token.lock().unwrap().clone() {
        if Instant::now() < utgar { return Ok(Some(t)); }
    }
    let sparad = tokenfil(app).and_then(|f| std::fs::read_to_string(f).ok()).and_then(|t| serde_json::from_str::<Sparad>(&t).ok());
    let j = match sparad {
        Some(s) => token_anrop(&[("client_id", GOOGLE_ID.unwrap_or("")), ("client_secret", GOOGLE_HEMLIGHET.unwrap_or("")), ("refresh_token", &s.refresh_token), ("grant_type", "refresh_token")]).await,
        None if fraga => logga_in(app).await,
        None => return Ok(None),
    };
    let j = match j {
        Ok(j) => j,
        // A revoked refresh token: forget it and sign in again.
        Err(_) if fraga => { if let Some(f) = tokenfil(app) { let _ = std::fs::remove_file(f); } logga_in(app).await? }
        Err(e) => return Err(e),
    };
    let t = j.get("access_token").and_then(Value::as_str).ok_or("Google sent no access token")?.to_string();
    let sek = j.get("expires_in").and_then(Value::as_u64).unwrap_or(3600).saturating_sub(60);
    *st.token.lock().unwrap() = Some((t.clone(), Instant::now() + Duration::from_secs(sek)));
    Ok(Some(t))
}

#[tauri::command]
fn google_inloggad(app: AppHandle) -> bool {
    tokenfil(&app).map(|f| f.exists()).unwrap_or(false)
}

#[tauri::command]
fn google_logga_ut(app: AppHandle, st: State<Tillstand>) {
    *st.token.lock().unwrap() = None;
    if let Some(f) = tokenfil(&app) { let _ = std::fs::remove_file(f); }
}

async fn drive_fil_id(t: &str, namn: &str) -> Result<Option<String>, String> {
    let svar = reqwest::Client::new().get("https://www.googleapis.com/drive/v3/files").bearer_auth(t)
        .query(&[("spaces", "appDataFolder"), ("q", &format!("name='{namn}'")), ("fields", "files(id)")])
        .send().await.map_err(|e| e.to_string())?;
    if !svar.status().is_success() { return Err(format!("Google Drive answered {}", svar.status())); }
    let j: Value = svar.json().await.map_err(|e| e.to_string())?;
    Ok(j["files"].get(0).and_then(|f| f["id"].as_str()).map(String::from))
}

// Merges with the phone's copy happen in JavaScript; Rust only moves the file.
#[tauri::command]
async fn drive_hamta(app: AppHandle, st: State<'_, Tillstand>, fraga: bool) -> Result<Option<String>, String> {
    drive_las_fil(&app, &st, fraga, DRIVEFIL).await
}

#[tauri::command]
async fn drive_las(app: AppHandle, st: State<'_, Tillstand>, namn: String, fraga: bool) -> Result<Option<String>, String> {
    if !ANDRA_DRIVEFILER.contains(&namn.as_str()) { return Err("not allowed".into()); }
    drive_las_fil(&app, &st, fraga, &namn).await
}

async fn drive_las_fil(app: &AppHandle, st: &Tillstand, fraga: bool, namn: &str) -> Result<Option<String>, String> {
    let Some(t) = token(app, st, fraga).await? else { return Err("not signed in".into()) };
    let Some(id) = drive_fil_id(&t, namn).await? else { return Ok(None) };
    let svar = reqwest::Client::new().get(format!("https://www.googleapis.com/drive/v3/files/{id}?alt=media")).bearer_auth(&t).send().await.map_err(|e| e.to_string())?;
    if !svar.status().is_success() { return Err(format!("Google Drive answered {}", svar.status())); }
    svar.text().await.map(Some).map_err(|e| e.to_string())
}

#[tauri::command]
async fn drive_spara(app: AppHandle, st: State<'_, Tillstand>, data: String) -> Result<(), String> {
    let Some(t) = token(&app, &st, false).await? else { return Err("not signed in".into()) };
    let k = reqwest::Client::new();
    let svar = match drive_fil_id(&t, DRIVEFIL).await? {
        Some(id) => k.patch(format!("https://www.googleapis.com/upload/drive/v3/files/{id}?uploadType=media")).bearer_auth(&t)
            .header("Content-Type", "application/json").body(data).send().await,
        None => {
            let grans = "immersion-dashboard-grans";
            let meta = json!({ "name": DRIVEFIL, "parents": ["appDataFolder"] });
            let kropp = format!("--{grans}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n{meta}\r\n--{grans}\r\nContent-Type: application/json\r\n\r\n{data}\r\n--{grans}--");
            k.post("https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart").bearer_auth(&t)
                .header("Content-Type", format!("multipart/related; boundary={grans}")).body(kropp).send().await
        }
    }.map_err(|e| e.to_string())?;
    if svar.status().is_success() { Ok(()) } else { Err(format!("Google Drive answered {}", svar.status())) }
}

// Looks for a newer release on GitHub at start. The user chooses; the installer then replaces the app and opens it again.
// No network, or a build without the updater's signing key: the check fails quietly.
async fn uppdatera(app: AppHandle) {
    let Ok(u) = app.updater() else { return };
    let Ok(Some(ny)) = u.check().await else { return };
    let fraga = format!("Immersion Dashboard {} is available. You have {}.

Update now? The app closes and opens again when it's done.", ny.version, ny.current_version);
    let h = app.clone();
    app.dialog().message(fraga).title("Update available")
        .buttons(MessageDialogButtons::OkCancelCustom("Update".into(), "Later".into()))
        .show(move |ja| {
            if !ja { return; }
            tauri::async_runtime::spawn(async move {
                if let Err(e) = ny.download_and_install(|_, _| {}, || {}).await {
                    h.dialog().message(format!("The update could not be installed: {e}")).title("Update").show(|_| {});
                }
            });
        });
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_updater::Builder::new().build())
        .manage(Tillstand::default())
        .manage(garmin::Garmin::default())
        .setup(|app| {
            let r = ladda_rotter(app.handle());
            *app.state::<Tillstand>().rotter.lock().unwrap() = r;
            let h = app.handle().clone();
            tauri::async_runtime::spawn(async move { uppdatera(h).await });
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![standard, lista, typ, las, valj, anki_connect, google_inloggad, google_logga_ut, drive_hamta, drive_las, drive_spara, garmin::garmin_hamta, garmin::garmin_svar])
        .run(tauri::generate_context!())
        .expect("error while running the app");
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn secrets_json_is_never_read() {
        let d = std::env::temp_dir().join("immersion-test-hemlig");
        std::fs::create_dir_all(&d).unwrap();
        std::fs::write(d.join("secrets.json"), "{}").unwrap();
        std::fs::write(d.join("stats.jsonl"), "").unwrap();
        let st = Tillstand::default();
        st.rotter.lock().unwrap().push(d.clone());
        assert!(tillaten(&st, d.join("stats.jsonl").to_str().unwrap()).is_ok());
        assert!(tillaten(&st, d.join("secrets.json").to_str().unwrap()).is_err());
        assert!(tillaten(&st, std::env::temp_dir().to_str().unwrap()).is_err());
        let _ = std::fs::remove_dir_all(d);
    }

    #[test]
    fn paths_outside_the_roots_are_refused() {
        let st = Tillstand::default();
        assert!(tillaten(&st, "C:\\Windows\\win.ini").is_err());
    }
}
