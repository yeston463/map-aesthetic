# Implementation status

This file answers one question: **which of the things the guidance says are
actually true of the bundled demo?** It exists because "the checkers pass" and
"the guidance is implemented" are different statements, and earlier rounds
sometimes reported the first as if it were the second.

Re-check the ledger after any edit to the demo or to these references:

```bash
python <skill-dir>/scripts/audit_claims.py          # 21 claims, evidence + doc anchors
python <skill-dir>/scripts/audit_claims.py --md     # a table for a report
```

Every claim binds a sentence in a reference file to a regex in a demo file. The
script checks both ends and writes `output/claim-audit.json`. It verifies the
**ledger**, not the design: a claim marked NOT_IMPLEMENTED passes as long as the
record is still accurate. Nothing here claims that the skill improves an agent's
output; see [evaluation status](evaluation-status.md).

## Ledger

| Claim | Status | What is true |
| --- | --- | --- |
| `fill-rest` | PARTIAL | The demo rests at 0.42 / 0.44 / 0.44, not the 0.35 default. 0.35–0.5 is the documented band over a raster basemap; the executable rule forbids only 1.0. |
| `fill-hover` | IMPLEMENTED | Hover raises the district fill to 0.65 and widens the boundary to 2.5px in the accent. It is a state, not a restyle: class colours and breaks do not move. |
| `motion-tokens` | IMPLEMENTED (one place) | The district hover uses 140ms in / 200ms out. Buttons and panels still have no motion, so most of the motion contract is unexercised. |
| `thematic-panes` | IMPLEMENTED | Eight named panes are actually used. Before this round every business layer was in `overlayPane`, so the pane-based `opaque-fill` rule was inspecting an empty pane and passing vacuously. Measured: 6 fills, 6 boundaries, 12 glows, 12 cores per direction. |
| `boundary-layer` | IMPLEMENTED | Fill polygons are `stroke:false`; a separate polyline in pane 411 draws the outline above the fill pane 410. Hover widens it to 2.5px in the accent. Boundary colour is a tuned theme token, with a computed 25%-lighter fallback. |
| `point-glow` / `core-outline` | IMPLEMENTED | Each site has a translucent 10–16px glow (pane 435, 0.8px blur) plus a crisp core whose radius still carries throughput and whose outline keeps overlapping points apart. |
| `camera-flyto` | IMPLEMENTED | Zoom actions use Leaflet `flyTo` with `duration: 1.6` seconds, shortened to 0.25s under `prefers-reduced-motion`. The instant `animate:false` pans in `selectSite` / `revealAboveSheet` remain boundary corrections, which the guidance allows. The earlier Mapbox-only `essential: true` wording was corrected. |
| `panel-blur` | IMPLEMENTED | The legend card and compass are floating HUD panels: translucent ground (alpha 0.92–0.94, kept above 0.9 so contrast is measured against the HUD surface) plus `backdrop-filter: blur(16px)`. |
| `panel-column` | PARTIAL | The fixed 272px column still holds intent, layers and the site list. The legend and compass now live on the canvas; the demo is a hybrid, not a pure floating-HUD composition. |
| `hud-legend` / `hud-compass` / `hud-yields` | IMPLEMENTED | The legend is grouped (line/site, value classes, no-data), states unit, ramp direction, breaks and per-class counts, and has three distinct north indicators (rose / seal / dial). Because Leaflet's transformed `mapPane` traps popups below a sibling HUD, the demo measures the intersection and folds the legend while a popup is open. |
| `tabular-numbers` | IMPLEMENTED | Found by the browser rule in an earlier round and fixed in `ui.css`. |
| `close-button` | IMPLEMENTED | 44×44 hit area. This defect was invisible until a regression gate actually opened a popup; Leaflet's selector is more specific, so the fix has to match it. |
| `class-breaks` | PARTIAL | Breaks are fixed per direction (`[400, 800, 1200]`), not computed from the data at runtime. The legend does state them. A demo comment claiming otherwise was corrected. |
| `colour-scale` | IMPLEMENTED (documented deviation) | The demo uses self-authored ramps; `DESIGN-NOTES.md` states why (4 classes, three different grounds) and states each ramp's direction. |
| `theme-measurement` | IMPLEMENTED | `scripts/measure_demo_themes.py` exports the palettes from their ES modules and measures them with the shipped validator's CIEDE2000 / deuteranopia / WCAG functions. Seven measurements were below threshold and were fixed by small colour edits: quiet-ground separation, no-data vs lowest class, and one colour-blind class pair. Result: `output/theme-measurements.json`, 0 failures. |
| `attribution` | IMPLEMENTED | A named source sits on the map, independent of the optional raster comparison layer. |
| `deep-link` | IMPLEMENTED | `?style=…&site=S01` opens a popup on load, so `popup-covers-feature` is evaluated rather than SKIP at every width. |
| `rule-fixtures` | IMPLEMENTED | 26 browser + 9 static rules each have a violation fixture and a compliant fixture. |

## What the checks actually cover

- **Rule coverage.** `tests-node/rule-fixtures.test.mjs` builds one compliant
  baseline page plus one single-defect page per browser rule, and a violating /
  clean source pair per static rule. The record is `output/rule-coverage.json`.
  A rule counts as covered only when it fires on the defect **and** stays silent
  on the compliant fixture. This is how three dead regexes and one unreachable
  static rule were found.
- **Demo regression.** `node scripts/verify_demo_consistency.mjs` runs the
  shipped browser checker over three directions × four widths, with and without
  an open popup, and writes `output/consistency/`. A fresh page load still leaves
  `popup-covers-feature` as SKIP at all four widths — that is why the second
  pass exists. SKIP is reported, never counted as PASS.
- **Static scan and geometry.** `check_anti_patterns.py` plus
  `demo/three-directions/capture.mjs` cover source-level red lines and the
  popup/sheet geometry respectively.
- **Colour contract.** `python scripts/measure_demo_themes.py` measures every
  ramp step, class pair (including a deuteranopia simulation), context surface,
  no-data tone and the three UI text contrasts against the validator's own
  thresholds, and writes `output/theme-measurements.json`.

A clean run means **no implemented rule found a fault in the states that were
actually opened**. It does not mean every documented line is implemented, every
state was visited, or the design is good.

## Still open

1. A **pure** floating-HUD composition: the fixed side column still exists, so
   §4.1 is exercised but not embodied end to end.
2. Data-computed class breaks. The breaks are still fixed per direction; the
   legend states them, which is the part the reader needs, but a restyle of a
   different dataset would need new breaks.
3. A written, per-ramp perceptual justification. The custom ramps now have a
   documented reason and measured separation, but they are not a published
   perceptually uniform scale.
4. An effectiveness result. One blind pair recorded a relative preference for
   the control arm with no dimension scores; nothing here replaces a
   comparative agent run. See [evaluation status](evaluation-status.md).
5. A real runtime load test: no agent has been shown to load the packaged ZIP
   as a skill and follow it on a fresh project.
