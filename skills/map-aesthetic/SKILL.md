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

Read [cartographic design](references/cartographic-design.md). Select the SDK
reference matching the actual project:

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

Use [visual QA](references/visual-qa.md) to select representative states. Verify
map canvas and DOM together, plus selection, popups, resize, theme transitions,
and retained data semantics. Use comparable extents and screen sizes for before
and after evidence. Fix observed regressions and recheck affected states.

If theme JSON is produced, validate it with
`python <skill-dir>/scripts/validate_theme.py <theme.json>` when Python and
`jsonschema` are available. Structural, contrast, and CIEDE2000 separability checks
reject surfaces that cannot be told apart; they do not prove label readability,
full color-vision accessibility, or SDK support. Report unavailable
checks without silently treating them as passed.

Deliver proportionally to the request:

- The important visual problems and chosen direction.
- Actual code/configuration changes, or an explicitly unimplemented specification.
- The capability mapping and any required provider-console action.
- Before/after evidence or a clear statement of what could not be observed.
- Verification performed, remaining limitations, and how to restore the baseline.

The optional [report template](assets/templates/audit-report.md) supports a full
audit. Do not force a large report for a small change. Report observations in
the user's language and never substitute a taste score for evidence.
