//! Text files the webview asks the app to write.
//!
//! The webview never names an arbitrary destination: `save_text_file` only
//! writes inside Frame's own subtitle folders, and `save_text_file_as` lets
//! the user pick the destination in a native save dialog opened here, so
//! script running in the page cannot overwrite files elsewhere on disk.

use std::path::{Component, Path, PathBuf};
use tauri::Manager;

/// Folder name the subtitle writers use under the temp and app data folders.
const SUBTITLE_DIR: &str = "harbor-subs";

fn subtitle_roots(app: &tauri::AppHandle) -> Vec<PathBuf> {
    let mut roots = vec![std::env::temp_dir().join(SUBTITLE_DIR)];
    if let Ok(data) = app.path().app_data_dir() {
        roots.push(data.join(SUBTITLE_DIR));
    }
    roots
}

/// True when `target` is an absolute path strictly inside one of `roots`,
/// with no `..` or `.` segments that could step outside after joining.
pub(crate) fn is_inside_roots(target: &Path, roots: &[PathBuf]) -> bool {
    if !target.is_absolute() {
        return false;
    }
    if target
        .components()
        .any(|c| matches!(c, Component::ParentDir | Component::CurDir))
    {
        return false;
    }
    roots
        .iter()
        .any(|root| target.starts_with(root) && target != root.as_path())
}

fn write_text(target: &Path, contents: &str) -> Result<(), String> {
    if let Some(parent) = target.parent() {
        if !parent.as_os_str().is_empty() {
            std::fs::create_dir_all(parent).map_err(|e| format!("create folder: {}", e))?;
        }
    }
    std::fs::write(target, contents.as_bytes()).map_err(|e| format!("write file: {}", e))
}

/// Writes a generated subtitle into Frame's temp or app data subtitle folder.
#[tauri::command]
pub async fn save_text_file(
    app: tauri::AppHandle,
    path: String,
    contents: String,
) -> Result<(), String> {
    let target = PathBuf::from(&path);
    if !is_inside_roots(&target, &subtitle_roots(&app)) {
        return Err("save_text_file only writes inside Frame's subtitle folders".into());
    }
    write_text(&target, &contents)
}

/// Asks the user where to save, then writes the text there. Resolves to the
/// chosen path, or `None` when the user cancelled the dialog.
#[tauri::command]
pub async fn save_text_file_as(
    app: tauri::AppHandle,
    default_name: String,
    filter_name: String,
    extensions: Vec<String>,
    contents: String,
) -> Result<Option<String>, String> {
    use tauri_plugin_dialog::DialogExt;
    let exts: Vec<&str> = extensions.iter().map(String::as_str).collect();
    let mut dialog = app.dialog().file().set_file_name(default_name);
    if !exts.is_empty() {
        dialog = dialog.add_filter(filter_name, &exts);
    }
    let picked = tauri::async_runtime::spawn_blocking(move || dialog.blocking_save_file())
        .await
        .map_err(|e| e.to_string())?;
    let Some(picked) = picked else {
        return Ok(None);
    };
    let target = picked.into_path().map_err(|e| e.to_string())?;
    let shown = target.to_string_lossy().into_owned();
    tauri::async_runtime::spawn_blocking(move || write_text(&target, &contents))
        .await
        .map_err(|e| e.to_string())??;
    Ok(Some(shown))
}

#[cfg(test)]
mod tests {
    use super::*;

    fn roots() -> Vec<PathBuf> {
        vec![std::env::temp_dir().join(SUBTITLE_DIR)]
    }

    #[test]
    fn accepts_files_inside_the_subtitle_folder() {
        let root = &roots()[0];
        assert!(is_inside_roots(&root.join("autosync-1.srt"), &roots()));
        assert!(is_inside_roots(&root.join("saved").join("x.vtt"), &roots()));
    }

    #[test]
    fn refuses_everything_else() {
        let root = &roots()[0];
        assert!(!is_inside_roots(root, &roots()));
        assert!(!is_inside_roots(&root.join("..").join("evil.txt"), &roots()));
        assert!(!is_inside_roots(&root.join(".").join("x.srt"), &roots()));
        assert!(!is_inside_roots(Path::new("relative/x.srt"), &roots()));
        assert!(!is_inside_roots(&std::env::temp_dir().join("other.srt"), &roots()));
        let sibling = std::env::temp_dir().join(format!("{SUBTITLE_DIR}-evil")).join("x.srt");
        assert!(!is_inside_roots(&sibling, &roots()));
    }
}
