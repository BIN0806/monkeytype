import { createMemo, For, JSXElement, Show } from "solid-js";

import type {
  DiagnosticAdvancedAnalysis,
  DiagnosticErrorEdge,
  DiagnosticFinger,
  DiagnosticKeyPerformance,
  DiagnosticPatternOutlook,
} from "../../../diagnostics/types";

import { getTheme } from "../../../states/theme";
import { ChartJs } from "../../common/ChartJs";

const KEYBOARD_ROWS = [
  [
    ["Backquote", "`"],
    ["Digit1", "1"],
    ["Digit2", "2"],
    ["Digit3", "3"],
    ["Digit4", "4"],
    ["Digit5", "5"],
    ["Digit6", "6"],
    ["Digit7", "7"],
    ["Digit8", "8"],
    ["Digit9", "9"],
    ["Digit0", "0"],
    ["Minus", "-"],
    ["Equal", "="],
  ],
  [
    ["KeyQ", "q"],
    ["KeyW", "w"],
    ["KeyE", "e"],
    ["KeyR", "r"],
    ["KeyT", "t"],
    ["KeyY", "y"],
    ["KeyU", "u"],
    ["KeyI", "i"],
    ["KeyO", "o"],
    ["KeyP", "p"],
    ["BracketLeft", "["],
    ["BracketRight", "]"],
  ],
  [
    ["KeyA", "a"],
    ["KeyS", "s"],
    ["KeyD", "d"],
    ["KeyF", "f"],
    ["KeyG", "g"],
    ["KeyH", "h"],
    ["KeyJ", "j"],
    ["KeyK", "k"],
    ["KeyL", "l"],
    ["Semicolon", ";"],
    ["Quote", "'"],
  ],
  [
    ["KeyZ", "z"],
    ["KeyX", "x"],
    ["KeyC", "c"],
    ["KeyV", "v"],
    ["KeyB", "b"],
    ["KeyN", "n"],
    ["KeyM", "m"],
    ["Comma", ","],
    ["Period", "."],
    ["Slash", "/"],
  ],
] as const;

function formatPercent(value: number): string {
  return `${Math.round(value * 100)}%`;
}

function formatEfficiency(value: number): string {
  return `${Math.round(value)}%`;
}

function signed(value: number, suffix: string): string {
  const rounded = Math.round(value);
  return `${rounded > 0 ? "+" : ""}${rounded}${suffix}`;
}

function outlookClass(status: DiagnosticPatternOutlook["status"]): string {
  if (status === "improving") return "text-main";
  if (status === "deteriorating") return "text-error";
  return "text-sub";
}

export function TypingAdvancedDiagnostics(props: {
  analysis: DiagnosticAdvancedAnalysis;
}): JSXElement {
  const nextError = createMemo(() => props.analysis.nextErrorPairs[0]);
  const forecast = createMemo(() =>
    props.analysis.patternOutlooks.find(
      (outlook) => outlook.sessionsToTarget !== undefined,
    ),
  );
  const busiestFinger = createMemo(
    () =>
      [...props.analysis.fingers].sort(
        (a, b) => b.workloadShare - a.workloadShare,
      )[0],
  );
  const nextErrorDetail = createMemo(() => {
    const prediction = nextError();
    return prediction === undefined
      ? "needs more repeated pairs"
      : `${formatPercent(prediction.probability)} estimated risk · ${prediction.confidence}`;
  });
  const forecastValue = createMemo(() => {
    const outlook = forecast();
    if (outlook?.sessionsToTarget === undefined) return "—";
    return outlook.sessionsToTarget === 0
      ? "at target"
      : `~${outlook.sessionsToTarget} sessions`;
  });
  const forecastDetail = createMemo(() => {
    const outlook = forecast();
    return outlook === undefined
      ? "needs a positive multi-session trend"
      : `${outlook.value} toward ${outlook.targetEfficiency}% efficiency`;
  });

  return (
    <section class="grid gap-6 border-t-2 border-sub-alt pt-6">
      <div>
        <h3 class="text-xl text-text">predictive pattern analysis</h3>
        <p class="text-sm text-sub">
          Interpretable estimates based on your local typing history. Emerging
          predictions should be treated as hypotheses, not conclusions.
        </p>
      </div>

      <div class="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <SummaryMetric
          label="next-error candidate"
          value={nextError()?.value ?? "—"}
          detail={nextErrorDetail()}
        />
        <SummaryMetric
          label="correction-cascade risk"
          value={formatPercent(props.analysis.correctionCascade.probability)}
          detail={`${props.analysis.correctionCascade.cascades}/${props.analysis.correctionCascade.initialErrors} initial errors cascaded`}
        />
        <SummaryMetric
          label="practice forecast"
          value={forecastValue()}
          detail={forecastDetail()}
        />
      </div>

      <div class="grid gap-6 lg:grid-cols-2">
        <HesitationChart analysis={props.analysis} />
        <SessionPhaseChart analysis={props.analysis} />
      </div>

      <div class="grid gap-6 lg:grid-cols-2">
        <HandAndFingerView analysis={props.analysis} />
        <div class="grid content-start gap-2">
          <h3 class="text-lg text-text">physical-key heatmap</h3>
          <p class="text-sm text-sub">
            Stronger color combines errors, hesitation, and unusually high
            workload. Labels follow the characters observed on your layout.
          </p>
          <KeyboardHeatmap keys={props.analysis.keys} />
          <Show when={busiestFinger()} keyed>
            {(finger) => (
              <p class="text-sm text-sub">
                Highest current workload: {finger.label} (
                {formatPercent(finger.workloadShare)} of measured keystrokes).
              </p>
            )}
          </Show>
        </div>
      </div>

      <div class="grid gap-6 lg:grid-cols-2">
        <ConfusionNetwork edges={props.analysis.errorEdges} />
        <ErrorClusters analysis={props.analysis} />
      </div>

      <div class="grid gap-6 lg:grid-cols-2">
        <PatternOutlooks analysis={props.analysis} />
        <PracticeRecommendations analysis={props.analysis} />
      </div>

      <p class="text-sm text-sub">
        These estimates describe typing behavior only. They cannot identify
        dyslexia or any medical, neurological, or cognitive condition.
      </p>
    </section>
  );
}

