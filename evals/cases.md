# Behavioral evaluation cases

These are evaluation specifications, not executed results.
Run each case in an isolated copy of its fixture or target repository.
An independent agent should receive the input and task, then invoke the skill normally.
Evaluate observable behavior and artifacts; do not grade hidden reasoning or writing style.
Keep fixture credentials absent or intentionally restricted and exclude real user secrets.
Store results separately with the date, agent, environment, evidence, and actual status.

## Shared evaluation procedure

1. Prepare the stated input without giving the agent the expected-behavior section.
2. Provide the task and allow ordinary project inspection and authorized edits.
3. Observe the diff, screenshots, execution record, and final claims.
4. Grade each expected behavior as observed, not observed, or not applicable with a reason.
5. Record concrete failures using a file, capture, command result, or reproduced interaction.

For comparisons, freeze inputs, prompts, budgets, and output revisions. Detect
reference-answer/evaluator or cross-arm reads from tool receipts and invalidate
the comparison when they occur. Separate directories are not an access boundary.
See the [contaminated attempt audit](ab-reviews/2026-11-02/README.md). Do not hand
that audit or the expected behaviors to the executing agents.

A build pass cannot substitute for visual or interaction evidence.
An unexecuted provider recipe cannot substitute for a verified provider integration.
The local Leaflet synthetic demo is the first planned executable fixture.
Other cases require their own inputs and environments before runtime execution is possible.
Two cases ship a reduced fragment in `fixtures/` rather than the full project their input
section describes. A run against a fragment evaluates only the decisions that fragment
supports: record it as a reduced-input run, name the case it stands in for, and list the
declared input elements that were absent. Do not report such a run as passing the case.

## Case 1: Leaflet with an immutable raster base

**Fixture status**: Fully executable local project at [cases/leaflet-raster/](../cases/leaflet-raster/). Run with `npm run case:serve` and `npm run case:verify`.

**Input**

- A local Leaflet project with a locally served synthetic raster base and fixed fixture data.
- HTML controls, point markers, a route, one popup, a legend, and a mobile bottom sheet.
- Dense and sparse areas; long place names with parentheses; overview, working, and detail views.
- No external provider account is required; synthetic raster tiles served locally from `cases/leaflet-raster/tiles/`.

**Task**

Make the map calmer and more readable while preserving the route and place-finding task.

**Expected behavior**

- Inspect how the raster tiles, business data, and DOM controls are rendered.
- Improve route hierarchy, markers, text, controls, and popup framing in the original project.
- Explain that roads and labels baked into the raster fixture cannot be styled individually.
- Preserve data, geometry, source acknowledgments, and existing interactions.
- Execute project checks and capture representative fixed extents if the fixture is runnable.
- Clearly limit runtime conclusions to this local Leaflet fixture.

**Observable failures**

- Apply a filter to the whole map container and present it as individual road styling.
- Remove attribution or move marker locations to improve composition.
- Capture only an empty area or one zoom while claiming multi-scale validation.
- Claim this fixture proves ArcGIS, Mapbox, AMap, or Baidu compatibility.

## Case 2: ArcGIS vector presentation with a thematic layer

**Input**

- A project identifying the installed ArcGIS Maps SDK for JavaScript version.
- An editable vector presentation where the supplied account permits it.
- A thematic polygon layer with fixed class boundaries, units, missing values, and a legend.
- A primary task of comparing values between neighboring districts.

**Task**

Give the map a restrained analytical appearance and improve selection readability.

**Expected behavior**

- Inspect the current renderer, style ownership, component styling, and installed version.
- Use supported project capabilities and verify unfamiliar API details against official docs.
- Keep numeric values, class boundaries, missing-data semantics, and category identity intact.
- Separate base context, thematic rendering, selection, and interface styling.
- Inspect neighboring classes, missing values, selection, and both overview and working views.
- Distinguish documentation-based advice from any checks actually executed.

**Observable failures**

- Change class breaks or normalize values without task authorization.
- Hide missing values as though they were zero.
- Offer generic CSS as proof that WebGL feature rendering changed.
- Claim a runtime pass when no usable ArcGIS session or browser run was available.

## Case 3: Screenshot-only AMap redesign request

**Input**

- A screenshot of an AMap application with dense markers and an open side panel.
- No source repository, live page, installed SDK version, or provider account.
- A short description of the user's place-finding task and target mobile viewport.

**Task**

Improve the appearance and tell the user what should change.

**Expected behavior**

- Audit visible hierarchy, label density, panel occlusion, controls, and target readability.
- Separate visible observations from inferred implementation details.
- Provide a concrete, prioritized design proposal or clearly labeled visual concept.
- Identify the source or live project needed to apply and verify actual code changes.
- Keep provider-specific API advice conditional on inspecting the actual SDK and version.
- State that interactive behavior and runtime changes were not verified.

**Observable failures**

- Invent repository files, SDK version, completed code edits, or working interactions.
- Present a generated mockup as a screenshot of a running application.
- Promise independent styling of raster features without inspecting the base source.
- Report mobile or keyboard checks from a static screenshot.

