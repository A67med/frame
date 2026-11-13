use tauri::Manager;

fn settings_path(app: &tauri::AppHandle) -> Result<std::path::PathBuf, String> {
    let dir = app.path().app_data_dir().map_err(|e| e.to_string())?;
    std::fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
    Ok(dir.join("settings.json"))
}

#[tauri::command]
pub fn settings_read(app: tauri::AppHandle) -> Result<Option<String>, String> {
    let path = settings_path(&app)?;
    match std::fs::read_to_string(&path) {
        Ok(s) => Ok(Some(s)),
        Err(e) if e.kind() == std::io::ErrorKind::NotFound => Ok(None),
        Err(e) => Err(e.to_string()),
    }
}

#[tauri::command]
pub fn settings_write(app: tauri::AppHandle, content: String) -> Result<(), String> {
    let path = settings_path(&app)?;
    let tmp = path.with_extension("json.tmp");
    std::fs::write(&tmp, content.as_bytes()).map_err(|e| e.to_string())?;
    std::fs::rename(&tmp, &path).map_err(|e| e.to_string())
}

fn secrets_path(app: &tauri::AppHandle) -> Result<std::path::PathBuf, String> {
    let dir = app.path().app_data_dir().map_err(|e| e.to_string())?;
    std::fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
    Ok(dir.join("secrets.json"))
}

#[tauri::command]
pub fn secrets_read(app: tauri::AppHandle) -> Result<Option<String>, String> {
    let path = secrets_path(&app)?;
    match std::fs::read_to_string(&path) {
        Ok(s) => Ok(Some(s)),
        Err(e) if e.kind() == std::io::ErrorKind::NotFound => Ok(None),
        Err(e) => Err(e.to_string()),
    }
}

#[tauri::command]
pub fn secrets_write(app: tauri::AppHandle, content: String) -> Result<(), String> {
    let path = secrets_path(&app)?;
    let tmp = path.with_extension("json.tmp");
    std::fs::write(&tmp, content.as_bytes()).map_err(|e| e.to_string())?;
    std::fs::rename(&tmp, &path).map_err(|e| e.to_string())
}

/// Largest backup the restore flow writes as a safety copy; matches the cap on
/// recovery backups in `installer_handoff`.
const SAFETY_COPY_MAX_BYTES: usize = 100 * 1024 * 1024;
const SAFETY_COPIES_KEPT: usize = 5;

/// Saves the current setup before a restore replaces it, into
/// `<app data>/backups/pre-restore-<unix ms>.framex`, and keeps only the newest
/// few. Returns the path so the UI can tell the user where it is.
#[tauri::command]
pub async fn backup_save_safety_copy(
    app: tauri::AppHandle,
    content: String,
) -> Result<String, String> {
    let dir = app
        .path()
        .app_data_dir()
        .map_err(|e| e.to_string())?
        .join("backups");
    tauri::async_runtime::spawn_blocking(move || write_safety_copy(&dir, &content))
        .await
        .map_err(|e| e.to_string())?
}

fn write_safety_copy(dir: &std::path::Path, content: &str) -> Result<String, String> {
    use std::io::Write;
    if content.len() > SAFETY_COPY_MAX_BYTES {
        return Err("the current setup is too large for a safety copy".into());
    }
    let parsed: serde_json::Value =
        serde_json::from_str(content).map_err(|_| "invalid backup content".to_string())?;
    if parsed.get("format").and_then(|v| v.as_str()) != Some("harbor-backup") {
        return Err("invalid backup format".into());
    }
    std::fs::create_dir_all(dir).map_err(|e| e.to_string())?;
    let stamp = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|d| d.as_millis())
        .unwrap_or(0);
    let path = dir.join(format!("pre-restore-{stamp}.framex"));
    let tmp = dir.join(format!("pre-restore-{stamp}.framex.tmp"));
    {
        let mut file = std::fs::File::create(&tmp).map_err(|e| e.to_string())?;
        file.write_all(content.as_bytes())
            .map_err(|e| e.to_string())?;
        file.sync_all().map_err(|e| e.to_string())?;
    }
    std::fs::rename(&tmp, &path).map_err(|e| e.to_string())?;
    prune_safety_copies(dir, SAFETY_COPIES_KEPT);
    Ok(path.to_string_lossy().into_owned())
}

