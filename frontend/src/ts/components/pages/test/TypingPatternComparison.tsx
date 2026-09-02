import { createMemo, createSignal, For, JSXElement, Show } from "solid-js";

import type { DiagnosticPatternComparison } from "../../../diagnostics/types";

import { getTheme } from "../../../states/theme";
import { Button } from "../../common/Button";
import { ChartJs } from "../../common/ChartJs";

function patternKey(comparison: DiagnosticPatternComparison): string {
  return `${comparison.kind}:${comparison.value}`;
}

function formatEfficiency(value: number): string {
  return `${Math.round(value)}%`;
}

function formatErrorRate(value: number): string {
  return `${Math.round(value * 100)}%`;
}

function signed(value: number, unit: string): string {
  const rounded = Math.round(value);
  return `${rounded > 0 ? "+" : ""}${rounded}${unit}`;
}

function review(comparison: DiagnosticPatternComparison): string {
  const efficiency = comparison.efficiencyDelta;
  const timing = comparison.latencyDeltaMs;
  const errors = comparison.errorRateDelta * 100;
  const efficiencyText =
    efficiency >= 6
      ? `${comparison.value} was more efficient than your previous average.`
      : efficiency <= -6
        ? `${comparison.value} was less efficient than your previous average.`
        : `${comparison.value} was close to your previous average.`;
  const timingText =
    timing <= -12
      ? `Your typical interval was ${Math.abs(Math.round(timing))} ms faster.`
      : timing >= 12
        ? `Your typical interval was ${Math.round(timing)} ms slower.`
        : "Your timing was steady.";
  const errorText =
    errors <= -1
      ? `Errors decreased by ${Math.abs(Math.round(errors))} percentage points.`
      : errors >= 1
        ? `Errors increased by ${Math.round(errors)} percentage points.`
        : "Accuracy was steady.";

  return `${efficiencyText} ${timingText} ${errorText}`;
}

