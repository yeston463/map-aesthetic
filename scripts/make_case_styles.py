#!/usr/bin/env python3
"""Build the vector-style case's day and night style JSON from the packaged themes.

The colours are not typed in here: they are read from the skill's theme presets, so the
case exercises the same contract the skill teaches, and the validator's separability
floors apply to what actually gets rendered. Re-run after editing a theme.

    python scripts/make_case_styles.py
"""
from __future__ import annotations

import json
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
THEMES = ROOT / "skills/map-aesthetic/assets/themes"
OUT = ROOT / "cases/mapbox-style/styles"

# The plan area, shared with the raster case so both describe the same fictional district.
CENTER = [121.4385, 31.2265]
DATA = "/cases/mapbox-style/data"


def style(theme: dict) -> dict:
    cartography = theme["cartography"]
    label_size = theme["cartography"]["labels"]["sizePx"]
    return {
        "version": 8,
        "metadata": {"case-id": f"case-{theme['id']}",
                     "case-attribution": "Synthetic local data · map-aesthetic vector-style case"},
        "name": f"Map Aesthetic case · {theme['name']}",
        "sources": {
            "context": {"type": "geojson", "data": f"{DATA}/context.geojson"},
            "places": {"type": "geojson", "data": f"{DATA}/places.geojson"},
        },
        "layers": [
            {"id": "ground", "type": "background",
             "paint": {"background-color": cartography["land"]}},
            {"id": "water", "type": "fill", "source": "context",
             "filter": ["==", ["geometry-type"], "Polygon"],
             "paint": {"fill-color": cartography["water"], "fill-opacity": 1}},
            {"id": "road-casing", "type": "line", "source": "context",
             "filter": ["==", ["get", "rank"], "arterial"],
             "layout": {"line-cap": "round", "line-join": "round"},
             "paint": {"line-color": cartography["roadCasing"], "line-width": 7, "line-opacity": 1}},
            {"id": "road", "type": "line", "source": "context",
             "filter": ["==", ["geometry-type"], "LineString"],
             "layout": {"line-cap": "round", "line-join": "round"},
             "paint": {"line-color": cartography["road"],
                       "line-width": ["case", ["==", ["get", "rank"], "arterial"], 4.5, 2],
                       "line-opacity": 1}},
            # Text only in Chinese: MapLibre renders ideographs from a local font family,
            # so this style needs no glyph endpoint and the case stays offline. A Latin
            # or numeric label here would request glyphs that do not exist.
            {"id": "place-name", "type": "symbol", "source": "places",
             "filter": ["<=", ["get", "tier"], 1],
             "layout": {"text-field": ["get", "name"], "text-size": label_size,
                        "symbol-placement": "point", "text-max-width": 8},
             "paint": {"text-color": cartography["label"],
                       "text-halo-color": cartography["labelHalo"],
                       "text-halo-width": cartography["labels"]["haloWidthPx"]}},
        ],
        "center": CENTER,
        "zoom": 14,
        "bearing": 0,
        "pitch": 0,
    }


def main() -> int:
    OUT.mkdir(parents=True, exist_ok=True)
    written = []
    pairs = [("quiet-analysis", "day"), ("night-operations", "night")]
    for theme_name, alias in pairs:
        theme = json.loads((THEMES / f"{theme_name}.json").read_text(encoding="utf-8"))
        rendered = json.dumps(style(theme), ensure_ascii=False, indent=2)
        for filename in (f"{alias}.json", f"{theme['mode']}.json"):
            target = OUT / filename
            target.write_text(rendered, encoding="utf-8")
            written.append(target)
    print("Wrote", ", ".join(str(path.relative_to(ROOT)).replace("\\", "/") for path in written))
    print("Both styles carry only Chinese symbol text, so no glyphs endpoint is required.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
