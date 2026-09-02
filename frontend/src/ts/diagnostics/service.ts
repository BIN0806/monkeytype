import {
  buildDiagnosticPatternComparisons,
  buildDiagnosticProfile,
  createDiagnosticSession,
  getDiagnosticPracticeWords,
} from "./analyzer";
import { buildAdvancedDiagnostics } from "./advanced-analyzer";
import {
  getDiagnosticsEnabled,
  setDiagnosticsError,
  setDiagnosticsStatus,
  setLatestDiagnostics,
} from "./state";
import { getDiagnosticSessions, storeDiagnosticSession } from "./storage";
import type { DiagnosticResult } from "./types";
import type { EventLog } from "../test/events/types";

let captureId = 0;

export async function captureDiagnosticSession(
  eventLog: EventLog,
  result: DiagnosticResult,
): Promise<void> {
  if (!getDiagnosticsEnabled()) return;

  const currentCaptureId = ++captureId;
  setDiagnosticsStatus("loading");
  setDiagnosticsError(null);

  try {
    const session = createDiagnosticSession(eventLog, result);
    await storeDiagnosticSession(session);
    const matchingSessions = (await getDiagnosticSessions()).filter(
      (stored) =>
        stored.language === session.language &&
        stored.layout === session.layout,
    );
    const profile = buildDiagnosticProfile(matchingSessions);
    const comparisons = buildDiagnosticPatternComparisons(
      matchingSessions,
      session,
    );
    const advanced = buildAdvancedDiagnostics(
      matchingSessions,
      session,
      comparisons,
    );
    const practiceWords = [
      ...new Set([
        ...advanced.practiceRecommendations.flatMap(
          (recommendation) => recommendation.words,
        ),
        ...getDiagnosticPracticeWords(session, profile),
      ]),
    ].slice(0, 20);

    if (currentCaptureId !== captureId) return;
    setLatestDiagnostics({
      session,
      profile,
      comparisons,
      advanced,
      practiceWords,
    });
    setDiagnosticsStatus("ready");
  } catch (error) {
    if (currentCaptureId !== captureId) return;
    const message = error instanceof Error ? error.message : String(error);
    console.error("Failed to capture typing diagnostics", error);
    setDiagnosticsError(message);
    setDiagnosticsStatus("error");
  }
}
