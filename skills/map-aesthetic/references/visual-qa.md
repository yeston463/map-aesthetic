# Visual and interaction QA

Use this procedure after editing the user's existing map implementation.
Adapt the matrix to the task; do not create every possible provider/device combination.
Document what ran, what was inspected, and what could not be exercised.
A screenshot proves the captured state, not all interaction or provider compatibility.
The local Leaflet synthetic demo cannot validate the other engines.
Do not report any planned check as a completed run.

## 1. Establish a repeatable baseline

Identify the actual page, build command, renderer, SDK version, and active base source.
Use the project's supported start and verification commands where available.
Inspect existing tests before adding a new tool or harness.
Record the route, viewport size, theme, locale, filters, and representative dataset.
Record geographic bounds or another explicit extent, center, rotation, and tilt as applicable.
Record which panels, popups, selections, and layers are open.
Use the same data and state for before/after captures unless the task changes them.
Keep synthetic fixtures explicitly labeled and separate from the user's production data.
Redact credentials and sensitive content from logs, screenshots, and shared artifacts.

## 2. Choose the smallest meaningful matrix

| Scenario | Required views or states | Main risks to inspect |
| --- | --- | --- |
| Sparse points | Working view, selected point, long popup | Unclear anchors, excessive symbol weight, occlusion |
| Dense points | Overview, cluster transition, detail | Noise, unstable categories, blocked targets |
| Routes | Overview and detailed turn or crossing | Broken continuity, base competition, hidden endpoints |
| Thematic polygons | Adjacent classes, missing data, legend | Misleading values, opacity overlap, illegible boundaries |
| Imagery or raster base | Bright and dark regions, overlays | Text contrast, uneditable baked-in labels |
| Panel-heavy application | Panel open/closed, results, popup | Geography hidden by UI, unusable visible area |
| Mobile use | Narrow viewport, opened sheet, selected target | Trapped map gestures, covered controls, inaccessible close action |
| Theme switch | Both themes, selection, reload | Lost data layers, unreadable controls, stale legend |

Use overview, working, and detail views when scale affects this change.
Add a dense dataset only when density or aggregation is relevant.
Add no-data, loading, and error states when the change affects their presentation.
Use existing device targets; avoid an arbitrary browser matrix unrelated to the project.
Explain omitted checks when an omission limits the claimed result.

## 3. Match geography, not numeric zoom

Use saved geographic bounds to align before/after and cross-provider captures.
Keep viewport dimensions and available map area consistent when comparing composition.
Use the same bearing and pitch where supported, otherwise disclose the difference.
Do not claim equivalent scale because two SDKs both report zoom `12`.
Different cameras, projections, padding, and zoom definitions can show different ground areas.
When a panel changes the viewport, record the actual unobscured map area.
Avoid fitting data independently for each capture if that hides changes in framing.
For scale thresholds, capture just below and above the actual project threshold.
Inspect at least one stable intermediate state if transitions are part of the behavior.

## 4. Wait for a truthful ready state

Use the renderer's documented lifecycle and the application's state to establish readiness.
Do not rely on an arbitrary delay alone or assume generic network idle means tiles are ready.
Check for unloaded tiles, missing labels, absent images, font failures, and layer errors.
Record when animations, transitions, or clustering have settled before a comparison capture.
Keep loading indicators visible when loading is still occurring.
Preserve a visible error or unavailable state when the provider cannot load.
Never replace unavailable provider content with unrelated imagery and label it successful.
Do not silence an error simply to obtain a cleaner screenshot.
If readiness cannot be established, label the capture partial and limit the conclusion.

## 5. Review the complete visual surface

Capture both the map rendering surface and its DOM interface in the same frame.
Inspect the actual screenshot, not just generated HTML or a successful browser response.
Compare these observations with the recorded primary task:

- Business features dominate only to the extent needed for that task.
- Context needed to locate and interpret those features remains visible.
- Category colors and numeric class meanings match the legend and original data.
- Missing, selected, hovered, disabled, and ordinary states remain distinguishable.
- Labels identify their features without distracting collisions or unreadable halos.
- Line joins, patterned fills, icons, and geometry appear complete in the tested extent.
- Controls and popup text remain legible on both light and dark base regions.
- Panels and popups leave the target and useful context visible.
- Provider attribution and required branding remain unobstructed and legible.
- No accidental crop, scroll overflow, or overlay covers a required action.

Record concrete findings with a screenshot reference and affected state.
Do not replace inspection with a subjective numeric beauty score.
Use an image diff as supporting evidence only; intended layout changes also produce diffs.
Avoid hard pixel thresholds for maps whose labels or tiles vary between requests.

## 6. Exercise interaction

Pan and zoom with the input methods relevant to the application.
Select overlapping features and verify that the chosen target remains identifiable.
Open and close representative popups, panels, search results, and layer controls.
Verify focus visibility and keyboard access for the controls being changed.
Check mobile touch targets and map-versus-page scroll behavior where mobile is in scope.
Switch filters or themes and confirm that selection and categories behave as intended.
Reload the page and verify that the intended initial view and layers return.
If the base style is replaced, verify custom sources, layers, ordering, and events afterward.
Repeat that replacement to catch duplicate listeners, duplicate layers, and lost state.
Do not count a static screenshot as evidence that any interaction passed.

## 7. Check practical performance

Use representative data volume and the same device or browser conditions for comparisons.
Inspect whether pan, zoom, hover, and selection remain responsive after the change.
Watch for repeated source loading, uncontrolled renders, and accumulating event handlers.
Check console and network errors caused by the edited code without exposing credentials.
Use existing profiling or performance checks when symptoms justify measurement.
Report measured numbers only with their method, device, data size, and conditions.
Do not invent a universal frame-rate target or claim benchmark gains from appearance.
Avoid adding a new map instance, renderer, or heavy dependency solely for decoration.

## 8. Verify geometry and evidence boundaries

Use known project control points if a change touches source data or view configuration.
Keep source coordinates and existing conversion paths intact during ordinary styling work.
Do not visually nudge features to compensate for a suspected coordinate-system mismatch.
Record the actual source and display coordinate conventions before proposing a conversion.
Compare viewport alignment after layout changes without silently rewriting geometry.
State when a provider, version, data source, or coordinate path was not exercised.
Documentation support and an adapter recipe are not runtime compatibility evidence.
One working Leaflet fixture supports only the Leaflet behavior actually exercised there.

## 9. Deliver an honest verification record

For each check record: scenario, setup, action, observable result, and evidence location.
Use statuses such as `passed`, `failed`, `not run`, and `blocked` with a concrete reason.
Include before/after captures and identify any deliberate difference in data or camera.
Separate successful build checks from browser, visual, interaction, and performance checks.
List remaining limitations with the effect each has on confidence.
Do not claim the map is ready while a task-critical visual or interaction defect remains.
If access is missing, deliver reviewable changes and state precisely what remains unverified.
Keep the record with the user's change or the repository's established delivery artifact.
