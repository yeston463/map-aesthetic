# Verification record

Date: **2026-11-02**. All executed checks below ran locally on Windows x64.
This record is limited to the repository and its local synthetic demonstration.
No commercial provider account, external map style, production dataset, or
deployed GitHub project was exercised.

## Environment

- Python 3.13.6; validation tools declare Python 3.10+ compatibility.
- Node 24.19.0, npm 11.12.1.
- Leaflet 1.9.4, Vite 8.3.5, Playwright 1.64.1, pinned in the npm lockfile.
- Playwright Chromium / Chrome for Testing 156.0.8078.4.
- Desktop browser viewport: 1440 × 1000 CSS px.
- Narrow browser viewport: 390 × 844 CSS px; this is desktop Chromium viewport
  emulation, not a physical mobile device or a complete touch-gesture test.

## Executed checks

| Check | Result | Scope |
| --- | --- | --- |
| Bundled skill-creator `quick_validate.py` | Passed | Skill frontmatter and naming |
| `python scripts/check_project.py` | Passed | Metadata, 20 Markdown files' local links, self-contained skill resources, theme presets, package versions |
| `python -m unittest discover -s tests -v` | 11 passed | Validator rejection behavior, valid presets, archive safety, extracted skill validation |
| `python skills/map-aesthetic/scripts/validate_theme.py` | 3 presets passed | JSON schema, three UI text-contrast pairs, cross-field invariants |
| `npm run build` | Passed | Production demo assets built with Vite |
| `npm run test:browser` | 4 passed | Actual browser rendering and interactions described below |
| Independent forward evaluations | 2 passed | Static design/implementation proposals, not provider runtime |
| `python scripts/package_skill.py` | Passed | Skill-only ZIP; MIT notice included; generated caches excluded |

The Python tests exercise poor contrast, invalid sizes, unknown fields, swapped
scale bands, insufficient casing width, non-finite JSON, duplicate JSON keys,
case-insensitive duplicate colors, non-mutating validation, CLI failure, and
running validation from an extracted archive.

## Browser behaviors exercised

1. Both maps render actual Leaflet SVG vectors and retain visible Leaflet /
   synthetic-data attribution. No external resource request or page script error
   was observed during this initial-render check.
2. Selecting a site opens two popups. Repeated theme switching preserves selection,
   popups, and the count of existing vector objects. Clearing removes selection
   emphasis and closes both popups.
3. Overview, working, and detail controls change enabled-label density and
   synthetic meters-per-pixel in the expected order. Views stay synchronized
   through scale changes and keyboard panning.
4. At a narrow viewport the maps stack without horizontal document overflow.
   Keyboard site selection works. Selection and the popup persist when changing
   theme and resizing to desktop, with both map centers synchronized.

The first browser run exposed half-pixel center drift after keyboard pan and
resize. The maps had unequal effective viewport widths and independent resize
handling. The fix gives them equal widths with a grid separator and one shared
resize path. The final four-scenario browser run passed after this change.

## Visual evidence

These are real screenshots of the local browser-rendered fixture, not mock
provider maps or generated map images:

- [Desktop comparison](images/demo-desktop.png): plain versus Quiet Analysis.
- [Night and selection](images/demo-night.png): Night Operations with River Depot selected.
- [Narrow layout](images/demo-mobile.png): stacked maps, controls, legends, and site list.

Both views use the same source geometry and Leaflet `CRS.Simple`, where a local
unit represents a synthetic meter. The working view is centered at local
`[5300, 7200]`, zoom `-4`, approximately 16 synthetic meters per CSS pixel.
Those values are fixture coordinates, not latitude/longitude or real geography.

Visual inspection covered the rendered map and DOM together: the refined
background yields priority to the route and reduces default label density,
the dark map retains readable controls and popup content, and narrow layout
keeps the map panels and legends within the page. Edge clipping of geographic
labels remains ordinary viewport clipping; no automatic label-collision system
is implemented or claimed.

To regenerate documentation images, build the demo, start `npm run preview` in
one terminal, then run `node scripts/capture-demo.mjs` in another. Inspect the
resulting images before committing them. The capture command alone is not visual QA.

## Agent behavior evidence

See [the forward evaluation record](../evals/results/2026-11-02.md) for the two
executed source-based tasks: raster Leaflet refinement and Mapbox route recovery
through style switching. Only the requested static outputs were evaluated.
The other five behavioral scenarios have not been executed.

## Not validated

- ArcGIS, Mapbox, AMap, or Baidu runtime integration, credentials, or console publication.
- Real Leaflet provider basemaps, raster rendering, plugin interoperability, or other Leaflet versions.
- Production volume, performance benchmarks, device matrix, physical touch input, or full accessibility conformance.
- Quantitative ramp perception, automatic label collision, clustering, 3D, or style-JSON conversion.
- Other agent hosts' skill discovery and installation behavior.
- GitHub Actions execution, GitHub Release, or demo hosting at the time of these local checks.

CI is configured for Ubuntu and Windows validation plus an Ubuntu Chromium demo
job. Configuration is not a claim that those remote jobs have already run. Inspect
the [current workflow runs](https://github.com/yeston463/map-aesthetic/actions)
for remote CI status after a push.
