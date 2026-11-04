# Map Aesthetic

[简体中文](README.zh-CN.md) · [Project design / 项目设计](docs/project-design.zh-CN.md)

An agent skill for improving the cartography and interface of existing web maps.
It coordinates basemaps, business layers, labels, legends, controls, and popups
through a shared design process and SDK-specific guidance.

**Status: 0.2.0 local candidate.** Includes executable Leaflet and MapLibre synthetic cases,
scenario guides, and measured evidence. Five SDK families have documentation adapters;
Mapbox GL JS and other provider runtimes remain unverified. A supplied agent A/B attempt
was [invalidated by reference and cross-arm access](evals/ab-reviews/2026-11-02/README.md);
there is no valid independent effectiveness result yet.

![Actual Leaflet demo: identical synthetic vectors with plain and refined styling](docs/images/demo-desktop.png)

[Night theme and selection](docs/images/demo-night.png) · [Mobile layout](docs/images/demo-mobile.png)

## What it does

- Audits hierarchy, label density, symbol design, map/UI composition, and states.
- Produces design tokens and concrete changes in the existing application's SDK.
- Preserves data semantics, coordinates, feature identity, interactions, and attribution.
- Adapts to native capabilities instead of treating every provider's style JSON as interchangeable.
- Solves concrete map defects using [scenario decision guides](skills/map-aesthetic/references/scenarios/README.md).
- Verifies representative scales, selection, popups, theme changes, and narrow screens.
- Separates observed results, inferred causes, and checks that could not be run.

The repository distributes an instruction-based skill, references, optional
theme validation, executable case projects, and a demonstration. It does not contain a
universal map SDK wrapper, an automatic style converter, or a production integration for every provider.

## Coverage

| SDK family | Included guidance | Runtime evidence in this repository |
| --- | --- | --- |
| [Leaflet](skills/map-aesthetic/references/adapters/leaflet.md) | Raster/vector boundary, symbols, panes, controls, lifecycle | Local synthetic raster case ([cases/leaflet-raster/](cases/leaflet-raster/)) and vector demo; see the current verification record |
| [ArcGIS JS](skills/map-aesthetic/references/adapters/arcgis.md) | Layer types, renderers, labels, vector basemaps, UI | Documentation only; no runtime integration tested |
| [Mapbox GL JS](skills/map-aesthetic/references/adapters/mapbox.md) | Classic styles, Standard configuration/slots, style reload | Documentation and [unverified integration example](cases/mapbox-style/mapbox-gl-variant.js) only |
| MapLibre GL JS 6.16.0 | Local GeoJSON style restoration fixture | [Runnable local case](cases/mapbox-style/); does not validate Mapbox |
| [AMap / 高德](skills/map-aesthetic/references/adapters/amap.md) | Published styles, feature visibility, overlays, controls | Documentation only; no runtime integration tested |
| [Baidu / 百度](skills/map-aesthetic/references/adapters/baidu.md) | Version-aware styling, overlays, controls, compatibility | Documentation only; no runtime integration tested |

Documentation adapters are decision guides, not executable adapter classes.
Each records dated official sources; implementation must check the actual SDK version.

## Runnable cases

The repository ships two standalone, fully executable case projects under `cases/`:

1. **Leaflet Raster Basemap Case** ([cases/leaflet-raster/](cases/leaflet-raster/)):
   - Demonstrates visual refinement against **immutable raster tiles** where roads and labels cannot be independently recolored.
   - Solves unprominent business features, 10 colliding Chinese long labels, popup occlusion of markers, and 100% mobile sheet occlusion.
   - Delivers baseline, improved version, code diff ([IMPROVEMENT.patch](cases/leaflet-raster/IMPROVEMENT.patch)), pixel measurements, and exploratory raster filter/opacity variants.
2. **MapLibre Local Vector Style Case** ([cases/mapbox-style/](cases/mapbox-style/)):
   - Demonstrates vector style hierarchy, route casing, Chinese label halos, and day/night theme switching (`quiet-analysis` vs `night-operations`).
   - Implements idempotent `style.load` restoration ([restore.js](cases/mapbox-style/restore.js)) ensuring owned resources and selection survive eight serial switches in this fixture; heap-memory leaks are not measured.
   - Includes an unverified Mapbox GL JS integration example ([mapbox-gl-variant.js](cases/mapbox-style/mapbox-gl-variant.js)) and cloud setup steps ([REMAINING_STEPS.md](cases/mapbox-style/REMAINING_STEPS.md)).

Start the local case server:

```sh
npm run case:serve
```

Open `http://127.0.0.1:4174/cases/` in your browser. Run automated functional and aesthetic verification:

```sh
npm run case:verify
python scripts/measure_case_pixels.py
```

The verifier owns a temporary loopback server. Install Python development dependencies
for pixel measurement. These fixture regressions are not an agent A/B experiment.

## Scenario decision guides

Targeted, practical guidance for specific frontend map challenges is organized in [skills/map-aesthetic/references/scenarios/](skills/map-aesthetic/references/scenarios/README.md):

