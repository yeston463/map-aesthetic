# Theme intent contract

This contract separates visual intent from SDK implementation. JSON matching
the schema is neither Mapbox Style JSON nor an executable cross-engine adapter.
Keep the target project's native configuration and layer semantics intact.

## Files and validation

- [Schema](../assets/theme.schema.json): JSON Schema draft 2020-12, contract version `1.0`.
- [Quiet analysis](../assets/themes/quiet-analysis.json): low-noise analytical context.
- [Night operations](../assets/themes/night-operations.json): dark operational context.
- [Public guide](../assets/themes/public-guide.json): legible public-facing navigation.
- [Validator](../scripts/validate_theme.py): shape, UI contrast, measured color separability, and cross-field invariants.

Python 3.10+ and `jsonschema` are needed for the optional validator. Reading or
using the skill does not require Python, Node, a map account, or any demo dependency.

## Interface tokens

`ui` describes surfaces, ordinary and secondary text, borders, accent and its
foreground, focus color, font stack, corner radius, and spacing unit. Colors are
opaque six-digit hex. Pixel values are CSS pixels. `spacingPx` is a design unit,
not a directive to give every control the same size.

Check `text` and `mutedText` on `surface`, and `accentText` on `accent` at 4.5:1
or better for ordinary text. Actual transparency, disabled states, text over maps,
focus indicators, imagery, and large text need contextual inspection. The palette
alone does not establish accessibility conformance.

## Measured separability floors

Color distance is measured in CIEDE2000, because a WCAG luminance ratio is the wrong
instrument for map fills: two classes can share identical lightness and still be
obvious to distinguish, and two fills can clear 1.3:1 and still be invisible.

| Check | Floor |
| --- | --- |
| `water`, `park`, `roadCasing` against `land` | dE2000 at least 5 |
| every `categorical` pair, normally and under a red-green simulation | dE2000 at least 5 |
| `sequential` adjacent stops, plus monotonic lightness | dE2000 at least 5 |

A difference near 2.3 is a just-noticeable difference across a large flat area, so 5
asks for a clearly visible edge rather than a barely detectable one. The floors
refuse an invisible surface; they do not certify a legible one. Thin strokes at
small widths, texture, halos against roads, and the real basemap all still need
inspection. `labelHalo` is deliberately excluded: a halo normally matches `land` so
text reads across darker features, and requiring separation there would reject a
correct design.

`sequential` runs from low value at index 0 to high value at the last index. On a
light basemap the ramp normally darkens toward the high end; on a dark basemap it
normally lightens. Both are correct, so the validator checks monotonic lightness and
step size rather than a direction. Record which direction a theme uses before binding
it to data, because binding index 0 to the wrong end inverts the map silently.

## Cartographic tokens

| Group | Meaning | Adaptation |
| --- | --- | --- |
| `land`, `water`, `park`, `road`, `roadCasing`, `boundary` | Context hierarchy | Map to discovered vector features or provider styles. For raster basemaps, record these as unavailable unless a suitable source already exists. |
| `label`, `labelHalo`, `labels` | Text and density intent | Map to supported fonts, halos, visibility, priority, and collision mechanisms. Density is a direction, not a common SDK parameter. |
| `categorical` | Distinct unordered classes | Associate colors with stable class IDs. Preserve existing associations unless the task authorizes a change. |
| `sequential` | Ordered low-to-high visual ramp | Inspect perceptual ordering and contrast against the actual background. Do not replace a diverging ramp with this sequence. |
| `route` | Business line plus casing | `casingWidthPx` is total outer stroke width, greater than `widthPx`. Usually requires two strokes/layers. |
| `site` | Business point plus outline | `radiusPx` is radius, not diameter; convert for SDKs that use size or device pixels. |
| `selection` | Selected feature emphasis | Use a redundant outline/halo or shape; color alone may not distinguish the state. |
| `scale` | Ground-resolution thresholds | Values are approximate meters per CSS pixel near the view center. Convert to native scale/zoom using the active projection and latitude. |

Below `detailBelowMpp`, show task-relevant fine detail; above
`overviewAboveMpp`, prefer distribution and aggregation; between them use the
middle view. This does not mandate clustering or interpolation. Implement only
what the SDK and data support. Theme presets are illustrative, not geographic
scale recommendations for every project.

## Semantic binding lives in the target project

For each editable role, record the target layer/source or component, native
properties, units, capability level, application timing, and restoration path.
An illustrative binding record, not a prescribed runtime API:

```json
{
  "role": "business.route",
  "target": "existing-route-layer",
  "capability": "native",
  "tokens": ["cartography.route.color", "cartography.route.widthPx"],
  "timing": "after target layer is ready",
  "preserves": ["feature IDs", "coordinates", "selection events"]
}
```

Never invent target layer IDs from this example. Inspect the real project.
Keep class breaks, normalization, filters, aggregation meaning, and coordinate
transformations outside the aesthetic theme. A necessary change to these belongs
in a separate, explicit task decision.

## Extension rules

Schema v1 rejects unknown properties so typos fail visibly. Put provider-specific
options in native configuration, not an unrecognized token. A new semantic field
needs a schema change, an example, documented units, validator coverage where
meaningful, and consideration of existing themes. Change `schemaVersion` when
an incompatible contract change is introduced.

The bundled demo implements only the subset it can demonstrate with local
Leaflet vectors. It does not render quantitative ramps or implement real label
collision, provider basemap editing, clustering, or 3D.
