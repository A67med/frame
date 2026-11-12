import { downloadText } from "@/lib/download-text";
import { buildSyncBackup, type SyncBackup } from "@/lib/profile-sync/backup-payload";
import { loadBgImage, saveBgImage } from "@/lib/theme-storage";
import { readAllProfilesIdentity } from "@/lib/profiles";
import { activeProfileId } from "@/lib/active-profile-id";
import {
  flushSecrets,
  getAllSecrets,
  isSecretKey,
  secretKeyForProfile,
  setSecret,
} from "@/lib/secret-store";
import { setItemWithRecovery } from "@/lib/storage-recovery";
import { localLibraryReady, readLocalLibrary, restoreLocalLibrary } from "@/lib/local-library";

declare const __APP_VERSION__: string;

// The container keeps Harbor's format id, so `.framex` and legacy `.harbx`
// files are the same JSON and either one restores on Frame or Harbor.
const FORMAT = "harbor-backup";
const VERSION = 1;
/** Restores refuse larger files before parsing; matches the native safety-copy cap. */
export const MAX_BACKUP_TEXT_LENGTH = 100 * 1024 * 1024;
const LOCAL_LIBRARY_KEY = "harbor.library.local.v1";

export const BACKUP_EXTENSION = "framex";
/** Extensions the restore picker accepts: Frame's own and Frame's. */
export const BACKUP_IMPORT_EXTENSIONS = ["framex", "harbx"] as const;

export function backupFileName(date: Date = new Date()): string {
  return `frame-backup-${date.toISOString().slice(0, 10)}.${BACKUP_EXTENSION}`;
}

export type BackupSectionKey =
  | "theme"
  | "homeLayout"
  | "settings"
  | "addons"
  | "profiles"
  | "sessions"
  | "watchlist"
  | "watchProgress"
  | "searchHistory"
  | "playerLayouts"
  | "feedDiscover"
  | "iptv"
  | "iptvCredentials"
  | "manga"
  | "miscState"
  | "other";

type BackupSection = {
  key: BackupSectionKey;
  /** English source strings; the UI passes them through t() for translation. */
  label: string;
  description: string;
  /** Flags the section in the UI (e.g. it contains login credentials). */
  warning?: boolean;
  patterns: string[];
};

/**
 * How localStorage keys map to user-facing export sections.
 * Order matters: the first section whose pattern prefixes a key wins,
 * so `harbor.discover.libImported` (homeLayout) must be checked before
 * the broader `harbor.discover.` (feedDiscover).
 */
