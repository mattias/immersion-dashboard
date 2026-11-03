// The app's commands get their own permissions, so the Garmin window can be given only garmin_svar.
fn main() {
    let kommandon = &["standard", "lista", "typ", "las", "valj", "anki_connect", "google_inloggad", "google_logga_ut", "drive_hamta", "drive_spara", "garmin_hamta", "garmin_svar"];
    tauri_build::try_build(tauri_build::Attributes::new().app_manifest(tauri_build::AppManifest::new().commands(kommandon)))
        .expect("failed to run tauri-build");
}
