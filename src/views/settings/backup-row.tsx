import { AlertTriangle, Check, Download, Info, Upload } from "./icons";
import { useEffect, useRef, useState, type ChangeEvent } from "react";
import {
  applyBackup,
  BACKUP_SECTIONS,
  BackupRestoreError,
  backupSectionDescription,
  backupSectionLabel,
  backupSections,
  downloadBackup,
  parseBackup,
  previewRestore,
  selectionHasCredentials,
  type Backup,
  type BackupSectionKey,
  type BackupValidationError,
} from "@/lib/backup";
import {
  BACKUP_PASSWORD_MIN_LENGTH,
  BackupCryptoError,
  backupPasswordProblem,
  decryptBackupText,
  isEncryptedBackup,
} from "@/lib/backup-crypto";
import { useT } from "@/lib/i18n";
import { ROW_DESC, SettingRow, SettingsModal } from "./kit";
import { SButton } from "./ui";

type BackupRowError =
  | BackupValidationError
  | "Could not build the backup file."
  | "Could not read that file.";

type RestoreErrorMessage =
  | "Restore did not finish. Some settings may already have changed. Free some storage, then try again."
  | "Restore did not finish. Your previous setup was put back. Free some storage, then try again."
  | "Frame could not save a safety copy of your current setup, so nothing was restored. Free some storage, then try again.";

const TEXT_FIELD =
  "h-11 w-full min-w-0 rounded-[10px] border border-edge-soft bg-elevated px-4 text-[16.5px] text-ink outline-none placeholder:text-ink-subtle/55 focus-visible:border-edge focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent";

// Only the desktop app writes a pre-restore safety copy (see applyBackup).
const KEEPS_SAFETY_COPY = typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;

function restoreErrorMessage(error: unknown): RestoreErrorMessage {
  if (error instanceof BackupRestoreError) {
    if (error.reason === "safety-copy") {
      return "Frame could not save a safety copy of your current setup, so nothing was restored. Free some storage, then try again.";
    }
    if (error.rolledBack) {
      return "Restore did not finish. Your previous setup was put back. Free some storage, then try again.";
    }
  }
  return "Restore did not finish. Some settings may already have changed. Free some storage, then try again.";
}

export function BackupRow() {
  const t = useT();
  const fileRef = useRef<HTMLInputElement>(null);
  const [exported, setExported] = useState(false);
  const [error, setError] = useState<BackupRowError | null>(null);
  const [pending, setPending] = useState<Backup | null>(null);
  const [locked, setLocked] = useState<string | null>(null);
  const [applying, setApplying] = useState(false);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [restoreError, setRestoreError] = useState<RestoreErrorMessage | null>(null);

  useEffect(() => {
    if (!exported) return;
    const timer = window.setTimeout(() => setExported(false), 1600);
    return () => window.clearTimeout(timer);
  }, [exported]);

  const doExport = async (selected: BackupSectionKey[], password: string) => {
    setError(null);
    setPickerOpen(false);
    try {
      const saved = await downloadBackup(selected, password ? { password } : {});
      if (saved) {
        setExported(true);
      }
    } catch {
      setError("Could not build the backup file.");
    }
  };

  const openParsed = (text: string) => {
    const res = parseBackup(text);
    if (!res.ok) {
      setError(res.error);
      return;
    }
    setPending(res.backup);
    setRestoreError(null);
  };

  const onFile = (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    setError(null);
    const reader = new FileReader();
    reader.onload = () => {
      const text = typeof reader.result === "string" ? reader.result : "";
      if (isEncryptedBackup(text)) {
        setLocked(text);
        return;
      }
      openParsed(text);
    };
    reader.onerror = () => setError("Could not read that file.");
    reader.readAsText(file);
  };

  const confirmRestore = (includeCustomCode: boolean) => {
    if (!pending) return;
    setApplying(true);
    setRestoreError(null);
    void applyBackup(pending, { includeCustomCode })
      .then(() => {
        window.setTimeout(() => window.location.reload(), 280);
      })
      .catch((err: unknown) => {
        setApplying(false);
        setRestoreError(restoreErrorMessage(err));
      });
  };

  return (
    <>
      <SettingRow
        icon={<Download size={20} strokeWidth={2.1} className="text-ink-muted" />}
        label={t("Export your setup")}
        desc={t(
          "Choose which parts of your setup to save in one backup file. Your Stremio sign-in is excluded.",
        )}
      >
        <SButton variant="primary" onClick={() => setPickerOpen(true)}>
          {exported ? (
            <Check size={16} strokeWidth={2.6} />
          ) : (
            <Download size={16} strokeWidth={2.4} />
          )}
          {exported ? t("Saved") : t("Export")}
        </SButton>
      </SettingRow>

      <SettingRow
        icon={<Upload size={20} strokeWidth={2.1} className="text-ink-muted" />}
        label={t("Restore from a backup")}
        desc={t(
          "Choose a Frame backup and review what it contains before restoring. Your Stremio sign-in stays on this device.",
        )}
      >
        <SButton onClick={() => fileRef.current?.click()}>
          <Upload size={16} strokeWidth={2.4} />
          {t("Restore")}
        </SButton>
      </SettingRow>

      {error && (
        <p role="alert" className="max-w-[70ch] text-[15.5px] leading-[22px] text-danger">
          {t(error)}
        </p>
      )}

      <input
        ref={fileRef}
        type="file"
        accept=".framex,.harbx,application/json,.json"
        onChange={onFile}
        className="hidden"
      />

      {pickerOpen && <ExportPicker onExport={doExport} onCancel={() => setPickerOpen(false)} />}

      {locked != null && (
        <UnlockBackup
          text={locked}
          onUnlocked={(plain) => {
            setLocked(null);
            openParsed(plain);
          }}
          onCancel={() => setLocked(null)}
        />
      )}

      {pending && (
        <RestoreConfirm
          backup={pending}
          applying={applying}
          error={restoreError}
          onConfirm={confirmRestore}
          onCancel={() => setPending(null)}
        />
      )}
    </>
  );
}

