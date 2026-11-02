# Verification record

Date: **2026-11-02**, revised the same day after a repository review. All executed
checks ran locally on Windows x64. This record is limited to the repository and its
local synthetic demonstration. No commercial provider account, external map style,
production dataset, or deployed GitHub project was exercised.

The previous version of this file is superseded. It recorded 11 tests and 4 browser
checks against a validator that measured only structure and three UI contrast pairs;
the numbers below are from the current tree.

## Environment

- Python 3.13.6; validation tools declare Python 3.10+ compatibility.
- Node 24.19.0, npm 11.12.1.
- Leaflet 1.9.4, Vite 8.3.5, Playwright 1.64.1, pinned in the npm lockfile.
- Playwright Chromium / Chrome for Testing 156.0.8078.4.
- Desktop browser viewport: 1440 × 1000 CSS px.
- Narrow browser viewport: 390 × 844 CSS px; this is desktop Chromium viewport
  emulation, not a physical mobile device or a complete touch-gesture test.

## Remote execution on GitHub Actions

The pushes that carried these changes ran the workflows, so the CI claims below are
observations rather than configuration.

| Run | Jobs | Result |
| --- | --- | --- |
| `41407753875` Validate project | `skill-and-themes (ubuntu-latest, 3.10)`, `skill-and-themes (windows-latest, 3.13)`, `demo` | all succeeded |
| `41408067158` Check citations (push) | `Claim table is complete (no network)` | succeeded; the live job is scheduled/dispatch-only |
| `41408079465` Check citations (dispatch) | `Citations resolve and support their claims` | succeeded: 37 URLs, 35 claims, 0 failures, 0 blocked |

The demo job resolved `node-version: 22` to **v22.23.4**, so the declared minimum Node
22.12 path is now exercised, and it is exercised on the built `dist` served through
`npm run preview`, not on the dev server.

One earlier dispatch, `41407565611`, failed in 0s because a `run:` step in
`citations.yml` held an unquoted colon and GitHub rejected the whole file. Nothing in
the repository could see that, which is why `check_project.py` now parses every
workflow. A second dispatch, `41407815766`, reached 36 of 37 URLs and reported the one
timed-out host as unverified with exit 2 instead of passing it; that behavior is
described under Remote handling of transport failures below.

## Executed checks

| Check | Result | Scope |
| --- | --- | --- |
| `python scripts/check_project.py` | Passed | Metadata, 20 Markdown files' local links, self-contained skill resources, README coverage parity, both workflow files parsed, 3 theme presets, package versions |
| `python scripts/check_citations.py --offline` | Passed | 36 cited URLs recorded, 35 claims, all 34 adapter citations carry a token set; no network used |
| `python scripts/check_citations.py` | Passed | 37 URLs resolved, 35 claims confirmed against page text, 0 failures, 0 blocked, 2 non-adapter citations checked for reachability only |
| `python -m unittest discover -s tests` | 18 passed | Validator rejection behavior, measured separability, valid presets, archive safety, extracted-skill validation |
| `python skills/map-aesthetic/scripts/validate_theme.py` | 3 presets passed | JSON schema, three UI contrast pairs, CIEDE2000 separability, cross-field invariants |
| `npm run build` | Passed | Production demo assets built with Vite, `dist` emptied on each build |
| `npm run test:browser` | 6 passed | Actual browser rendering and the interactions below |
| Independent forward evaluations | 2 reduced-input static reviews, no observed failure | Not case passes; see the evaluation record |

`python -m pip install -r requirements-dev.txt` installed `jsonschema` and `PyYAML`;
`npm ci` added 19 packages with 0 vulnerabilities reported.

## Guard behavior was probed, not assumed

Every guard above was exercised against a violating copy of the real files, and the
no-op case was checked too. A guard that stays silent on a violating copy is treated
as a finding, not as a passing check.