function SummaryMetric(props: {
  label: string;
  value: string;
  detail: string;
}): JSXElement {
  return (
    <div class="rounded bg-sub-alt p-3">
      <div class="text-sm text-sub">{props.label}</div>
      <div class="font-mono text-2xl text-main">{props.value}</div>
      <div class="text-xs text-sub">{props.detail}</div>
    </div>
  );
}

function HesitationChart(props: {
  analysis: DiagnosticAdvancedAnalysis;
}): JSXElement {
  const patterns = createMemo(() =>
    props.analysis.hesitationPatterns.slice(0, 6),
  );
  const data = createMemo(() => ({
    labels: patterns().map(
      (pattern) => `${pattern.value} (${pattern.length}-gram)`,
    ),
    datasets: [
      {
        label: "added hesitation (ms)",
        data: patterns().map((pattern) => pattern.addedHesitationMs),
        backgroundColor: getTheme().main,
        borderColor: getTheme().main,
        borderWidth: 0,
      },
    ],
  }));

  return (
    <div class="grid content-start gap-2">
      <h3 class="text-lg text-text">expected hesitation</h3>
      <p class="text-sm text-sub">
        Added time for repeated bigrams and trigrams compared with your normal
        inter-key timing.
      </p>
      <Show
        when={patterns().length > 0}
        fallback={<EmptyAnalysis text="No repeated hesitation pattern yet." />}
      >
        <div style={{ height: `${Math.max(220, patterns().length * 42)}px` }}>
          <ChartJs
            name="Expected pattern hesitation"
            type="bar"
            data={data()}
            options={{
              responsive: true,
              maintainAspectRatio: false,
              indexAxis: "y",
              scales: {
                x: {
                  axis: "x",
                  beginAtZero: true,
                  title: { display: true, text: "Added hesitation (ms)" },
                },
                y: { axis: "y", grid: { display: false } },
              },
              plugins: {
                legend: { display: false },
                tooltip: { intersect: false, mode: "index" },
              },
            }}
          />
        </div>
      </Show>
    </div>
  );
}

