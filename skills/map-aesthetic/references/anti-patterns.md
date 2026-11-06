# Anti-patterns

The failures below are not taste judgements. They are the specific things that make a
map read as machine-made, and each one is stated so that a script or a person can
decide it.

This file is the companion to [cartographic design](cartographic-design.md): that
one says what a map should do, this one says what it must not do. Where the two
overlap, this one is the stricter.

Not every line below is exercised by the bundled demo, and not every number is
enforced by a script. [Implementation status](implementation-status.md) records,
claim by claim, what is implemented, what is a target, and what is a defect in
this document. Read it before treating a passing check as full compliance.

---

## 1. The hard red lines

### 1.1 No default street basemap under a data layer

A default provider street tile set is a photo of somebody else's design decisions:
its colours, its label sizes and its hierarchy were chosen for a general-purpose
map, not for this data. Under a thematic layer it reads as noise, and the data
looks pasted on.

- Never use a default OpenStreetMap raster tile set (`tile.openstreetmap.org`) as
  the basemap of a themed map. The exception is a navigation street view, where the
  street image is the content.
- Never stack a data layer on a basemap whose hierarchy the data cannot outrank.
  If the base is louder than the data, remove the base, mute it, or replace it.
- The check is not "is it pretty" but "does the eye land on the data first". If a
  reader's first click is on the basemap, the basemap won.

### 1.2 No raw saturated colour

Never `red`, `blue`, `#FF0000`, `#00FF00`, or any fully saturated primary. Pure
hues read as debug output and as alarm.

- Every colour is a **tint** — a pure hue mixed with neutral, or a desaturated
  step of it. A pure hue appears only as an accent over a very small area.
- The colour a reader sees most often is the least saturated one. Saturation is
  spent, not sprayed.
- Where a state must be loud, it is loud by **contrast and shape**, not by hue
  alone: an amber ring, a heavier stroke, a larger mark.

### 1.3 No opaque fill over the basemap

A thematic polygon's `fill-opacity` is never `1.0` when it sits over a basemap.
A full-opacity fill is a dead panel: it erases the roads, the water and the
texture underneath, and the reader loses the context that makes the region
meaningful.

- Default `fill-opacity` for a thematic polygon over a basemap: **0.35**.
- On hover it may rise to **0.65**, so the reader can see what is under it.
- These are starting values, not a fixed target. The
  [theme contract](theme-contract.md) allows 0.35–0.5 over a raster basemap and
  0.5–0.7 where polygons sit below the labels; the executable rules enforce only
  the red line (never 1.0), because a legitimate value depends on the ground.
- On a vector basemap, where the polygons can sit *below* the labels, 0.5–0.7 is
  fine, and a value near 1.0 is acceptable only for a deliberate selection or a
  no-data hatch.
- An opaque fill is right in exactly one place: a mask that hides the basemap on
  purpose, and says so in the legend.

### 1.4 No default popup

The engine's default popup is a white box with a triangular tip, a heavy shadow
and a small grey ×. It is the most recognisable sign of an unfinished map.

- The popup's wrapper, tip, close button and content are all restyled. The
  wrapper takes the theme's surface, radius and shadow; the tip takes the
  surface colour; the close button is a readable target.
- The close button has a hit area of at least 32 by 32 pixels and states its
  action to assistive technology.
- The popup's content is built by the application, not by the default text
  binding: what it is, its state, its numbers, its identifier.

### 1.5 No dense default pins

A default teardrop pin is a 25-pixel picture of a location. Thirty of them cover
the map and hide the data.

- Above **30 points**, the default pin is not used. The alternatives, in order:
  1. a circle or circle-marker layer whose radius carries a value;
  2. a cluster layer, with the cluster count drawn on it;
  3. a hexbin or density layer, when only the density matters.
- A pin is a label with a picture on it. If the map does not need a label, it
  does not need a pin.
- Below 30 points the pin is still a poor default: a circle is smaller, does not
  scale with zoom by accident, and can carry a value.

---

## 2. The basemap and the colour contract

### 2.1 Choosing a basemap

