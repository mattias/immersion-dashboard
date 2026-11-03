// Garmin Connect has no API for individuals, and its sign-in is guarded against scripts. So the user
// signs in on Garmin's own page in a window of the app, and the sleep data is fetched by that page
// with Garmin's own web session. The app never sees the password. The Garmin page may call one
// command only: garmin_svar, which hands back the data (see capabilities/garmin.json).
use std::sync::atomic::{AtomicBool, AtomicUsize, Ordering};
use std::sync::Mutex;
use std::time::Duration;
use tauri::webview::PageLoadEvent;
use tauri::{AppHandle, Manager, State, WebviewUrl, WebviewWindowBuilder};
use tokio::sync::oneshot;

const START: &str = "https://connect.garmin.com/modern/";
pub const ETIKETT: &str = "garmin";

#[derive(Default)]
pub struct Garmin {
    inloggad: AtomicBool,
    laddningar: AtomicUsize,
    svar: Mutex<Option<oneshot::Sender<String>>>,
}

fn ar_garmin(u: &url::Url) -> bool {
    u.host_str() == Some("connect.garmin.com")
}

fn ar_inloggning(u: &url::Url) -> bool {
    u.host_str().map(|h| h.starts_with("sso.")).unwrap_or(false) || u.path().contains("signin")
}

fn fonster(app: &AppHandle) -> Result<tauri::WebviewWindow, String> {
    if let Some(w) = app.get_webview_window(ETIKETT) {
        return Ok(w);
    }
    let h = app.clone();
    WebviewWindowBuilder::new(app, ETIKETT, WebviewUrl::External(START.parse().unwrap()))
        .title("Sign in to Garmin Connect")
        .inner_size(520.0, 760.0)
        .visible(false)
        .on_page_load(move |w, p| {
            if p.event() != PageLoadEvent::Finished {
                return;
            }
            let st = h.state::<Garmin>();
            let u = p.url();
            let inne = ar_garmin(u) && !ar_inloggning(u);
            st.inloggad.store(inne, Ordering::SeqCst);
            if inne {
                let _ = w.hide();
            }
            st.laddningar.fetch_add(1, Ordering::SeqCst);
        })
        .build()
        .map_err(|e| e.to_string())
}

// skript: JavaScript that runs on connect.garmin.com and ends by calling garmin_svar.
// visa: the user clicked, so the sign-in window may be shown.
#[tauri::command]
pub async fn garmin_hamta(app: AppHandle, st: State<'_, Garmin>, skript: String, visa: bool) -> Result<String, String> {
    let w = fonster(&app)?;
    // A session that expired since the page loaded shows up as an answer with "inloggning"; then sign in once more.
    for forsok in 0..2 {
        if forsok == 1 {
            st.inloggad.store(false, Ordering::SeqCst);
        }
        logga_in(&w, &st, visa).await?;
        let (tx, rx) = oneshot::channel();
        *st.svar.lock().unwrap() = Some(tx);
        w.eval(&skript).map_err(|e| e.to_string())?;
        let s = match tokio::time::timeout(Duration::from_secs(900), rx).await {
            Ok(Ok(s)) => s,
            _ => return Err("Garmin did not answer.".into()),
        };
        if !s.contains("\"inloggning\":true") {
            return Ok(s);
        }
    }
    Err("Garmin asked for sign-in again.".into())
}

async fn logga_in(w: &tauri::WebviewWindow, st: &Garmin, visa: bool) -> Result<(), String> {
    if st.inloggad.load(Ordering::SeqCst) {
        return Ok(());
    }
    let fore = st.laddningar.load(Ordering::SeqCst);
    let _ = w.navigate(START.parse().unwrap());
    let slut = tokio::time::Instant::now() + Duration::from_secs(if visa { 600 } else { 45 });
    let mut visad = false;
    while tokio::time::Instant::now() < slut {
        tokio::time::sleep(Duration::from_millis(300)).await;
        if st.inloggad.load(Ordering::SeqCst) {
            return Ok(());
        }
        // A page has loaded and it is not Garmin Connect itself: the sign-in page.
        if st.laddningar.load(Ordering::SeqCst) > fore {
            if !visa {
                return Err("Sign in to Garmin: press sync.".into());
            }
            if !visad {
                let _ = w.show();
                let _ = w.set_focus();
                visad = true;
            }
        }
    }
    let _ = w.hide();
    Err("Garmin sign-in timed out.".into())
}

#[tauri::command]
pub fn garmin_svar(st: State<Garmin>, data: String) {
    if let Some(tx) = st.svar.lock().unwrap().take() {
        let _ = tx.send(data);
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn recognises_garmin_pages() {
        assert!(ar_garmin(&"https://connect.garmin.com/modern/".parse().unwrap()));
        assert!(!ar_garmin(&"https://connect.garmin.com.evil.example/".parse().unwrap()));
        assert!(ar_inloggning(&"https://sso.garmin.com/portal/sso/en-US/sign-in".parse().unwrap()));
    }
}
