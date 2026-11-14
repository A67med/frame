//! CLI launch argument handling, pending local media file handoff, and `stremio://` deep links.

static PENDING_OPEN_FILE: std::sync::OnceLock<std::sync::Mutex<Option<String>>> =
    std::sync::OnceLock::new();

#[cfg(desktop)]
const MEDIA_EXTS: &[&str] = &[
    "mkv", "mp4", "avi", "mov", "webm", "m4v", "ts", "m2ts", "mpg", "mpeg", "wmv", "flv", "ogv",
    "3gp",
];

#[cfg(desktop)]
pub(crate) fn media_file_from_args(args: &[String]) -> Option<String> {
    for a in args {
        let lower = a.to_lowercase();
        if MEDIA_EXTS.iter().any(|e| lower.ends_with(&format!(".{e}")))
            && std::path::Path::new(a).is_file()
        {
            return Some(a.clone());
        }
    }
    None
}

fn pending_open_file() -> &'static std::sync::Mutex<Option<String>> {
    PENDING_OPEN_FILE.get_or_init(|| std::sync::Mutex::new(None))
}

#[cfg(desktop)]
pub(crate) fn capture_startup_media_arg() {
    let args: Vec<String> = std::env::args().skip(1).collect();
    if let Some(path) = media_file_from_args(&args) {
        if let Ok(mut guard) = pending_open_file().lock() {
            *guard = Some(path);
        }
    }
}

#[tauri::command]
pub fn harbor_take_pending_file() -> Option<String> {
    pending_open_file().lock().ok().and_then(|mut g| g.take())
}

#[cfg(desktop)]
pub(crate) fn release_stremio_scheme(app: &tauri::AppHandle) {
    use std::io::Write;
    use tauri_plugin_deep_link::DeepLinkExt;
    let msg = match app.deep_link().unregister("stremio") {
        Ok(()) => "[harbor::deeplink] released stremio:// on shutdown".to_string(),
        Err(e) => format!("[harbor::deeplink] could not release stremio://: {}", e),
    };
    let _ = writeln!(std::io::stderr(), "{}", msg);
}

#[cfg(desktop)]
#[tauri::command]
pub async fn deeplink_set_stremio(app: tauri::AppHandle, enabled: bool) -> Result<(), String> {
    use tauri_plugin_deep_link::DeepLinkExt;
    if enabled {
        app.deep_link()
            .register("stremio")
            .map_err(|e| format!("register stremio: {}", e))?;
    } else {
        let _ = app.deep_link().unregister("stremio");
    }
    Ok(())
}

#[cfg(desktop)]
#[tauri::command]
pub async fn deeplink_is_stremio_registered(app: tauri::AppHandle) -> Result<bool, String> {
    use tauri_plugin_deep_link::DeepLinkExt;
    app.deep_link()
        .is_registered("stremio")
        .map_err(|e| e.to_string())
}