export const BACKUP_SECTIONS: readonly BackupSection[] = [
  {
    key: "theme",
    label: "Theme & backgrounds",
    description: "Your chosen theme, custom themes, uploaded fonts, and the background image.",
    patterns: [
      "harbor.theme",
      "harbor.custom-themes.v1",
      "harbor.theme-uploads.v1",
      "harbor.theme-client-id",
      "harbor.theme-unseen.v1",
    ],
  },
  {
    key: "homeLayout",
    label: "Home layout",
    description: "Home and detail view layout, page rows, pinned catalogs, and scroll memory.",
    patterns: [
      "harbor.pageRows.",
      "harbor.pagecollrows.v1",
      "harbor.pinnedcatalogs.v1",
      "harbor.discover.libImported",
      "harbor.detailLayout",
      "harbor.library.tab",
      "harbor.scroll.v1",
    ],
  },
  {
    key: "settings",
    label: "Settings",
    description: "App settings and preferences, including parental controls.",
    patterns: ["harbor.settings", "harbor.settingsNew.v1", "harbor.parental"],
  },
  {
    key: "addons",
    label: "Addons",
    description: "Your installed addons, their order, and which ones are disabled.",
    patterns: [
      "harbor.installed-addons",
      "harbor.addons.",
      "harbor.addonOrder",
      "harbor.addonOrderBackups",
      "harbor.sa.v1.",
    ],
  },
  {
    key: "profiles",
    label: "Profiles",
    description: "Your profiles, the active profile, and the profile picker.",
    patterns: ["harbor.profiles.v1", "harbor.profile.lastSelectAt", "harbor.pickerShown"],
  },
  {
    key: "sessions",
    label: "Service sign-ins",
    description: "Your saved Trakt, Simkl, MAL, AniList, and Letterboxd logins.",
    warning: true,
    patterns: [
      "harbor.trakt.session.v1",
      "harbor.simkl.session.v1",
      "harbor.mal.session.v1",
      "harbor.anilist.session.v1",
      "harbor.letterboxd.session.v1",
    ],
  },
  {
    key: "watchlist",
    label: "Watchlist & favorites",
    description: "Your watchlist, local library, custom lists, collections, and favorites.",
    patterns: [
      "harbor.watchlist.",
      "harbor.localwatchlist.",
      "harbor.localcw.",
      "harbor.favorites.",
      "harbor.charfavorites.",
      "harbor.library.local.v1",
      "harbor.library.local.removed.v1",
      "harbor.customlists",
      "harbor.collections",
    ],
  },
  {
    key: "watchProgress",
    label: "Watch progress & history",
    description: "Resume positions, watched flags, playback history, and manual watch marks.",
    patterns: [
      "harbor.resume",
      "harbor.watchedFlag.v1",
      "harbor.watchedby.v1",
      "harbor.watchevents.v1",
      "harbor.moviewatched.v1",
      "harbor.manualwatched",
      "harbor.manualunwatched",
      "harbor.hiddenepisodes.v1",
      "harbor.lastseason.v1",
      "harbor.playback-history.v1",
    ],
  },
  {
    key: "searchHistory",
    label: "Search history",
    description: "Your recent search queries.",
    patterns: ["harbor.search.recent"],
  },
  {
    key: "playerLayouts",
    label: "Player layouts & prefs",
    description: "Player UI layout, volume, subtitle presets, and player preferences.",
    patterns: ["harbor.player.", "harbor.sub.presets.v1"],
  },
  {
    key: "iptv",
    label: "Live TV",
    description: "M3U URLs, favorites, the EPG guide style, and stats.",
    patterns: ["harbor.iptv.", "harbor.guide.style"],
  },
  {
    key: "iptvCredentials",
    label: "Xtream credentials",
    description: "Usernames and passwords for Xtream playlists.",
    warning: true,
    patterns: [],
  },
  {
    key: "feedDiscover",
    label: "Feed & Discover",
    description: "Feed preferences and Discover row state.",
    patterns: ["harbor.feed", "harbor.discover."],
  },
  {
    key: "manga",
    label: "Manga",
    description: "Manga library, reading progress, favorites, bookmarks, and reader prefs.",
    patterns: ["harbor.manga.", "harbor.mangaread.", "harbor.mangafav.", "harbor.mangabookmarks."],
  },
  {
    key: "miscState",
    label: "Onboarding & interface state",
    description:
      "Onboarding flags, dismissed tips, reminders, the discovery queue, and watch party name.",
    patterns: [
      "harbor.onboarding",
      "harbor.hero-muted.v1",
      "harbor.hero-known-audio.v1",
      "harbor.surprise.recent.v1",
      "harbor.voyage.v1",
      "harbor.reminders.",
      "harbor.auto-download.v1",
      "harbor.queue.",
      "harbor.custom-hover.v1",
      "harbor.awardpacks.v1",
      "harbor.cw.dismissed",
      "harbor.advisory.ignored",
      "harbor.calendar.filtersOpen",
      "harbor.multiview.",
      "harbor.memoryHud.open",
      "harbor.webhook.lastTick",
      "harbor.relayBannerDismissed",
      "harbor.presence.status",
      "harbor.kids.learn.v1",
      "harbor.curfew.",
      "harbor.avatar-synced.",
      "harbor.libraryNameRepair.v1.",
      "harbor.together.name",
      "harbor.together.followHostExit",
    ],
  },
  {
    key: "other",
    label: "Cached lookups & misc",
    description: "Recomputable caches like IMDb/TMDB ID maps and award data, plus small UI flags.",
    patterns: [],
  },
];

