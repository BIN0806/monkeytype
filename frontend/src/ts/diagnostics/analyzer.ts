import type {
  DiagnosticConfidence,
  DiagnosticFeature,
  DiagnosticObservation,
  DiagnosticPatternComparison,
  DiagnosticPatternKind,
  DiagnosticPatternPerformance,
  DiagnosticPatternTrendPoint,
  DiagnosticProfile,
  DiagnosticResult,
  DiagnosticSession,
} from "./types";
import { DIAGNOSTIC_SESSION_VERSION } from "./types";
import type { EventLog, TestEventNoMs } from "../test/events/types";

const MAX_KEY_TO_INPUT_DELAY_MS = 250;
const MIN_INTERVAL_MS = 15;
const MAX_INTERVAL_MS = 2000;
const PRIOR_WEIGHT = 8;
const MAX_PATTERN_TREND_SESSIONS = 12;

const NON_CHARACTER_CODES = new Set([
  "AltLeft",
  "AltRight",
  "Backspace",
  "CapsLock",
  "ControlLeft",
  "ControlRight",
  "Enter",
  "MetaLeft",
  "MetaRight",
  "ShiftLeft",
  "ShiftRight",
  "Tab",
]);

type Press = {
  code: string;
  downMs: number;
  upMs?: number;
  estimatedRelease: boolean;
  observation?: DiagnosticObservation;
};

type FeatureAccumulator = {
  attempts: number;
  errors: number;
  latencies: number[];
};

function isUsefulInterval(value: number | undefined): value is number {
  return (
    value !== undefined && value >= MIN_INTERVAL_MS && value <= MAX_INTERVAL_MS
  );
}

function median(values: number[]): number | undefined {
  if (values.length === 0) return undefined;
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  const right = sorted[middle];
  if (right === undefined) return undefined;
  if (sorted.length % 2 === 1) return right;
  const left = sorted[middle - 1];
  return left === undefined ? right : (left + right) / 2;
}

function bareWord(word: string): string {
  return word.replace(/[ \n]$/, "");
}

function getTargetCharacter(
  eventLog: EventLog,
  event: Extract<TestEventNoMs, { type: "input" }>,
): string | undefined {
  const targetWord = eventLog.context.targetWords[event.data.wordIndex];
  if (targetWord === undefined) return undefined;
  return Array.from(targetWord)[event.data.charIndex];
}

function findMatchingPress(
  presses: Press[],
  inputMs: number,
): Press | undefined {
  for (let index = presses.length - 1; index >= 0; index--) {
    const press = presses[index];
    if (press === undefined || press.observation !== undefined) continue;
    if (NON_CHARACTER_CODES.has(press.code)) continue;
    const delay = inputMs - press.downMs;
    if (delay < 0) continue;
    if (delay > MAX_KEY_TO_INPUT_DELAY_MS) break;
    return press;
  }
  return undefined;
}

export function extractDiagnosticObservations(eventLog: EventLog): {
  observations: DiagnosticObservation[];
  correctionCount: number;
} {
  const observations: DiagnosticObservation[] = [];
  const presses: Press[] = [];
  const activePresses = new Map<string, Press>();
  let correctionCount = 0;
  let previousInputMs: number | undefined;

  for (const event of eventLog.events) {
    if (event.type === "keydown") {
      const press: Press = {
        code: event.data.code,
        downMs: event.testMs,
        estimatedRelease: false,
      };
      presses.push(press);
      activePresses.set(event.data.code, press);
      continue;
    }

    if (event.type === "keyup") {
      const press = activePresses.get(event.data.code);
      if (press !== undefined) {
        press.upMs = event.testMs;
        press.estimatedRelease = event.data.estimated === true;
        activePresses.delete(event.data.code);
      }
      continue;
    }

    if (event.type !== "input") continue;

    if (
      event.data.inputType === "deleteContentBackward" ||
      event.data.inputType === "deleteWordBackward"
    ) {
      if (event.data.automatic !== true) correctionCount++;
      continue;
    }

    if (
      event.data.inputType !== "insertText" ||
      event.data.automatic === true ||
      Array.from(event.data.data).length !== 1
    ) {
      continue;
    }

    const target = getTargetCharacter(eventLog, event);
    const targetWord = eventLog.context.targetWords[event.data.wordIndex];
    if (target === undefined || targetWord === undefined) continue;

    const observation: DiagnosticObservation = {
      target,
      typed: event.data.data,
      correct: event.data.correct,
      word: bareWord(targetWord),
      wordIndex: event.data.wordIndex,
      charIndex: event.data.charIndex,
      testMs: event.testMs,
      ...(previousInputMs === undefined
        ? {}
        : { intervalMs: event.testMs - previousInputMs }),
    };
    previousInputMs = event.testMs;

    const press = findMatchingPress(presses, event.testMs);
    if (press !== undefined) {
      press.observation = observation;
      observation.physicalCode = press.code;
    }

    observations.push(observation);
  }

  const matchedPresses = presses.filter((press) => {
    if (press.observation === undefined) return false;
    if (
      press.upMs !== undefined &&
      !press.estimatedRelease &&
      press.upMs >= press.downMs
    ) {
      press.observation.dwellMs = press.upMs - press.downMs;
    }
    return true;
  });

  for (let index = 1; index < matchedPresses.length; index++) {
    const previous = matchedPresses[index - 1];
    const current = matchedPresses[index];
    if (
      previous?.upMs === undefined ||
      previous.estimatedRelease ||
      current?.observation === undefined
    ) {
      continue;
    }
    current.observation.flightMs = current.downMs - previous.upMs;
  }

  return { observations, correctionCount };
}