function ExportPicker({
  onExport,
  onCancel,
}: {
  onExport: (selected: BackupSectionKey[], password: string) => void;
  onCancel: () => void;
}) {
  const t = useT();
  const [selected, setSelected] = useState<Set<BackupSectionKey>>(
    () => new Set(BACKUP_SECTIONS.map((s) => s.key)),
  );
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [plainConsent, setPlainConsent] = useState(false);
  // The password and consent controls sit under the section list, often out of
  // view; an export they block scrolls to them instead of a silent disabled button.
  const protectRef = useRef<HTMLDivElement>(null);

  const allSelected = selected.size === BACKUP_SECTIONS.length;
  const toggle = (key: BackupSectionKey) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(key)) {
        next.delete(key);
      } else {
        next.add(key);
      }
      return next;
    });
  };
  const toggleAll = () => {
    setSelected(allSelected ? new Set() : new Set(BACKUP_SECTIONS.map((s) => s.key)));
  };

  const encrypting = password.length > 0;
  const passwordShort = encrypting && backupPasswordProblem(password) === "too-short";
  const mismatch = encrypting && confirm !== password;
  const needsConsent = !encrypting && selectionHasCredentials([...selected]);
  const canExport =
    selected.size > 0 && !passwordShort && !mismatch && (!needsConsent || plainConsent);
  const tryExport = () => {
    if (canExport) {
      onExport([...selected], password);
      return;
    }
    const block = protectRef.current;
    if (!block) return;
    block.scrollIntoView({ block: "nearest", behavior: "smooth" });
    block
      .querySelector<HTMLInputElement>(
        passwordShort || mismatch ? "input[type=password]" : "input[type=checkbox]",
      )
      ?.focus({ preventScroll: true });
  };

  return (
    <SettingsModal
      open
      onClose={onCancel}
      title={t("What should the backup include?")}
      width={800}
      sub={t("Choose the sections to save in one file. Your Stremio sign-in is excluded.")}
      actions={
        <>
          <SButton onClick={onCancel}>{t("Cancel")}</SButton>
          <SButton variant="primary" disabled={selected.size === 0} onClick={tryExport}>
            <Download size={16} strokeWidth={2.4} />
            {t("Export {n} sections", { n: selected.size })}
          </SButton>
        </>
      }
    >
      <div className="flex flex-wrap items-center justify-between gap-3">
        <button
          type="button"
          onClick={toggleAll}
          className="flex h-11 items-center gap-2 rounded-[8px] px-3 text-[15.5px] font-semibold leading-[22px] text-ink-muted transition-colors hover:bg-elevated hover:text-ink"
        >
          <Check
            size={17}
            strokeWidth={2.6}
            className={allSelected ? "text-accent" : "text-ink-subtle"}
          />
          {allSelected ? t("Deselect all") : t("Select all")}
        </button>
        <span className="text-[15.5px] leading-[22px] tabular-nums text-ink-subtle">
          {t("{n} of {total} chosen", { n: selected.size, total: BACKUP_SECTIONS.length })}
        </span>
      </div>

      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
        {BACKUP_SECTIONS.map((section) => {
          const on = selected.has(section.key);
          return (
            <label
              key={section.key}
              className={`flex min-h-[44px] cursor-pointer flex-col gap-1 rounded-[10px] border px-3.5 py-3 transition-colors ${
                on ? "border-edge bg-elevated" : "border-edge-soft hover:border-edge"
              }`}
            >
              <span className="flex items-start gap-2.5">
                <input
                  type="checkbox"
                  checked={on}
                  onChange={() => toggle(section.key)}
                  className="mt-[5px] h-4 w-4 shrink-0 accent-ink"
                />
                <span className="flex min-w-0 flex-wrap items-center gap-2">
                  <span className="text-[16.5px] font-medium leading-[24px] text-ink">
                    {t(backupSectionLabel(section.key))}
                  </span>
                  {section.warning && (
                    <AlertTriangle
                      size={16}
                      strokeWidth={2.4}
                      className="shrink-0 text-danger"
                      aria-label={t("contains login credentials")}
                    />
                  )}
                </span>
              </span>
              <span className={`ps-[26px] ${ROW_DESC}`}>
                {t(backupSectionDescription(section.key))}
              </span>
            </label>
          );
        })}
      </div>

      <div ref={protectRef} className="flex flex-col gap-2">
        <div className="flex flex-col gap-2 rounded-[10px] border border-edge-soft px-4 py-3">
          <span className="text-[16.5px] font-medium leading-[24px] text-ink">
            {t("Password (optional)")}
          </span>
          <p className={`max-w-[66ch] ${ROW_DESC}`}>
            {t(
              "With a password the file is encrypted, and it cannot be restored without it. Frame cannot recover a forgotten password.",
            )}
          </p>
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder={t("Password")}
              aria-label={t("Password")}
              spellCheck={false}
              autoComplete="new-password"
              className={TEXT_FIELD}
            />
            <input
              type="password"
              value={confirm}
              onChange={(e) => setConfirm(e.target.value)}
              placeholder={t("Repeat the password")}
              aria-label={t("Repeat the password")}
              spellCheck={false}
              autoComplete="new-password"
              disabled={!encrypting}
              className={TEXT_FIELD}
            />
          </div>
          {passwordShort && (
            <p className="text-[15px] text-danger">
              {t("Use at least {n} characters.", { n: BACKUP_PASSWORD_MIN_LENGTH })}
            </p>
          )}
          {!passwordShort && mismatch && confirm.length > 0 && (
            <p className="text-[15px] text-danger">{t("The passwords do not match.")}</p>
          )}
        </div>

        {needsConsent && (
          <label className="flex cursor-pointer items-start gap-2.5 rounded-[10px] bg-elevated px-4 py-3">
            <input
              type="checkbox"
              checked={plainConsent}
              onChange={(e) => setPlainConsent(e.target.checked)}
              className="mt-[5px] h-4 w-4 shrink-0 accent-ink"
            />
            <span className={`max-w-[66ch] ${ROW_DESC}`}>
              {t(
                "Save without a password. Settings, addons, Live TV and sign-ins can contain API keys and passwords, and anyone with the file can read them.",
              )}
            </span>
          </label>
        )}
      </div>
    </SettingsModal>
  );
}

