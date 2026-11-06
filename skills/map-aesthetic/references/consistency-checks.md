# Consistency checks

`scripts/consistency.mjs` is the executable form of the checklist. It opens a
running map page in headless Chrome and reports what a reviewer would otherwise
have to find by eye.

The premise is borrowed from `Leonxlnx/taste-skill`: **a taste that cannot be
stated as a rule cannot be checked, and a rule that cannot be checked is an
opinion.** So each rule here states a fault a designer would mark, a severity, and
a one-line fix. Nothing in this file needs taste to agree with; it needs the
numbers.

```bash
node <skill-dir>/scripts/consistency.mjs <url> \
  --widths 1440,1024,768,390 [--out dir] [--json]
```

Exit 1 when anything FAILs, 0 when clean, 2 when the page could not be checked.
It needs Node 22+ and Playwright.

## The rules

### Reading

| Rule | Severity | Fault |
| --- | --- | --- |
| `text-contrast` | FAIL | Text below 4.5:1 against its ground (3:1 for large text). The ground is found by walking up the tree, so a label on a coloured card is measured against the card, not the page. |
| `body-size` | WARN | A paragraph under 12px. A map panel's note works at 11–12px; running text does not. |
| `tap-target` | WARN | A control under 44px on a touch screen, under 32px with a pointer. |

### One system

| Rule | Severity | Fault |
| --- | --- | --- |
| `button-styles` | FAIL | Buttons within the same navigation or action group have different shapes, heights or label sizes. |
| `heading-scale` | FAIL | A visible heading level has two sizes, or a visible h1 is not larger than a visible h2. |
| `radius-family` | WARN | More than three corner radii in the page. |
| `focus-visible` | FAIL | No `:focus` rule anywhere in the stylesheets. |

### The map itself

| Rule | Severity | Fault |
| --- | --- | --- |
| `annotation-overlap` | FAIL | Two labels overlap. |
| `annotation-outside` | FAIL | A label leaves the canvas. |
| `popup-covers-feature` | FAIL | The popup covers the feature it describes. |
| `legend-correspondence` | FAIL | A bound legend colour cannot be found among SVG colours or pattern fills. This is a one-way heuristic, not proof that every map colour has a legend entry. |
| `attribution-present` | FAIL | The map carries only the engine's name; the data source is not named. |
| `controls-reachable` | WARN | No zoom control, or one under 28px. |

### Words

| Rule | Severity | Fault |
| --- | --- | --- |
| `filler-words` | WARN | A button or heading that says 了解更多 / 一站式 / Learn more. |
| `placeholder-text` | FAIL | A bracketed stand-in, lorem ipsum, TODO or 待补充 left in visible text. |
| `label-not-noun` | WARN | A heading or button that names a category instead of a thing. |

### Motion

| Rule | Severity | Fault |
| --- | --- | --- |
| `scroll-reveal` | FAIL | An animation named for a reveal, fade-in or rise. |
| `motion-duration` | WARN | A duration that is not one of the tokens in [interaction](interaction.md). |
| `reduced-motion` | WARN | Under `prefers-reduced-motion`, a rendered element is fully transparent or an animation is still running. Static partial opacity is not treated as motion. |

### The anti-patterns that show in a rendered page

| Rule | Severity | Fault |
| --- | --- | --- |
| `raw-colour` | FAIL | A pure saturated hue anywhere on the page. |
| `opaque-fill` | FAIL | A thematic area in the districts pane filled opaque. |
| `cursor-pointer` | WARN | An interactive path without `cursor: pointer`. |
| `default-popup` | WARN | The popup wrapper still has the engine's border radius and heavy shadow. |
| `pin-density` | WARN | More than 30 image pin icons on the map. |
| `attribution-legible` | FAIL | The attribution hidden, faded below 0.5, or set under 9px. |
| `tabular-numbers` | WARN | A figure whose element and ancestors never set `tabular-nums`. |

## What the checker cannot decide

It measures the rendered page. It does not know whether the hierarchy is right,
whether the palette says what the reader needs it to say, or whether the route
reads as a route. Those stay with a person, and a clean run is not a verdict.

It also cannot see what is not on the page: a missing layer, a legend entry for a
class that has no member, a source that was swapped without being recorded.

## Adapting the rules to a project

The rules read the page, not the project, so they work on any map. But they look
for conventions that are this skill's, not everyone's:

- `annotation-overlap` and `annotation-outside` need a `window.__demo.labelBoxes()`
  that returns the rendered boxes of the labels. A project that exposes the same
  shape gets the two rules for free; one that does not gets them skipped.
- `popup-covers-feature` needs `window.__demo.markerBox(id)` and `selected()`.
- `legend-correspondence` reads the legend's `data-color` attribute and the SVG
  fills on the page. It compares normalised hex, so `#14558a` and
  `rgb(20, 85, 138)` match.

A rule without the required observation surface is reported as `SKIP`, not as a
pass. `popup-covers-feature` is also skipped when no popup is open. Run the checker
on the relevant interaction state as well as the initial page. Its DOM-based colour
estimate cannot reliably measure text over map canvas, imagery, transparency or
gradients; independently inspect and measure those states. A clean run does not
establish WCAG conformance.
