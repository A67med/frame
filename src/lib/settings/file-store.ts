import { invoke } from "@tauri-apps/api/core";

const isTauri = typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;

export async function readSettingsFile(): Promise<string | null> {
  if (!isTauri) return null;
  try {
    return (await invoke<string | null>("settings_read")) ?? null;
  } catch {
    return null;
  }
}

/**
 * Mirrors settings to the native file (localStorage stays the primary copy, and
 * native code reads a few flags from this file). Resolves false when the write
 * was refused so callers can tell, instead of swallowing the failure.
 */
export async function writeSettingsFile(content: string): Promise<boolean> {
  if (!isTauri) return true;
  try {
    await invoke("settings_write", { content });
    return true;
  } catch (error) {
    console.warn("[settings] could not write settings.json", error);
    return false;
  }
}
