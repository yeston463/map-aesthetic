# Cartographic design

Use this reference to make concrete visual decisions in the user's existing map.
This skill edits the original project; it is not a universal map SDK or runtime.
Apply the same design intent through the capabilities actually available there.
Read the installed SDK version, current code, and applicable provider documentation.
Treat unsupported visual controls as constraints, not permission to replace the stack.

## Establish the visual job

Record the primary task before selecting a palette or moving controls.
Identify the geographic area, typical data density, and useful viewing distances.
List the features people must find, compare, select, or follow.
Identify indispensable context: roads, addresses, boundaries, terrain, or imagery.
Inspect the existing desktop and mobile composition before proposing changes.
Separate observed defects from preferences and from facts still needing verification.
Ask for missing data only when the project cannot supply a useful representative view.

## Choose style from the task

| Task | Visual priority | Context to preserve | Common excess to avoid |
| --- | --- | --- | --- |
| Find a nearby place | Distinct targets and location confidence | Streets, useful place names, entrances | Decorative markers larger than the places |
| Follow a route | Continuous route and readable instructions | Turns, road relationships, destination | A bright base competing with the route |
| Monitor operations | Status changes and selection | Relevant facilities and service areas | Every status using an equally intense accent |
| Compare geographic values | Honest value encoding | Boundaries and a restrained reference base | Attractive colors with misleading class differences |
| Explore public information | Approachable hierarchy and discovery | Recognizable landmarks and names | Dense introductory panels covering the map |
| Inspect imagery | Original image evidence and overlay precision | Image detail and required source information | Recoloring imagery as though it were a vector base |

Dark, light, warm, and neutral themes are choices to justify against that task.
A dark theme is not a default definition of quality or a cure for dense data.
Use an existing brand or reference as guidance without copying its geographic errors.
When tasks compete, name the primary task and give the secondary task a quieter layer.

## Divide the visual surface

Treat the base, business data, and interface as separate design surfaces.
The base establishes location; business data communicates the task; UI enables action.
Identify which surface owns each label, line, marker, popup, and attribution element.
Record whether a feature is HTML, SVG, canvas, WebGL, or baked into raster tiles.
Use that ownership to select the right edit point in the original project.
Do not assume CSS reaches a feature rendered inside canvas or a tile image.
Do not recreate a provider label layer merely to change its font without inspecting cost.

## Use a small semantic token system

Keep ordinary UI tokens for spacing, surfaces, text, borders, focus, and elevation.
Add cartographic tokens for context contrast, line hierarchy, label halos, and density.
Add data tokens for categories, ordered values, neutral values, selection, and missing data.
Express scale-dependent choices as documented stops or ranges, using project conventions.
Give tokens semantic names such as `route.primary`, `site.selected`, and `label.context`.
Resolve tokens through the current renderer; avoid a new abstraction layer without need.
Keep categorical assignments stable across filtering, selection, and theme changes.
Only introduce tokens that are used by the actual change; avoid a speculative framework.

## Respect base-map authority

For a vector base, first inspect which style objects or editing tools the project owns.
For a raster base, assume road colors and baked-in labels cannot be edited individually.
Do not recolor an entire map container with CSS filters to simulate per-feature control.
Such filters can also alter business layers, text, imagery, and status semantics.
If raster styling is unavailable, improve overlays and UI within that limitation.
Offer another licensed base only when it serves the task and fits the user's scope.
Preserve required provider branding, attribution, and source acknowledgments.
Keep controls legible around those elements rather than covering or cropping them.
Do not invent a paid style, provider permission, or token scope that was not verified.

## Keep data meaning intact

Use discrete colors for categories without implying an order that the data lacks.
Use an ordered ramp when values have a meaningful low-to-high relationship.
Use a diverging ramp only when a meaningful central value or reference exists.
Show missing data distinctly from zero, neutral, hidden, and unavailable values.
Preserve units, class boundaries, aggregation rules, and legend definitions by default.
If a classification change is requested, document its effect on interpretation.
Do not change geometry or numeric data to make a map look more balanced.
Use shape, outline, pattern, or text when color alone cannot carry a distinction.
Check the same category or value against every background it can cross.
Keep the legend aligned with the visible render state, including filters and selection.

## Size points, lines, and areas deliberately

Point size must communicate data or interaction priority, not arbitrary visual weight.
Check icon anchors so the intended ground location remains clear.
Keep selected markers recognizable without hiding adjacent targets or their own location.
Use line hierarchy to separate routes, boundaries, and background infrastructure.
Check continuity at bends, joins, tile boundaries, and intersections in representative views.
Choose screen-relative width or ground-relative width from the meaning of the feature.
Do not describe a screen-pixel stroke as a constant geographic corridor width.
Balance polygon fill and outline so neighboring values and overlapping areas remain legible.
Inspect overlap: opacity changes can create an unintended apparent value scale.
Keep holes, small islands, and narrow features meaningful at the scales where they matter.

## Treat labels as a scarce resource

Allocate label priority to the locations needed for the task.
Distinguish provider labels, business labels, marker text, and popup text before editing.
Check collisions between these systems; one engine's collision handling may not cover all.
Use restrained halos or backing surfaces when text crosses variable backgrounds.
Preserve essential place names and address context when reducing label density.
Avoid labeling every business feature at every scale.
Check long names, non-Latin text, multilingual content, and realistic numeric values.
Do not resolve collisions by silently truncating the only identifier users need.
Keep label position or leader lines clear enough to identify the corresponding feature.

## Design across scale

Define a useful overview, working view, and detail view for the actual geography.
At overview, favor distribution, regional structure, and meaningful aggregation.
At working scale, expose the relationships required for comparison or navigation.
At detail scale, provide precise selection and relevant local context.
Adjust visibility, clustering, line weight, and label density as a coordinated system.
Inspect transitions around any threshold, not just one image on each side.
Do not compare providers by identical numeric zoom; use equivalent geographic extents.
Preserve feature identity and category colors when clusters expand or layers appear.
Retain selection and an intelligible location when a scale transition changes representation.

## Compose the map with its interface

Place panels using the geography visible in representative views, not an empty screenshot.
Ensure an opened popup leaves its target and useful surrounding context visible.
Check docked panels, search results, mobile sheets, and attribution together.
Keep zoom, location, layer, and reset controls discoverable without equal visual emphasis.
Use the project’s accessible control patterns, visible focus, and adequate hit targets.
Inspect hover, selection, keyboard focus, loading, empty, and error states separately.
Show loading or unavailable status truthfully; never substitute a fake successful base.
Do not change coordinates, coordinate transforms, projection, or data origin as a style fix.

## Record the result

Summarize the task, design choices, affected surfaces, and supported capabilities.
Record deliberate limitations, including raster constraints or missing provider credentials.
Capture before and after at fixed geographic extents and representative UI states.
Distinguish code inspection, documentation review, and executed visual validation.
Read `visual-qa.md` before declaring the map ready.
