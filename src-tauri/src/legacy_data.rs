//! Frame shipped its first release under Harbor's bundle identifier. The identifier names
//! the folders that hold settings and WebView storage, so changing it would look like a
//! fresh install. On first launch this copies those folders across, before anything opens
//! them. The original folders are only ever read, so no outcome here can lose them.
//!
//! The copy is all or nothing. It builds in a staging folder and only takes the final name
//! once every file is there at its original size. Harbor may still be running from the same
//! folder, and its locked files fail the copy, so that case is retried on the next launch.

use std::fs;
use std::path::{Path, PathBuf};
use std::sync::atomic::{AtomicBool, Ordering};

pub const IDENTIFIER: &str = "io.github.abdallahkattriah-sketch.frame";
const LEGACY_IDENTIFIER: &str = "app.harbor";

/// Attempts before Frame stops retrying and keeps the data the user has made since.
const MAX_ATTEMPTS: u32 = 3;

/// WebView caches rebuild themselves. Only these folders inside the WebView's own data are
/// left behind, so a user folder that happens to share a name is still copied.
const WEBVIEW_DIR: &str = "EBWebView";
const WEBVIEW_CACHES: [&str; 6] = [
    "Cache",
    "Code Cache",
    "GPUCache",
    "DawnGraphiteCache",
    "DawnWebGPUCache",
    "GrShaderCache",
];

static FAILED: AtomicBool = AtomicBool::new(false);

#[derive(Debug, PartialEq, Eq)]
enum Outcome {
    NotNeeded,
    Migrated,
    Failed,
}

fn data_roots() -> Vec<PathBuf> {
    let env_dir = |name: &str| std::env::var_os(name).map(PathBuf::from);
    #[cfg(target_os = "windows")]
    {
        [env_dir("APPDATA"), env_dir("LOCALAPPDATA")]
            .into_iter()
            .flatten()
            .collect()
    }
    #[cfg(target_os = "macos")]
    {
        env_dir("HOME")
            .map(|home| {
                vec![
                    home.join("Library/Application Support"),
                    home.join("Library/WebKit"),
                ]
            })
            .unwrap_or_default()
    }
    #[cfg(not(any(target_os = "windows", target_os = "macos")))]
    {
        let home = env_dir("HOME");
        [
            env_dir("XDG_DATA_HOME").or_else(|| home.as_ref().map(|h| h.join(".local/share"))),
            env_dir("XDG_CONFIG_HOME").or_else(|| home.as_ref().map(|h| h.join(".config"))),
        ]
        .into_iter()
        .flatten()
        .collect()
    }
}

fn copy_tree(from: &Path, to: &Path, in_webview: bool) -> std::io::Result<()> {
    fs::create_dir_all(to)?;
    for entry in fs::read_dir(from)? {
        let entry = entry?;
        let kind = entry.file_type()?;
        let name = entry.file_name();
        let target = to.join(&name);
        if kind.is_dir() {
            if in_webview && WEBVIEW_CACHES.iter().any(|d| name == *d) {
                continue;
            }
            copy_tree(&entry.path(), &target, in_webview || name == WEBVIEW_DIR)?;
        } else if kind.is_file() {
            let copied = fs::copy(entry.path(), &target)?;
            let expected = entry.metadata()?.len();
            if copied != expected {
                return Err(std::io::Error::other(format!(
                    "{:?} changed while copying",
                    entry.path()
                )));
            }
        } else {
            // Reparse points would point the new folder back into the old one.
            eprintln!("[legacy-data] not copying link {:?}", entry.path());
        }
    }
    Ok(())
}

fn attempts_so_far(marker: &Path) -> u32 {
    fs::read_to_string(marker)
        .ok()
        .and_then(|text| text.trim().parse().ok())
        .unwrap_or(0)
}

fn migrate_dir(root: &Path, legacy: &str, current: &str) -> Outcome {
    let from = root.join(legacy);
    if !from.is_dir() {
        return Outcome::NotNeeded;
    }
    let to = root.join(current);
    let marker = root.join(format!("{current}.migration-failed"));
    let attempts = attempts_so_far(&marker);
    if to.exists() {
        // A destination with no failure on record is Frame's own data and always wins.
        if !marker.exists() {
            return Outcome::NotNeeded;
        }
        if attempts >= MAX_ATTEMPTS {
            return Outcome::Failed;
        }
    }
    let staging = root.join(format!("{current}.migrating"));
    let _ = fs::remove_dir_all(&staging);
    let copied = copy_tree(&from, &staging, false);
    let done = copied.and_then(|()| {
        // A session that started fresh after a failed attempt is set aside, never deleted.
        if to.exists() {
            fs::rename(&to, root.join(format!("{current}.before-retry-{attempts}")))?;
        }
        fs::rename(&staging, &to)
    });
    match done {
        Ok(()) => {
            let _ = fs::remove_file(&marker);
            Outcome::Migrated
        }
        Err(error) => {
            eprintln!("[legacy-data] could not migrate {from:?}: {error}");
            let _ = fs::remove_dir_all(&staging);
            let _ = fs::write(&marker, (attempts + 1).to_string());
            Outcome::Failed
        }
    }
}

pub fn migrate() {
    for root in data_roots() {
        if migrate_dir(&root, LEGACY_IDENTIFIER, IDENTIFIER) == Outcome::Failed {
            FAILED.store(true, Ordering::Relaxed);
        }
    }
}

/// Whether the user should be told their data did not come across on this launch.
pub fn failed() -> bool {
    FAILED.load(Ordering::Relaxed)
}

