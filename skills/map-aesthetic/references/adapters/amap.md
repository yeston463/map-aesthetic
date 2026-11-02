# AMap JSAPI aesthetic adapter

Last official-document check: **2026-11-02**.
Coverage: documentation and implementation guidance only. No real-key, browser, console, or production integration has been validated by this project.

## Detect before editing

1. Find the actual loader: `AMapLoader.load`, `@amap/amap-jsapi-loader`, a direct `webapi.amap.com/maps` script, or a framework wrapper.
2. Record the requested JSAPI version, loader version, optional AMapUI / Loca versions, and the code that owns the map instance.
3. Inspect both lockfiles and runtime loading. An installed wrapper does not prove which SDK version reaches the page.
4. Treat `window.AMap` as a provider signal, not sufficient version evidence.
5. Preserve the existing loading path. Do not inject another SDK script to apply a theme.
6. Keep coordinates, sources, business filters, camera rules, and interaction semantics unchanged unless the task includes them.

The official 2.0 quick start explicitly passes `version: "2.0"` to the loader; it also documents a different default when version is omitted.
Therefore, never infer 2.0 from the loader's name. [Loading and initialization](https://lbs.amap.com/api/javascript-api-v2/getting-started)

Record an evidence block in the delivery:

```text
provider: amap
sdkVersion: observed value or unknown
loader: observed entry point
mapOwner: component / hook / module
optionalPackages: observed values only
validation: documentation-only | locally-rendered | real-key-verified
```

## Capability matrix

| Surface | Supported entry point | Useful aesthetic work | Boundary |
| --- | --- | --- | --- |
| Basemap theme | `mapStyle` / `map.setMapStyle(...)` | Select an official style or an existing published custom style | This path accepts an AMap style URI; it is not a generic Mapbox style JSON importer. |
| Basemap content | `map.setFeatures(...)` | Reduce background clutter | Documented groups are `bg`, `point`, `road`, `building`; groups are coarse. |
| Marker image | `AMap.Icon`, marker `icon` | Consistent marker shape, size, image resolution | Keep the geographic anchor and hit target correct. |
| Marker HTML | marker `content` | Branded badges, counts, compact cards | `content` overrides `icon`; app-owned DOM needs scoped CSS and safe content handling. |
| Lines / areas | `Polyline` / `Polygon` style options, `setOptions` | Stroke, fill, opacity, dashes, selected state | Aesthetic changes must not rewrite geometry. |
| Popup | custom `InfoWindow` content | Typography, spacing, action hierarchy | Content is app UI; retain close, focus, and pointer behavior. |
| Built-in controls | plugins and `map.addControl` / `removeControl` | Position, visibility, spacing | Per-control options differ; arbitrary native skinning is not promised. |
| AMapUI controls | `BasicControl`, documented theme class | Theme app-visible control surfaces | Separate dependency and version; inspect before using. |

