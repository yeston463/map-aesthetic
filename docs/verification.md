# v0.2 local verification — reviewed 2026-11-02

This record applies to the uncommitted local v0.2 tree in `studio/_review_map_aesthetic`.
It replaces unsupported counts and A/B claims in the earlier local report. It does
not describe a pushed release. Historical v0.1 evidence remains in Git history.

## Environment

Windows x64, Python 3.13.6, Node 24.19.0, npm 11.12.1, Pillow 12.1.0;
Leaflet 1.9.4, MapLibre GL JS 6.16.0, Vite 8.3.5, Playwright 1.64.1,
Chrome for Testing 156.0.8078.4. The minimum declared Python/Node versions and
Ubuntu were not rerun locally. Host CJK fonts affect text and PNG reproducibility.

## Commands actually executed

| Command / check | Observed result |
| --- | --- |
| `npm ci --no-audit --no-fund` | Passed after repairing lockfile; 44 packages installed |
| `python -m unittest discover -s tests -v` | 35 tests passed |
| `npm run test:node` | 7 tests passed; API doubles do not validate real Mapbox |
| `npm run build` | Passed |
| `npm run test:browser` | 6 demo tests passed |
| `npm run case:verify` | 85/85 assertions passed; 10 observations counted separately |
| `python scripts/measure_case_pixels.py` | Passed on the captured report and matching image hashes |
| `python scripts/check_citations.py --offline` | Structure only: 36 URLs, 35 claims, 34 adapter citations; no network |
| `python scripts/check_project.py` | Passed after A/B and preflight review updates: metadata, 56 Markdown files, README parity, workflows, lockfile dependencies, presets |
| Skill-creator `quick_validate.py` | Passed |
| `python scripts/package_skill.py` | Passed: self-contained skill ZIP with 24 files |

The original `npm ci --dry-run` failed because MapLibre was absent from the
lockfile. This was reproduced before the repair. A clean local install succeeded
afterward. Pillow is now declared for raster generation and screenshot measurement.

Project integrity, whitespace checks, and packaging passed at finalization.
A remote CI run of these local changes has not run.

## Case evidence

The raw [case report](../cases/evidence/verification-report.json) records execution
time, engine/version, assertions, observations, camera, viewport, and per-map image hashes.
Leaflet comparison clips are now both **1020 × 1015 CSS px** at
center `[31.2268, 121.4388]`, zoom 15, with the same source data.
The desktop browser viewport is 1280 × 1100; narrow viewport is 390 × 844.
Mobile selection may pan to reveal the target, so its camera is not claimed identical.

| Image | Actual file dimensions |
| --- | --- |
| [leaflet-baseline-map.png](../cases/evidence/leaflet-baseline-map.png) | 1020 × 1015 pixels |
| [leaflet-improved-map.png](../cases/evidence/leaflet-improved-map.png) | 1020 × 1015 pixels |
| [leaflet-improved-mobile.png](../cases/evidence/leaflet-improved-mobile.png) | 390 × 844 pixels |
| [mapbox-night-selection.png](../cases/evidence/mapbox-night-selection.png) | 1280 × 1004 pixels |

The filename prefix `mapbox-` is retained for old links, but those screenshots show
**MapLibre**, not Mapbox GL JS. Eight replacements are serial: each waits for idle.
They verify resource counts and selection, not every race or absence of memory leaks.

## Measured quantities and limits

At the fixed Leaflet desktop extent, enabled label boxes change from
24 to 14, with measured overlapping pairs
10 to 0.
Missing-data versus value-class minimum rendered deltaE00 is
5.63; adjacent class minimum is 6.82.
The improved route's sampled local deltaE00 is 35.95.
This is a color-distance sample, not a luminance contrast ratio or proof of better taste.
The baseline route has a larger local distance in this fixture; maximizing that
number is not the design objective. Transparency and patterns affect rendered colors.

Negative baseline findings and exploratory filter/opacity variants are recorded
separately. The variants apply to the tile container, not business symbols. They
cannot selectively recolor roads, but are not universal evidence that fading is bad.

Pixel measurement fails on missing capture metadata, missing screenshots,
dimension mismatches, or screenshot SHA-256 mismatches. UI text contrast,
color-vision accessibility, perceived ordering, and task usability need separate review.

## Evaluations and CI

See [evaluation status](../evals/results/2026-11-02.md). Hand-authored fixture
regression is not an independent agent execution. A subsequently supplied A/B
attempt has execution logs, but reference-answer and cross-arm access invalidated
the comparison. See [the audit](../evals/ab-reviews/2026-11-02/README.md) for step-level
receipts and an aligned post-hoc replay. Preparation alone does not prove effectiveness.

The CI configuration now includes case execution, pixel measurement, Node checks,
and evidence upload. It has not been pushed or run remotely for this v0.2 revision.
Earlier green v0.1 jobs are not evidence for the new cases.

## Unverified

Actual Mapbox/Standard or commercial provider services; production data/volume;
heap profiling and all event listeners; physical mobile gestures; all languages,
fonts, browsers and devices; online citations in this review; GitHub Release or hosting.

Review details: [v0.2 review](reviews/v0.2-review-2026-11-02.md).