function UnlockBackup({
  text,
  onUnlocked,
  onCancel,
}: {
  text: string;
  onUnlocked: (plain: string) => void;
  onCancel: () => void;
}) {
  const t = useT();
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState<
    | "Wrong password, or the file was changed or damaged."
    | "This encrypted backup needs a newer version of Frame."
    | "This encrypted backup is damaged and cannot be restored."
    | null
  >(null);

  const unlock = () => {
    if (!password || busy) return;
    setBusy(true);
    setFailed(null);
    void decryptBackupText(text, password)
      .then(onUnlocked)
      .catch((err: unknown) => {
        setBusy(false);
        const reason = err instanceof BackupCryptoError ? err.reason : "malformed";
        setFailed(
          reason === "wrong-password-or-damaged"
            ? "Wrong password, or the file was changed or damaged."
            : reason === "unsupported-version"
              ? "This encrypted backup needs a newer version of Frame."
              : "This encrypted backup is damaged and cannot be restored.",
        );
      });
  };

  return (
    <SettingsModal
      open
      onClose={onCancel}
      dismissible={!busy}
      title={t("This backup is password protected")}
      sub={t("Enter the password that was set when the backup was saved.")}
      actions={
        <>
          <SButton disabled={busy} onClick={onCancel}>
            {t("Cancel")}
          </SButton>
          <SButton variant="primary" disabled={busy || !password} onClick={unlock}>
            {busy ? t("Unlocking...") : t("Unlock")}
          </SButton>
        </>
      }
    >
      <input
        type="password"
        value={password}
        onChange={(e) => setPassword(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter") unlock();
        }}
        placeholder={t("Password")}
        aria-label={t("Password")}
        spellCheck={false}
        autoComplete="off"
        className={TEXT_FIELD}
      />
      {failed && (
        <p role="alert" className="text-[15px] text-danger">
          {t(failed)}
        </p>
      )}
    </SettingsModal>
  );
}

