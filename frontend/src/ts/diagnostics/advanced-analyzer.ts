import type {
  DiagnosticAdvancedAnalysis,
  DiagnosticConfidence,
  DiagnosticCorrectionCascade,
  DiagnosticErrorCluster,
  DiagnosticErrorEdge,
  DiagnosticFinger,
  DiagnosticHand,
  DiagnosticHesitationPattern,
  DiagnosticInputGroupPerformance,
  DiagnosticKeyPerformance,
  DiagnosticPairPrediction,
  DiagnosticPatternComparison,
  DiagnosticPatternOutlook,
  DiagnosticPatternPerformance,
  DiagnosticPracticeRecommendation,
  DiagnosticSession,
  DiagnosticSessionPhase,
} from "./types";
import type { TestEventNoMs } from "../test/events/types";

const MIN_INTERVAL_MS = 15;
const MAX_INTERVAL_MS = 2000;
const PREDICTION_PRIOR_WEIGHT = 8;
const PHASE_COUNT = 5;
const TARGET_EFFICIENCY = 100;

type Accumulator = {
  attempts: number;
  errors: number;
  latencies: number[];
};

type KeyAssignment = {
  label: string;
  hand: DiagnosticHand;
  finger: DiagnosticFinger;
};

const KEY_ASSIGNMENTS: Record<string, KeyAssignment> = {
  Backquote: { label: "`", hand: "left", finger: "left pinky" },
  Digit1: { label: "1", hand: "left", finger: "left pinky" },
  Digit2: { label: "2", hand: "left", finger: "left ring" },
  Digit3: { label: "3", hand: "left", finger: "left middle" },
  Digit4: { label: "4", hand: "left", finger: "left index" },
  Digit5: { label: "5", hand: "left", finger: "left index" },
  Digit6: { label: "6", hand: "right", finger: "right index" },
  Digit7: { label: "7", hand: "right", finger: "right index" },
  Digit8: { label: "8", hand: "right", finger: "right middle" },
  Digit9: { label: "9", hand: "right", finger: "right ring" },
  Digit0: { label: "0", hand: "right", finger: "right pinky" },
  Minus: { label: "-", hand: "right", finger: "right pinky" },
  Equal: { label: "=", hand: "right", finger: "right pinky" },
  KeyQ: { label: "q", hand: "left", finger: "left pinky" },
  KeyW: { label: "w", hand: "left", finger: "left ring" },
  KeyE: { label: "e", hand: "left", finger: "left middle" },
  KeyR: { label: "r", hand: "left", finger: "left index" },
  KeyT: { label: "t", hand: "left", finger: "left index" },
  KeyY: { label: "y", hand: "right", finger: "right index" },
  KeyU: { label: "u", hand: "right", finger: "right index" },
  KeyI: { label: "i", hand: "right", finger: "right middle" },
  KeyO: { label: "o", hand: "right", finger: "right ring" },
  KeyP: { label: "p", hand: "right", finger: "right pinky" },
  BracketLeft: { label: "[", hand: "right", finger: "right pinky" },
  BracketRight: { label: "]", hand: "right", finger: "right pinky" },
  KeyA: { label: "a", hand: "left", finger: "left pinky" },
  KeyS: { label: "s", hand: "left", finger: "left ring" },
  KeyD: { label: "d", hand: "left", finger: "left middle" },
  KeyF: { label: "f", hand: "left", finger: "left index" },
  KeyG: { label: "g", hand: "left", finger: "left index" },
  KeyH: { label: "h", hand: "right", finger: "right index" },
  KeyJ: { label: "j", hand: "right", finger: "right index" },
  KeyK: { label: "k", hand: "right", finger: "right middle" },
  KeyL: { label: "l", hand: "right", finger: "right ring" },
  Semicolon: { label: ";", hand: "right", finger: "right pinky" },
  Quote: { label: "'", hand: "right", finger: "right pinky" },
  KeyZ: { label: "z", hand: "left", finger: "left pinky" },
  KeyX: { label: "x", hand: "left", finger: "left ring" },
  KeyC: { label: "c", hand: "left", finger: "left middle" },
  KeyV: { label: "v", hand: "left", finger: "left index" },
  KeyB: { label: "b", hand: "left", finger: "left index" },
  KeyN: { label: "n", hand: "right", finger: "right index" },
  KeyM: { label: "m", hand: "right", finger: "right index" },
  Comma: { label: ",", hand: "right", finger: "right middle" },
  Period: { label: ".", hand: "right", finger: "right ring" },
  Slash: { label: "/", hand: "right", finger: "right pinky" },
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

function confidenceFor(attempts: number): DiagnosticConfidence {
  if (attempts >= 20) return "strong";
  if (attempts >= 8) return "moderate";
  return "emerging";
}

function emptyAccumulator(): Accumulator {
  return { attempts: 0, errors: 0, latencies: [] };
}

function addObservation(
  accumulator: Accumulator,
  correct: boolean,
  latencyMs: number | undefined,
): void {
  accumulator.attempts++;
  if (!correct) accumulator.errors++;
  if (isUsefulInterval(latencyMs)) accumulator.latencies.push(latencyMs);
}

function baselineLatency(sessions: DiagnosticSession[]): number | undefined {
  return median(
    sessions
      .flatMap((session) => session.observations)
      .map((observation) => observation.intervalMs)
      .filter(isUsefulInterval),
  );
}

function performance(
  accumulator: Accumulator | undefined,
  baselineMs: number | undefined,
): DiagnosticPatternPerformance | undefined {
  if (accumulator === undefined || accumulator.attempts === 0) return undefined;
  const medianLatencyMs = median(accumulator.latencies);
  if (
    medianLatencyMs === undefined ||
    baselineMs === undefined ||
    baselineMs <= 0
  ) {
    return undefined;
  }
  const errorRate = accumulator.errors / accumulator.attempts;
  const relativeSpeed = Math.min(
    2,
    Math.max(0.25, baselineMs / medianLatencyMs),
  );
  return {
    attempts: accumulator.attempts,
    errors: accumulator.errors,
    errorRate,
    medianLatencyMs,
    efficiency: Math.max(
      0,
      Math.min(200, (1 - errorRate) * relativeSpeed * 100),
    ),
  };
}

function forEachNgram(
  session: DiagnosticSession,
  length: 2 | 3,
  callback: (value: string, correct: boolean, durationMs: number) => void,
): void {
  const observations = session.observations;
  for (let start = 0; start <= observations.length - length; start++) {
    const sequence = observations.slice(start, start + length);
    const first = sequence[0];
    const last = sequence.at(-1);
    if (first === undefined || last === undefined) continue;
    const contiguous = sequence.every((observation, index) => {
      if (/\s/u.test(observation.target)) return false;
      return (
        observation.wordIndex === first.wordIndex &&
        observation.charIndex === first.charIndex + index
      );
    });
    if (!contiguous) continue;
    const durationMs = last.testMs - first.testMs;
    if (!isUsefulInterval(durationMs)) continue;
    callback(
      sequence.map((observation) => observation.target).join(""),
      sequence.every((observation) => observation.correct),
      durationMs,
    );
  }
}

function buildNextErrorPredictions(
  sessions: DiagnosticSession[],
): DiagnosticPairPrediction[] {
  const groups = new Map<string, Accumulator>();
  for (const session of sessions) {
    forEachNgram(session, 2, (value, correct, durationMs) => {
      const group = groups.get(value) ?? emptyAccumulator();
      addObservation(group, correct, durationMs);
      groups.set(value, group);
    });
  }
  const observations = sessions.flatMap((session) => session.observations);
  const overallErrorRate =
    observations.length === 0
      ? 0
      : observations.filter((observation) => !observation.correct).length /
        observations.length;

  return [...groups.entries()]
    .filter(([, group]) => group.attempts >= 3)
    .map(([value, group]) => ({
      value,
      attempts: group.attempts,
      errors: group.errors,
      probability:
        (group.errors + overallErrorRate * PREDICTION_PRIOR_WEIGHT) /
        (group.attempts + PREDICTION_PRIOR_WEIGHT),
      confidence: confidenceFor(group.attempts),
    }))
    .sort((a, b) => b.probability - a.probability || b.attempts - a.attempts)
    .slice(0, 6);
}

function buildHesitationPatterns(
  sessions: DiagnosticSession[],
): DiagnosticHesitationPattern[] {
  const groups = new Map<
    string,
    { length: 2 | 3; durations: number[]; hesitations: number[] }
  >();

  for (const session of sessions) {
    const sessionBaseline = baselineLatency([session]);
    if (sessionBaseline === undefined) continue;
    for (const length of [2, 3] as const) {
      forEachNgram(session, length, (value, _correct, durationMs) => {
        const key = `${length}:${value}`;
        const group = groups.get(key) ?? {
          length,
          durations: [],
          hesitations: [],
        };
        group.durations.push(durationMs);
        group.hesitations.push(durationMs - sessionBaseline * (length - 1));
        groups.set(key, group);
      });
    }
  }

  return [...groups.entries()]
    .filter(([, group]) => group.durations.length >= 2)
    .map(([key, group]) => ({
      value: key.slice(2),
      length: group.length,
      attempts: group.durations.length,
      medianDurationMs: median(group.durations) as number,
      addedHesitationMs: median(group.hesitations) as number,
      confidence: confidenceFor(group.durations.length),
    }))
    .filter((pattern) => pattern.addedHesitationMs >= 10)
    .sort(
      (a, b) =>
        b.addedHesitationMs - a.addedHesitationMs || b.attempts - a.attempts,
    )
    .slice(0, 8);
}

function buildErrorEdges(sessions: DiagnosticSession[]): DiagnosticErrorEdge[] {
  const counts = new Map<string, DiagnosticErrorEdge>();
  const add = (
    from: string,
    to: string,
    kind: DiagnosticErrorEdge["kind"],
  ): void => {
    const key = `${kind}\u0000${from}\u0000${to}`;
    const edge = counts.get(key) ?? { from, to, kind, count: 0 };
    edge.count++;
    counts.set(key, edge);
  };

  for (const session of sessions) {
    for (const observation of session.observations) {
      if (
        observation.correct ||
        observation.target === observation.typed ||
        /\s/u.test(observation.target) ||
        /\s/u.test(observation.typed)
      ) {
        continue;
      }
      add(observation.target, observation.typed, "substitution");
    }

    for (let index = 1; index < session.observations.length; index++) {
      const previous = session.observations[index - 1];
      const current = session.observations[index];
      if (
        previous === undefined ||
        current === undefined ||
        previous.correct ||
        current.correct ||
        previous.wordIndex !== current.wordIndex ||
        current.charIndex !== previous.charIndex + 1 ||
        previous.target === current.target ||
        previous.typed !== current.target ||
        current.typed !== previous.target
      ) {
        continue;
      }
      add(
        previous.target + current.target,
        previous.typed + current.typed,
        "transposition",
      );
    }
  }

  return [...counts.values()].sort((a, b) => b.count - a.count).slice(0, 12);
}

function buildErrorClusters(
  edges: DiagnosticErrorEdge[],
): DiagnosticErrorCluster[] {
  const parent = new Map<string, string>();
  const find = (value: string): string => {
    const current = parent.get(value);
    if (current === undefined) {
      parent.set(value, value);
      return value;
    }
    if (current === value) return value;
    const root = find(current);
    parent.set(value, root);
    return root;
  };
  const union = (left: string, right: string): void => {
    const leftRoot = find(left);
    const rightRoot = find(right);
    if (leftRoot !== rightRoot) parent.set(rightRoot, leftRoot);
  };

  for (const edge of edges) union(edge.from, edge.to);
  const members = new Map<string, Set<string>>();
  for (const value of parent.keys()) {
    const root = find(value);
    const set = members.get(root) ?? new Set<string>();
    set.add(value);
    members.set(root, set);
  }

  return [...members.entries()]
    .map(([id, values]) => {
      const clusterEdges = edges.filter(
        (edge) => find(edge.from) === id || find(edge.to) === id,
      );
      return {
        id,
        members: [...values].sort(),
        errors: clusterEdges.reduce((sum, edge) => sum + edge.count, 0),
        substitutions: clusterEdges
          .filter((edge) => edge.kind === "substitution")
          .reduce((sum, edge) => sum + edge.count, 0),
        transpositions: clusterEdges
          .filter((edge) => edge.kind === "transposition")
          .reduce((sum, edge) => sum + edge.count, 0),
      };
    })
    .sort((a, b) => b.errors - a.errors)
    .slice(0, 5);
}

function buildCorrectionCascade(
  sessions: DiagnosticSession[],
): DiagnosticCorrectionCascade {
  let initialErrors = 0;
  let cascades = 0;

  for (const session of sessions) {
    const inputs = session.eventLog.events.filter(
      (event): event is Extract<TestEventNoMs, { type: "input" }> =>
        event.type === "input" && event.data.automatic !== true,
    );
    for (let index = 0; index < inputs.length; index++) {
      const event = inputs[index];
      if (event?.data.inputType !== "insertText" || event.data.correct) {
        continue;
      }
      initialErrors++;
      let deletes = 0;
      let additionalErrors = 0;
      let correctStreak = 0;
      let windowEnd = index;
      for (let nextIndex = index + 1; nextIndex < inputs.length; nextIndex++) {
        const next = inputs[nextIndex];
        if (next === undefined || next.testMs - event.testMs > 2000) break;
        windowEnd = nextIndex;
        if (
          next.data.inputType === "deleteContentBackward" ||
          next.data.inputType === "deleteWordBackward"
        ) {
          deletes++;
          correctStreak = 0;
          continue;
        }
        if (next.data.inputType !== "insertText") continue;
        if (!next.data.correct) {
          additionalErrors++;
          correctStreak = 0;
        } else {
          correctStreak++;
          if (correctStreak >= 2) break;
        }
      }
      if (deletes >= 2 || (deletes >= 1 && additionalErrors >= 1)) cascades++;
      index = windowEnd;
    }
  }

  return {
    initialErrors,
    cascades,
    probability: initialErrors === 0 ? 0 : cascades / initialErrors,
  };
}

function groupInputPerformance(
  currentSession: DiagnosticSession,
  previousSessions: DiagnosticSession[],
  property: "hand" | "finger",
): DiagnosticInputGroupPerformance[] {
  const currentGroups = new Map<string, Accumulator>();
  const previousGroups = new Map<string, Accumulator>();
  const addSession = (
    session: DiagnosticSession,
    groups: Map<string, Accumulator>,
  ): void => {
    for (const observation of session.observations) {
      if (observation.physicalCode === undefined) continue;
      const assignment = KEY_ASSIGNMENTS[observation.physicalCode];
      if (assignment === undefined) continue;
      const id = assignment[property];
      const group = groups.get(id) ?? emptyAccumulator();
      addObservation(group, observation.correct, observation.intervalMs);
      groups.set(id, group);
    }
  };
  addSession(currentSession, currentGroups);
  for (const session of previousSessions) addSession(session, previousGroups);
  const currentBaseline = baselineLatency([currentSession]);
  const previousBaseline = baselineLatency(previousSessions);
  const totalCurrentAttempts = [...currentGroups.values()].reduce(
    (sum, group) => sum + group.attempts,
    0,
  );

  return [...currentGroups.entries()]
    .map(([id, group]) => ({
      id,
      label: id,
      current: performance(group, currentBaseline),
      previous: performance(previousGroups.get(id), previousBaseline),
      workloadShare:
        totalCurrentAttempts === 0 ? 0 : group.attempts / totalCurrentAttempts,
    }))
    .sort((a, b) => a.label.localeCompare(b.label));
}

function buildSessionPhases(
  currentSession: DiagnosticSession,
  previousSessions: DiagnosticSession[],
): DiagnosticSessionPhase[] {
  const phaseGroups = (sessions: DiagnosticSession[]): Accumulator[] => {
    const groups = Array.from({ length: PHASE_COUNT }, emptyAccumulator);
    for (const session of sessions) {
      const count = session.observations.length;
      session.observations.forEach((observation, index) => {
        const phase = Math.min(
          PHASE_COUNT - 1,
          Math.floor((index / Math.max(count, 1)) * PHASE_COUNT),
        );
        const group = groups[phase];
        if (group !== undefined) {
          addObservation(group, observation.correct, observation.intervalMs);
        }
      });
    }
    return groups;
  };
  const currentGroups = phaseGroups([currentSession]);
  const previousGroups = phaseGroups(previousSessions);
  const currentBaseline = baselineLatency([currentSession]);
  const previousBaseline = baselineLatency(previousSessions);

  return currentGroups.flatMap((group, index) => {
    const current = performance(group, currentBaseline);
    if (current === undefined) return [];
    const previous = performance(previousGroups[index], previousBaseline);
    return [
      {
        progress: Math.round(((index + 0.5) / PHASE_COUNT) * 100),
        currentEfficiency: current.efficiency,
        ...(previous === undefined
          ? {}
          : { previousEfficiency: previous.efficiency }),
      },
    ];
  });
}

function linearSlope(values: number[]): number {
  if (values.length < 2) return 0;
  const xMean = (values.length - 1) / 2;
  const yMean = values.reduce((sum, value) => sum + value, 0) / values.length;
  let numerator = 0;
  let denominator = 0;
  values.forEach((value, index) => {
    numerator += (index - xMean) * (value - yMean);
    denominator += (index - xMean) ** 2;
  });
  return denominator === 0 ? 0 : numerator / denominator;
}

function buildPatternOutlooks(
  comparisons: DiagnosticPatternComparison[],
): DiagnosticPatternOutlook[] {
  return comparisons.slice(0, 8).map((comparison) => {
    const values = comparison.trend.map((point) => point.efficiency);
    const slopePerSession = linearSlope(values);
    const first = values[0] ?? comparison.current.efficiency;
    const latestEfficiency = values.at(-1) ?? comparison.current.efficiency;
    let status: DiagnosticPatternOutlook["status"] = "stable";
    if (values.length < 3) {
      status = "emerging";
    } else if (slopePerSession >= 2 && latestEfficiency - first >= 5) {
      status = "improving";
    } else if (slopePerSession <= -2 && latestEfficiency - first <= -5) {
      status = "deteriorating";
    }
    const sessionsToTarget =
      latestEfficiency >= TARGET_EFFICIENCY
        ? 0
        : values.length >= 3 && slopePerSession > 1
          ? Math.min(
              50,
              Math.ceil(
                (TARGET_EFFICIENCY - latestEfficiency) / slopePerSession,
              ),
            )
          : undefined;
    return {
      value: comparison.value,
      kind: comparison.kind,
      status,
      slopePerSession,
      latestEfficiency,
      targetEfficiency: TARGET_EFFICIENCY,
      ...(sessionsToTarget === undefined ? {} : { sessionsToTarget }),
    };
  });
}

function mostCommonLabel(
  sessionGroups: DiagnosticSession[],
  code: string,
  fallback: string,
): string {
  const counts = new Map<string, number>();
  for (const observation of sessionGroups.flatMap(
    (session) => session.observations,
  )) {
    if (observation.physicalCode !== code || /\s/u.test(observation.target)) {
      continue;
    }
    counts.set(observation.target, (counts.get(observation.target) ?? 0) + 1);
  }
  return [...counts.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? fallback;
}

function buildKeyPerformance(
  sessions: DiagnosticSession[],
): DiagnosticKeyPerformance[] {
  const groups = new Map<string, Accumulator>();
  for (const session of sessions) {
    for (const observation of session.observations) {
      const code = observation.physicalCode;
      if (code === undefined || KEY_ASSIGNMENTS[code] === undefined) continue;
      const group = groups.get(code) ?? emptyAccumulator();
      addObservation(group, observation.correct, observation.intervalMs);
      groups.set(code, group);
    }
  }
  const baseline = baselineLatency(sessions);
  const totalAttempts = [...groups.values()].reduce(
    (sum, group) => sum + group.attempts,
    0,
  );
  const expectedShare = groups.size === 0 ? 0 : 1 / groups.size;

  return [...groups.entries()].flatMap(([code, group]) => {
    const assignment = KEY_ASSIGNMENTS[code];
    const keyPerformance = performance(group, baseline);
    if (assignment === undefined || keyPerformance === undefined) return [];
    const slowdown =
      baseline === undefined || baseline === 0
        ? 0
        : keyPerformance.medianLatencyMs / baseline - 1;
    const workloadShare =
      totalAttempts === 0 ? 0 : group.attempts / totalAttempts;
    const overload = Math.max(0, workloadShare - expectedShare);
    return [
      {
        code,
        label: mostCommonLabel(sessions, code, assignment.label),
        hand: assignment.hand,
        finger: assignment.finger,
        attempts: group.attempts,
        errorRate: keyPerformance.errorRate,
        slowdown,
        workloadShare,
        severity: Math.min(
          1,
          keyPerformance.errorRate * 2.5 +
            Math.max(0, slowdown) * 0.75 +
            overload * 2,
        ),
      },
    ];
  });
}

function bareWord(word: string): string {
  return word.replace(/[ \n]$/, "");
}

function buildPracticeRecommendations(
  currentSession: DiagnosticSession,
  comparisons: DiagnosticPatternComparison[],
  outlooks: DiagnosticPatternOutlook[],
): DiagnosticPracticeRecommendation[] {
  const words = [
    ...new Set(
      currentSession.eventLog.context.targetWords
        .map(bareWord)
        .filter((word) => word !== ""),
    ),
  ];
  const confidenceWeight: Record<DiagnosticConfidence, number> = {
    emerging: 0.45,
    moderate: 0.72,
    strong: 1,
  };

  return comparisons
    .flatMap((comparison) => {
      const matchingWords = words
        .filter((word) => word.includes(comparison.value))
        .slice(0, 5);
      if (matchingWords.length === 0) return [];
      const outlook = outlooks.find(
        (item) =>
          item.kind === comparison.kind && item.value === comparison.value,
      );
      const gap = Math.max(
        0,
        TARGET_EFFICIENCY - comparison.current.efficiency,
      );
      const trendGain = Math.max(0, outlook?.slopePerSession ?? 0);
      const expectedGain = Math.min(
        15,
        Math.max(1, trendGain, gap * 0.15) *
          confidenceWeight[comparison.confidence],
      );
      const reason =
        outlook?.status === "deteriorating"
          ? "Recent sessions are moving away from your baseline."
          : outlook?.status === "improving"
            ? "This pattern is improving and focused repetition may reinforce it."
            : comparison.current.errorRate > comparison.previous.errorRate
              ? "Errors increased in the current session."
              : "Timing remains less efficient than your personal baseline.";
      return [
        {
          pattern: comparison.value,
          kind: comparison.kind,
          words: matchingWords,
          expectedGain,
          reason,
        },
      ];
    })
    .sort((a, b) => b.expectedGain - a.expectedGain)
    .slice(0, 5);
}

export function buildAdvancedDiagnostics(
  sessions: DiagnosticSession[],
  currentSession: DiagnosticSession,
  comparisons: DiagnosticPatternComparison[],
): DiagnosticAdvancedAnalysis {
  const previousSessions = sessions.filter(
    (session) =>
      session.id !== currentSession.id &&
      session.timestamp < currentSession.timestamp &&
      session.language === currentSession.language &&
      session.layout === currentSession.layout,
  );
  const allSessions = [...previousSessions, currentSession].sort(
    (a, b) => a.timestamp - b.timestamp,
  );
  const errorEdges = buildErrorEdges(allSessions);
  const patternOutlooks = buildPatternOutlooks(comparisons);

  return {
    nextErrorPairs: buildNextErrorPredictions(allSessions),
    hesitationPatterns: buildHesitationPatterns(allSessions),
    errorEdges,
    errorClusters: buildErrorClusters(errorEdges),
    correctionCascade: buildCorrectionCascade(allSessions),
    hands: groupInputPerformance(currentSession, previousSessions, "hand"),
    fingers: groupInputPerformance(currentSession, previousSessions, "finger"),
    sessionPhases: buildSessionPhases(currentSession, previousSessions),
    patternOutlooks,
    keys: buildKeyPerformance(allSessions),
    practiceRecommendations: buildPracticeRecommendations(
      currentSession,
      comparisons,
      patternOutlooks,
    ),
  };
}

export function getDiagnosticKeyAssignment(
  code: string,
): KeyAssignment | undefined {
  return KEY_ASSIGNMENTS[code];
}
