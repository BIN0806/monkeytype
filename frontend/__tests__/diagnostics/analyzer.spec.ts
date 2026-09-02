import { describe, expect, it } from "vitest";
import {
  buildDiagnosticPatternComparisons,
  buildDiagnosticProfile,
  createDiagnosticSession,
  extractDiagnosticObservations,
  getDiagnosticPracticeWords,
} from "../../src/ts/diagnostics/analyzer";
import type {
  DiagnosticObservation,
  DiagnosticResult,
  DiagnosticSession,
} from "../../src/ts/diagnostics/types";
import type { EventLog } from "../../src/ts/test/events/types";

function eventLog(): EventLog {
  return {
    version: 1,
    context: {
      targetWords: ["the "],
      mode: "words",
      mode2: "10",
      bailedOut: false,
      koreanStatus: false,
    },
    events: [
      { type: "keydown", testMs: 0, data: { code: "KeyT" } },
      {
        type: "input",
        testMs: 10,
        data: {
          inputType: "insertText",
          data: "t",
          correct: true,
          wordIndex: 0,
          charIndex: 0,
          inputValue: "t",
        },
      },
      { type: "keyup", testMs: 60, data: { code: "KeyT" } },
      { type: "keydown", testMs: 70, data: { code: "KeyX" } },
      {
        type: "input",
        testMs: 80,
        data: {
          inputType: "insertText",
          data: "x",
          correct: false,
          wordIndex: 0,
          charIndex: 1,
          inputValue: "tx",
        },
      },
      { type: "keyup", testMs: 120, data: { code: "KeyX" } },
      { type: "keydown", testMs: 130, data: { code: "Backspace" } },
      {
        type: "input",
        testMs: 140,
        data: {
          inputType: "deleteContentBackward",
          wordIndex: 0,
          charIndex: 2,
          inputValue: "t",
        },
      },
      { type: "keyup", testMs: 160, data: { code: "Backspace" } },
      { type: "keydown", testMs: 170, data: { code: "KeyH" } },
      {
        type: "input",
        testMs: 180,
        data: {
          inputType: "insertText",
          data: "h",
          correct: true,
          wordIndex: 0,
          charIndex: 1,
          inputValue: "th",
        },
      },
      { type: "keyup", testMs: 220, data: { code: "KeyH" } },
      { type: "keydown", testMs: 230, data: { code: "KeyE" } },
      {
        type: "input",
        testMs: 240,
        data: {
          inputType: "insertText",
          data: "e",
          correct: true,
          wordIndex: 0,
          charIndex: 2,
          inputValue: "the",
        },
      },
      { type: "keyup", testMs: 280, data: { code: "KeyE" } },
    ],
  };
}

function result(timestamp: number): DiagnosticResult {
  return {
    timestamp,
    wpm: 60,
    acc: 75,
    testDuration: 1,
    mode: "words",
    mode2: "10",
    language: "english",
    layout: "default",
  };
}

function patternSession(
  timestamp: number,
  pairLatencyMs: number,
): DiagnosticSession {
  const session = createDiagnosticSession(eventLog(), result(timestamp));
  const observations: DiagnosticObservation[] = [
    {
      target: "a",
      typed: "a",
      correct: true,
      word: "athe",
      wordIndex: 0,
      charIndex: 0,
      testMs: 0,
    },
    {
      target: "t",
      typed: "t",
      correct: true,
      word: "athe",
      wordIndex: 0,
      charIndex: 1,
      testMs: 60,
      intervalMs: 60,
    },
    {
      target: "h",
      typed: "h",
      correct: true,
      word: "athe",
      wordIndex: 0,
      charIndex: 2,
      testMs: 60 + pairLatencyMs,
      intervalMs: pairLatencyMs,
    },
    {
      target: "e",
      typed: "e",
      correct: true,
      word: "athe",
      wordIndex: 0,
      charIndex: 3,
      testMs: 120 + pairLatencyMs,
      intervalMs: 60,
    },
  ];
  session.observations = observations;
  return session;
}

describe("typing diagnostics analyzer", () => {
  it("extracts substitutions, corrections, dwell, and flight timing", () => {
    const extracted = extractDiagnosticObservations(eventLog());

    expect(extracted.correctionCount).toBe(1);
    expect(extracted.observations).toHaveLength(4);
    expect(extracted.observations[0]).toMatchObject({
      target: "t",
      typed: "t",
      physicalCode: "KeyT",
      dwellMs: 60,
    });
    expect(extracted.observations[1]).toMatchObject({
      target: "h",
      typed: "x",
      correct: false,
      physicalCode: "KeyX",
      dwellMs: 50,
      flightMs: 10,
    });
  });

  it("builds evidence-weighted character, n-gram, and confusion profiles", () => {
    const first = createDiagnosticSession(eventLog(), result(1));
    const second = createDiagnosticSession(eventLog(), result(2));
    const profile = buildDiagnosticProfile([first, second]);

    expect(profile.sessionCount).toBe(2);
    expect(profile.observationCount).toBe(8);
    expect(profile.correctionCount).toBe(2);
    expect(profile.confusions[0]).toEqual({
      target: "h",
      typed: "x",
      count: 2,
    });
    expect(profile.characters[0]).toMatchObject({
      value: "h",
      attempts: 4,
      errors: 2,
      confidence: "emerging",
    });
    expect(profile.ngrams.some((feature) => feature.value === "th")).toBe(true);
  });

  it("selects current test words containing weak patterns", () => {
    const session = createDiagnosticSession(eventLog(), result(1));
    const profile = buildDiagnosticProfile([session, session]);

    expect(getDiagnosticPracticeWords(session, profile)).toEqual(["the"]);
  });

  it("compares repeated current patterns with previous session efficiency", () => {
    const first = patternSession(1, 150);
    const second = patternSession(2, 150);
    const current = patternSession(3, 90);
    const comparisons = buildDiagnosticPatternComparisons(
      [first, second, current],
      current,
    );
    const pair = comparisons.find(
      (comparison) => comparison.kind === "pair" && comparison.value === "th",
    );

    expect(pair).toBeDefined();
    expect(pair?.previous).toMatchObject({
      attempts: 2,
      medianLatencyMs: 150,
      efficiency: 40,
    });
    expect(pair?.current.attempts).toBe(1);
    expect(pair?.current.medianLatencyMs).toBe(90);
    expect(pair?.efficiencyDelta).toBeCloseTo(26.67, 1);
    expect(pair?.latencyDeltaMs).toBe(-60);
    expect(pair?.trend).toHaveLength(3);
    expect(pair?.trend.at(-1)?.isCurrent).toBe(true);
  });
});
