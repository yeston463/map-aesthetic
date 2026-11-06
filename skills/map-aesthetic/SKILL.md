---
name: map-aesthetic
description: Refine the cartography and UI of existing web maps, including basemaps, data layers, labels, legends, controls, and popups. Use for map visual audits, restyling, or reference-driven refinement in Leaflet, ArcGIS Maps SDK for JavaScript, Mapbox GL JS, AMap, and Baidu Maps. Applies to source code, running pages, and screenshot-based reviews.
license: MIT
---

# Map Aesthetic

Improve the map's visual hierarchy for its actual task. Work in the existing
project and SDK. The product is a usable map, a concrete code/configuration
change when source is available, and evidence appropriate to the available access.

## Establish scope and evidence

- Determine whether the user wants an audit, an implementation, or reference
  matching. A request to refine an accessible project normally includes implementation.
- Inspect the lockfile, SDK imports or loader URL, framework wrapper, map
  initialization, layer sources, current style, and relevant UI. Do not identify
  SDK generation solely from a global namespace.
- Identify the map's task, primary business layer, intended devices, data
  semantics, coordinate reference system, and provider restrictions. Infer these
  from the project; ask only about missing information that changes the result.
- State a brief design direction and the known scope of change. Capture a baseline
  when a working map and browser are available. An absent credential or preview
  narrows the evidence; it does not prevent useful source/configuration work.
- With screenshots alone, distinguish observed problems from inferred causes.
  Produce a design specification and implementation guidance. Do not claim code
  changes, measured performance, working interactions, or live validation.

## Load only the relevant guidance

Read [cartographic design](references/cartographic-design.md) and
[anti-patterns](references/anti-patterns.md). The first says what a map should do;
the second says what it must not do, and where the two overlap the second is the
stricter. For the methods that transfer across samples (and where they do **not**
apply), read [transferable principles](references/transferable-principles.md) — it
records what the sample iterations proved, and explicitly says the palette or
layout of one sample is **not** a fixed answer for every map. For common visual
defects (dense points, route/road confusion,
choropleth competing with labels, Chinese long label collisions, dark mode
contrast, or mobile sheet/popup occlusion), consult the
[scenario guides](references/scenarios/README.md).

A map is not the interface. When the work touches the panel, the legend, the
controls, the popup or the states around the map, also read
[interaction](references/interaction.md) for the motion numbers and the popup and
sheet rules, and [interface copy](references/interface-copy.md) for the wording of
everything outside the map. The executable form of the review is
[consistency checks](references/consistency-checks.md).

The guidance is a specification, not a report of what the bundled demo does.
[Implementation status](references/implementation-status.md) records which
claims are implemented, which are targets, and which were defects in this
document; [evaluation status](references/evaluation-status.md) records what has
and has not been shown about the skill's effect on an agent's output. Read both
before describing a passing check as compliance or as evidence of usefulness.

Select the SDK reference matching the actual project:

| SDK | Reference |
| --- | --- |
| Leaflet | [Leaflet](references/adapters/leaflet.md) |
| ArcGIS Maps SDK for JavaScript | [ArcGIS](references/adapters/arcgis.md) |
| Mapbox GL JS | [Mapbox](references/adapters/mapbox.md) |
| AMap / 高德 | [AMap](references/adapters/amap.md) |
| Baidu / 百度 | [Baidu](references/adapters/baidu.md) |

For another engine, inspect its documented capabilities and apply the shared
design process. Mark that adapter as unverified rather than guessing APIs.
Confirm version-specific methods against the installed version and official docs
when uncertain. Reference notes are starting points, not a promise of compatibility.

## Design a coordinated map

1. Establish the hierarchy: geographic context, business data, labels, selection,
   then supporting UI. Preserve contextual information needed for the user's task.
2. Define interface and cartographic tokens using the
   [theme contract](references/theme-contract.md). Reuse the project's design system
   and data semantics. Packaged themes are optional starting points, not fixed styles.
3. Specify overview, middle, and detail behavior in ground scale or resolution.
   Map those bands to the SDK; do not transfer numeric zoom levels across engines.
4. Tune label priority, density, line casing, point outlines, polygon opacity,
   collision handling, and legend correspondence together. If an engine cannot
   implement a rule, record the approximation and its effect.
5. Style controls, search, legends, popups, focus, and selected states consistently.
   Coordinate overlays and side panels so the feature of interest remains visible.

## Adapt and implement

- Make a small capability table for the requested changes: native, approximate,
  unavailable, or unverified. Identify the editable surface: basemap style,
  business vector layer, raster pixels, or DOM UI.
