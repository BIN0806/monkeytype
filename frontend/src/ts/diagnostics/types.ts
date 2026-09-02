import type { Mode } from "@monkeytype/schemas/shared";
import type { EventLog } from "../test/events/types";

export const DIAGNOSTIC_SESSION_VERSION = 1;

export type DiagnosticObservation = {
  target: string;
  typed: string;
  correct: boolean;
  word: string;
  wordIndex: number;
  charIndex: number;
  testMs: number;
  intervalMs?: number;
  physicalCode?: string;
  dwellMs?: number;
  flightMs?: number;
};

export type DiagnosticSession = {
  id: string;
  version: typeof DIAGNOSTIC_SESSION_VERSION;
  timestamp: number;
  language: string;
  layout: string;
  mode: Mode;
  mode2: string;
  wpm: number;
  acc: number;
  testDuration: number;
  correctionCount: number;
  observations: DiagnosticObservation[];
  eventLog: EventLog;
};

export type DiagnosticConfidence = "emerging" | "moderate" | "strong";

export type DiagnosticFeature = {
  value: string;
  attempts: number;
  errors: number;
  errorRate: number;
  medianLatencyMs?: number;
  slowdown: number;
  confidence: DiagnosticConfidence;
  score: number;
};

export type DiagnosticConfusion = {
  target: string;
  typed: string;
  count: number;
};

export type DiagnosticProfile = {
  sessionCount: number;
  observationCount: number;
  correctionCount: number;
  overallErrorRate: number;
  baselineLatencyMs?: number;
  characters: DiagnosticFeature[];
  ngrams: DiagnosticFeature[];
  confusions: DiagnosticConfusion[];
};

export type DiagnosticPatternKind = "character" | "pair";

export type DiagnosticPatternPerformance = {
  attempts: number;
  errors: number;
  errorRate: number;
  medianLatencyMs: number;
  /** 100 is the user's typical accuracy-adjusted timing for that session set. */
  efficiency: number;
};

export type DiagnosticPatternTrendPoint = DiagnosticPatternPerformance & {
  sessionId: string;
  timestamp: number;
  isCurrent: boolean;
};

export type DiagnosticPatternComparison = {
  value: string;
  kind: DiagnosticPatternKind;
  current: DiagnosticPatternPerformance;
  previous: DiagnosticPatternPerformance;
  efficiencyDelta: number;
  errorRateDelta: number;
  latencyDeltaMs: number;
  confidence: DiagnosticConfidence;
  trend: DiagnosticPatternTrendPoint[];
};

export type DiagnosticPairPrediction = {
  value: string;
  attempts: number;
  errors: number;
  probability: number;
  confidence: DiagnosticConfidence;
};

export type DiagnosticHesitationPattern = {
  value: string;
  length: 2 | 3;
  attempts: number;
  medianDurationMs: number;
  addedHesitationMs: number;
  confidence: DiagnosticConfidence;
};

export type DiagnosticErrorEdge = {
  from: string;
  to: string;
  count: number;
  kind: "substitution" | "transposition";
};

export type DiagnosticErrorCluster = {
  id: string;
  members: string[];
  errors: number;
  substitutions: number;
  transpositions: number;
};

export type DiagnosticCorrectionCascade = {
  initialErrors: number;
  cascades: number;
  probability: number;
};

export type DiagnosticHand = "left" | "right";

export type DiagnosticFinger =
  | "left pinky"
  | "left ring"
  | "left middle"
  | "left index"
  | "right index"
  | "right middle"
  | "right ring"
  | "right pinky";

export type DiagnosticInputGroupPerformance = {
  id: string;
  label: string;
  current?: DiagnosticPatternPerformance;
  previous?: DiagnosticPatternPerformance;
  workloadShare: number;
};

export type DiagnosticSessionPhase = {
  progress: number;
  currentEfficiency: number;
  previousEfficiency?: number;
};

export type DiagnosticPatternOutlook = {
  value: string;
  kind: DiagnosticPatternKind;
  status: "emerging" | "improving" | "stable" | "deteriorating";
  slopePerSession: number;
  latestEfficiency: number;
  targetEfficiency: number;
  sessionsToTarget?: number;
};

export type DiagnosticKeyPerformance = {
  code: string;
  label: string;
  hand: DiagnosticHand;
  finger: DiagnosticFinger;
  attempts: number;
  errorRate: number;
  slowdown: number;
  workloadShare: number;
  severity: number;
};

export type DiagnosticPracticeRecommendation = {
  pattern: string;
  kind: DiagnosticPatternKind;
  words: string[];
  expectedGain: number;
  reason: string;
};

export type DiagnosticAdvancedAnalysis = {
  nextErrorPairs: DiagnosticPairPrediction[];
  hesitationPatterns: DiagnosticHesitationPattern[];
  errorEdges: DiagnosticErrorEdge[];
  errorClusters: DiagnosticErrorCluster[];
  correctionCascade: DiagnosticCorrectionCascade;
  hands: DiagnosticInputGroupPerformance[];
  fingers: DiagnosticInputGroupPerformance[];
  sessionPhases: DiagnosticSessionPhase[];
  patternOutlooks: DiagnosticPatternOutlook[];
  keys: DiagnosticKeyPerformance[];
  practiceRecommendations: DiagnosticPracticeRecommendation[];
};

export type DiagnosticView = {
  session: DiagnosticSession;
  profile: DiagnosticProfile;
  comparisons: DiagnosticPatternComparison[];
  advanced: DiagnosticAdvancedAnalysis;
  practiceWords: string[];
};

export type DiagnosticResult = {
  timestamp: number;
  wpm: number;
  acc: number;
  testDuration: number;
  mode: Mode;
  mode2: string;
  language: string;
  layout: string;
};