export function createDiagnosticSession(
  eventLog: EventLog,
  result: DiagnosticResult,
): DiagnosticSession {
  const { observations, correctionCount } =
    extractDiagnosticObservations(eventLog);

  return {
    id: String(result.timestamp),
    version: DIAGNOSTIC_SESSION_VERSION,
    timestamp: result.timestamp,
    language: result.language,
    layout: result.layout,
    mode: result.mode,
    mode2: result.mode2,
    wpm: result.wpm,
    acc: result.acc,
    testDuration: result.testDuration,
    correctionCount,
    observations,
    eventLog: structuredClone(eventLog),
  };
}

function confidenceFor(attempts: number): DiagnosticConfidence {
  if (attempts >= 20) return "strong";
  if (attempts >= 8) return "moderate";
  return "emerging";
}

function addToAccumulator(
  groups: Map<string, FeatureAccumulator>,
  value: string,
  correct: boolean,
  latencyMs: number | undefined,
): void {
  const group = groups.get(value) ?? {
    attempts: 0,
    errors: 0,
    latencies: [],
  };
  group.attempts++;
  if (!correct) group.errors++;
  if (isUsefulInterval(latencyMs)) group.latencies.push(latencyMs);
  groups.set(value, group);
}

function toFeatures(
  groups: Map<string, FeatureAccumulator>,
  overallErrorRate: number,
  baselineLatencyMs: number | undefined,
  minimumAttempts: number,
): DiagnosticFeature[] {
  const features: DiagnosticFeature[] = [];

  for (const [value, group] of groups) {
    if (group.attempts < minimumAttempts) continue;
    const medianLatencyMs = median(group.latencies);
    const adjustedErrorRate =
      (group.errors + overallErrorRate * PRIOR_WEIGHT) /
      (group.attempts + PRIOR_WEIGHT);
    const slowdown =
      medianLatencyMs === undefined ||
      baselineLatencyMs === undefined ||
      baselineLatencyMs === 0
        ? 0
        : medianLatencyMs / baselineLatencyMs - 1;
    const confidenceWeight = group.attempts / (group.attempts + 12);
    const score =
      confidenceWeight *
      (Math.max(0, adjustedErrorRate - overallErrorRate) * 3 +
        Math.max(0, slowdown));

    if (group.errors === 0 && slowdown < 0.1) continue;

    features.push({
      value,
      attempts: group.attempts,
      errors: group.errors,
      errorRate: group.errors / group.attempts,
      ...(medianLatencyMs === undefined ? {} : { medianLatencyMs }),
      slowdown,
      confidence: confidenceFor(group.attempts),
      score,
    });
  }

  return features.sort((a, b) => b.score - a.score || b.attempts - a.attempts);
}

