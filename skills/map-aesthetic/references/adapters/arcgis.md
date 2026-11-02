# ArcGIS Maps SDK for JavaScript aesthetic adapter

Documentation checked: **2026-11-02**.
Coverage: documentation-based guidance; authenticated services and real application behavior are not runtime-tested here.

## Identify version, view, and ownership

- Read the resolved `@arcgis/core` and component versions or CDN URL.
- Distinguish legacy 3.x code, 4.x applications, and 5.x APIs; latest documentation is not an installed-version guarantee.
- Identify ESM, legacy AMD, framework wrappers, and `arcgis-map`/`arcgis-scene` components.
- Inspect existing Calcite/component theme setup and CSS ownership before editing UI.
- Record `MapView` versus `SceneView`, spatial reference, basemap, and operational layers.
- Resolve portal/web map content before assuming the layer types it contains.
- Keep a cosmetic task within the existing architecture; a component migration is a separate change.

Sources: [SDK entry points and components](https://developers.arcgis.com/javascript/latest/get-started/), [MapView](https://developers.arcgis.com/javascript/latest/references/core/views/MapView/), [SceneView](https://developers.arcgis.com/javascript/latest/references/core/views/SceneView/).

## Assess each layer independently

| Actual layer | Styling surface | Important boundary |
| --- | --- | --- |
| `VectorTileLayer` | Style resource, style-layer paint/layout | Runtime helper support differs between 2D and 3D. |
| `TileLayer`/`WebTileLayer` | Cached image appearance/source | Individual raster roads and text are not client-side features. |
| `FeatureLayer` | Renderer, visual variables, labels, popup | Geometry, fields, renderer type, and view support govern options. |
| `GraphicsLayer` | Symbols of owned graphics | Do not assume it has a FeatureLayer renderer contract. |
| `MapImageLayer` | Server-rendered sublayers | Dynamic renderer/label changes depend on service capabilities. |
| `SceneLayer` | Supported renderer and 3D symbols | Scene data, cached attributes, and symbol type impose limits. |
| Imagery/elevation/other layers | Type-specific | Check the actual layer API before proposing adjustments. |

Sources: [VectorTileLayer](https://developers.arcgis.com/javascript/latest/references/core/layers/VectorTileLayer/), [FeatureLayer](https://developers.arcgis.com/javascript/latest/references/core/layers/FeatureLayer/), [MapImageLayer](https://developers.arcgis.com/javascript/latest/references/core/layers/MapImageLayer/), [SceneLayer](https://developers.arcgis.com/javascript/latest/references/core/layers/SceneLayer/).

Mark each requested change native, approximate, unavailable, or unverified for that layer and view.
A restylable vector basemap does not imply editable imagery or editable portal content.

## Vector basemap handling

- Inspect style-layer IDs, source layers, glyphs, sprites, and resource URLs.
- In supported versions, `loadStyle` replaces the entire vector tile style and reloads that layer.
- `setPaintProperties` and `setLayoutProperties` offer narrower updates.
- The checked documentation limits those two runtime helpers to **2D MapView**.
- Do not use Mapbox's singular `setPaintProperty` as an ArcGIS API name.
- In 3D, verify whole-style replacement and the intended style against that version's limitations.
- Preserve relative resource resolution when exporting or relocating style JSON.
- Do not assume every Mapbox expression or style extension is supported.
- `refresh` fetches layer data; the checked reference says it does not fetch the style.

Source: [VectorTileLayer style replacement, helpers, and limitations](https://developers.arcgis.com/javascript/latest/references/core/layers/VectorTileLayer/).

## Business symbology and labels

- Preserve renderer category values, class breaks, normalization, and field bindings.
- Change color/size/outline through the existing renderer's valid symbol structure.
- Clone SDK renderer or symbol objects with their supported clone methods where available.
- Keep a selected-feature highlight separate from base renderer changes.
- Account for visual variables that can override a symbol's fixed appearance.
- `labelingInfo` is an array of label classes; `labelsVisible` controls display.
- The checked FeatureLayer reference limits SceneView to one label class per feature.
- A 2D text halo and a 3D callout/occluded label are separate design problems.
- Match scale intent using actual view scale and layer limits; copied zoom thresholds are unreliable.
- Inspect `MapImageLayer` sublayer/service support before changing its renderer.
- Cached `TileLayer` sublayer properties are read-only in the checked Sublayer reference,
  except `legendEnabled`, `popupEnabled`, and the `popupTemplate` title. Do not report a
  legend or popup-title change on a cached sublayer as unavailable; renderer, labels,
  and visibility are the parts that are not.

Sources: [FeatureLayer labeling and rendering](https://developers.arcgis.com/javascript/latest/references/core/layers/FeatureLayer/), [Sublayer constraints](https://developers.arcgis.com/javascript/latest/references/core/layers/support/Sublayer/).

## UI theme

- Use the installed component/Calcite release's documented theme variables and slots.
- Keep popup content, legend semantics, search, and layer controls consistent with the application.
- Test keyboard focus and popup placement after spacing or font changes.
- Avoid brittle selectors targeting private internal DOM or Shadow DOM internals.
- Preserve attribution and portal licensing details.
- Check component lifecycle before mixing component-owned UI with imperative view UI.

Source: [SDK components and Calcite integration](https://developers.arcgis.com/javascript/latest/get-started/).

## Load, reset, and recovery

- Await view readiness and the relevant layer's loading promise before dependent mutations.
- Obtain a layer view through `whenLayerView` when the task depends on that rendered layer view.
- Handle rejected loads and unsupported view/layer combinations explicitly.
- Do not describe an ArcGIS basemap replacement as a Mapbox-style global reset.
- After basemap replacement, resolve its new layers and reapply only owned basemap overrides.
- Reapply runtime overrides after application-driven renderer replacement or layer recreation.
- For complete `loadStyle` replacement, await completion before follow-up style-layer changes.
- Keep temporary highlight handles and reactive watches disposable.
- Use bounded readiness waits; a blocked service must not leave QA waiting forever.

Sources: [MapView readiness and layer views](https://developers.arcgis.com/javascript/latest/references/core/views/MapView/), [reactiveUtils lifecycle](https://developers.arcgis.com/javascript/latest/references/core/core/reactiveUtils/).

## Performance, rollback, and evidence

- Measure dense symbols, label classes, transparency, and 3D geometry on the target device.
- Reduce visual complexity before increasing SceneView quality settings.
- Retain original basemap/style references, renderer clones, labels, UI values, and selected IDs.
- Roll back owned properties or source configuration; do not destroy the view merely to undo colors.
- Restore the existing view/camera, layer ordering, and popup behavior after changes.
- Compare fixed extent or camera, data, time, container size, and view type.
- Test overview/detail scales, selected states, overlapping labels, and UI focus.
- Exercise supported basemap switches, rerenders, and renderer resets.
- Report exact version, layer types, MapView/SceneView, service access, and observed results.
- Documentation coverage is not service compatibility or a performance benchmark.