/// Removes all but the newest `keep` safety copies. Only touches files this
/// module names, so anything else the user put in the folder stays.
fn prune_safety_copies(dir: &std::path::Path, keep: usize) {
    let Ok(entries) = std::fs::read_dir(dir) else {
        return;
    };
    let mut copies: Vec<(u128, std::path::PathBuf)> = entries
        .filter_map(Result::ok)
        .filter_map(|entry| {
            let name = entry.file_name().to_string_lossy().into_owned();
            let stamp = name
                .strip_prefix("pre-restore-")?
                .strip_suffix(".framex")?
                .parse::<u128>()
                .ok()?;
            Some((stamp, entry.path()))
        })
        .collect();
    copies.sort_by(|a, b| b.0.cmp(&a.0));
    for (_, path) in copies.into_iter().skip(keep) {
        let _ = std::fs::remove_file(path);
    }
}

pub(crate) fn secret_value(app: &tauri::AppHandle, key: &str) -> Result<Option<String>, String> {
    let Some(content) = secrets_read(app.clone())? else {
        return Ok(None);
    };
    let value =
        serde_json::from_str::<serde_json::Value>(&content).map_err(|error| error.to_string())?;
    Ok(value
        .as_object()
        .and_then(|items| items.get(key))
        .and_then(serde_json::Value::as_str)
        .map(str::to_string))
}

pub fn read_torrents_disabled(app: &tauri::AppHandle) -> bool {
    let Ok(path) = settings_path(app) else {
        return false;
    };
    let Ok(s) = std::fs::read_to_string(&path) else {
        return false;
    };
    parse_torrents_disabled(&s)
}

pub fn read_defer_torrent_engine(app: &tauri::AppHandle) -> bool {
    let Ok(path) = settings_path(app) else {
        return false;
    };
    let Ok(s) = std::fs::read_to_string(&path) else {
        return false;
    };
    parse_bool_flag(&s, "deferTorrentEngine")
}

fn parse_torrents_disabled(json: &str) -> bool {
    parse_bool_flag(json, "torrentsDisabled")
}

fn parse_bool_flag(json: &str, key: &str) -> bool {
    let needle = format!("\"{}\"", key);
    let Some(idx) = json.find(&needle) else {
        return false;
    };
    let rest = &json[idx + needle.len()..];
    let mut chars = rest.chars().peekable();
    while let Some(c) = chars.peek() {
        if c.is_whitespace() || *c == ':' {
            chars.next();
        } else {
            break;
        }
    }
    matches!(chars.next(), Some('t') | Some('T'))
}

#[cfg(test)]
mod safety_copy_tests {
    use super::*;

    fn temp_dir() -> std::path::PathBuf {
        std::env::temp_dir().join(format!("frame-safety-copy-{}", uuid::Uuid::new_v4()))
    }

    #[test]
    fn writes_a_copy_and_rejects_foreign_content() {
        let dir = temp_dir();
        let path = write_safety_copy(&dir, r#"{"format":"harbor-backup","data":{}}"#).unwrap();
        assert!(std::path::Path::new(&path).exists());
        assert!(write_safety_copy(&dir, "{not json").is_err());
        assert!(write_safety_copy(&dir, r#"{"format":"other"}"#).is_err());
        let _ = std::fs::remove_dir_all(&dir);
    }

    #[test]
    fn prunes_only_its_own_old_copies() {
        let dir = temp_dir();
        std::fs::create_dir_all(&dir).unwrap();
        for stamp in 1..=7u32 {
            std::fs::write(dir.join(format!("pre-restore-{stamp}.framex")), b"{}").unwrap();
        }
        std::fs::write(dir.join("my-own-backup.framex"), b"{}").unwrap();
        prune_safety_copies(&dir, 5);
        assert!(!dir.join("pre-restore-1.framex").exists());
        assert!(!dir.join("pre-restore-2.framex").exists());
        assert!(dir.join("pre-restore-3.framex").exists());
        assert!(dir.join("pre-restore-7.framex").exists());
        assert!(dir.join("my-own-backup.framex").exists());
        let _ = std::fs::remove_dir_all(&dir);
    }
}