export function buildDiagnosticProfile(
  sessions: DiagnosticSession[],
): DiagnosticProfile {
  const characterGroups = new Map<string, FeatureAccumulator>();
  const ngramGroups = new Map<string, FeatureAccumulator>();
  const confusionCounts = new Map<string, number>();
  const allObservations = sessions.flatMap((session) => session.observations);
  const allIntervals = allObservations
    .map((observation) => observation.intervalMs)
    .filter(isUsefulInterval);
  const baselineLatencyMs = median(allIntervals);
  const errors = allObservations.filter(
    (observation) => !observation.correct,
  ).length;
  const overallErrorRate =
    allObservations.length === 0 ? 0 : errors / allObservations.length;

  for (const observation of allObservations) {
    if (!/\s/u.test(observation.target)) {
      addToAccumulator(
        characterGroups,
        observation.target,
        observation.correct,
        observation.intervalMs,
      );
    }
    if (!observation.correct) {
      const key = `${observation.target}\u0000${observation.typed}`;
      confusionCounts.set(key, (confusionCounts.get(key) ?? 0) + 1);
    }
  }

  for (const session of sessions) {
    const observations = session.observations;
    for (let index = 1; index < observations.length; index++) {
      const previous = observations[index - 1];
      const current = observations[index];
      if (previous === undefined || current === undefined) continue;
      if (
        previous.wordIndex !== current.wordIndex ||
        current.charIndex !== previous.charIndex + 1 ||
        /\s/u.test(previous.target) ||
        /\s/u.test(current.target)
      ) {
        continue;
      }
      addToAccumulator(
        ngramGroups,
        previous.target + current.target,
        previous.correct && current.correct,
        current.testMs - previous.testMs,
      );
    }
  }

  const confusions = [...confusionCounts.entries()]
    .map(([key, count]) => {
      const [target = "", typed = ""] = key.split("\u0000");
      return { target, typed, count };
    })
    .sort((a, b) => b.count - a.count);

  return {
    sessionCount: sessions.length,
    observationCount: allObservations.length,
    correctionCount: sessions.reduce(
      (sum, session) => sum + session.correctionCount,
      0,
    ),
    overallErrorRate,
    ...(baselineLatencyMs === undefined ? {} : { baselineLatencyMs }),
    characters: toFeatures(
      characterGroups,
      overallErrorRate,
      baselineLatencyMs,
      2,
    ),
    ngrams: toFeatures(ngramGroups, overallErrorRate, baselineLatencyMs, 2),
    confusions,
  };
}

function getSessionBaselineLatency(
  sessions: DiagnosticSession[],
): number | undefined {
  return median(
    sessions
      .flatMap((session) => session.observations)
      .map((observation) => observation.intervalMs)
      .filter(isUsefulInterval),
  );
}

function buildPatternGroups(
  sessions: DiagnosticSession[],
  kind: DiagnosticPatternKind,
): Map<string, FeatureAccumulator> {
  const groups = new Map<string, FeatureAccumulator>();

  for (const session of sessions) {
    const observations = session.observations;
    if (kind === "character") {
      for (const observation of observations) {
        if (/\s/u.test(observation.target)) continue;
        addToAccumulator(
          groups,
          observation.target,
          observation.correct,
          observation.intervalMs,
        );
      }
      continue;
    }

    for (let index = 1; index < observations.length; index++) {
      const previous = observations[index - 1];
      const current = observations[index];
      if (
        previous === undefined ||
        current === undefined ||
        previous.wordIndex !== current.wordIndex ||
        current.charIndex !== previous.charIndex + 1 ||
        /\s/u.test(previous.target) ||
        /\s/u.test(current.target)
      ) {
        continue;
      }
      addToAccumulator(
        groups,
        previous.target + current.target,
        previous.correct && current.correct,
        current.testMs - previous.testMs,
      );
    }
  }

  return groups;
}

function toPatternPerformance(
  accumulator: FeatureAccumulator,
  baselineLatencyMs: number | undefined,
): DiagnosticPatternPerformance | undefined {
  const medianLatencyMs = median(accumulator.latencies);
  if (
    medianLatencyMs === undefined ||
    baselineLatencyMs === undefined ||
    baselineLatencyMs <= 0
  ) {
    return undefined;
  }

  const errorRate = accumulator.errors / accumulator.attempts;
  const relativeSpeed = Math.min(
    2,
    Math.max(0.25, baselineLatencyMs / medianLatencyMs),
  );
  const efficiency = Math.max(
    0,
    Math.min(200, (1 - errorRate) * relativeSpeed * 100),
  );

  return {
    attempts: accumulator.attempts,
    errors: accumulator.errors,
    errorRate,
    medianLatencyMs,
    efficiency,
  };
}

