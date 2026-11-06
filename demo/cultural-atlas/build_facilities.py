#!/usr/bin/env python3
"""Generate fictional cultural-facility demonstration data for the cultural-atlas demo.

The basemap (context.geojson / labels.geojson) is the SAME real OSM road snapshot that the
street-atlas sample reuses; only the facilities are虚构 (fictional). Coordinates are scattered
inside the basemap bounds but are NOT snapped to real addresses, and annual visits are synthetic.
Re-running this script with the same seed reproduces identical output.

Usage:  python -B demo/cultural-atlas/build_facilities.py
"""
from __future__ import annotations
import json
import random
from pathlib import Path

HERE = Path(__file__).resolve().parent
SEED = 20261106

# Basemap bounds from data/basemap-provenance.json: S,W,N,E = 31.216,121.425,31.238,121.452
# Keep facilities inside with margin so labels stay on the canvas.
LAT_MIN, LAT_MAX = 31.221, 31.233
LON_MIN, LON_MAX = 121.433, 121.445

CATEGORIES = {
    "博物馆": "#3f6fa3",
    "图书馆": "#4e9a76",
    "剧院": "#c25a43",
    "美术馆": "#8a6cb0",
    "书店": "#c8902c",
    "非遗驿站": "#4f95a6",
}

NAMES = {
    "博物馆": ["江岸博物馆", "临江工业遗产馆", "旧仓里航运馆"],
    "图书馆": ["临江图书馆", "江畔少儿图书馆", "西园社区书房"],
    "剧院": ["江岸大剧院", "旧仓里小剧场", "光复西路演艺中心"],
    "美术馆": ["南苑美术馆", "滨河当代艺术馆"],
    "书店": ["渡口书店", "旧仓库书局", "梧桐里独立书店"],
    "非遗驿站": ["非遗驿站·织造", "非遗驿站·曲艺", "非遗驿站·船工号子"],
}


def make_facilities(rng: random.Random) -> list[dict]:
    rows = []
    fid = 1
    for category, names in NAMES.items():
        for name in names:
            lat = rng.uniform(LAT_MIN, LAT_MAX)
            lon = rng.uniform(LON_MIN, LON_MAX)
            # Synthetic but plausible: visits in 10k–520k; older institutions skew larger.
            visits = int(rng.uniform(10, 52)) * 10_000
            year = rng.randint(1958, 2021)
            rows.append({
                "type": "Feature",
                "properties": {
                    "facility_id": f"F{fid:02d}",
                    "name": name,
                    "category": category,
                    "color": CATEGORIES[category],
                    "annual_visits": visits,
                    "year_opened": year,
                    "note": "虚构示例 · 未吸附真实地址",
                },
                "geometry": {"type": "Point", "coordinates": [round(lon, 6), round(lat, 6)]},
            })
            fid += 1
    return rows


def main() -> None:
    rng = random.Random(SEED)
    features = make_facilities(rng)
    collection = {"type": "FeatureCollection", "features": features}
    (HERE / "data" / "facilities.geojson").write_text(
        json.dumps(collection, ensure_ascii=False, indent=1), encoding="utf-8")

    import hashlib
    raw = json.dumps(collection, ensure_ascii=False, sort_keys=True).encode("utf-8")
    provenance = {
        "description": "Fictional cultural facilities placed over a real OSM road snapshot. "
                       "Names, visits and years are synthetic; coordinates are not snapped to "
                       "real addresses and must not be used for wayfinding.",
        "generator": "demo/cultural-atlas/build_facilities.py",
        "seed": SEED,
        "count": len(features),
        "bounds_used_south_west_north_east": [LAT_MIN, LON_MIN, LAT_MAX, LON_MAX],
        "categories": CATEGORIES,
        "sha256": hashlib.sha256(raw).hexdigest(),
        "basemap_source": "OpenStreetMap contributors, via Overpass API (see basemap-provenance.json)",
        "license": "facility data: CC0 fictional; basemap: ODbL-1.0",
    }
    (HERE / "data" / "facilities-provenance.json").write_text(
        json.dumps(provenance, ensure_ascii=False, indent=2), encoding="utf-8")
    print(f"wrote {len(features)} fictional facilities -> data/facilities.geojson")


if __name__ == "__main__":
    main()