- Use public SDK APIs, existing framework components, and scoped CSS. Raster
  tiles do not expose their baked-in roads and labels for semantic recoloring.
  Replacing their source is a separate change to assess with the user intent.
- Map semantic roles to discovered layer IDs and source schemas. Do not assume
  provider layer names, interchangeable style JSON, shared units, or identical
  collision/ordering capabilities.
- Preserve data, class boundaries, coordinate systems, feature IDs, event behavior,
  navigation, attribution, and required provider branding. An aesthetic request
  does not itself authorize changing data meanings or swapping the map provider.
- Apply styles when the map/style/layer is ready. Handle style replacement,
  theme toggling, resize, teardown, and repeated application where relevant.
  Avoid accumulating listeners, sources, layers, or DOM nodes.
- Preserve the current behavior as a reversible baseline. Do not fork the SDK or
  rewrite the application architecture merely to restyle the map.
- Never invent keys, style IDs, permissions, screenshots, or service responses.
  If a console action or missing credential blocks one portion, deliver the
  implementable portion and the exact remaining configuration step.

## Verify and report

Identify the engine that actually ran. A MapLibre fixture does not validate
Mapbox GL JS, Standard imports, or provider services. Hand-authored examples and
automated regression checks do not establish that this skill improved an agent's
output; comparative claims require separately recorded agent executions.

Use [visual QA](references/visual-qa.md) to select representative states. Verify
map canvas and DOM together, plus selection, popups, resize, theme transitions,
and retained data semantics. Use comparable extents and screen sizes for before
and after evidence. Fix observed regressions and recheck affected states.
When a mobile panel overlaps the map, inspect the entire popup frame and target
against both the panel and viewport after panning settles; disabling auto-pan
without another boundary adjustment can leave the popup clipped.

If theme JSON is produced, validate it with
`python <skill-dir>/scripts/validate_theme.py <theme.json>` when Python and
`jsonschema` are available. Structural, contrast, and CIEDE2000 separability checks
reject surfaces that cannot be told apart; they do not prove label readability,
full color-vision accessibility, or SDK support. Report unavailable
checks without silently treating them as passed.

### Make the judgement executable

A taste that cannot be stated as a rule cannot be checked, and a rule that cannot
be checked is an opinion. Two levels of check are available.

The source can be read before anything is served:

```bash
python <skill-dir>/scripts/check_anti_patterns.py <path>
```

It finds the red lines that live in the code: a pure saturated colour, a
thematic area filled opaque over a basemap, a popup opened without a custom
class, a marker layer with no clustering, a hidden attribution, a tile layer with
no attribution, a basemap URL from a provider that needs checking.

Where a browser is available, run the page against
`node <skill-dir>/scripts/consistency.mjs <url> --widths 1440,1024,768,390`.
It opens the page in headless Chrome and reports each finding as FAIL or WARN with
the element, the fault and a one-line fix: text contrast and size, one button
family, one heading scale, one radius family, a focus ring, annotation overlap and
overflow, a popup that covers its own feature, legend-to-map colour
correspondence, a named data source, filler and placeholder wording, scroll-driven
motion, off-token durations, and the anti-patterns that show in a rendered page:
a pure colour, an opaque thematic fill, a missing pointer cursor, the engine's
default popup, a dense field of pins, an illegible attribution, and figures set
without tabular figures.

FAIL must be fixed or reported as false. WARN is for the eye. The checker is
evidence, not a verdict: a rule it cannot decide still needs a person, and a
passing run does not make the page good. A rule that returns SKIP was not
decided at all — open the state that exercises it before counting a run as
clean. Both checkers have paired violation/compliance fixtures in the
repository, so a rule that can never fire is a test failure rather than a
silent pass.

When a contrast fault is found, do not guess a replacement colour. Solve for one:

```bash
python <skill-dir>/scripts/solve_contrast.py --ground "#f2f4f6" --color "#78828d" --target 4.5
```

It works in OKLCH, so the hue is preserved and the result is the same colour made
readable rather than a different colour that happens to pass. It also says which
way to move, and says so when the hue cannot reach the target.

Deliver proportionally to the request:

- The important visual problems and chosen direction.
- Actual code/configuration changes, or an explicitly unimplemented specification.
- The capability mapping and any required provider-console action.
- Before/after evidence or a clear statement of what could not be observed.
- Verification performed, remaining limitations, and how to restore the baseline.

The optional [report template](assets/templates/audit-report.md) supports a full
audit. Do not force a large report for a small change. Report observations in
the user's language and never substitute a taste score for evidence.
