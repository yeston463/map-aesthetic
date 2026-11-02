# Baidu Maps aesthetic adapter

Last official-document check: **2026-11-02**.
Coverage: documentation and implementation guidance only. No real-AK, browser, console, or production integration has been validated by this project.

## Detect the SDK, not just the namespace

1. Inspect the loaded `api.map.baidu.com/api` script, its `v` and `type` parameters, any loader configuration, and framework wrappers.
2. Record whether the application uses legacy BMap 2.0 / 3.0, JSAPI GL, or 4.0 behavior.
3. `BMap` and `BMapGL` alone are insufficient version evidence: 4.0 supports compatibility namespaces.
4. Preserve existing SDK loading and compatibility settings. Do not add a second SDK script for theming.
5. Record optional MapVGL, BMapLib / BMapGLLib, and drawing plugins independently.
6. Preserve the app's coordinate convention, data, camera, filters, and interactions during aesthetic work.

The official 4.0 migration guide checked on this date identifies 4.0 as the current version.
That is a dated documentation observation, not a permanent latest-version guarantee. [Migration guide](https://lbsyun.baidu.com/docs/jsapi?title=jsapi4%2Fupgrade)

| Observed loading / behavior | Styling branch | Important caution |
| --- | --- | --- |
| Legacy 2.0 / 3.0 BMap | Read that exact version's style contract | Existing projects can differ in rendering and supported style formats. |
| GL, often `type=webgl&v=1.0` | `setMapStyleV2({ styleId / styleJson })` | GL only supports the newer personalization path. |
| 4.0, usually `v=4.0` | Prefer `setMapStyle({ styleId / styleJson })` | Migration docs mark `setMapStyleV2` deprecated. |
| 4.0 using BMapGL compatibility | Inspect pre-initialization compatibility settings | Namespace does not prove GL runtime behavior. |

GL details: [personalized maps](https://lbs.baidu.com/docs/jsapi?title=jspopularGL%2Fguide%2Fcustom).
4.0 entry: [setting map style](https://lbsyun.baidu.com/docs/jsapi?title=jsapi4%2Fquickstart%2Fstyle).

For 4.0, official documentation supports loader, synchronous script, and callback-based loading.
Follow the host project's loader, pin the observed version, and create map objects only after loading completes. [Loading](https://lbsyun.baidu.com/docs/jsapi?title=jsapi4%2Fguide%2Fconcepts%2Fload)

## Capability matrix

| Surface | 4.0 entry / GL equivalent | Useful aesthetic work | Boundary |
| --- | --- | --- | --- |
| Basemap | `setMapStyle` / `setMapStyleV2` | Feature visibility, geometry / label color through native style rules or published ID | Provider feature taxonomy and version determine available rules. |
| Marker | `Icon`, `Marker.setIcon` | Brand shape, image size, visual state | Image size and geographic anchor must remain consistent. |
| Vector marker | 4.0 `Symbol` | Simple semantic vector icons | Do not assume the same symbol implementation across all older versions. |
| Lines | `Polyline` style options and setters | Stroke color, width, opacity, dashes | Preserve geometry and route meaning. |
| Areas | `Polygon` options; version-specific visualization layers | Fill / border hierarchy and selection | Native overlays and batch layers have different APIs. |
| Text / popup | Version-matched Label / InfoWindow or custom overlay | Typography and content hierarchy | Verify the exact content and layout contract before coding. |
| Controls | `addControl`, `removeControl`, documented positioning | Avoid collisions, group navigation, adjust placement | Do not rely on undocumented provider DOM selectors. |
| App chrome | App-owned DOM / CSS | Search panel, legend, cards, buttons | Keep app CSS scoped outside provider-rendered internals. |

Marker behavior: [4.0 marker styles](https://lbsyun.baidu.com/docs/jsapi?title=jsapi4%2Fguide%2Foverlaypoint%2Fmarkerstyle).
Line behavior: [4.0 polylines](https://lbsyun.baidu.com/docs/jsapi?title=jsapi4%2Fguide%2Foverlayline%2Fpolyline).
Area styling: [4.0 area layers](https://lbs.baidu.com/docs/jsapi?title=jsapi4%2Fguide%2Fvisual%2Fpolygon).
Controls: [4.0 controls](https://lbs.baidu.com/docs/jsapi?title=jsapi4%2Fguide%2Fmap%2Fcontrol).

## Translate visual intent

The following are adapter recommendations, not extra SDK guarantees.

| Intent | Implementation direction | Required review |
| --- | --- | --- |
| Quiet basemap | Use native style rules to soften roads and optional POI labels | Preserve orientation landmarks at useful zoom levels. |
| Branded background | Prepare or reuse a provider-native style JSON / published style ID | Review feature categories and accepted color syntax in the target SDK. |
| Highlight operational data | Make business overlays distinct from the basemap; use meaningful outlines and opacity | Check overlap and dense intersections. |
| Categories / status | Translate semantic tokens to Icon / Symbol / line / area styles | Verify legend, selected state, and non-color cues. |
| Premium app UI | Restyle app-owned panels; reposition controls using documented options | Check narrow viewports, touch targets, and attribution clearance. |
| Day / night mode | Switch approved style plus owned overlay and UI tokens | Recheck label readability and every interaction state. |

Do not translate shared tokens directly into unverified Baidu `featureType` names.
Start from a verified native JSON example or an owner-exported console style, then edit the necessary rules.
If no supported rule matches the requested treatment, report the limitation instead of silently approximating it.

## Small version-aware integration fragment

This fragment assumes an existing initialized map and explicit version evidence; it is not a verified runnable example.

```js
function applyBaiduBasemapStyle(map, sdkBranch, style) {
  if (sdkBranch === "4.0") {
    map.setMapStyle(style);
    return;
  }
  if (sdkBranch === "gl") {
    map.setMapStyleV2(style);
    return;
  }
  throw new Error("Confirm legacy Baidu style contract before applying changes");
}

// Use a published owner-provided ID, or verified native JSON.
applyBaiduBasemapStyle(map, observedSdkBranch, { styleId: configuredStyleId });
```

For GL, official guidance requires style application after `centerAndZoom` initialization.
For 4.0, apply the style early after map initialization. [GL](https://lbs.baidu.com/docs/jsapi?title=jspopularGL%2Fguide%2Fcustom), [4.0](https://lbsyun.baidu.com/docs/jsapi?title=jsapi4%2Fquickstart%2Fstyle)

## Lifecycle, compatibility, and rollback

- Snapshot the app's configured style ID / JSON, owned overlay styles, control placement, and camera before editing.
- Do not assume the SDK can recover an old console style definition; retain the application's original config or a prior published style.
- Reuse map and overlay instances for visual updates. Keep a registry of objects and listeners owned by the patch.
- Remove only owned controls / overlays during rollback; preserve search and other business objects.
- Follow the detected SDK's disposal contract in the existing map owner's unmount cleanup.
- Guard asynchronous loading and style work against unmounts and stale requests.
- When changing Icon attributes in 4.0, reapply the icon with `marker.setIcon(icon)` so the marker refreshes reliably. [Marker styles](https://lbsyun.baidu.com/docs/jsapi?title=jsapi4%2Fguide%2Foverlaypoint%2Fmarkerstyle)
- SDK migration remains separate work; do not upgrade as a side effect of making the map attractive.

4.0 migration documentation describes `BMapGL.apiVersion = 'gl'` and `BMapGL.uiVersion = 'gl'` compatibility options.
Both belong before map creation and must not be changed during runtime; inspect existing settings, do not toggle them as themes. [Migration guide](https://lbsyun.baidu.com/docs/jsapi?title=jsapi4%2Fupgrade)

## Performance and visual checks

- Avoid replacing every marker or rebuilding all layers when a selection changes.
- Keep DOM overlays small; benchmark dense views before adding rich HTML cards to every point.
- Treat MapVGL and other visualization packages as separate adapters with their own style and lifecycle contracts.
- Load the SDK and optional packages once; use the application's established readiness signal.
- Compare the same coordinates, zoom, camera, dataset, and viewport in before / after captures.
- Inspect overview, working, and street zooms; include empty, dense, selected, loading, and failure states.
- Check marker anchors, overlap, popup edges, label contrast, and controls on both narrow and wide viewports.
- Record real console / network errors; a mock preview is not evidence of successful AK or style authorization.

## Credentials and console-dependent delivery

Loading requires an account's AK or an existing configured proxy path. Preserve the project's credential channel.
GL's official personalization guide requires the published style ID and AK to belong to the same user.
It also warns that a deleted style ID falls back to the default basemap. [GL personalization](https://lbs.baidu.com/docs/jsapi?title=jspopularGL%2Fguide%2Fcustom)
For 4.0, recheck ownership and publication requirements against the actual account and current console instead of assuming legacy rules are complete.

Without a usable AK or console access, deliver a patch with configuration placeholders, a provider-native style specification, and explicit owner steps.
Include a feature-to-color / visibility table, required style publication action, expected screenshots, and a clearly labeled mock when useful.
Retain the existing usable style until the configured replacement is available.
Mark delivery **documentation-only** or **unverified with a real AK**; never fabricate an AK, style ID, or success screenshot.

## Claims this adapter must not make

- BMap always means 2.0 / 3.0, or BMapGL always means the historical GL runtime.
- All Baidu versions share one style method, color syntax, feature taxonomy, or overlay implementation.
- Provider style JSON converts losslessly to another SDK's style JSON.
- CSS can selectively recolor the entire rendered basemap or every native control.
- An attractive preview verifies credentials, account entitlement, browser support, or production performance.
- The dated 4.0 documentation observation remains valid without a future recheck.

All official links above were checked on **2026-11-02**. Recheck the exact observed SDK before implementation.
