import { describe, expect, it } from "vitest";
import { buildAdvancedDiagnostics } from "../../src/ts/diagnostics/advanced-analyzer";
import type {
  DiagnosticObservation,
  DiagnosticPatternComparison,
  DiagnosticSession,
} from "../../src/ts/diagnostics/types";
import type { EventLog } from "../../src/ts/test/events/types";

function inputEvent(
  testMs: number,
  inputType: "insertText" | "deleteContentBackward",
  options: { data?: string; correct?: boolean; charIndex?: number } = {},
): EventLog["events"][number] {
  if (inputType === "deleteContentBackward") {
    return {
      type: "input",
      testMs,
      data: {
        inputType,
        wordIndex: 0,
        charIndex: options.charIndex ?? 0,
        inputValue: "",
      },
    };
  }
  return {
    type: "input",
    testMs,
    data: {
      inputType,
      data: options.data ?? "",
      correct: options.correct ?? true,
      wordIndex: 0,
      charIndex: options.charIndex ?? 0,
      inputValue: options.data ?? "",
    },
  };
}

function observation(
  target: string,
  typed: string,
  charIndex: number,
  testMs: number,
  intervalMs: number | undefined,
  physicalCode: string,
): DiagnosticObservation {
  return {
    target,
    typed,
    correct: target === typed,
    word: "the",
    wordIndex: 0,
    charIndex,
    testMs,
    ...(intervalMs === undefined ? {} : { intervalMs }),
    physicalCode,
  };
}

function session(
  timestamp: number,
  observations: DiagnosticObservation[],
  events: EventLog["events"] = [],
): DiagnosticSession {
  return {
    id: String(timestamp),
    version: 1,
    timestamp,
    language: "english",
    layout: "default",
    mode: "words",
    mode2: "10",
    wpm: 60,
    acc: 90,
    testDuration: 10,
    correctionCount: events.filter(
      (event) =>
        event.type === "input" &&
        event.data.inputType === "deleteContentBackward",
    ).length,
    observations,
    eventLog: {
      version: 1,
      context: {
        targetWords: ["the "],
        mode: "words",
        mode2: "10",
        bailedOut: false,
        koreanStatus: false,
      },
      events,
    },
  };
}

function timedSession(
  timestamp: number,
  pairLatencyMs: number,
  hTyped: string,
): DiagnosticSession {
  return session(timestamp, [
    observation("t", "t", 0, 0, undefined, "KeyT"),
    observation("h", hTyped, 1, pairLatencyMs, pairLatencyMs, "KeyH"),
    observation("e", "e", 2, pairLatencyMs + 60, 60, "KeyE"),
  ]);
}

describe("advanced typing diagnostics", () => {
  it("predicts risky pairs and measures repeated hesitation and key balance", () => {
    const first = timedSession(1, 200, "x");
    const second = timedSession(2, 200, "x");
    const current = timedSession(3, 150, "h");
    const analysis = buildAdvancedDiagnostics(
      [first, second, current],
      current,
      [],
    );

    expect(analysis.nextErrorPairs[0]).toMatchObject({
      value: "th",
      attempts: 3,
      errors: 2,
    });
    expect(analysis.nextErrorPairs[0]?.probability).toBeGreaterThan(0);
    expect(
      analysis.hesitationPatterns.find((pattern) => pattern.value === "th"),
    ).toMatchObject({ length: 2, attempts: 3 });
    expect(analysis.hands.map((hand) => hand.id)).toEqual(["left", "right"]);
    expect(analysis.keys.find((key) => key.code === "KeyH")).toMatchObject({
      finger: "right index",
      attempts: 3,
    });
  });

  it("clusters substitutions and transpositions and estimates correction cascades", () => {
    const current = session(
      1,
      [
        observation("t", "h", 0, 10, undefined, "KeyH"),
        observation("h", "t", 1, 30, 20, "KeyT"),
        observation("e", "e", 2, 80, 50, "KeyE"),
      ],
      [
        inputEvent(10, "insertText", {
          data: "h",
          correct: false,
          charIndex: 0,
        }),
        inputEvent(20, "deleteContentBackward"),
        inputEvent(30, "insertText", {
          data: "t",
          correct: false,
          charIndex: 1,
        }),
        inputEvent(40, "deleteContentBackward"),
        inputEvent(50, "deleteContentBackward"),
        inputEvent(60, "insertText", {
          data: "t",
          correct: true,
          charIndex: 0,
        }),
        inputEvent(70, "insertText", {
          data: "h",
          correct: true,
          charIndex: 1,
        }),
      ],
    );
    const analysis = buildAdvancedDiagnostics([current], current, []);

    expect(analysis.errorEdges).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          from: "th",
          to: "ht",
          kind: "transposition",
        }),
        expect.objectContaining({
          from: "t",
          to: "h",
          kind: "substitution",
        }),
      ]),
    );
    expect(analysis.errorClusters[0]?.errors).toBeGreaterThan(0);
    expect(analysis.correctionCascade).toMatchObject({
      initialErrors: 1,
      cascades: 1,
      probability: 1,
    });
  });

  it("forecasts improving patterns and ranks matching practice words", () => {
    const first = timedSession(1, 180, "h");
    const second = timedSession(2, 140, "h");
    const current = timedSession(3, 100, "h");
    const comparison: DiagnosticPatternComparison = {
      value: "th",
      kind: "pair",
      current: {
        attempts: 2,
        errors: 0,
        errorRate: 0,
        medianLatencyMs: 100,
        efficiency: 80,
      },
      previous: {
        attempts: 8,
        errors: 1,
        errorRate: 0.125,
        medianLatencyMs: 160,
        efficiency: 50,
      },
      efficiencyDelta: 30,
      errorRateDelta: -0.125,
      latencyDeltaMs: -60,
      confidence: "moderate",
      trend: [
        {
          sessionId: "1",
          timestamp: 1,
          isCurrent: false,
          attempts: 2,
          errors: 0,
          errorRate: 0,
          medianLatencyMs: 180,
          efficiency: 40,
        },
        {
          sessionId: "2",
          timestamp: 2,
          isCurrent: false,
          attempts: 2,
          errors: 0,
          errorRate: 0,
          medianLatencyMs: 140,
          efficiency: 60,
        },
        {
          sessionId: "3",
          timestamp: 3,
          isCurrent: true,
          attempts: 2,
          errors: 0,
          errorRate: 0,
          medianLatencyMs: 100,
          efficiency: 80,
        },
      ],
    };
    const analysis = buildAdvancedDiagnostics(
      [first, second, current],
      current,
      [comparison],
    );

    expect(analysis.patternOutlooks[0]).toMatchObject({
      value: "th",
      status: "improving",
      slopePerSession: 20,
      sessionsToTarget: 1,
    });
    expect(analysis.practiceRecommendations[0]).toMatchObject({
      pattern: "th",
      words: ["the"],
    });
    expect(analysis.practiceRecommendations[0]?.expectedGain).toBeGreaterThan(
      0,
    );
  });
});