export const ALL_SECTION_KEYS: readonly BackupSectionKey[] = BACKUP_SECTIONS.map((s) => s.key);

export function isSectionKey(value: unknown): value is BackupSectionKey {
  return typeof value === "string" && (ALL_SECTION_KEYS as readonly string[]).includes(value);
}

/** The section a localStorage key belongs to; "other" is the catch-all. */
export function sectionOf(key: string): BackupSectionKey {
  for (const section of BACKUP_SECTIONS) {
    if (section.patterns.some((p) => key.startsWith(p))) return section.key;
  }
  return "other";
}

export function backupSectionLabel(key: BackupSectionKey): string {
  return BACKUP_SECTIONS.find((s) => s.key === key)?.label ?? "Cached lookups & misc";
}

export function backupSectionDescription(key: BackupSectionKey): string {
  return BACKUP_SECTIONS.find((s) => s.key === key)?.description ?? "";
}

export type Backup = {
  format: string;
  version: number;
  app: string;
  exportedAt: string;
  data: Record<string, string>;
  /** Which sections this backup contains. Absent on legacy files (= everything). */
  sections?: BackupSectionKey[];
  bgImages?: Record<string, string>;
  /** @deprecated legacy single-image field from before per-profile backgrounds; still read on restore */
  bgImage?: string | null;
  /**
   * A resolved snapshot of everything account sync owns, so the server side never
   * becomes the only copy of a household's customisation. That is the standing wound on
   * the :8799 community sync service and it must not repeat here with higher stakes.
   */
  sync?: SyncBackup;
};

function isPortable(key: string): boolean {
  if (!key.startsWith("harbor.")) return false;
  // Update enrollment and staged-install state belong to this installation.
  if (key.startsWith("harbor.update.")) return false;
  if (key === "harbor.auth" || key.startsWith("harbor.auth.")) return false;
  if (key === "harbor.together.clientId") return false;
  return true;
}

export async function buildBackup(selected?: BackupSectionKey[]): Promise<Backup> {
  const sectionSet = selected && selected.length > 0 ? new Set<BackupSectionKey>(selected) : null;
  const data: Record<string, string> = {};
  for (let i = 0; i < localStorage.length; i++) {
    const key = localStorage.key(i);
    if (!key || !isPortable(key)) continue;
    if (sectionSet && !sectionSet.has(sectionOf(key))) continue;
    const value = localStorage.getItem(key);
    if (value != null) data[key] = value;
  }
  for (const [key, value] of Object.entries(getAllSecrets())) {
    if (!isPortable(key)) continue;
    if (sectionSet && !sectionSet.has(sectionOf(key))) continue;
    if (data[key] == null) data[key] = value;
  }
  if (!sectionSet || sectionSet.has("watchlist")) {
    await localLibraryReady();
    data["harbor.library.local.v1"] = JSON.stringify(readLocalLibrary());
  }
  // Xtream playlists embed credentials in their URLs; when the Xtream
  // credentials section is left out (but Live TV is exported), drop them so
  // they never leave the device.
  if (sectionSet?.has("iptv") && !sectionSet.has("iptvCredentials")) {
    const raw = data["harbor.iptv.playlists.v1"];
    if (raw != null) {
      try {
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed)) {
          const filtered = parsed.filter((p: { kind?: string }) => p?.kind !== "xtream");
          if (filtered.length === 0) {
            delete data["harbor.iptv.playlists.v1"];
          } else {
            data["harbor.iptv.playlists.v1"] = JSON.stringify(filtered);
          }
        }
      } catch {
        /* leave malformed playlists data untouched */
      }
    }
  }
  const includeBg = !sectionSet || sectionSet.has("theme");
  const bgImages: Record<string, string> = {};
  if (includeBg) {
    for (const { id } of readAllProfilesIdentity()) {
      const image = await loadBgImage(id);
      if (image) bgImages[id] = image;
    }
  }
  return {
    format: FORMAT,
    version: VERSION,
    app: typeof __APP_VERSION__ === "string" ? __APP_VERSION__ : "dev",
    exportedAt: new Date().toISOString(),
    data,
    sync: buildSyncBackup(),
    sections: sectionSet
      ? (ALL_SECTION_KEYS.filter((k) => sectionSet.has(k)) as BackupSectionKey[])
      : [...ALL_SECTION_KEYS],
    ...(Object.keys(bgImages).length > 0 ? { bgImages } : {}),
  };
}

