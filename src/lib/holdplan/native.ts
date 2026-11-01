export function isTauri(): boolean {
  return typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;
}

export function markTauriShell(): void {
  if (isTauri()) document.documentElement.dataset.tauri = "";
}