| Mutation | Required outcome | Result |
| --- | --- | --- |
| 14 theme violations (hex alpha, 3-digit hex, CSS variable, unknown field, swapped scale bands, casing not exceeding width, case-duplicate palette, non-finite value, duplicate JSON key, UTF-8 BOM, missing required token, bad mode, undersized palette, poor contrast) | refused | all refused |
| Water set equal to land; categorical pair 0.51 dE2000 apart; non-monotonic ramp | refused with the measured number | refused |
| `labelHalo` set equal to `land` | **must not** be refused (a knockout halo is correct design) | not refused |
| Night water reverted to `#132632` | refused at dE2000 2.26 | refused |
| Skill name drift, skill linking outside itself, broken image link, package version drift, short description length | refused | all refused |
| `openai.yaml` missing or without `interface`; lockfile without `version` | refused with an actionable line, not a traceback | refused, no traceback |
| One README drops an adapter row | refused by coverage parity | refused |
| Invalid preset moved into a subdirectory | refused (preset scan is recursive) | refused |
| Theme presets deleted entirely | refused | refused |
| Mapbox citation replaced by a nonexistent page | refused by the claim table | refused |
| Claim token removed from the table | refused as UNSUPPORTED | refused |
| Claim URL pointing at an unreachable host | exit 2 and "not a pass" | exit 2 |
| New adapter citation with no claim entry | refused as UNCLAIMED | refused |
| `--route` no longer written to the panel; sparse rule reverted; accent chip removed; baseline variables removed | browser suite fails | all four caught |
| `run:` step in a workflow holding an unquoted colon | refused by the workflow parser check | refused, no traceback |

## Remote handling of transport failures

`check_citations.py` distinguishes three outcomes and the CI job preserves them. A
dead link or a claim that stopped matching its page is exit 1 and stays red. A URL
that cannot be reached is retried once, and if it still fails the run reports
"UNVERIFIED, not passed" as a warning with the full output in the job summary, because
one cross-border timeout is not citation rot and a weekly red that means "could not
connect" trains maintainers to ignore red. Both outcomes were observed on real runs:
`41407815766` produced exit 2 from a `lbs.amap.com` TLS handshake timeout, and
`41408079465` reached every URL. The retry path was additionally proven in-process: a
simulated transport failure recovers on the third attempt and reports nothing blocked,
while a persistently unreachable host still exits 2.

The CIEDE2000 implementation used by the validator was cross-checked against
`colour-science` 0.4.7: agreement within 0.0001 on published vectors and within
0.04 across all 444 colour pairs taken from the presets.

## Measured cartographic results

Context fills against `land`, in CIEDE2000, before the night-preset correction:

| Theme | water | park | roadCasing |
| --- | --- | --- | --- |
| night-operations, before | 2.26 | 11.93 | 2.53 |
| night-operations, after | 5.59 | 11.93 | 5.47 |
| quiet-analysis | 10.05 | 7.62 | 5.09 |
| public-guide | 13.83 | 11.54 | 5.90 |

Categorical classes are separated by hue rather than lightness: the worst pair is
1.01–1.02:1 in luminance but 22.1–26.5 in CIEDE2000, and 12.0–15.6 under a red-green
simulation, with no pair below 5. A luminance-ratio check would have failed these
palettes for no reason, which is why the floors are stated in CIEDE2000.

Sequential ramps are monotonic in lightness with adjacent steps of 9.4–16.9 dE2000.
Index 0 is the low end; the two light themes darken toward the high end and the dark
theme lightens. The contract records the direction instead of enforcing one.

## Browser behaviors exercised

1. Both maps render actual Leaflet SVG vectors and retain visible Leaflet /
   synthetic-data attribution. No external resource request or page script error was
   observed during the initial-render check.
2. Selecting a site opens two popups. Repeated theme switching preserves selection,
   popups, and the count of existing vector objects. Clearing removes selection
   emphasis and closes both popups. Six rapid alternating switches were additionally
   checked outside the suite: popups stayed at 2, popup content nodes at 2, and paths
   at 131, so nothing accumulated.