/**
 * Sections whose entries can hold API keys, tokens or passwords: settings keep
 * debrid and provider keys, addon URLs often embed keys, Live TV playlists can
 * carry Xtream logins. Exporting any of them without a password needs consent.
 */
export const CREDENTIAL_SECTIONS: readonly BackupSectionKey[] = [
  "settings",
  "addons",
  "sessions",
  "iptv",
  "iptvCredentials",
];

export function selectionHasCredentials(selected: readonly BackupSectionKey[]): boolean {
  return selected.some((key) => CREDENTIAL_SECTIONS.includes(key));
}

/** The backup file text, encrypted with the password when one is given. */
export async function serializeBackup(backup: Backup, password?: string): Promise<string> {
  const text = JSON.stringify(backup, null, 2);
  if (!password) return text;
  const { encryptBackupText } = await import("@/lib/backup-crypto");
  return encryptBackupText(text, password);
}

export async function downloadBackup(
  selected?: BackupSectionKey[],
  options: { password?: string } = {},
): Promise<boolean> {
  const backup = await buildBackup(selected);
  const text = await serializeBackup(backup, options.password);
  return downloadText(backupFileName(), text, [BACKUP_EXTENSION], "Frame backup");
}

export type BackupValidationError =
  | "That file is not valid JSON."
  | "Unrecognized file."
  | "This is not a Frame backup file."
  | "This backup has no data in it."
  | "This backup contained nothing restorable."
  | "This backup is too large to restore."
  | "This backup was made by a newer version of Frame. Update Frame, then try again."
  | "This backup is damaged and cannot be restored.";

export type ParsedBackup =
  | { ok: true; backup: Backup }
  | { ok: false; error: BackupValidationError };

export function parseBackup(text: string): ParsedBackup {
  if (text.length > MAX_BACKUP_TEXT_LENGTH) {
    return { ok: false, error: "This backup is too large to restore." };
  }
  let json: unknown;
  try {
    json = JSON.parse(text);
  } catch {
    return { ok: false, error: "That file is not valid JSON." };
  }
  if (!json || typeof json !== "object") {
    return { ok: false, error: "Unrecognized file." };
  }
  const b = json as Partial<Backup>;
  if (b.format !== FORMAT) {
    return { ok: false, error: "This is not a Frame backup file." };
  }
  // Files without a version predate the field and are read as version 1.
  if (b.version !== undefined) {
    if (typeof b.version !== "number" || !Number.isInteger(b.version) || b.version < 1) {
      return { ok: false, error: "This backup is damaged and cannot be restored." };
    }
    if (b.version > VERSION) {
      return {
        ok: false,
        error: "This backup was made by a newer version of Frame. Update Frame, then try again.",
      };
    }
  }
  if (!b.data || typeof b.data !== "object" || Array.isArray(b.data)) {
    return { ok: false, error: "This backup has no data in it." };
  }
  const data: Record<string, string> = {};
  for (const [k, v] of Object.entries(b.data)) {
    if (typeof v === "string" && isPortable(k)) data[k] = v;
  }
  // The local library is replaced as one document, so a damaged one would
  // fail halfway through the restore; refuse it before anything is written.
  if (data[LOCAL_LIBRARY_KEY] != null && !isJsonArray(data[LOCAL_LIBRARY_KEY])) {
    return { ok: false, error: "This backup is damaged and cannot be restored." };
  }
  if (Object.keys(data).length === 0) {
    return { ok: false, error: "This backup contained nothing restorable." };
  }
  const sections = Array.isArray(b.sections)
    ? (b.sections.filter(isSectionKey) as BackupSectionKey[])
    : undefined;
  const bgImages: Record<string, string> = {};
  if (b.bgImages && typeof b.bgImages === "object") {
    for (const [id, value] of Object.entries(b.bgImages)) {
      if (typeof value === "string") bgImages[id] = value;
    }
  }
  return {
    ok: true,
    backup: {
      format: FORMAT,
      version: typeof b.version === "number" ? b.version : VERSION,
      app: typeof b.app === "string" ? b.app : "unknown",
      exportedAt: typeof b.exportedAt === "string" ? b.exportedAt : "",
      data,
      ...(sections && sections.length > 0 ? { sections } : {}),
      ...(Object.keys(bgImages).length > 0 ? { bgImages } : {}),
      ...(typeof b.bgImage === "string" || b.bgImage === null ? { bgImage: b.bgImage } : {}),
    },
  };
}