Basemap and content entries: [custom maps](https://lbs.amap.com/api/javascript-api-v2/guide/map/map-style).
Marker entries: [custom markers](https://lbs.amap.com/api/javascript-api-v2/guide/amap-marker/custom-marker).
Shape entries: [2.0 overlay example](https://lbs.amap.com/demo/javascript-api-v2/example/overlayers/overlaygroup).
Popup entry: [quick start](https://lbs.amap.com/api/javascript-api-v2/getting-started).
Control entries: [controls and AMapUI](https://lbs.amap.com/api/javascript-api-v2/guide/overlays/toolbar).

## Translate visual intent

Treat the following as adapter recommendations, not additional SDK guarantees.

| Intent | AMap implementation direction | Evidence to capture |
| --- | --- | --- |
| Quiet analytical map | Start from an official restrained theme; reduce optional content groups only when context remains readable | Overview, district, street screenshots |
| Brand-colored land / water / roads | Prepare a console style specification and apply the resulting published style URI | Approved palette, owner-provided style ID |
| Data above background | Lower background contrast before increasing overlay saturation; use clear outline / fill hierarchy | Dense and sparse data views |
| Semantic categories | Map category tokens to marker assets and line / area options | Legend-to-map color agreement |
| Hover / selected / disabled | Store explicit style values for each state; update only affected owned objects | Pointer and keyboard interaction screenshots |
| Compact controls | Use documented placement options or an app-owned control layer | Narrow viewport and touch overlap checks |

Use lightness and line weight to build hierarchy. Do not solve every contrast problem by making the basemap darker.
Keep attribution, scale, and essential navigation visible in the accepted layout.
When a requested label treatment has no verified control in the detected version, record it as unsupported or console-dependent.

## Minimal application pattern

This is an integration fragment, not a complete runnable or verified sample.
It assumes an existing loaded 2.0 map and a theme chosen for the user's task.

```js
const previous = {
  style: map.getMapStyle(),
  features: [...map.getFeatures()],
};

map.setMapStyle("amap://styles/whitesmoke");
// Optional, after checking the information the application requires:
map.setFeatures(["bg", "road", "building"]);

function rollbackAestheticChange() {
  map.setMapStyle(previous.style);
  map.setFeatures(previous.features);
}
```

Use the Map reference matching the actual SDK for getters, setters, and disposal.
The official Map reference documents `getMapStyle`, `getFeatures`, `remove`, and `destroy`. [Map reference](https://lbs.amap.com/api/maps-javascript-api/reference/amap-map/map)
Do not call `destroy()` when merely reverting a theme on a map owned by another component.

## Lifecycle and rollback

- Wait for the existing loader promise and required plugin callback before touching the SDK.
- Capture the previous style URI, feature groups, owned overlay styles, and owned control state before mutation.
- Reuse the map instance for theme changes. Recreating it can discard listeners, camera state, and search overlays.
- Keep a registry of objects and listeners created by the patch; undo only those objects and listeners.
- Use existing framework unmount cleanup; only the map owner should destroy the map.
- Guard asynchronous theme work against a component unmount or a newer theme request.
- Restore app-owned marker markup and scoped classes as well as map style values.
- If a console style was edited in place, code rollback alone may not restore its old appearance; keep a separate prior published style when available.

## Performance and visual checks

- Avoid thousands of new DOM badges merely to improve marker appearance; measure density and pan behavior first.
- Update changed objects in place; do not clear and reconstruct every overlay on each pointer movement.
- Load only plugins required by the task and already approved for the project.
- Debounce expensive application work triggered by camera changes; do not add perpetual theme animation.
- Inspect icon sharpness at normal and high device-pixel ratios, including marker anchors near the viewport edge.
- Compare identical center, zoom, bearing, pitch, data, and viewport before and after the change.
- Check at least overview, working, and street levels plus empty, dense, selected, loading, and error states.
- Record browser console failures separately from visual findings; a mock screenshot does not verify SDK loading.

## Credentials and console-dependent delivery

The official setup requires a web JSAPI key; its security configuration must match the account's documented setup.
Custom basemap styles require platform editing and publication before a style ID is available. [Setup](https://lbs.amap.com/api/javascript-api-v2/getting-started), [style publication](https://lbs.amap.com/api/javascript-api-v2/guide/map/map-style)

If access is unavailable, deliver:

1. Source changes using existing project configuration and clearly named placeholders.
2. A console specification: feature group, intended color / visibility, zoom range where applicable, and reference screenshot.
3. An owner checklist for supplying the existing key / security configuration and published style URI through the project's configuration channel.
4. A validation report marked **documentation-only** or **unverified with a real key**.

Do not invent a style ID, copy a credential into examples, or claim the basemap has rendered successfully.
Keep a usable existing theme until the owner-provided style is available; present a mock only as a labeled design preview.

## Claims this adapter must not make

- One style JSON produces identical output across AMap and other providers.
- CSS can selectively recolor every feature in the rendered basemap.
- All control interiors are stable public DOM or safe global CSS targets.
- AMapUI, Loca, third-party clustering, and native overlays share one styling API.
- Aesthetic work requires an SDK migration, coordinate conversion, or provider switch.
- Official documentation coverage proves account entitlement, pricing, browser support, or successful runtime integration.

## Official sources and recheck rule

Sources above were checked on **2026-11-02**. Recheck the detected SDK's official references before implementation.
Read version-specific caveats for advanced 3D, custom layers, labels, or optional packages instead of extending this table by assumption.
