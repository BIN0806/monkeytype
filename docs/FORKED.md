# Forked Document: Local Typing Diagnostics

## Review status

This document is the review record for the uncommitted
`feature/typing-diagnostics` branch in the `BIN0806/monkeytype` fork. The work
described here must be read and approved before it is committed or pushed.

- [ ] I reviewed the captured data and local-storage behavior.
- [ ] I reviewed the calculations, predictions, and confidence labels.
- [ ] I reviewed the visualizations and personalized practice behavior.
- [ ] I reviewed the limitations and non-medical disclaimer.
- [ ] I approve committing and pushing these changes.

## Purpose

The fork adds an optional, privacy-first typing review to Monkeytype's result
page. It turns a completed test's input timing and correction history into an
interpretable personal profile: recurring weak characters and character
pairs, hesitation, likely error patterns, correction cascades, hand and finger
balance, within-test warm-up or fatigue, longer-term trends, and focused
practice suggestions.

This milestone does **not** add a trained machine-learning model or an ML
framework. There is no TensorFlow, PyTorch, or scikit-learn dependency. The
implementation is an on-device, statistical and feature-engineering baseline
that can support later model training once enough consented data exists. Its
outputs are estimates and hypotheses, not medical or cognitive diagnoses.

The upstream GPL-3.0 license, notices, and Git history remain unchanged.

## User experience

1. A **local typing diagnostics** panel appears on the test-result page.
2. Collection is off until the user explicitly enables it.
3. After an enabled test finishes, analysis runs in the browser and the result
   is saved locally.
4. The panel shows the current result, recurring weak patterns, comparisons
   with earlier matching tests, advanced visualizations, and a written review.
5. **Practice these patterns** starts a shuffled custom test made from relevant
   words in the completed test. A maximum of 20 unique words is used, and the
   practice length is at least 10 words.
6. The user can pause future collection from the result panel. Pausing does not
   delete sessions already stored in the browser.

No Monkeytype account, backend, MongoDB, Redis, or Firebase account is required
for this feature. Account-dependent Monkeytype features remain separate from
the local analysis.

## Data captured and retained

When diagnostics are enabled, each completed test stores a versioned session
record in the browser's IndexedDB database named `typing-diagnostics-db`.

| Data | Why it is used |
| --- | --- |
| Target character, typed character, correctness, word, and position | Error, substitution, transposition, character, and n-gram analysis |
| Test-relative timestamp and inter-key interval | Speed, hesitation, efficiency, and session-phase analysis |
| Physical `KeyboardEvent.code`, when available | Approximate hand, finger, and keyboard-position analysis |
| Key dwell and flight times, when derivable | Retained as timing features for analysis and later model work |
| Manual correction count | Correction behavior summary |
| WPM, accuracy, duration, mode, language, and layout | Session context and matching comparable history |
| The completed test event log | Reconstructing input and correction sequences |

The opt-in preference is stored separately in `localStorage` under
`typingDiagnosticsEnabled`. Sessions are kept only in the local browser and
are not sent to Monkeytype, the fork owner, or another service by this code.
Analysis compares only sessions with the same language and configured layout.
The oldest records are automatically pruned after 500 stored sessions.

The current implementation does not yet provide an export, selective-delete,
or delete-all control. Clearing the site's browser data removes the local
records. Development smoke testing also inserted synthetic diagnostic sessions
into the local development origin (`127.0.0.1:3000`); those records are test
data rather than the user's measured typing history.

## Analysis definitions

### Observations and timing

- Only non-automatic `insertText` input events are converted to character
  observations. Composition/IME input is excluded from this baseline.
- A physical key-down is paired with an input event only when it can be matched
  within 250 ms.
- Timing intervals outside the useful 0–2,000 ms range are excluded from timing
  statistics.
- Medians are used instead of means to reduce the influence of isolated pauses.
- Confidence is labeled **emerging** below 8 attempts, **moderate** from 8 to 19
  attempts, and **strong** at 20 or more attempts.

### Weak characters and n-grams

Character, bigram, and trigram groups track attempts, errors, median latency,
and slowdown against the user's median interval. Error estimates are shrunk
toward the user's overall error rate so a tiny sample does not dominate the
ranking. A weakness score combines excess error rate, slowdown, and evidence
weight. Patterns with no errors and less than 10% slowdown are omitted.

### Relative efficiency and session comparison

Relative efficiency combines accuracy with timing against the user's own
session baseline:

```text
relative speed = clamp(baseline median / pattern median, 0.25, 2.0)
efficiency = clamp((1 - error rate) * relative speed * 100, 0, 200)
```

An efficiency of 100 means typical personal, accuracy-adjusted timing for that
session set; it is not a population percentile. Higher is better. The current
session is compared with earlier same-language, same-layout sessions for
patterns that appear in both. Charts retain at most the latest 12 trend points.

### Predictions and advanced indicators

- **Next-error pair:** character pairs with at least 3 observations are ranked
  by a smoothed error probability. The smoothing prior has a weight of 8 and
  uses the user's overall error rate.
- **Expected hesitation:** bigrams and trigrams with at least 2 observations
  are compared with the session baseline. Only patterns adding at least 10 ms
  are shown.
- **Substitution and transposition clusters:** intended-to-typed substitutions
  and reversed adjacent pairs become weighted connections, then connected
  characters are grouped into up to 5 clusters.
- **Correction cascade:** after an initial error, a 2-second window is examined.
  A cascade means at least 2 deletions, or at least 1 deletion plus another
  error. Each detected chain is counted once.
- **Hand and finger balance:** physical key codes are mapped to standard keyboard
  positions. Accuracy-adjusted efficiency and current workload are compared by
  hand and finger.
- **Warm-up/fatigue curve:** each test is divided into 5 equal observation bins.
  Current efficiency is plotted against previous matching sessions by progress
  through the test.
