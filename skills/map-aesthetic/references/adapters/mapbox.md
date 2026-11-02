# Mapbox GL JS aesthetic adapter

Documentation checked: **2026-11-02**.
Coverage: documentation-based guidance; no live Mapbox account, style, or service validation is claimed.

## Identify engine and style family

- Read resolved `mapbox-gl` version, CSS version, and script/bundler setup.
- Detect `react-map-gl`, framework lifecycle ownership, and controlled camera props.
- Check the wrapper's actual engine import; its name alone does not prove Mapbox rather than MapLibre.
- Record style URL/JSON, imports, projection, terrain, language, and imagery sources.
- Classify the style as Standard/Standard Satellite, a style importing them, or an editable classic/custom style.
- Inspect declared style/config schema and installed-version support before selecting properties.
- Keep existing credential injection; never generate, copy, or print an access token.

Sources: [Map API](https://docs.mapbox.com/mapbox-gl-js/api/map/), [react-map-gl engine-specific Map](https://visgl.github.io/react-map-gl/docs/api-reference/mapbox/map), [Style families](https://docs.mapbox.com/mapbox-gl-js/guides/styles/set-a-style/).

## Capability assessment

| Surface | Preferred entry | Boundary |
| --- | --- | --- |
| Standard basemap | Documented import configuration | Arbitrary internal basemap layer editing is not the contract. |
| Classic/custom vector style | Existing layer paint/layout and expressions | Inspect layer IDs, types, and source schema first. |
| Raster/imagery source | Raster properties or another source style | Per-road and per-label semantic edits are unavailable in baked pixels. |
| Business source/layer | Appropriate style layer and data expressions | Preserve IDs, classification, filters, and query behavior. |
| DOM markers/popups/controls | Application CSS and public APIs | Canvas paint settings do not theme DOM UI. |
| Terrain, lights, atmosphere | Version/style-supported APIs | Evaluate depth, occlusion, and device cost separately. |

Sources: [Set and configure a style](https://docs.mapbox.com/mapbox-gl-js/guides/styles/set-a-style/), [Sources and layers](https://docs.mapbox.com/mapbox-gl-js/guides/styles/work-with-layers/).

## Standard and imported styles

- Configure Standard with the documented import ID and supported config key.
- For the normal Standard root, the documented import ID is `basemap`.
- Initialization uses `config`; runtime updates use `setConfigProperty`.
- Available settings differ between Standard and Standard Satellite and can change by release.
- Inspect an application's imports instead of assuming every style uses `basemap`.
- Add owned business layers using the style's exposed `slot` insertion points.
- Standard exposes `bottom`, `middle`, and `top`; choose by visual intent and verify the rendered result.
- Do not depend on private basemap layer names to insert a route.
- Imported-style slots are named positions, not equivalents of Leaflet panes or global CSS z-index.
- Within a slot, explicit ordering still needs inspection; terrain/globe rendering may affect draped layers.
- Never promise arbitrary land/water/road token mapping when no config option exists.
- Mark unsupported theme values approximate or unavailable; propose a custom style only within task scope.

Sources: [Standard configuration](https://docs.mapbox.com/mapbox-gl-js/guides/styles/set-a-style/), [Layer insertion and draping](https://docs.mapbox.com/mapbox-gl-js/guides/styles/work-with-layers/), [Slots specification](https://docs.mapbox.com/style-spec/reference/slots/).

## Classic/custom styles and business layers

- Use `setPaintProperty` for valid paint properties of a known layer type.
- Use `setLayoutProperty` for layout properties such as visibility.
- Evaluate expressions before overwriting them with fixed values.
- Retain source-layer, geometry filters, category values, and classification breaks.
- Keep symbol font stacks compatible with available glyph resources and target languages.
- Inspect text/icon collision settings; forcing overlap can hide critical geography or labels.
- Preserve separate base, hover, selection, and alert semantics.
- Feature state may suit transient paint changes; verify property support and stable feature IDs first.
- Keep DOM marker styles separate from circle/symbol layer styles.
- Translate scale intent using rendered extents, projection, pitch, and target density.

Sources: [Source/layer manipulation](https://docs.mapbox.com/mapbox-gl-js/guides/styles/work-with-layers/), [Feature state and update cost](https://docs.mapbox.com/help/troubleshooting/mapbox-gl-js-performance/).

## Style loading and reset recovery

`setStyle` can discard sources and layers added at runtime. Reinstall owned additions after `style.load`.

Keep application-owned definitions outside the mutable style:

1. Retain source, layer, image, active theme, and selected-feature definitions.
2. Register one restoration handler with cleanup on disposal.
3. Restore required images and sources before dependent layers.
4. Check IDs before adding; repeated style events must not create duplicates.
5. Reapply theme and supported feature state after their dependencies exist.
6. Reestablish owned interaction bindings without duplicating listeners.

Do not use the initial `load` event alone for later style switches.
Do not mutate the style repeatedly from `styledata`; changes can trigger more style events.
Handle style/resource errors, and place a bound on screenshot readiness.
Use `idle` as useful settling evidence where appropriate; continuously updating sources need an application-specific condition.
Treat wrapper-declared `<Source>`/`<Layer>` restoration as wrapper-owned when applicable.
Do not create a second imperative copy of a component-owned layer.

Sources: [Persist sources and layers across styles](https://docs.mapbox.com/mapbox-gl-js/example/style-switch/), [Map events and lifecycle](https://docs.mapbox.com/mapbox-gl-js/api/map/), [react-map-gl ownership](https://visgl.github.io/react-map-gl/docs/api-reference/mapbox/map).

## Performance and rollback

- Prefer narrow paint/layout/config changes over a complete style replacement for every theme control.
- Avoid whole-source `setData` calls for a color-only change.
- Measure extra sources, layers, vertices, label complexity, and terrain on the target device.
- Use state-driven paint for supported transient interactions rather than rebuilding large datasets.
- Preserve original style/import configuration, owned layer definitions, images, and UI values.
- Capture camera/projection/terrain settings when the change actually touches them.
- Roll back using source configuration plus restoration state; a style JSON snapshot alone is incomplete.
- Keep attribution/logo requirements and existing credential handling intact.

Source: [Mapbox performance model and strategies](https://docs.mapbox.com/help/troubleshooting/mapbox-gl-js-performance/).

## Evidence to capture

- Record exact engine/wrapper versions, style family, import IDs, and supported changes.
- Compare fixed extent, bearing, pitch, projection, data, container size, and device pixel ratio.
- Check labels in actual languages, including glyph loading and fallback.
- Exercise business selection, feature queries, popup placement, and keyboard focus.
- Verify theme toggling, style switching, and component remount where supported.
- Inspect terrain/globe layer placement if used; a flat-map screenshot does not validate it.
- Report resource failures separately from visual failures.
- State whether results are documentation-only, synthetic, or tested against the real application.