#[cfg(test)]
mod tests {
    use super::*;

    fn temp_root(name: &str) -> PathBuf {
        let root = std::env::temp_dir().join(format!(
            "frame-legacy-data-{name}-{}",
            std::process::id()
        ));
        let _ = fs::remove_dir_all(&root);
        fs::create_dir_all(&root).unwrap();
        root
    }

    fn seed(root: &Path) {
        fs::create_dir_all(root.join("old/EBWebView/Default/Cache")).unwrap();
        fs::create_dir_all(root.join("old/engine/Cache")).unwrap();
        fs::write(root.join("old/settings.json"), "{}").unwrap();
        fs::write(root.join("old/EBWebView/Default/ls"), "x").unwrap();
        fs::write(root.join("old/EBWebView/Default/Cache/big"), "x").unwrap();
        fs::write(root.join("old/engine/Cache/keep"), "x").unwrap();
    }

    #[test]
    fn copies_data_and_keeps_the_original() {
        let root = temp_root("copy");
        seed(&root);
        assert_eq!(migrate_dir(&root, "old", "new"), Outcome::Migrated);
        assert_eq!(fs::read_to_string(root.join("new/settings.json")).unwrap(), "{}");
        assert!(root.join("new/EBWebView/Default/ls").exists());
        assert!(root.join("old/settings.json").exists());
        assert!(root.join("old/EBWebView/Default/Cache/big").exists());
        assert!(!root.join("new.migrating").exists());
        assert!(!root.join("new.migration-failed").exists());
        fs::remove_dir_all(&root).unwrap();
    }

    #[test]
    fn leaves_only_webview_caches_behind() {
        let root = temp_root("caches");
        seed(&root);
        migrate_dir(&root, "old", "new");
        assert!(!root.join("new/EBWebView/Default/Cache").exists());
        assert!(root.join("new/engine/Cache/keep").exists());
        fs::remove_dir_all(&root).unwrap();
    }

    #[test]
    fn never_touches_an_existing_destination() {
        let root = temp_root("existing");
        fs::create_dir_all(root.join("old")).unwrap();
        fs::create_dir_all(root.join("new")).unwrap();
        fs::write(root.join("old/settings.json"), "old").unwrap();
        fs::write(root.join("new/settings.json"), "new").unwrap();
        assert_eq!(migrate_dir(&root, "old", "new"), Outcome::NotNeeded);
        assert_eq!(fs::read_to_string(root.join("new/settings.json")).unwrap(), "new");
        fs::remove_dir_all(&root).unwrap();
    }

    #[test]
    fn does_nothing_without_legacy_data() {
        let root = temp_root("none");
        assert_eq!(migrate_dir(&root, "old", "new"), Outcome::NotNeeded);
        assert!(!root.join("new").exists());
        fs::remove_dir_all(&root).unwrap();
    }

    #[test]
    fn retries_after_a_failure_and_sets_the_fresh_session_aside() {
        let root = temp_root("retry");
        seed(&root);
        fs::create_dir_all(root.join("new")).unwrap();
        fs::write(root.join("new/settings.json"), "fresh").unwrap();
        fs::write(root.join("new.migration-failed"), "1").unwrap();
        assert_eq!(migrate_dir(&root, "old", "new"), Outcome::Migrated);
        assert_eq!(fs::read_to_string(root.join("new/settings.json")).unwrap(), "{}");
        assert_eq!(
            fs::read_to_string(root.join("new.before-retry-1/settings.json")).unwrap(),
            "fresh"
        );
        assert!(!root.join("new.migration-failed").exists());
        fs::remove_dir_all(&root).unwrap();
    }

    #[test]
    fn stops_retrying_and_keeps_newer_data_after_the_limit() {
        let root = temp_root("limit");
        seed(&root);
        fs::create_dir_all(root.join("new")).unwrap();
        fs::write(root.join("new/settings.json"), "newer").unwrap();
        fs::write(root.join("new.migration-failed"), MAX_ATTEMPTS.to_string()).unwrap();
        assert_eq!(migrate_dir(&root, "old", "new"), Outcome::Failed);
        assert_eq!(fs::read_to_string(root.join("new/settings.json")).unwrap(), "newer");
        assert!(root.join("old/settings.json").exists());
        fs::remove_dir_all(&root).unwrap();
    }

    // Windows refuses to read a file another process holds without sharing, which is how an
    // open Harbor's WebView locks look to the copy.
    #[cfg(windows)]
    #[test]
    fn a_locked_file_fails_cleanly_and_records_the_attempt() {
        use std::os::windows::fs::OpenOptionsExt;
        let root = temp_root("locked");
        seed(&root);
        let locked = root.join("old/EBWebView/lockfile");
        fs::write(&locked, "x").unwrap();
        let held = fs::OpenOptions::new()
            .read(true)
            .share_mode(0)
            .open(&locked)
            .unwrap();
        assert_eq!(migrate_dir(&root, "old", "new"), Outcome::Failed);
        assert!(!root.join("new").exists());
        assert!(!root.join("new.migrating").exists());
        assert_eq!(fs::read_to_string(root.join("new.migration-failed")).unwrap(), "1");
        assert!(root.join("old/settings.json").exists());
        drop(held);
        // The app then starts fresh. With Harbor closed, the next launch brings the data over.
        fs::create_dir_all(root.join("new")).unwrap();
        assert_eq!(migrate_dir(&root, "old", "new"), Outcome::Migrated);
        assert_eq!(fs::read_to_string(root.join("new/settings.json")).unwrap(), "{}");
        fs::remove_dir_all(&root).unwrap();
    }
}
