# Leaflet aesthetic adapter

Documentation checked: **2026-11-02**.
Coverage: implementation guidance; no claim of live tile-service validation.
Any local synthetic demo must report its own tested scope separately.

## Identify the actual stack

- Read the resolved `leaflet` version from the lockfile or script URL.
- Record plugins, renderer choice, CSS imports, CRS, and tile providers.
- Detect React Leaflet, Vue wrappers, or framework-owned layer components.
- Do not infer engine capability from a wrapper's component name.
- The checked Leaflet reference describes 1.9.4; do not treat it as every version's contract.
- React Leaflet documents which props are mutable; changing an arbitrary creation prop may do nothing.
- Keep declarative components as the owner when the application already uses them.

Sources: [Leaflet reference](https://leafletjs.com/reference.html), [React Leaflet component props](https://react-leaflet.js.org/docs/api-components/).

## Capability assessment

| Surface | Assessment | Implementation decision |
| --- | --- | --- |
| Standard raster tiles | Semantic recoloring unavailable | Choose a compatible styled source, if authorized. |
| WMS or imagery | Conditional | Inspect provider-side style parameters and service permissions. |
| Vector-tile plugin | Unknown until inspected | Use that plugin's versioned API, not core Leaflet methods. |
| Polyline, polygon, circle paths | Native | Use path options or `setStyle`. |
| GeoJSON features | Native | Resolve per-feature styling; point handling can differ. |
| Marker icons | Native | Use `Icon`/`DivIcon` and `setIcon`; preserve anchors. |
| Popups, tooltips, controls | Native plus application CSS | Scope UI styles to the map container. |
| Automatic label collision | Plugin-specific | Never promise Mapbox-like collision behavior from core Leaflet. |

Raster roads, water, and text arrive as pixels. Opacity or a CSS filter cannot independently restyle those features.
Treat a whole-tile filter as a documented approximation only when the task accepts its effect on labels and imagery.
Never apply that filter to the complete map container.

Source: [Leaflet layer and UI APIs](https://leafletjs.com/reference.html).

## Translate visual intent

- Map semantic colors to existing feature categories; retain classification breaks.
- Convert a route hierarchy into deliberate casing, stroke width, and contrast.
- Style GeoJSON points through their actual marker implementation.
- A DOM marker's CSS width, a circle marker's pixel radius, and a geographic circle's radius are different quantities.
- Keep icon size, icon anchor, popup anchor, and keyboard focus coherent.
- Use properties already present in data; do not infer new risk categories from color choices.
- Core Leaflet has no universal label priority/halo expression language.
- Separate application tooltips from text baked into tiles.
- Derive scale rules from observed extents and label density, rather than copying another engine's zoom values.

Source: [GeoJSON styling and point handling](https://leafletjs.com/examples/geojson/).

## Pane order and interaction

Panes establish stacking contexts for groups of layers. Inspect existing panes before adding one.
The default stack places tiles below paths, then marker shadows/icons, then popups.
`bringToFront` and marker `zIndexOffset` do not provide unrestricted ordering across panes.

For separate provider-supplied label tiles:

1. Reuse or create a dedicated labels pane.
2. Set its z-index relative to existing business layers and popups.
3. Set `pointer-events: none` only on a decorative, noninteractive pane.
4. Leave interactive feature panes available to hit testing.

Do not set huge z-index values globally; check tooltips, selection, controls, and modal overlays together.
Pane assignment is normally a layer creation decision. Verify wrapper mutability before changing it in place.

Source: [Working with map panes](https://leafletjs.com/examples/map-panes/).

## Apply, reload, and restore

- Leaflet has no global style document or Mapbox `style.load` lifecycle.
- A theme update normally patches retained vector layers, icons, and scoped UI CSS.
- `map.whenReady` concerns map initialization, not completion of every later tile request.
- For a changed tile source, observe that layer's loading/error events with a bounded wait.
- Preserve the existing map instance, view, selection IDs, and interaction handlers.
- Store the active theme outside temporary hover styles.
- `GeoJSON.resetStyle` restores the original GeoJSON style; it may restore an older theme after a theme change.
- Resolve hover exit from the active base style when original and active themes differ.
- On component remount or layer recreation, initialize from the same active theme state.
- Remove task-added listeners on disposal; do not attach another listener on each toggle.

Source: [Map readiness, GeoJSON resetStyle, and events](https://leafletjs.com/reference.html).

## Performance and rollback

- Prefer patching owned layers to rebuilding every feature for a color change.
- Measure dense areas before adding thousands of DOM markers or permanent tooltips.
- Inspect existing Canvas/SVG choice before changing it; interactions and plugin behavior may differ.
- Debounce application-driven scale styling where continuous events create excessive work.
- Keep original tile configuration, attribution, icon objects, styles, and UI values before mutation.
- Roll back declarative source configuration plus runtime state; do not rely only on `resetStyle`.
- Restore the prior source if replacement fails; report network/provider failures separately from styling defects.
- Keep provider attribution visible and retain its required content.

These are project workflow recommendations, not an additional Leaflet compatibility guarantee.

## Evidence to capture

- Record exact version, wrapper, tile source type, plugins, and changed surfaces.
- Compare fixed extents at overview, working, and detail scales.
- Exercise hover, selected features, popup opening, keyboard focus, and theme toggling.
- Verify pane order at overlapping markers, polygons, and labels.
- Repeat remount/source-switch behavior if the application supports it.
- Record whether remote tiles loaded; synthetic geometry alone does not validate a provider's basemap.
- Distinguish documentation coverage, local synthetic verification, and actual application verification.