function isJsonArray(text: string): boolean {
  try {
    return Array.isArray(JSON.parse(text));
  } catch {
    return false;
  }
}

export function backupKeyCount(backup: Backup): number {
  return Object.keys(backup.data).length;
}

/**
 * Sections this backup actually restores. Legacy files without a sections
 * field restore everything, which keeps old backups working unchanged.
 */
export function backupSections(backup: Backup): BackupSectionKey[] {
  return backup.sections && backup.sections.length > 0 ? backup.sections : [...ALL_SECTION_KEYS];
}

/**
 * Final-segment shape of a stored profile id: the fallback "default", or a
 * generated id like "p_mqxx2agk_ez1zro" (see createProfile in profiles.tsx).
 */
const PROFILE_ID_RE = /^(?:default|p_[a-z0-9]+_[a-z0-9]+)$/;
const PROFILES_STATE_KEY = "harbor.profiles.v1";

function profileSuffixOf(key: string): string | null {
  const dot = key.lastIndexOf(".");
  if (dot < 0) return null;
  const id = key.slice(dot + 1);
  return PROFILE_ID_RE.test(id) ? id : null;
}

/**
 * Rewrites per-profile entries so a backup taken elsewhere lands where this
 * build reads it. Most domains are read back with the active profile id
 * appended, so foreign ids are swapped for it; when several source profiles
 * collapse onto one target key, the entry with more data wins instead of
 * whichever came last in key order.
 * Legacy watchlists used a bare global key, while current builds store them
 * per profile. A scoped restore maps either shape onto the active profile;
 * full backups retain their original profile layout.
 */
const BARE_BASES = new Set(["harbor.watchlist.v1", "harbor.watchlist.aggregate.v1"]);

function retargetProfileKeys(data: Record<string, string>): Record<string, string> {
  const target = activeProfileId();
  const profilesIncluded = data[PROFILES_STATE_KEY] != null;
  const out: Record<string, string> = {};
  const setMerged = (key: string, value: string) => {
    const prev = out[key];
    out[key] = prev != null && prev.length >= value.length ? prev : value;
  };
  for (const [key, value] of Object.entries(data)) {
    const from = profileSuffixOf(key);
    if (!from) {
      if (!profilesIncluded && BARE_BASES.has(key)) {
        setMerged(`${key}.${target}`, value);
      } else {
        out[key] = value;
      }
      continue;
    }
    const base = key.slice(0, key.length - from.length - 1);
    if (profilesIncluded) {
      out[key] = value;
      continue;
    }
    setMerged(`${base}.${target}`, value);
  }
  return out;
}

type RestorePlan = {
  /** Entries to write, already retargeted to this install's profiles. */
  data: Record<string, string>;
  localLibrary: string | null;
  /** Legacy full backups replace whole sections; these existing keys go away. */
  staleLocalKeys: string[];
  staleSecretKeys: string[];
  wipesSections: boolean;
};