function getPatternTrend(
  sessions: DiagnosticSession[],
  currentSession: DiagnosticSession,
  kind: DiagnosticPatternKind,
  value: string,
): DiagnosticPatternTrendPoint[] {
  const trend: DiagnosticPatternTrendPoint[] = [];

  for (const session of sessions) {
    const group = buildPatternGroups([session], kind).get(value);
    if (group === undefined) continue;
    const performance = toPatternPerformance(
      group,
      getSessionBaselineLatency([session]),
    );
    if (performance === undefined) continue;
    trend.push({
      ...performance,
      sessionId: session.id,
      timestamp: session.timestamp,
      isCurrent: session.id === currentSession.id,
    });
  }

  return trend.slice(-MAX_PATTERN_TREND_SESSIONS);
}

/**
 * Compare patterns repeated in the current test with the user's earlier tests.
 * Efficiency is accuracy-adjusted speed relative to the user's own median
 * keystroke interval: 100 is typical, higher is better.
 */
export function buildDiagnosticPatternComparisons(
  sessions: DiagnosticSession[],
  currentSession: DiagnosticSession,
): DiagnosticPatternComparison[] {
  const previousSessions = sessions.filter(
    (session) =>
      session.id !== currentSession.id &&
      session.timestamp < currentSession.timestamp &&
      session.language === currentSession.language &&
      session.layout === currentSession.layout,
  );
  if (previousSessions.length === 0) return [];

  const orderedSessions = [...previousSessions, currentSession].sort(
    (a, b) => a.timestamp - b.timestamp,
  );
  const currentBaseline = getSessionBaselineLatency([currentSession]);
  const previousBaseline = getSessionBaselineLatency(previousSessions);
  const comparisons: DiagnosticPatternComparison[] = [];

  for (const kind of ["character", "pair"] as const) {
    const currentGroups = buildPatternGroups([currentSession], kind);
    const previousGroups = buildPatternGroups(previousSessions, kind);

    for (const [value, currentGroup] of currentGroups) {
      const previousGroup = previousGroups.get(value);
      if (previousGroup === undefined || previousGroup.attempts < 2) continue;
      const current = toPatternPerformance(currentGroup, currentBaseline);
      const previous = toPatternPerformance(previousGroup, previousBaseline);
      if (current === undefined || previous === undefined) continue;

      comparisons.push({
        value,
        kind,
        current,
        previous,
        efficiencyDelta: current.efficiency - previous.efficiency,
        errorRateDelta: current.errorRate - previous.errorRate,
        latencyDeltaMs: current.medianLatencyMs - previous.medianLatencyMs,
        confidence: confidenceFor(current.attempts + previous.attempts),
        trend: getPatternTrend(orderedSessions, currentSession, kind, value),
      });
    }
  }

  const weaknessScore = (comparison: DiagnosticPatternComparison): number => {
    const evidenceWeight = Math.min(1, comparison.previous.attempts / 12);
    const historicalWeakness =
      Math.max(0, 100 - comparison.previous.efficiency) +
      comparison.previous.errorRate * 200;
    const currentRegression = Math.max(0, -comparison.efficiencyDelta);
    return historicalWeakness * evidenceWeight + currentRegression * 0.5;
  };

  return comparisons.sort(
    (a, b) =>
      weaknessScore(b) - weaknessScore(a) ||
      b.previous.attempts - a.previous.attempts,
  );
}

export function getDiagnosticPracticeWords(
  session: DiagnosticSession,
  profile: DiagnosticProfile,
): string[] {
  const patterns = [
    ...profile.confusions.slice(0, 3).map((item) => item.target),
    ...profile.ngrams.slice(0, 3).map((item) => item.value),
    ...profile.characters.slice(0, 3).map((item) => item.value),
  ].filter((pattern) => pattern !== "");
  const incorrectWords = new Set(
    session.observations
      .filter((observation) => !observation.correct)
      .map((observation) => observation.word),
  );
  const targetWords = session.eventLog.context.targetWords.map(bareWord);
  const matchingWords = targetWords.filter(
    (word) =>
      incorrectWords.has(word) ||
      patterns.some((pattern) => word.includes(pattern)),
  );

  return [...new Set(matchingWords.filter((word) => word !== ""))].slice(0, 20);
}
