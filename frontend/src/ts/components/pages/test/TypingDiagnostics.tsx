import { createMemo, For, Show } from "solid-js";

import type { DiagnosticFeature } from "../../../diagnostics/types";

import { getConfig } from "../../../config/store";
import { captureDiagnosticSession } from "../../../diagnostics/service";
import {
  getDiagnosticsEnabled,
  getDiagnosticsError,
  getDiagnosticsStatus,
  getLatestDiagnostics,
  setDiagnosticsEnabled,
} from "../../../diagnostics/state";
import {
  getLastEventLog,
  getLastResult,
  getResultVisible,
} from "../../../states/test";
import * as PractiseWords from "../../../test/practise-words";
import * as TestLogic from "../../../test/test-logic";
import { Button } from "../../common/Button";
import { TypingAdvancedDiagnostics } from "./TypingAdvancedDiagnostics";
import { TypingPatternComparison } from "./TypingPatternComparison";

function formatPercent(value: number): string {
  return `${Math.round(value * 100)}%`;
}

function featureDetails(feature: DiagnosticFeature): string {
  const details = [
    `${feature.errors}/${feature.attempts} errors`,
    feature.confidence,
  ];
  if (feature.slowdown >= 0.05) {
    details.splice(1, 0, `${formatPercent(feature.slowdown)} slower`);
  }
  return details.join(" · ");
}

export function TypingDiagnostics() {
  const currentView = createMemo(() => {
    const view = getLatestDiagnostics();
    const result = getLastResult();
    if (view === null || result === null) return null;
    return view.session.timestamp === result.timestamp ? view : null;
  });

  const captureCurrentTest = async (): Promise<void> => {
    const eventLog = getLastEventLog();
    const result = getLastResult();
    if (eventLog === null || result === null) return;
    await captureDiagnosticSession(eventLog, {
      timestamp: result.timestamp,
      wpm: result.wpm,
      acc: result.acc,
      testDuration: result.testDuration,
      mode: result.mode,
      mode2: result.mode2,
      language: result.language,
      layout: getConfig.layout,
    });
  };

  const toggleDiagnostics = (): void => {
    const enabled = !getDiagnosticsEnabled();
    setDiagnosticsEnabled(enabled);
    if (enabled) void captureCurrentTest();
  };

  const practice = (): void => {
    const view = currentView();
    if (view !== null && PractiseWords.initDiagnostics(view.practiceWords)) {
      void TestLogic.restart({ practiseMissed: true });
    }
  };

  return (
    <Show when={getResultVisible()}>
      <section class="mt-6 grid w-full gap-4 border-t-2 border-sub-alt pt-6">
        <div class="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 class="text-xl text-text">typing diagnostics</h2>
            <div class="text-sm text-sub">
              Private typing-pattern analysis stored only in this browser.
            </div>
          </div>
          <Button
            variant="text"
            class="text-xl"
            active={getDiagnosticsEnabled()}
            aria-pressed={getDiagnosticsEnabled()}
            fa={{ icon: "fa-stethoscope", fixedWidth: true }}
            balloon={{
              text: getDiagnosticsEnabled()
                ? "turn typing diagnostics off"
                : "turn typing diagnostics on",
              position: "left",
            }}
            onClick={toggleDiagnostics}
          />
        </div>

        <Show
          when={getDiagnosticsEnabled()}
          fallback={
            <div class="grid gap-3 rounded bg-sub-alt p-4 text-text">
              <div>
                Analyze only Monkeytype test input, key timing, corrections,
                difficult characters, and letter pairs. Diagnostic data is never
                uploaded.
              </div>
              <div class="text-sm text-sub">
                Select the diagnostics icon above to turn local analysis on.
              </div>
            </div>
          }
        >
          <Show when={getDiagnosticsStatus() === "loading"}>
            <div class="text-sub">Analyzing this test…</div>
          </Show>

          <Show when={getDiagnosticsStatus() === "error"}>
            <div class="text-error">
              Local diagnostics could not be saved. {getDiagnosticsError()}
            </div>
          </Show>

          <Show when={currentView()} keyed>
            {(view) => (
              <>
                <div class="grid grid-cols-2 gap-3 sm:grid-cols-4">
                  <Metric label="sessions" value={view.profile.sessionCount} />
                  <Metric
                    label="observations"
                    value={view.profile.observationCount}
                  />
                  <Metric
                    label="error rate"
                    value={formatPercent(view.profile.overallErrorRate)}
                  />
                  <Metric
                    label="corrections"
                    value={view.profile.correctionCount}
                  />
                </div>

                <div class="grid gap-5 md:grid-cols-2">
                  <FeatureList
                    title="difficult characters"
                    features={view.profile.characters.slice(0, 4)}
                  />
                  <FeatureList
                    title="difficult letter pairs"
                    features={view.profile.ngrams.slice(0, 4)}
                  />
                </div>

                <Show when={view.profile.confusions[0]} keyed>
                  {(confusion) => (
                    <div class="text-sub">
                      Most frequent substitution:{" "}
                      <span class="font-mono text-text">
                        {confusion.target} → {confusion.typed}
                      </span>{" "}
                      ({confusion.count}{" "}
                      {confusion.count === 1 ? "time" : "times"})
                    </div>
                  )}
                </Show>

                <TypingPatternComparison comparisons={view.comparisons} />
                <TypingAdvancedDiagnostics analysis={view.advanced} />

                <div class="flex flex-wrap items-center gap-3">
                  <Button
                    text="practice these patterns"
                    fa={{ icon: "fa-dumbbell" }}
                    disabled={view.practiceWords.length === 0}
                    onClick={practice}
                  />
                  <div class="text-sm text-sub">
                    Pattern labels describe observed typing behavior, not a
                    medical or cognitive diagnosis.
                  </div>
                </div>
              </>
            )}
          </Show>
        </Show>
      </section>
    </Show>
  );
}

function Metric(props: { label: string; value: string | number }) {
  return (
    <div class="rounded bg-sub-alt p-3">
      <div class="text-sm text-sub">{props.label}</div>
      <div class="text-2xl text-text">{props.value}</div>
    </div>
  );
}

function FeatureList(props: { title: string; features: DiagnosticFeature[] }) {
  return (
    <div class="grid content-start gap-2">
      <h3 class="text-sub">{props.title}</h3>
      <Show
        when={props.features.length > 0}
        fallback={
          <div class="text-sm text-sub">
            No clear pattern yet. More tests will improve confidence.
          </div>
        }
      >
        <For each={props.features}>
          {(feature) => (
            <div class="flex items-baseline justify-between gap-4 border-b border-sub-alt py-2">
              <span class="font-mono text-xl text-text">{feature.value}</span>
              <span class="text-right text-sm text-sub">
                {featureDetails(feature)}
              </span>
            </div>
          )}
        </For>
      </Show>
    </div>
  );
}