function RestoreConfirm({
  backup,
  applying,
  error,
  onConfirm,
  onCancel,
}: {
  backup: Backup;
  applying: boolean;
  error: RestoreErrorMessage | null;
  onConfirm: (includeCustomCode: boolean) => void;
  onCancel: () => void;
}) {
  const t = useT();
  const [includeCode, setIncludeCode] = useState(false);
  const when = backup.exportedAt
    ? new Date(backup.exportedAt).toLocaleString()
    : t("an unknown date");
  const sections = backupSections(backup);
  const [preview] = useState(() => previewRestore(backup));

  return (
    <SettingsModal
      open
      onClose={onCancel}
      dismissible={!applying}
      title={t("Restore this backup?")}
      sub={
        preview.replacesWholeSections && preview.removes > 0
          ? t(
              "This older full backup restores its {n} saved entries and replaces each part of your setup it covers. {removed} current entries in those parts are not in the file and will be removed.",
              { n: String(preview.entries), removed: String(preview.removes) },
            )
          : t(
              "This file restores its {n} saved entries and replaces only those parts of your setup. Anything it does not contain stays exactly as it is.",
              { n: String(preview.entries) },
            )
      }
      actions={
        <>
          <SButton disabled={applying} onClick={onCancel}>
            {t("Cancel")}
          </SButton>
          <SButton variant="primary" disabled={applying} onClick={() => onConfirm(includeCode)}>
            {applying ? t("Restoring...") : t("Restore and reload")}
          </SButton>
        </>
      }
    >
      {error && (
        <p role="alert" className="text-[15px] text-danger">
          {t(error)}
        </p>
      )}
      <div className="flex flex-wrap gap-2">
        {sections.map((key) => (
          <span
            key={key}
            className="rounded-[8px] bg-elevated px-3 py-1.5 text-[15.5px] leading-[22px] text-ink-muted"
          >
            {t(backupSectionLabel(key))}
          </span>
        ))}
      </div>

      {preview.customCode && (
        <label className="flex cursor-pointer items-start gap-2.5 rounded-[10px] bg-elevated px-4 py-3">
          <input
            type="checkbox"
            checked={includeCode}
            disabled={applying}
            onChange={(e) => setIncludeCode(e.target.checked)}
            className="mt-[5px] h-4 w-4 shrink-0 accent-ink"
          />
          <span className={`max-w-[66ch] ${ROW_DESC}`}>
            {t(
              "Also restore the custom JavaScript and HTML in this file. That code runs with full access to Frame, so only include it from a backup you made yourself. Left unticked, your current custom code stays.",
            )}
          </span>
        </label>
      )}

      {backup.sections?.includes("iptv") && !backup.sections.includes("iptvCredentials") && (
        <p className={`max-w-[66ch] ${ROW_DESC}`}>
          {t("Xtream credentials were left out of this backup.")}
        </p>
      )}

      <div className="flex items-start gap-2.5 rounded-[10px] bg-elevated px-4 py-3">
        <Info size={18} className="mt-[2px] shrink-0 text-ink-subtle" />
        <p className={`max-w-[66ch] ${ROW_DESC}`}>
          {t("Saved {when} from Frame {app}. Your Stremio sign-in stays as is.", {
            when,
            app: backup.app,
          })}
          {KEEPS_SAFETY_COPY && (
            <> {t("A copy of your current setup is saved first, so you can go back.")}</>
          )}
        </p>
      </div>
    </SettingsModal>
  );
}