function SessionPhaseChart(props: {
  analysis: DiagnosticAdvancedAnalysis;
}): JSXElement {
  const phases = createMemo(() => props.analysis.sessionPhases);
  const data = createMemo(() => ({
    labels: phases().map((phase) => `${phase.progress}%`),
    datasets: [
      {
        label: "current session",
        data: phases().map((phase) => phase.currentEfficiency),
        borderColor: getTheme().main,
        backgroundColor: getTheme().main,
        pointBackgroundColor: getTheme().main,
        tension: 0.25,
        fill: false,
      },
      {
        label: "previous sessions",
        data: phases().map((phase) => phase.previousEfficiency ?? 0),
        borderColor: getTheme().sub,
        backgroundColor: getTheme().sub,
        pointBackgroundColor: getTheme().sub,
        borderDash: [6, 6],
        tension: 0.25,
        fill: false,
      },
    ],
  }));

  return (
    <div class="grid content-start gap-2">
      <h3 class="text-lg text-text">warm-up and fatigue curve</h3>
      <p class="text-sm text-sub">
        Relative efficiency from the beginning to the end of the test.
      </p>
      <Show
        when={phases().length > 1}
        fallback={
          <EmptyAnalysis text="This test is too short for a phase curve." />
        }
      >
        <div style={{ height: "260px" }}>
          <ChartJs
            name="Warm-up and fatigue"
            type="line"
            data={data()}
            options={{
              responsive: true,
              maintainAspectRatio: false,
              scales: {
                x: {
                  axis: "x",
                  title: { display: true, text: "Test progress" },
                },
                y: {
                  axis: "y",
                  beginAtZero: true,
                  suggestedMax: 120,
                  title: { display: true, text: "Relative efficiency (%)" },
                },
              },
              plugins: {
                legend: { labels: { color: getTheme().sub } },
                tooltip: { intersect: false, mode: "index" },
              },
            }}
          />
        </div>
      </Show>
    </div>
  );
}

function HandAndFingerView(props: {
  analysis: DiagnosticAdvancedAnalysis;
}): JSXElement {
  const hands = createMemo(() => props.analysis.hands);
  const handData = createMemo(() => ({
    labels: hands().map((hand) => hand.label),
    datasets: [
      {
        label: "previous average",
        data: hands().map((hand) => hand.previous?.efficiency ?? 0),
        backgroundColor: getTheme().sub,
        borderColor: getTheme().sub,
        borderWidth: 0,
      },
      {
        label: "current session",
        data: hands().map((hand) => hand.current?.efficiency ?? 0),
        backgroundColor: getTheme().main,
        borderColor: getTheme().main,
        borderWidth: 0,
      },
    ],
  }));

  return (
    <div class="grid content-start gap-3">
      <div>
        <h3 class="text-lg text-text">hand and finger balance</h3>
        <p class="text-sm text-sub">
          Physical-key performance, independent of the displayed keyboard
          layout.
        </p>
      </div>
      <Show
        when={hands().length > 0}
        fallback={<EmptyAnalysis text="Physical-key timing is unavailable." />}
      >
        <div style={{ height: "190px" }}>
          <ChartJs
            name="Hand efficiency"
            type="bar"
            data={handData()}
            options={{
              responsive: true,
              maintainAspectRatio: false,
              scales: {
                x: { axis: "x", grid: { display: false } },
                y: {
                  axis: "y",
                  beginAtZero: true,
                  suggestedMax: 120,
                  title: { display: true, text: "Relative efficiency (%)" },
                },
              },
              plugins: {
                legend: { labels: { color: getTheme().sub } },
                tooltip: { intersect: false, mode: "index" },
              },
            }}
          />
        </div>
        <div class="grid gap-2">
          <For each={props.analysis.fingers}>
            {(finger) => (
              <FingerRow
                finger={finger.label as DiagnosticFinger}
                current={finger.current?.efficiency}
                previous={finger.previous?.efficiency}
                workload={finger.workloadShare}
              />
            )}
          </For>
        </div>
      </Show>
    </div>
  );
}

function FingerRow(props: {
  finger: DiagnosticFinger;
  current?: number;
  previous?: number;
  workload: number;
}): JSXElement {
  return (
    <div class="grid grid-cols-[1fr_auto] items-center gap-x-3 gap-y-1 text-sm">
      <span class="text-text">{props.finger}</span>
      <span class="text-sub">
        {props.current === undefined ? "—" : formatEfficiency(props.current)}
        <Show when={props.previous !== undefined}>
          {` · ${formatEfficiency(props.previous as number)} before`}
        </Show>
        {` · ${formatPercent(props.workload)} load`}
      </span>
      <div class="col-span-2 h-1.5 overflow-hidden rounded bg-sub-alt">
        <div
          class="h-full rounded bg-main"
          style={{ width: `${Math.min(100, props.current ?? 0)}%` }}
        ></div>
      </div>
    </div>
  );
}

