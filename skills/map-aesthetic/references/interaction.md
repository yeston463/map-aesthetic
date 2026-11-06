# Interaction

The map is not the interface. A map page is a panel, a legend, a list, a popup, a
status bar and a set of controls, and a reader moves between them. This file holds
the numbers for that movement.

The rule behind every number here: **motion is feedback, not decoration.** It tells
the reader that something answered. It never announces itself, never plays on
scroll, and never competes with the map for attention.

Durations, easing and distances are tokens. Name them once and use them; a second
duration is a second idea.

## Tokens

| Token | Value | Use |
| --- | --- | --- |
| `--m-in` | 140ms | a control answering the pointer |
| `--m-out` | 200ms | a control returning to rest |
| `--m-press` | 90ms | a control sinking under the finger |
| `--m-panel` | 200ms | a panel or list appearing |
| `--m-slide` | 240ms | an indicator travelling to a new position |
| `--m-cycle` | 3.2s | one loop inside a visual |

Easing: `--m-ease cubic-bezier(.2,.8,.2,1)` for every UI step; `--m-ease-io
cubic-bezier(.65,0,.35,1)` only for travel; linear for loops. No bounce, no
overshoot, no spring.

Distances: a card lifts 2px, a linked image zooms to 1.02 inside its frame, an
arrow moves 3px, a dropdown drops 6px, a button steps 1px up and 1px down on
press with scale .985. No other distances exist.

## The hover layer

Hover applies to a fine pointer only. Every hover control also works by tap and by
keyboard and has a visible focus state. Nothing resizes and pushes its neighbour.
No rotation, skew, glow, or shine sweep.

| Control | On hover | On press | Time |
| --- | --- | --- | --- |
| Button | the fill steps 14% toward the ink; an outlined button gains a faint fill and a stronger border; the box steps up 1px | sinks to 1px below rest, scale .985 | 140 in / 200 out / 90 press |
| Text link | an ink line draws left to right | — | 140 / 200 |
| Nav word | the drawn underline appears; the panel opens after 150ms of intent and drops 6px | — | 200, closes in 120 |
| Selected item | a 2px bar under it | — | still |
| Card with a link | lifts 2px; its border darkens one step | — | 180 |
| Card without a link | nothing | — | — |
| Focus ring | a 2px ring in the accent, its offset settling from 6px to 2px | — | 200 |

A map has its own hover states, and they are not the DOM's:

- A hovered feature changes **weight or colour only**. Never scale, never rotate.
- The hovered feature keeps its class colour; only the outline changes. A hover
  that replaces the fill destroys the class encoding the reader is using.
- A hovered cluster shows its count. A hovered feature shows a tooltip with the
  values, not a label that was already on the map.
- The hover state of a selected feature is the selected state. Selection wins.

## The popup and the panel

A popup is a map overlay, not a page. Its rules:

- **One popup at a time.** Opening a second closes the first. Two popups mean the
  reader cannot tell which feature they are reading about.
- **The popup never covers the feature it describes.** If the popup would land on
  the marker, offset it or pan the map so it does not. A popup over its own
  marker is the single most common map defect.
- **The close button is always inside the popup frame** and never outside the
  viewport. At least 44 by 44 pixels of hit area.
- The popup opens on click or on Enter, never on hover. A hover popup cannot be
  dismissed by moving the pointer, and it fights the tooltip.
- Content order: what it is, then its state, then its numbers, then its identifier.

A bottom sheet on a phone is a different thing from a popup and follows different
rules:

- The sheet reserves space. The map is **panned** so the feature and its popup sit
  in the part of the canvas the sheet does not cover. Disabling auto-pan without
  another adjustment leaves the popup clipped.
- The popup's tip stays anchored to its feature. Pan the map; do not push the popup
  away from its anchor to fake clearance.
- A collapsed sheet is a real state, and the map must be laid out for it. A sheet
  that covers 45% of a phone screen is not a panel, it is a takeover.

## Focus and keyboard

- Every control is reachable by Tab and shows a focus ring. The ring is 2px in the
  accent with 2px offset; it is never removed for "cleanliness".
- A feature that can be selected can be selected with the keyboard, and the
  selected state is announced.
- The map canvas takes focus as one stop, not one stop per layer. Arrow keys pan,
  `+`/`-` zoom, `Escape` closes the popup.
- Focus order follows the reading order of the page: the map, then the controls
  that change the map, then the legend, then the list, then the panel.

## Loading and empty states

A map that loads has three states, and each needs a designed appearance.

- **Loading.** The map frame, its controls and its panel are in place before the
  data arrives; only the data area is empty. A skeleton of the panel, not a
  spinner over a blank page. Never a full-page loader.
- **Empty.** "No features in this view" is a sentence, not an empty box. It says
  what is empty and, where possible, what would fill it.
- **Error.** The error says what failed and what to do. A console message is not
  an error state.

## Reduced motion

Under `prefers-reduced-motion: reduce`, the map still works and the reader still
knows what happened:

- Colours still change on hover; the transition is opacity and colour only.
- The selected feature still changes appearance, instantly.
- The panel still appears, without the drop.
- A looping visual shows its finished frame.
- Nothing stays hidden waiting for an animation that will not run.

The reduced-motion rule is not an accessibility afterthought: a map that relies on
animation to show its selection is broken for readers who turn motion off, and
that is a defect whether or not anyone has reported it.

## Never

- A card, tile or row that fades or rises in as the page scrolls. The map is the
  content; scrolling past it must not make it appear.
- A feature that tilts, flips, scales or follows the pointer.
- A marquee, a rotating notice, a self-advancing carousel, a timed tab.
- A random blink. Every change shows a state, a step, or real data.
- A hover slower than its token, an overshooting ease, a delay before a control
  answers.
- Motion that moves the map's data. Only the camera and the overlays may move.