function planRestore(backup: Backup): RestorePlan {
  const data = retargetProfileKeys(backup.data);
  const localLibrary = data[LOCAL_LIBRARY_KEY] ?? null;
  delete data[LOCAL_LIBRARY_KEY];

  // Whole-domain wiping is reserved for legacy full backups (no sections
  // field): there, "restore everything" must also clear items the source
  // install had deleted. Sectioned files replace only the exact entries they
  // carry and never touch anything else.
  const staleLocalKeys: string[] = [];
  const staleSecretKeys: string[] = [];
  const wipesSections = backup.sections == null || backup.sections.length === 0;
  if (wipesSections) {
    const filled = new Set<BackupSectionKey>();
    for (const key of Object.keys(backup.data)) {
      if (!isPortable(key)) continue;
      filled.add(sectionOf(key));
    }
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (!key || !isPortable(key) || key === LOCAL_LIBRARY_KEY) continue;
      if (!filled.has(sectionOf(key))) continue;
      staleLocalKeys.push(key);
    }
    for (const key of Object.keys(getAllSecrets())) {
      if (!isPortable(key)) continue;
      if (!filled.has(sectionOf(key))) continue;
      if (data[key] == null) staleSecretKeys.push(key);
    }
  }
  return { data, localLibrary, staleLocalKeys, staleSecretKeys, wipesSections };
}

export type RestorePreview = {
  /** Entries the file writes. */
  entries: number;
  /** True for legacy full backups, which replace whole sections. */
  replacesWholeSections: boolean;
  /** Existing entries that the restore removes because the file lacks them. */
  removes: number;
};

/** What a restore would change on this install, computed without writing anything. */
export function previewRestore(backup: Backup): RestorePreview {
  const plan = planRestore(backup);
  const written = new Set(Object.keys(plan.data));
  const removes =
    plan.staleLocalKeys.filter((k) => !written.has(k)).length + plan.staleSecretKeys.length;
  return {
    entries: backupKeyCount(backup),
    replacesWholeSections: plan.wipesSections,
    removes,
  };
}

export type RestoreFailure =
  | "safety-copy"
  | "storage-refused"
  | "library-refused"
  | "secrets-not-saved";

/**
 * Thrown when a restore could not be completed. `rolledBack` says whether the
 * setup that was there before the restore was put back in full.
 */
export class BackupRestoreError extends Error {
  readonly reason: RestoreFailure;
  readonly rolledBack: boolean;
  readonly failedKeys: string[];

  constructor(reason: RestoreFailure, rolledBack: boolean, failedKeys: string[] = []) {
    super(`restore failed: ${reason}`);
    this.name = "BackupRestoreError";
    this.reason = reason;
    this.rolledBack = rolledBack;
    this.failedKeys = failedKeys;
  }
}

type Snapshot = {
  local: Map<string, string>;
  secrets: Record<string, string>;
  library: string | null;
};

async function captureSnapshot(includeLibrary: boolean): Promise<Snapshot> {
  const local = new Map<string, string>();
  for (let i = 0; i < localStorage.length; i++) {
    const key = localStorage.key(i);
    if (!key || !isPortable(key)) continue;
    const value = localStorage.getItem(key);
    if (value != null) local.set(key, value);
  }
  let library: string | null = null;
  if (includeLibrary) {
    await localLibraryReady();
    library = JSON.stringify(readLocalLibrary());
  }
  return { local, secrets: getAllSecrets(), library };
}

/** Puts the pre-restore state back for every key the restore touched. */
async function rollback(snapshot: Snapshot, touched: Set<string>): Promise<boolean> {
  let ok = true;
  // Remove new keys first so their space is free for the previous values.
  for (const key of touched) {
    if (snapshot.local.has(key)) continue;
    try {
      localStorage.removeItem(key);
    } catch {
      ok = false;
    }
  }
  for (const key of touched) {
    const previous = snapshot.local.get(key);
    if (previous == null) continue;
    try {
      if (localStorage.getItem(key) !== previous && !setItemWithRecovery(key, previous)) ok = false;
    } catch {
      ok = false;
    }
  }
  const current = getAllSecrets();
  for (const key of Object.keys(current)) {
    if (snapshot.secrets[key] == null) setSecret(key, null);
  }
  for (const [key, value] of Object.entries(snapshot.secrets)) {
    if (current[key] !== value) setSecret(key, value);
  }
  if (snapshot.library != null && !restoreLocalLibrary(snapshot.library)) ok = false;
  try {
    await flushSecrets();
  } catch {
    ok = false;
  }
  return ok;
}