export function TypingPatternComparison(props: {
  comparisons: DiagnosticPatternComparison[];
}): JSXElement {
  const visibleComparisons = createMemo(() => props.comparisons.slice(0, 6));
  const [selectedKey, setSelectedKey] = createSignal("");
  const selected = createMemo(
    () =>
      visibleComparisons().find(
        (comparison) => patternKey(comparison) === selectedKey(),
      ) ?? visibleComparisons()[0],
  );
  const selectedPatternKey = createMemo(() => {
    const comparison = selected();
    return comparison === undefined ? "" : patternKey(comparison);
  });

  const comparisonData = createMemo(() => ({
    labels: visibleComparisons().map((comparison) => comparison.value),
    datasets: [
      {
        label: "previous average",
        data: visibleComparisons().map(
          (comparison) => comparison.previous.efficiency,
        ),
        backgroundColor: getTheme().sub,
        borderColor: getTheme().sub,
        borderWidth: 0,
      },
      {
        label: "current session",
        data: visibleComparisons().map(
          (comparison) => comparison.current.efficiency,
        ),
        backgroundColor: getTheme().main,
        borderColor: getTheme().main,
        borderWidth: 0,
      },
    ],
  }));

  const trendData = createMemo(() => {
    const comparison = selected();
    if (comparison === undefined) return { labels: [], datasets: [] };
    return {
      labels: comparison.trend.map((_, index) => index + 1),
      datasets: [
        {
          label: `${comparison.value} efficiency`,
          data: comparison.trend.map((point) => point.efficiency),
          borderColor: getTheme().main,
          backgroundColor: getTheme().main,
          pointBackgroundColor: comparison.trend.map((point) =>
            point.isCurrent ? getTheme().main : getTheme().sub,
          ),
          pointRadius: comparison.trend.map((point) =>
            point.isCurrent ? 5 : 3,
          ),
          tension: 0.25,
          fill: false,
        },
        {
          label: "personal baseline",
          data: comparison.trend.map(() => 100),
          borderColor: getTheme().sub,
          backgroundColor: getTheme().sub,
          pointRadius: 0,
          borderDash: [6, 6],
          borderWidth: 1,
          tension: 0,
          fill: false,
        },
      ],
    };
  });

  return (
    <section class="grid gap-4 border-t border-sub-alt pt-5">
      <div>
        <h3 class="text-lg text-text">current session vs previous patterns</h3>
        <p class="text-sm text-sub">
          Relative efficiency combines accuracy and timing. 100% is your own
          typical performance; higher is better.
        </p>
      </div>

      <Show
        when={visibleComparisons().length > 0}
        fallback={
          <div class="rounded bg-sub-alt p-4 text-sm text-sub">
            No repeated pattern has enough history yet. Complete another test
            with some of the same characters or letter pairs to unlock the
            comparison graphs.
          </div>
        }
      >
        <div
          style={{
            height: `${Math.max(210, visibleComparisons().length * 42)}px`,
          }}
        >
          <ChartJs
            name="Pattern performance comparison"
            type="bar"
            data={comparisonData()}
            options={{
              responsive: true,
              maintainAspectRatio: false,
              indexAxis: "y",
              scales: {
                x: {
                  axis: "x",
                  beginAtZero: true,
                  suggestedMax: 120,
                  title: {
                    display: true,
                    text: "Relative efficiency (%)",
                  },
                },
                y: {
                  axis: "y",
                  grid: { display: false },
                },
              },
              plugins: {
                legend: {
                  labels: { color: getTheme().sub },
                },
                tooltip: {
                  intersect: false,
                  mode: "index",
                },
              },
            }}
          />
        </div>

        <div class="flex flex-wrap gap-1">
          <For each={visibleComparisons()}>
            {(comparison) => (
              <Button
                variant="text"
                text={`${comparison.value} ${comparison.kind}`}
                active={patternKey(comparison) === selectedPatternKey()}
                onClick={() => setSelectedKey(patternKey(comparison))}
              />
            )}
          </For>
        </div>

        <Show when={selected()} keyed>
          {(comparison) => (
            <div class="grid gap-4 rounded bg-sub-alt p-4">
              <div class="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <h3 class="font-mono text-xl text-main">
                    {comparison.value}
                  </h3>
                  <p class="text-sm text-sub">{review(comparison)}</p>
                </div>
                <span class="text-sm text-sub">
                  {comparison.confidence} confidence · {comparison.kind}
                </span>
              </div>

              <div class="grid grid-cols-2 gap-3 sm:grid-cols-4">
                <ComparisonMetric
                  label="current efficiency"
                  value={formatEfficiency(comparison.current.efficiency)}
                  detail={signed(comparison.efficiencyDelta, " pts")}
                />
                <ComparisonMetric
                  label="current errors"
                  value={formatErrorRate(comparison.current.errorRate)}
                  detail={`${formatErrorRate(comparison.previous.errorRate)} before`}
                />
                <ComparisonMetric
                  label="current timing"
                  value={`${Math.round(comparison.current.medianLatencyMs)} ms`}
                  detail={`${Math.round(comparison.previous.medianLatencyMs)} ms before`}
                />
                <ComparisonMetric
                  label="evidence"
                  value={`${comparison.current.attempts} now`}
                  detail={`${comparison.previous.attempts} previous`}
                />
              </div>

              <div>
                <div class="mb-2 text-sm text-sub">
                  Pattern efficiency across sessions
                </div>
                <div style={{ height: "220px" }}>
                  <ChartJs
                    name={`${comparison.value} efficiency trend`}
                    type="line"
                    data={trendData()}
                    options={{
                      responsive: true,
                      maintainAspectRatio: false,
                      scales: {
                        x: {
                          axis: "x",
                          title: { display: true, text: "Repeated sessions" },
                        },
                        y: {
                          axis: "y",
                          beginAtZero: true,
                          suggestedMax: 120,
                          title: {
                            display: true,
                            text: "Relative efficiency (%)",
                          },
                        },
                      },
                      plugins: {
                        legend: {
                          labels: { color: getTheme().sub },
                        },
                        tooltip: {
                          intersect: false,
                          mode: "index",
                        },
                      },
                    }}
                  />
                </div>
              </div>
            </div>
          )}
        </Show>
      </Show>
    </section>
  );
}

function ComparisonMetric(props: {
  label: string;
  value: string;
  detail: string;
}): JSXElement {
  return (
    <div>
      <div class="text-xs text-sub">{props.label}</div>
      <div class="text-xl text-text">{props.value}</div>
      <div class="text-xs text-sub">{props.detail}</div>
    </div>
  );
}