- **Trend status:** a linear slope over available efficiency points labels a
  pattern emerging when fewer than 3 points exist, improving at a slope of at
  least +2 points/session and a total gain of at least 5, deteriorating at the
  opposite thresholds, or stable otherwise.
- **Sessions to target:** when at least 3 points exist and the slope exceeds +1,
  the current linear trend is extrapolated to 100 efficiency, capped at 50
  sessions. No estimate is shown without sufficient positive evidence.
- **Keyboard severity:** error rate, slowdown, and unusually high workload are
  combined into a bounded 0–1 display score.
- **Practice opportunity:** relevant words from the completed test are ranked by
  efficiency gap, recent slope, and confidence. The displayed potential gain is
  a bounded heuristic (maximum 15 efficiency points), not a guaranteed outcome.

## Visualizations and written feedback

The result panel adds:

- current-versus-previous pattern efficiency bars;
- a selectable per-pattern efficiency trend line;
- expected hesitation bars for bigrams and trigrams;
- a current-versus-history warm-up/fatigue curve;
- left/right hand efficiency bars and per-finger comparisons;
- a keyboard heatmap for errors, hesitation, and workload severity;
- an intended-versus-typed confusion network;
- substitution and transposition cluster summaries;
- correction-cascade probability;
- improving, stable, deteriorating, or emerging pattern outlooks;
- estimated sessions to reach the personal target when evidence permits; and
- ranked personalized practice recommendations with plain-language reasons.

Empty or low-evidence states are handled explicitly rather than manufacturing a
prediction. The interface also states that the findings describe observed
keyboard behavior and cannot diagnose dyslexia or another condition.

## Files changed

| File | Responsibility |
| --- | --- |
| `frontend/src/html/pages/test-result.html` | Adds the diagnostics mount point to the result page |
| `frontend/src/ts/components/mount.tsx` | Registers the SolidJS diagnostics component |
| `frontend/src/ts/test/test-logic.ts` | Starts an asynchronous local capture after a test completes |
| `frontend/src/ts/test/practise-words.ts` | Reuses practice setup and adds diagnostics-targeted custom practice |
| `frontend/src/ts/diagnostics/types.ts` | Defines versioned session, profile, comparison, prediction, visualization, and practice types |
| `frontend/src/ts/diagnostics/state.ts` | Holds opt-in, loading, error, and latest-analysis state |
| `frontend/src/ts/diagnostics/storage.ts` | Stores and prunes local IndexedDB sessions |
| `frontend/src/ts/diagnostics/analyzer.ts` | Extracts observations, profiles weak patterns, compares sessions, and selects practice words |
| `frontend/src/ts/diagnostics/advanced-analyzer.ts` | Builds predictions, clusters, cascades, input-group balance, curves, forecasts, heatmap data, and recommendations |
| `frontend/src/ts/diagnostics/service.ts` | Coordinates opt-in capture, storage, matching history, analysis, and UI state |
| `frontend/src/ts/components/pages/test/TypingDiagnostics.tsx` | Provides the opt-in panel, summary, privacy language, review, and practice action |
| `frontend/src/ts/components/pages/test/TypingPatternComparison.tsx` | Renders current/history pattern comparisons and trends |
| `frontend/src/ts/components/pages/test/TypingAdvancedDiagnostics.tsx` | Renders the advanced charts, heatmap, network, clusters, outlooks, and recommendations |
| `frontend/__tests__/diagnostics/analyzer.spec.ts` | Tests event extraction, profiling, comparisons, and practice selection |
| `frontend/__tests__/diagnostics/advanced-analyzer.spec.ts` | Tests prediction, hesitation, input balance, error clustering, cascades, forecasts, and recommendations |
| `docs/FORKED.md` | Records the fork's behavior, data use, calculations, limitations, files, and verification |

## Validation completed

The implementation was checked with the repository-pinned Node 24.11.0 and pnpm
11.21.0 versions.

- Frontend test suite: **56 files and 1,083 tests passed**.
- Frontend type-aware lint and type checking: **passed**.
- Frontend production build: **passed** (480 files processed and no circular
  dependency found).
- Live local smoke test: the result page rendered the stored-history review,
  seven canvas charts, keyboard heatmap, confusion network, clusters, outlooks,
  and personalized practice content.
- Feature-specific browser errors: **none observed**.

The build still reports upstream/environment warnings for stale Browserslist
data, a Font Awesome Sass deprecation, and large generated chunks. With the
blank local Firebase configuration, the development browser also reports the
expected unavailable Firebase/backend messages and existing SolidJS
module-scope warnings. These are not introduced diagnostics failures.

Useful verification commands from the repository root are:

```sh
pnpm --filter @monkeytype/frontend test
pnpm --filter @monkeytype/frontend lint
pnpm --filter @monkeytype/frontend build
pnpm --filter @monkeytype/frontend dev
```

## Known limitations and next steps

- Results become more meaningful only after repeated exposure to the same
  patterns; early confidence is intentionally low.
- The physical hand/finger mapping assumes standard keyboard positions. It does
  not infer the user's actual fingering technique, and displayed character
  layouts may differ from those physical positions.
- Forecasts are linear extrapolations, not causal predictions or promises about
  learning speed.
- Error clusters use interpretable graph connectivity, not a trained clustering
  model.
- Practice words are restricted to words present in the just-completed test.
- Timing and input extraction need additional validation for IMEs, mobile input,
  accessibility tools, and unusual keyboard layouts.
- A future privacy milestone should add in-product export and delete controls
  before considering any optional account synchronization.
- A future modeling milestone can compare this baseline with calibrated,
  on-device models only after defining evaluation data, minimum sample sizes,
  failure cases, and user-facing explanations.