- [Dense points](skills/map-aesthetic/references/scenarios/dense-points.md): scale-dependent radius tiering, knockout strokes, and priority filtering.
- [Route and road confusion](skills/map-aesthetic/references/scenarios/route-road-confusion.md): dual-stroke casing (`casingWidthPx > widthPx`) and hue separation.
- [Thematic choropleth vs labels](skills/map-aesthetic/references/scenarios/thematic-choropleth-vs-labels.md): layer slot sinking, opacity calibration, and missing-data hatch patterns.
- [Chinese long label collisions](skills/map-aesthetic/references/scenarios/chinese-long-labels.md): ground-resolution tiering, bracket abbreviation rules, and text halos.
- [Dark mode contrast](skills/map-aesthetic/references/scenarios/dark-mode-contrast.md): anchoring water/land dE2000 ≥ 5.0, monotonic brightness ramp inversion, and glare reduction.
- [Mobile sheet and popup occlusion](skills/map-aesthetic/references/scenarios/mobile-sheet-popup-occlusion.md): vertical popup offsets, autoPan padding, and reserve bottom safe margins.

## Install the skill

Clone the repository:

```sh
git clone https://github.com/yeston463/map-aesthetic.git
cd map-aesthetic
```

Copy **only** `skills/map-aesthetic` into your
agent's skill directory. For Codex's current user-scoped discovery, use
`~/.agents/skills/map-aesthetic`; repository-scoped installation uses
`<target-project>/.agents/skills/map-aesthetic`. See the
[official Codex skill locations](https://learn.chatgpt.com/docs/build-skills#where-codex-loads-local-skills).

On macOS / Linux, from this repository:

```sh
mkdir -p ~/.agents/skills
cp -R skills/map-aesthetic ~/.agents/skills/
```

On Windows PowerShell, from this repository:

```powershell
$mapSkillDestination = Join-Path $env:USERPROFILE '.agents\skills'
New-Item -ItemType Directory -Force -Path $mapSkillDestination | Out-Null
Copy-Item -LiteralPath '.\skills\map-aesthetic' -Destination $mapSkillDestination -Recurse
```

Inspect an existing installation before copying an update. Codex detects skill
changes automatically; restart if it does not appear. Other Agent Skills-capable
tools can load the same `SKILL.md`; host-specific discovery is not tested here.
`agents/openai.yaml` is optional Codex UI metadata. No npm package is needed to
read or use the skill. Python is needed only for the optional validator.

## Use it

```text
Use $map-aesthetic to refine this logistics map. Keep the current SDK,
provider, data meanings, and interactions. Reduce background noise,
emphasize routes and exceptional sites, unify the legend and popups,
then verify overview, working, and detail views on desktop and mobile.
```

Also supported: visual audits, reference-led refinement, day/night themes,
label hierarchy, and screenshot-only reviews. Screenshot-only work produces
a specification and implementation guidance; it cannot establish runtime success.

## Run the demo

Node 22.12+ and npm are required. Install packages once; the running demo uses
no map key, provider basemap, remote font, or external tile request.

```sh
npm ci
npm run dev
```

Open the local URL printed by Vite (`http://127.0.0.1:4173/`). Compare the same synthetic data before and
after refinement, change themes, select sites, and inspect scale behavior.
The fixture is a fictional local coordinate plane, not an authoritative map.

## Validate changes

Python 3.10+ is supported by the validation tools.

```sh
python -m pip install -r requirements-dev.txt
python scripts/check_project.py
python scripts/check_citations.py --offline
python -m unittest discover -s tests -v
npm run build
npx playwright install chromium
npm run test:browser
npm run test:node
npm run case:verify
python scripts/measure_case_pixels.py
```

Theme files can be checked independently:

```sh
python skills/map-aesthetic/scripts/validate_theme.py path/to/theme.json
```

The validator checks structure, three UI text-contrast pairs, CIEDE2000 separability
between context surfaces and data classes, semantic rules (missing data, diverging ramps,
class bindings, selection modes), and token invariants.

Citations are checked separately. Provider documentation sites are single-page apps,
so a removed page can still answer HTTP 200; the check therefore pairs each adapter
citation with tokens that must appear on the page it opens.

```sh
python scripts/check_citations.py --offline   # claim table, no network
python scripts/check_citations.py             # resolve citations and confirm claims
```

Exit code 2 means the network blocked the conclusion, not that the citations hold.

## Project layout

```text
skills/map-aesthetic/   Installable skill, references, themes, scenarios, validator
cases/                  Fully runnable Leaflet raster and Mapbox vector case projects
demo/                   Credential-free Leaflet comparison using synthetic local vectors
docs/                   Detailed design, verification records, release procedure, screenshots
evals/                  Behavioral scenarios, forward evaluation results, raw fixtures
tests/                  Theme-validator and package tests
tests-browser/          Browser checks for the demonstration
scripts/                Verification and measurement scripts
.github/                CI and issue / pull-request templates
```

## Contribute and release

Start with [contributing](CONTRIBUTING.md), the [behavioral scenarios](evals/cases.md),
the [verification record](docs/verification.md), and the [release procedure](docs/releasing.md). Future coverage should grow through
real integration evidence, not provider-name lists. The detailed
[project design](docs/project-design.zh-CN.md) describes the roadmap and support levels.

MIT covers this project's original files. Dependencies retain their own licenses;
provider SDKs, map data, accounts, and service terms remain separate. See
[third-party notices](THIRD_PARTY.md). This project is independent of the named map providers.