function isTauriRuntime(): boolean {
  return typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;
}

/**
 * Saves the current setup to the app data folder before a restore replaces
 * it. Returns the saved path, or null outside the desktop app.
 */
async function saveSafetyCopy(): Promise<string | null> {
  if (!isTauriRuntime()) return null;
  const { invoke } = await import("@tauri-apps/api/core");
  const current = await buildBackup();
  return invoke<string>("backup_save_safety_copy", { content: JSON.stringify(current) });
}

export type RestoreResult = {
  /** Where the pre-restore safety copy was saved, when the platform keeps one. */
  safetyCopyPath: string | null;
};

/**
 * Restores a parsed backup. Nothing is written until a safety copy of the
 * current setup exists (desktop) and an in-memory snapshot is taken; if any
 * entry, the local library or the sign-ins cannot be saved, the touched keys
 * are put back and a BackupRestoreError is thrown instead of reporting success.
 */
export async function applyBackup(backup: Backup): Promise<RestoreResult> {
  const plan = planRestore(backup);

  let safetyCopyPath: string | null = null;
  try {
    safetyCopyPath = await saveSafetyCopy();
  } catch (error) {
    console.warn("[backup] could not save a safety copy, restore not started", error);
    throw new BackupRestoreError("safety-copy", true);
  }
  const snapshot = await captureSnapshot(plan.localLibrary != null);
  const touched = new Set<string>();
  const failedKeys: string[] = [];
  let failure: RestoreFailure | null = null;

  if (plan.localLibrary != null && !restoreLocalLibrary(plan.localLibrary)) {
    failure = "library-refused";
  }

  if (failure == null) {
    for (const key of plan.staleLocalKeys) {
      touched.add(key);
      localStorage.removeItem(key);
    }
    for (const key of plan.staleSecretKeys) setSecret(key, null);

    // Restore localStorage-backed entries first so a restored profiles list can
    // change which profile the sign-ins land on. Small personal keys are written
    // before bulky recomputable caches so a full storage degrades by dropping
    // caches instead of user data; recovery prunes quotas and retries.
    const entries = Object.entries(plan.data)
      .filter(([k]) => isPortable(k) && !isSecretKey(k))
      .sort(([, a], [, b]) => a.length - b.length);
    for (const [k, v] of entries) {
      touched.add(k);
      try {
        if (!setItemWithRecovery(k, v)) failedKeys.push(k);
      } catch (e) {
        console.warn(`[backup] failed to restore "${k}"`, e);
        failedKeys.push(k);
      }
    }
    if (failedKeys.length > 0) failure = "storage-refused";
  }

  if (failure == null) {
    // Sign-ins are stored per profile; place them on the profile that is active
    // after this restore so they come back regardless of where the backup was made.
    const targetProfile = activeProfileId();
    for (const [k, v] of Object.entries(backup.data)) {
      if (!isPortable(k) || !isSecretKey(k)) continue;
      setSecret(secretKeyForProfile(k, targetProfile), v);
    }
    try {
      await flushSecrets();
    } catch (error) {
      console.warn("[backup] sign-ins could not be saved", error);
      failure = "secrets-not-saved";
    }
  }

  if (failure != null) {
    const rolledBack = await rollback(snapshot, touched);
    throw new BackupRestoreError(failure, rolledBack, failedKeys);
  }

  const restoresTheme =
    backup.sections == null || backup.sections.length === 0 || backup.sections.includes("theme");
  if (restoresTheme) {
    if (backup.bgImages) {
      for (const [id, image] of Object.entries(backup.bgImages)) {
        try {
          await saveBgImage(image, id);
        } catch {
          /* background restore is best-effort */
        }
      }
    } else if (backup.bgImage !== undefined) {
      try {
        await saveBgImage(backup.bgImage);
      } catch {
        /* background restore is best-effort */
      }
    }
  }
  return { safetyCopyPath };
}