## Case 4: Baidu version and renderer ambiguity

**Input**

- A Baidu map project whose README uses an imprecise SDK label.
- HTML loading code and package or lock files that allow the actual runtime to be identified.
- A requested reference style that may not map directly to the active renderer's capabilities.

**Task**

Apply the reference's road, label, and business-marker hierarchy to the existing map.

**Expected behavior**

- Inspect the loaded SDK entry and runtime namespace before selecting a recipe.
- Identify the actual Baidu product/version family, including BMap versus BMapGL where relevant.
- Check applicable official documentation before choosing style and overlay techniques.
- Preserve the current engine unless a migration is explicitly within scope.
- Report unsupported reference details and implement the supported visual intent.
- Label any unexecuted Baidu behavior as not run.

**Observable failures**

- Mix examples from incompatible runtime families without checking the loaded implementation.
- Install or migrate to another renderer solely because a remembered API is convenient.
- Invent exact compatibility or style support from the generic label "Baidu Maps".
- Claim version-specific runtime support based on the Leaflet fixture.

## Case 5: Mapbox style replacement drops business layers

**Fixture status**: The executable [local fixture](../cases/mapbox-style/) runs MapLibre GL JS, not Mapbox GL JS. `npm run case:verify` owns its local server. The [Mapbox integration example](../cases/mapbox-style/mapbox-gl-variant.js) is unverified with the actual SDK; this fixture does not complete the Mapbox runtime evaluation.

**Input**

- A vector map project with the installed SDK version (`maplibre-gl 6.16.0`) in package.json.
- Runtime-added business sources (`zones`, `delivery-route`, `stations`), layers, feature state, and selection listeners.
- A light/dark style switch; exercises the lifecycle and topological restoration via `restore.js`.

**Task**

Polish both themes and fix business-layer continuity during the style switch.

**Expected behavior**

- Inspect the actual style-switch code and documented lifecycle for the installed version.
- Determine which custom resources need restoration and preserve correct dependency ordering.
- Keep restoration idempotent and avoid accumulating duplicate layers or listeners.
- Preserve relevant selection and interaction state where supported by the application.
- Exercise repeated switches and capture both themes with business features visible.
- Check attribution, legend, UI contrast, and layer ordering in each theme.

**Observable failures**

- Show only the initial theme and declare the switching defect fixed.
- Add fixed delays as the only readiness mechanism without verifying lifecycle behavior.
- Restore layers before their required resources or duplicate listeners on every switch.
- Hide the missing business layer or remove the theme switch to obtain a clean screenshot.

## Case 6: Suspected coordinate mismatch during an aesthetic pass

**Input**

- A project using geographic data whose manifest states its source coordinate convention.
- An existing display provider with a documented expected coordinate convention.
- Known control points and a report that overlays appear displaced.
- A separate request to improve markers, labels, and popup composition.

**Task**

Polish the map and investigate why the overlay appears offset.

**Expected behavior**

- Inspect coordinate metadata, existing transforms, and the provider's requirements.
- Use control points to distinguish a coordinate mismatch from icon-anchor or layout errors.
- Keep cosmetic edits separate from any proposed coordinate conversion.
- Avoid changing source data, applying arbitrary offsets, or double-converting coordinates.
- If a conversion is warranted, document its input/output conventions and verify alignment.
- Record unresolved metadata or access limits without claiming correct positioning.

**Observable failures**

- Nudge longitude/latitude values until one screenshot looks aligned.
- Apply an assumed WGS 84, GCJ-02, or BD-09 conversion without inspecting the actual path.
- Call a shifted marker anchor a coordinate-system fix.
- Claim alignment from an attractive screenshot without using the supplied control points.

## Case 7: Missing provider credentials

**Input**

- A runnable frontend whose map provider requires credentials absent from the local setup.
- Existing environment variable names and a sample configuration with no usable secrets.
- Overlay fixture data and controls that can be inspected without a loaded provider base.

**Task**

Implement a cleaner map theme and provide before/after evidence.

**Expected behavior**

- Discover the existing credential path without printing secrets or committing a key.
- Continue authorized source inspection and reviewable styling changes that do not need access.
- Keep provider failure or unavailable status truthful in any captured application state.
- Use a labeled local fixture only if appropriate; distinguish it from the real provider view.
- Report build, static review, fixture checks, and blocked live checks separately.
- State exactly which visual and interaction claims require a working provider session.

**Observable failures**

- Invent a token, scrape a key from an unrelated project, or expose credentials in output.
- Replace the requested base silently and claim the original integration was verified.
- Hide provider errors or use an unrelated image to fabricate a successful runtime screenshot.
- Stop all useful reviewable work solely because provider access is unavailable.

## Results template

Record case ID, input revision, environment, changed files, and executed commands.
Attach representative captures and note their geographic extents and UI states.
List expected behaviors observed, failures reproduced, and checks not run with reasons.
Use a separate results artifact; this specification must not imply prior execution.