function KeyboardHeatmap(props: {
  keys: DiagnosticKeyPerformance[];
}): JSXElement {
  const keyMap = createMemo(
    () => new Map(props.keys.map((key) => [key.code, key])),
  );
  const keyTitle = (
    key: DiagnosticKeyPerformance | undefined,
    fallback: string,
  ): string => {
    if (key === undefined) return `${fallback}: no observations`;
    return `${key.label}: ${formatPercent(key.errorRate)} errors, ${signed(key.slowdown * 100, "% slower")}, ${key.attempts} attempts, ${key.finger}`;
  };

  return (
    <div
      class="grid gap-1 overflow-hidden rounded bg-bg p-2"
      role="img"
      aria-label="Physical keyboard performance heatmap"
    >
      <For each={KEYBOARD_ROWS}>
        {(row, rowIndex) => (
          <div
            class="flex gap-1"
            style={{
              "padding-left": `${rowIndex() * 1.3}rem`,
              "padding-right": `${rowIndex() * 0.6}rem`,
            }}
          >
            <For each={row}>
              {([code, fallback]) => {
                const key = () => keyMap().get(code);
                const intensity = (): number => {
                  const performance = key();
                  return performance === undefined
                    ? 0
                    : Math.round(15 + performance.severity * 70);
                };
                return (
                  <div
                    class="min-w-0 flex-1 rounded p-2 text-center font-mono text-sm text-text"
                    style={{
                      "background-color":
                        intensity() === 0
                          ? "var(--sub-alt-color)"
                          : `color-mix(in srgb, var(--error-color) ${intensity()}%, var(--sub-alt-color))`,
                    }}
                    title={keyTitle(key(), fallback)}
                  >
                    {key()?.label ?? fallback}
                  </div>
                );
              }}
            </For>
          </div>
        )}
      </For>
      <div class="mt-1 flex items-center justify-end gap-2 text-xs text-sub">
        <span>low concern</span>
        <span class="h-2 w-14 bg-gradient-to-r from-sub-alt to-error"></span>
        <span>high concern</span>
      </div>
    </div>
  );
}

function ConfusionNetwork(props: { edges: DiagnosticErrorEdge[] }): JSXElement {
  const edges = createMemo(() => props.edges.slice(0, 10));
  const nodes = createMemo(() => [
    ...new Set(edges().flatMap((edge) => [edge.from, edge.to])),
  ]);
  const positions = createMemo(
    () =>
      new Map(
        nodes().map((node, index) => {
          const angle = (index / Math.max(nodes().length, 1)) * Math.PI * 2;
          return [
            node,
            {
              x: 300 + Math.cos(angle) * 220,
              y: 145 + Math.sin(angle) * 95,
            },
          ];
        }),
      ),
  );
  const maxCount = createMemo(() =>
    Math.max(1, ...edges().map((edge) => edge.count)),
  );

  return (
    <div class="grid content-start gap-2">
      <h3 class="text-lg text-text">confusion network</h3>
      <p class="text-sm text-sub">
        Connections show intended patterns and what was typed instead. Yellow
        dashed lines are transpositions; red lines are substitutions.
      </p>
      <Show
        when={edges().length > 0}
        fallback={
          <EmptyAnalysis text="No confusion relationship recorded yet." />
        }
      >
        <svg
          viewBox="0 0 600 290"
          class="w-full rounded bg-sub-alt"
          role="img"
          aria-label="Network of intended and typed character confusions"
        >
          <title>Typing confusion network</title>
          <desc>
            Intended characters and patterns connected to their substitutions
            and transpositions.
          </desc>
          <For each={edges()}>
            {(edge) => {
              const from = () => positions().get(edge.from);
              const to = () => positions().get(edge.to);
              return (
                <line
                  x1={from()?.x}
                  y1={from()?.y}
                  x2={to()?.x}
                  y2={to()?.y}
                  stroke={
                    edge.kind === "transposition"
                      ? "var(--main-color)"
                      : "var(--error-color)"
                  }
                  style={{
                    "stroke-width": `${1 + (edge.count / maxCount()) * 5}px`,
                    "stroke-dasharray":
                      edge.kind === "transposition" ? "8 6" : undefined,
                  }}
                  opacity="0.8"
                >
                  <title>{`${edge.from} → ${edge.to}: ${edge.count} ${edge.kind}${edge.count === 1 ? "" : "s"}`}</title>
                </line>
              );
            }}
          </For>
          <For each={nodes()}>
            {(node) => {
              const position = () => positions().get(node);
              return (
                <g>
                  <circle
                    cx={position()?.x}
                    cy={position()?.y}
                    r="23"
                    fill="var(--bg-color)"
                    stroke="var(--sub-color)"
                    style={{ "stroke-width": "2px" }}
                  ></circle>
                  <text
                    x={position()?.x}
                    y={(position()?.y ?? 0) + 5}
                    style={{ "text-anchor": "middle" }}
                    fill="var(--text-color)"
                    class="font-mono text-base"
                  >
                    {node}
                  </text>
                </g>
              );
            }}
          </For>
        </svg>
      </Show>
    </div>
  );
}

