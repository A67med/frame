const IS_TAURI = typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;

export type SaveResult = { saved: boolean; path: string | null };
export type SaveTextOptions = { nativeFailure?: "fallback" | "throw" };

export async function saveTextFileWithPath(
  filename: string,
  text: string,
  extensions: string[],
  label = "Frame",
  options: SaveTextOptions = {},
): Promise<SaveResult> {
  if (IS_TAURI) {
    try {
      const { invoke } = await import("@tauri-apps/api/core");
      // The native side opens the save dialog and writes the chosen file, so
      // the page never hands the app an arbitrary path to overwrite.
      const path = await invoke<string | null>("save_text_file_as", {
        defaultName: filename,
        filterName: label,
        extensions,
        contents: text,
      });
      if (!path) return { saved: false, path: null };
      return { saved: true, path };
    } catch (err) {
      if (options.nativeFailure === "throw") throw err;
      console.warn("[harbor] native save failed, falling back", err);
    }
  }
  const blob = new Blob([text], { type: "text/plain" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 1000);
  return { saved: true, path: null };
}

export async function downloadText(
  filename: string,
  text: string,
  extensions: string[],
  label = "Frame",
  options: SaveTextOptions = {},
): Promise<boolean> {
  const { saved } = await saveTextFileWithPath(filename, text, extensions, label, options);
  return saved;
}