3. Overview, working, and detail controls change enabled-label density and synthetic
   meters-per-pixel in the expected order: 3/9/16 labels at 32.00/16.00/5.66 m/px for
   a balanced theme. A sparse theme shows 3/6/13, so `labels.density` now changes the
   working view as well as the detail view; at overview only district names remain and
   there is nothing left to thin. Views stay synchronized through scale changes and
   keyboard panning.
4. At a narrow viewport the maps stack without horizontal document overflow. Keyboard
   site selection works. Selection and the popup persist when changing theme and
   resizing to desktop, with both map centers synchronized.
5. Rendered text and legend colors were read back from the page: the accent chip's
   measured contrast is at least 4.5:1 for all three themes, the legend swatch equals
   the route stroke drawn on its own map in both panels, and the legend gap resolves
   from `spacingPx`.

The first browser run exposed half-pixel center drift after keyboard pan and resize.
The maps had unequal effective viewport widths and independent resize handling. The fix
gives them equal widths with a grid separator and one shared resize path.

## Visual evidence

These are real screenshots of the local browser-rendered fixture, not mock provider
maps or generated map images:

- [Desktop comparison](images/demo-desktop.png): plain versus Quiet Analysis.
- [Night and selection](images/demo-night.png): Night Operations with River Depot selected.
- [Narrow layout](images/demo-mobile.png): stacked maps, controls, legends, and site list.

Rebuilding and re-capturing produced byte-identical files twice in a row
(SHA-256 `938f3886…`, `af318b24…`, `3e15b69d…`), so the committed images are the
current build's output rather than a retained earlier capture. Inspect them after any
style change; the capture command alone is not visual QA.

Both views use the same source geometry and Leaflet `CRS.Simple`, where a local unit
represents a synthetic meter. The working view is centered at local `[5300, 7200]`,
zoom `-4`, measured 16.00 synthetic meters per CSS pixel. Those values are fixture
coordinates, not latitude/longitude or real geography.

Visual inspection covered the rendered map and DOM together: the refined background
yields priority to the route and reduces default label density, the dark map retains
readable controls and popup content, and narrow layout keeps the map panels and legends
within the page. Edge clipping of geographic labels remains ordinary viewport clipping;
no automatic label-collision system is implemented or claimed.

## Agent behavior evidence

See [the forward evaluation record](../evals/results/2026-11-02.md). Both executed
reviews used reduced fixtures rather than the projects their cases describe, are
labelled as standing in for Case 1 and Case 5, and are **not** case passes. The
per-behavior grade table was not recorded during review and cannot be reconstructed
because the generated proposals were not retained. Cases 2, 3, 4, 6, and 7 have not
been executed.

## Not reproducible from this repository

An earlier version of this record listed a pass for a bundled skill-creator
`quick_validate.py`. That tool is not vendored here and no command line was recorded,
so it is removed rather than carried forward. Skill frontmatter and naming are covered
reproducibly by `scripts/check_project.py`.

## Not validated

- ArcGIS, Mapbox, AMap, or Baidu runtime integration, credentials, or console publication.
- Real Leaflet provider basemaps, raster rendering, plugin interoperability, or other Leaflet versions.
- Production volume, performance benchmarks, device matrix, physical touch input, or full accessibility conformance.
- Quantitative ramp perception beyond lightness monotonicity, automatic label collision, clustering, 3D, or style-JSON conversion.
- Other agent hosts' skill discovery and installation behavior.
- GitHub Release, demo hosting, or Pages deployment.
- The scheduled citation run. Only push and manual dispatch triggers have executed; the
  weekly schedule has not yet had a chance to fire.
- Protanopia and tritanopia; the categorical screen simulates red-green deficiency only.

The Ubuntu and Windows validation jobs, the Ubuntu Chromium demo job, and both citation
jobs have run on the commits that introduced these changes, with the outcomes recorded
under Remote execution on GitHub Actions. A future commit's status is not implied by
this record; inspect the
[current workflow runs](https://github.com/yeston463/map-aesthetic/actions) after a push.