**The provider is a compliance decision before it is a design decision.** In
China, the allowed basemap sources are Tencent Maps, AMap (Gaode), Baidu Maps and
NASG Tianditu. Carto, Mapbox and the public OpenStreetMap tile servers are not
on that list, and their vector styles render OpenStreetMap data with a public
tile service. Use them only when the work is explicitly outside China and the
project's own terms allow it.

| Situation | Basemap | Notes |
| --- | --- | --- |
| China area, no token of your own | **Tianditu** (`vec_w` + `cva_w`, WMTS) | Free key, applied for at `console.tianditu.gov.cn/api/key`. Carry the审图号 GS(2023)336号 in the attribution. |
| China area, a provider is already in use | That provider's vector style | Keep the provider's coordinate system and attribution exactly as they are. |
| The project has its own vector basemap | It | The best case: every layer is restyleable. |
| A synthetic or offline demo | The project's own geometry | No provider, no key, no network, no attribution obligation beyond the repository's. |

Two things to check before choosing:

- **The key.** Tianditu, CARTO, Mapbox and Mapbox Studio all need one. "Free"
  means a key is issued without payment, not that the key is unnecessary. A CARTO
  key is a minute away by e-mail and the free tier is 5M requests a month for
  non-commercial use, 1M for commercial — so the request itself is the
  difference between a usable key and a rejected request.
- **The attribution.** It is a licence condition, not a courtesy. CARTO requires
  "© OpenStreetMap contributors, © CARTO" visible on the map; Tianditu requires
  its审图号. Hiding, fading or covering an attribution is a breach, and the
  provider can suspend the key over it.

### 2.2 The scientific colour scales

Do not invent a rainbow. A rainbow has no perceptual order, so a reader cannot
tell whether the middle colour is more or less than the ends.

These scales are perceptually ordered and tested. Take one whole, or state that
you have built a different one and why.

| Scale | Steps | Use |
| --- | --- | --- |
| Teal / Cyan Glow | `#082a4d #0d588a #168b98 #38b99e #88e09b #e2f9b8` | Dark basemap, luminous data, flow and density |
| Magma / Sunset | `#180f3e #451077 #721f81 #9f2f7f #cd4071 #f1605d #fd9567 #fcfdbf` | Dark basemap, heat and magnitude |
| Emerald to Deep Blue | `#e0f3db #a8ddb5 #7bccc4 #4eb3d3 #2b8cbe #08589e` | Light basemap, sequential value |
| Categorical | `#3b82f6 #10b981 #f59e0b #ec4899 #8b5cf6 #06b6d4` | Classes, at most six, high separation and low glare |

Rules that travel with them:

- **A sequential scale runs one way.** The lightest is the lowest value. On a dark
  basemap it runs the other way: the darkest is the lowest. State which in the
  style, so nobody binds the wrong end.
- **A diverging scale is centred on a meaningful value**, not on the middle of the
  range. The mean, a target or zero.
- **A categorical scale is at most six classes.** Past six, the reader has to
  look them up; a legend becomes a lookup table.
- **The class breaks are computed from the data and shown in the legend.** A
  restyle may not move a feature between classes.

---

## 3. Layer rendering

### 3.1 Polygons

- Fill opacity 0.35 at rest, 0.65 on hover, with the transition eased and short
  (140ms in, 200ms out — [interaction](interaction.md)).
- The boundary is a **separate line layer**, not the polygon's own stroke: a
  colour about 25% lighter than the fill, 1.2px wide. On hover the stroke widens
  to 2.5px and turns white or the accent.
- The boundary layer is above the fill layer, so the outline is never muddied by
  a neighbouring fill.
- A no-data class is a texture, not a colour: a hatch at low opacity with its own
  legend entry and a count.

### 3.2 Points

Two layers, not one:

- **The glow.** Radius 10–16px, opacity 0.2, blur 0.8. It gives the point a
  presence on a busy ground without making the point itself bigger.
- **The core.** Radius 4–6px, opacity 0.95, with a 1px outline in the inverse
  colour — dark on a light basemap, light on a dark one — so overlapping points
  do not merge into a blob.