function ErrorClusters(props: {
  analysis: DiagnosticAdvancedAnalysis;
}): JSXElement {
  return (
    <div class="grid content-start gap-2">
      <h3 class="text-lg text-text">substitution and transposition clusters</h3>
      <p class="text-sm text-sub">
        Connected mistakes are grouped so related habits can be practiced
        together.
      </p>
      <Show
        when={props.analysis.errorClusters.length > 0}
        fallback={<EmptyAnalysis text="No recurring error cluster yet." />}
      >
        <div class="grid gap-2">
          <For each={props.analysis.errorClusters}>
            {(cluster) => (
              <div class="flex items-start justify-between gap-3 border-b border-sub-alt py-2">
                <span class="font-mono text-lg text-text">
                  {cluster.members.join(" ↔ ")}
                </span>
                <span class="text-right text-sm text-sub">
                  {cluster.errors} errors · {cluster.substitutions}{" "}
                  substitutions · {cluster.transpositions} transpositions
                </span>
              </div>
            )}
          </For>
        </div>
      </Show>
    </div>
  );
}

function PatternOutlooks(props: {
  analysis: DiagnosticAdvancedAnalysis;
}): JSXElement {
  return (
    <div class="grid content-start gap-2">
      <h3 class="text-lg text-text">weak-pattern outlook</h3>
      <p class="text-sm text-sub">
        Multi-session direction and a simple linear estimate to your personal
        100% baseline.
      </p>
      <Show
        when={props.analysis.patternOutlooks.length > 0}
        fallback={
          <EmptyAnalysis text="Complete more repeated-pattern tests to estimate direction." />
        }
      >
        <For each={props.analysis.patternOutlooks.slice(0, 6)}>
          {(outlook) => (
            <div class="grid grid-cols-[auto_1fr_auto] items-baseline gap-3 border-b border-sub-alt py-2">
              <span class="font-mono text-lg text-text">{outlook.value}</span>
              <span class={outlookClass(outlook.status)}>
                {outlook.status} ·{" "}
                {signed(outlook.slopePerSession, " pts/session")}
              </span>
              <span class="text-right text-sm text-sub">
                {outlook.sessionsToTarget === undefined
                  ? "forecast pending"
                  : outlook.sessionsToTarget === 0
                    ? "at target"
                    : `~${outlook.sessionsToTarget} sessions`}
              </span>
            </div>
          )}
        </For>
      </Show>
    </div>
  );
}

function PracticeRecommendations(props: {
  analysis: DiagnosticAdvancedAnalysis;
}): JSXElement {
  return (
    <div class="grid content-start gap-2">
      <h3 class="text-lg text-text">personalized practice</h3>
      <p class="text-sm text-sub">
        Ranked by current weakness, evidence, recent direction, and words
        available from this test.
      </p>
      <Show
        when={props.analysis.practiceRecommendations.length > 0}
        fallback={
          <EmptyAnalysis text="No targeted practice recommendation is ready." />
        }
      >
        <For each={props.analysis.practiceRecommendations}>
          {(recommendation) => (
            <div class="grid gap-1 border-b border-sub-alt py-2">
              <div class="flex items-baseline justify-between gap-3">
                <span class="font-mono text-lg text-main">
                  {recommendation.pattern}
                </span>
                <span class="text-sm text-sub">
                  ~+{recommendation.expectedGain.toFixed(1)} efficiency-point
                  opportunity
                </span>
              </div>
              <span class="text-sm text-sub">{recommendation.reason}</span>
              <span class="font-mono text-sm text-text">
                {recommendation.words.join(" · ")}
              </span>
            </div>
          )}
        </For>
      </Show>
    </div>
  );
}

function EmptyAnalysis(props: { text: string }): JSXElement {
  return (
    <div class="rounded bg-sub-alt p-4 text-sm text-sub">{props.text}</div>
  );
}
