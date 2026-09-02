import { createSignal } from "solid-js";
import type { DiagnosticView } from "./types";

const ENABLED_STORAGE_KEY = "typingDiagnosticsEnabled";

function readEnabledPreference(): boolean {
  try {
    return window.localStorage.getItem(ENABLED_STORAGE_KEY) === "true";
  } catch {
    return false;
  }
}

export const [getDiagnosticsEnabled, setDiagnosticsEnabledSignal] =
  createSignal(readEnabledPreference());
export const [getLatestDiagnostics, setLatestDiagnostics] =
  createSignal<DiagnosticView | null>(null);
export const [getDiagnosticsStatus, setDiagnosticsStatus] = createSignal<
  "idle" | "loading" | "ready" | "error"
>("idle");
export const [getDiagnosticsError, setDiagnosticsError] = createSignal<
  string | null
>(null);

export function setDiagnosticsEnabled(enabled: boolean): void {
  try {
    window.localStorage.setItem(ENABLED_STORAGE_KEY, String(enabled));
  } catch {
    // The signal still enables diagnostics for the current page session.
  }
  setDiagnosticsEnabledSignal(enabled);
}