The core's radius carries a value when the data has one: throughput, magnitude,
count. A radius that means nothing is a decoration.

### 3.3 Camera and pointer

- Every interactive feature sets `cursor: pointer`. A feature that responds to a
  click and does not say so is a trap.
- A camera move is a smooth transition, not a jump. The API and the unit are
  SDK-specific: Leaflet uses `map.flyTo(latlng, zoom, { duration: 1.6 })`
  (seconds), Mapbox GL JS / MapLibre use
  `map.flyTo({ center, duration: 1600, essential: true })` (milliseconds).
  `essential` is a Mapbox/MapLibre option and **does not exist in Leaflet**.
  Under reduced motion, shorten the duration through the engine's handling of
  `prefers-reduced-motion`; do not remove the move.
- An instant `animate: false` pan is correct for a boundary correction after a
  selection, and wrong as a substitute for a camera tour. Name which one an
  interaction is, so a checker does not have to guess.
- The map does not move under the reader's hands. A pan caused by a hover, a
  tooltip or a resize is a defect.

---

## 4. Floating interface and typography

A map is the page. The panel is an instrument on top of it, not a page with a
picture in it.

### 4.1 The floating panel

A control bar, a legend or a detail card floats over the canvas. Its treatment:

| | Dark theme | Light theme |
| --- | --- | --- |
| Ground | `rgba(15, 23, 42, 0.78)` | `rgba(255, 255, 255, 0.82)` |
| Blur | `backdrop-filter: blur(16px)` | same |
| Border | `1px solid rgba(255,255,255,0.1)` | `1px solid rgba(15,23,42,0.08)` |
| Radius | 12px | 12px |
| Shadow | `0 10px 30px -10px rgba(0,0,0,0.5)` | `0 10px 25px -5px rgba(0,0,0,0.08)` |

The blur needs a backdrop to blur. Over a flat ground it does nothing but cost
frames, so a panel over a plain map gets a solid ground instead.

### 4.2 Numbers

Every figure the reader compares — a coordinate, an area, a count, a ratio — is
set in tabular figures: `font-variant-numeric: tabular-nums`. Proportional
digits make a column of numbers jitter as it updates, and a coordinate that
reflows is a coordinate that cannot be copied.

- Coordinates are set in a monospace face with the hemisphere written out:
  `35.6762° N, 139.6503° E`.
- A number keeps its unit next to it, and the unit is not repeated in every
  row of a table.

### 4.3 The legend

The legend is part of the map, not a caption for it. It sits in a corner of the
canvas, over the map, styled like the rest of the floating interface.

- It carries the class breaks in the same order as the ramp runs, with the
  unit stated.
- Every colour in it appears on the map, and every data colour on the map
  appears in it.
- On a dark theme the legend's ground is the dark surface, and its text passes
  the contrast floor on that ground, not on the map's ground.

---

## 5. The verification loop

Before the work is handed over:

1. **Look at the attribution.** The engine's default attribution is a white bar
   with a link. It has to be restyled to a small, quiet line that still satisfies
   the provider's terms — visible, legible, and not hidden behind a panel.
2. **Look at the map in a browser.** Screenshot it. Confirm:
   - the basemap tiles actually loaded, with no blank or error tile;
   - the floating panel separates from the map behind it;
   - nothing overlaps on a phone or a desktop, and no panel covers the feature
     the reader just selected.
3. **Run the checks.** `scripts/consistency.mjs` decides what a script can
   decide; the rest is for the eye.

A map that has not been seen in a browser has not been verified. "The code looks
right" is not evidence that the tiles loaded.

---

## 6. The one-line self-check

Read the screenshot without the brief. Ask:

- Does the eye land on the data, or on the basemap?
- Is any colour so saturated that it looks like an error?
- Is any polygon so opaque that the reader has lost the ground under it?
- Does the popup look like it belongs to this map?
- Do the numbers line up in a column?
- Can the reader tell which name belongs to which thing?

If any answer is wrong, that is the next thing to fix, and it is on this page.
