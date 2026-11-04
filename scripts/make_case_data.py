#!/usr/bin/env python3
"""Generate the synthetic data and raster tiles for the Leaflet raster case.

Everything here is invented. The area is a fictional district plan drawn in WGS 84
geographic coordinates; no real place, address, or third-party dataset is represented,
so the whole output is redistributable under the repository license and needs no
attribution beyond this file. Coordinates are plain lon/lat on purpose: because the
geometry is synthetic there is no GCJ-02 or BD-09 datum question to resolve, and the
case must not be read as a real-world location.

Reproducible with the same Pillow version and font files, not byte-identical across
all operating systems. The manifest records a SHA-256 per output. Set CASE_FONT to
an available CJK font when regenerating outside the original Windows environment.

    python scripts/make_case_data.py
"""
from __future__ import annotations

import hashlib
import json
import math
import os
import random
from pathlib import Path

from PIL import Image, ImageDraw, ImageFont

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / "cases" / "leaflet-raster"
DATA = OUT / "data"
TILES = OUT / "tiles"
MAPBOX_DATA = ROOT / "cases" / "mapbox-style" / "data"

SEED = 20261102
ZOOMS = (14, 15)
TILE_SIZE = 256

# Fictional plan area, roughly 1.4 km across, near Shanghai tile numbers for realism.
LON_MIN, LON_MAX = 121.4300, 121.4470
LAT_MIN, LAT_MAX = 31.2200, 31.2330

FONT_CANDIDATES = tuple(path for path in (os.environ.get("CASE_FONT"),
    "C:/Windows/Fonts/msyh.ttc", "C:/Windows/Fonts/simhei.ttf", "C:/Windows/Fonts/simsun.ttc",
    "/usr/share/fonts/opentype/noto/NotoSansCJK-Regular.ttc") if path)

# Baked context colours. These are deliberately close in luminance to the ground so the
# raster competes with the business layers: that is the defect the case must fix.
GROUND = (238, 238, 236)
BLOCK = (222, 222, 219)
WATER = (176, 205, 224)
ARTERIAL = (255, 255, 255)
ARTERIAL_EDGE = (206, 206, 202)
LOCAL = (246, 246, 244)
LOCAL_EDGE = (214, 214, 210)
BAKED_LABEL = (120, 120, 118)
BAKED_ROAD_LABEL = (150, 150, 147)


def lon_to_x(lon: float) -> float:
    return (lon + 180.0) / 360.0


def lat_to_y(lat: float) -> float:
    radians = math.radians(lat)
    return (1.0 - math.asinh(math.tan(radians)) / math.pi) / 2.0


def world_to_pixel(lon: float, lat: float, zoom: int) -> tuple[float, float]:
    scale = TILE_SIZE * (2 ** zoom)
    return lon_to_x(lon) * scale, lat_to_y(lat) * scale


def tile_bounds(zoom: int) -> tuple[int, int, int, int]:
    """Inclusive tile range covering the area. lat_to_y grows southward."""
    count = 2 ** zoom
    x0 = int(lon_to_x(LON_MIN) * count)
    x1 = int(lon_to_x(LON_MAX) * count)
    y0 = int(lat_to_y(LAT_MAX) * count)
    y1 = int(lat_to_y(LAT_MIN) * count)
    return x0, x1, y0, y1


def font(size: int):
    for path in FONT_CANDIDATES:
        try:
            return ImageFont.truetype(path, size, index=0)
        except OSError:
            continue
    raise SystemExit("No CJK font found; the baked raster labels would render as tofu.")


def point(lon: float, lat: float, name: str, **props) -> dict:
    return {"type": "Feature", "properties": {"name": name, **props},
            "geometry": {"type": "Point", "coordinates": [round(lon, 6), round(lat, 6)]}}


def line(coords: list[tuple[float, float]], **props) -> dict:
    return {"type": "Feature", "properties": props,
            "geometry": {"type": "LineString", "coordinates": [[round(a, 6), round(b, 6)] for a, b in coords]}}


def polygon(ring: list[tuple[float, float]], **props) -> dict:
    closed = [*ring, ring[0]]
    return {"type": "Feature", "properties": props,
            "geometry": {"type": "Polygon", "coordinates": [[[round(a, 6), round(b, 6)] for a, b in closed]]}}


def collection(features: list[dict]) -> dict:
    return {"type": "FeatureCollection", "name": "map-aesthetic-case", "features": features}


def build_geometry() -> dict[str, list[dict]]:
    """Lay out the fictional plan: a river, an arterial grid, blocks, and business data."""
    rng = random.Random(SEED)
    west, east = LON_MIN + 0.0008, LON_MAX - 0.0008
    south, north = LAT_MIN + 0.0006, LAT_MAX - 0.0006

    arterials = [
        line([(west, south + (north - south) * 0.30), (east, south + (north - south) * 0.30)],
             kind="arterial", road="江淮大道"),
        line([(west, south + (north - south) * 0.72), (east, south + (north - south) * 0.72)],
             kind="arterial", road="江岸大道"),
        line([(west + (east - west) * 0.34, south), (west + (east - west) * 0.34, north)],
             kind="arterial", road="临江路"),
    ]
    locals_ = []
    for index, fraction in enumerate((0.10, 0.50, 0.88)):
        locals_.append(line([(west + (east - west) * fraction, south),
                             (west + (east - west) * fraction, north)], kind="local", road=f"支路{index + 1}"))
    for fraction in (0.12, 0.48, 0.88):
        locals_.append(line([(west, south + (north - south) * fraction),
                             (east, south + (north - south) * fraction)], kind="local", road="横巷"))
    diagonal = line([(west, south), (east, north)], kind="local", road="斜港路")

    river = polygon([
        (LON_MIN, LAT_MAX - 0.0012), (LON_MIN + 0.0060, LAT_MAX - 0.0028),
        (LON_MIN + 0.0105, LAT_MIN + 0.0060), (LON_MIN + 0.0148, LAT_MIN + 0.0018),
        (LON_MIN + 0.0170, LAT_MIN), (LON_MIN + 0.0170, LAT_MIN - 0.0016),
        (LON_MIN + 0.0126, LAT_MIN + 0.0002), (LON_MIN + 0.0082, LAT_MIN + 0.0072),
        (LON_MIN + 0.0038, LAT_MAX - 0.0016), (LON_MIN, LAT_MAX + 0.0002),
    ], kind="water", water="新港河")

    blocks = []
    step_x, step_y = (east - west) / 7.0, (north - south) / 5.0
    for row in range(5):
        for column in range(7):
            if rng.random() < 0.22:
                continue
            x0 = west + column * step_x + step_x * 0.16
            y0 = south + row * step_y + step_y * 0.16
            blocks.append(polygon([(x0, y0), (x0 + step_x * 0.62, y0),
                                   (x0 + step_x * 0.62, y0 + step_y * 0.60), (x0, y0 + step_y * 0.60)],
                                  kind="block"))

    sites = [
        point(west + (east - west) * 0.06, south + (north - south) * 0.30, "江岸路综合配送中心（北区临时中转点）",
              site_id="S01", class_name="配送站", status="normal", throughput=1840),
        point(west + (east - west) * 0.34, south + (north - south) * 0.72, "临江路集散点",
              site_id="S02", class_name="集散点", status="normal", throughput=920),
        point(west + (east - west) * 0.50, south + (north - south) * 0.48, "旧仓里驿站",
              site_id="S03", class_name="驿站", status="alert", throughput=610),
        point(west + (east - west) * 0.62, south + (north - south) * 0.30, "江淮大道配送站",
              site_id="S04", class_name="配送站", status="normal", throughput=1520),
        point(west + (east - west) * 0.88, south + (north - south) * 0.72, "东圩里集散点",
              site_id="S05", class_name="集散点", status="alert", throughput=730),
        point(west + (east - west) * 0.22, south + (north - south) * 0.12, "纺织新村驿站",
              site_id="S06", class_name="驿站", status="normal", throughput=380),
        point(west + (east - west) * 0.46, south + (north - south) * 0.88, "沿河路配送站",
              site_id="S07", class_name="配送站", status="normal", throughput=1130),
        point(west + (east - west) * 0.70, south + (north - south) * 0.12, "南苑驿站",
              site_id="S08", class_name="驿站", status="normal", throughput=290),
        point(west + (east - west) * 0.94, south + (north - south) * 0.48, "三多里配送站",
              site_id="S09", class_name="配送站", status="normal", throughput=1010),
        point(west + (east - west) * 0.14, south + (north - south) * 0.50, "兴仁里集散点",
              site_id="S10", class_name="集散点", status="normal", throughput=540),
        point(west + (east - west) * 0.58, south + (north - south) * 0.06, "小学路口驿站",
              site_id="S11", class_name="驿站", status="alert", throughput=420),
        point(west + (east - west) * 0.80, south + (north - south) * 0.88, "新港河配送站",
              site_id="S12", class_name="配送站", status="normal", throughput=1260),
    ]

    route = line([tuple(feature["geometry"]["coordinates"]) for feature in
                  [sites[0], sites[9], sites[1], sites[2], sites[3], sites[4], sites[8]]],
                 route_id="R1", name="主配送线")

    districts = [
        polygon([(west, south + (north - south) * 0.72), (west + (east - west) * 0.34, south + (north - south) * 0.72),
                 (west + (east - west) * 0.34, north), (west, north)], district_id="D1", district="旧仓里社区", value=610),
        polygon([(west + (east - west) * 0.34, south + (north - south) * 0.72), (east, south + (north - south) * 0.72),
                 (east, north), (west + (east - west) * 0.34, north)], district_id="D2", district="三多里社区", value=1260),
        polygon([(west, south + (north - south) * 0.30), (west + (east - west) * 0.34, south + (north - south) * 0.30),
                 (west + (east - west) * 0.34, south + (north - south) * 0.72), (west, south + (north - south) * 0.72)],
                district_id="D3", district="兴仁里社区", value=920),
        polygon([(west + (east - west) * 0.34, south + (north - south) * 0.30), (east, south + (north - south) * 0.30),
                 (east, south + (north - south) * 0.72), (west + (east - west) * 0.34, south + (north - south) * 0.72)],
                district_id="D4", district="江淮大道社区", value=None),
        polygon([(west, south), (west + (east - west) * 0.50, south),
                 (west + (east - west) * 0.50, south + (north - south) * 0.30), (west, south + (north - south) * 0.30)],
                district_id="D5", district="纺织新村社区", value=380),
        polygon([(west + (east - west) * 0.50, south), (east, south),
                 (east, south + (north - south) * 0.30), (west + (east - west) * 0.50, south + (north - south) * 0.30)],
                district_id="D6", district="南苑社区", value=None),
    ]

    label_features = []
    for name, lon, lat, tier in [
        ("江岸片区", west + (east - west) * 0.30, south + (north - south) * 0.86, 0),
        ("新港河", west + (east - west) * 0.78, south + (north - south) * 0.20, 0),
        ("江淮大道", west + (east - west) * 0.52, south + (north - south) * 0.32, 1),
        ("临江路", west + (east - west) * 0.36, south + (north - south) * 0.58, 1),
        ("旧仓里", west + (east - west) * 0.18, south + (north - south) * 0.80, 1),
        ("三多里", west + (east - west) * 0.66, south + (north - south) * 0.84, 1),
        ("纺织新村", west + (east - west) * 0.20, south + (north - south) * 0.14, 2),
        ("南苑", west + (east - west) * 0.72, south + (north - south) * 0.10, 2),
        ("兴仁里", west + (east - west) * 0.12, south + (north - south) * 0.52, 2),
        ("小学路", west + (east - west) * 0.58, south + (north - south) * 0.06, 2),
        ("东圩里", west + (east - west) * 0.90, south + (north - south) * 0.74, 2),
        ("沿河路", west + (east - west) * 0.46, south + (north - south) * 0.90, 2),
    ]:
        label_features.append(point(lon, lat, name, tier=tier))
    for index, site in enumerate(sites):
        lon, lat = site["geometry"]["coordinates"]
        label_features.append(point(lon, lat + 0.00035, site["properties"]["name"],
                                    tier=1, site_id=site["properties"]["site_id"]))

    return {"arterials": arterials, "locals": locals_ + [diagonal], "river": [river], "blocks": blocks,
            "sites": sites, "route": [route], "districts": districts, "labels": label_features}


def draw_tiles(geometry: dict[str, list[dict]]) -> list[Path]:
    """Rasterise the baked context, including its own Chinese road and place names."""
    TILES.mkdir(parents=True, exist_ok=True)
    written: list[Path] = []
    title_font, road_font = font(15), font(11)
    for zoom in ZOOMS:
        x0, x1, y0, y1 = tile_bounds(zoom)
        for tile_x in range(x0, x1 + 1):
            for tile_y in range(y0, y1 + 1):
                image = Image.new("RGB", (TILE_SIZE, TILE_SIZE), GROUND)
                draw = ImageDraw.Draw(image)
                origin_x = tile_x * TILE_SIZE
                origin_y = tile_y * TILE_SIZE

                def local(lon: float, lat: float) -> tuple[int, int]:
                    px, py = world_to_pixel(lon, lat, zoom)
                    return int(px - origin_x), int(py - origin_y)

                for feature in geometry["river"]:
                    draw.polygon([local(*coord) for coord in feature["geometry"]["coordinates"][0]], fill=WATER)
                for feature in geometry["blocks"]:
                    draw.polygon([local(*coord) for coord in feature["geometry"]["coordinates"][0]], fill=BLOCK)
                for group, core, edge, width in (("locals", LOCAL, LOCAL_EDGE, 5), ("arterials", ARTERIAL, ARTERIAL_EDGE, 9)):
                    for feature in geometry[group]:
                        points = [local(*coord) for coord in feature["geometry"]["coordinates"]]
                        draw.line(points, fill=edge, width=width + 2, joint="curve")
                        draw.line(points, fill=core, width=width, joint="curve")

                # Baked names: part of the pixels, therefore not independently restylable.
                for feature in geometry["arterials"]:
                    lon, lat = feature["geometry"]["coordinates"][0]
                    lon = (lon + feature["geometry"]["coordinates"][1][0]) / 2
                    lat = (lat + feature["geometry"]["coordinates"][1][1]) / 2
                    x, y = local(lon, lat)
                    if 0 < x < TILE_SIZE and 0 < y < TILE_SIZE and zoom >= 15:
                        draw.text((x - 24, y - 7), feature["properties"]["road"], font=road_font, fill=BAKED_ROAD_LABEL)
                if zoom >= 15:
                    for feature in geometry["labels"]:
                        if feature["properties"]["tier"] != 0:
                            continue
                        x, y = local(*feature["geometry"]["coordinates"])
                        if -40 < x < TILE_SIZE and -20 < y < TILE_SIZE:
                            draw.text((x - 30, y - 8), feature["properties"]["name"], font=title_font, fill=BAKED_LABEL)
                directory = TILES / str(zoom) / str(tile_x)
                directory.mkdir(parents=True, exist_ok=True)
                path = directory / f"{tile_y}.png"
                image.save(path, optimize=True)
                written.append(path)
    return written


def write_geojson(geometry: dict[str, list[dict]]) -> list[Path]:
    DATA.mkdir(parents=True, exist_ok=True)
    groups = {
        "context.geojson": geometry["arterials"] + geometry["locals"] + geometry["river"] + geometry["blocks"],
        "sites.geojson": geometry["sites"],
        "route.geojson": geometry["route"],
        "districts.geojson": geometry["districts"],
        "labels.geojson": geometry["labels"],
    }
    written = []
    for name, features in groups.items():
        path = DATA / name
        text = json.dumps(collection(features), ensure_ascii=False, separators=(",", ":"))
        path.write_text(text, encoding="utf-8")
        written.append(path)
    return written


def mapbox_business(geometry: dict[str, list[dict]]) -> dict[str, list[dict]]:
    """A small, independent overlay set for the vector-style case.

    It reuses the same fictional plan so the two cases describe the same district, but
    the file is its own so each case can be started, edited and verified alone.
    """
    sites = [feature for feature in geometry["sites"] if feature["properties"]["site_id"] in ("S01", "S04", "S09")]
    route = [line([tuple(feature["geometry"]["coordinates"]) for feature in
                   [geometry["sites"][0], geometry["sites"][1], geometry["sites"][3], geometry["sites"][4],
                    geometry["sites"][8]]],
                  route_id="R1", name="主配送线")]
    zones = [feature for feature in geometry["districts"] if feature["properties"]["district_id"] in ("D1", "D3", "D5")]
    water = geometry["river"]
    roads = [{"type": "Feature", "properties": {"road": feature["properties"].get("road", "支路"),
                                                "rank": "arterial" if feature["properties"].get("kind") == "arterial" else "local"},
              "geometry": feature["geometry"]}
             for feature in geometry["arterials"] + geometry["locals"]]
    places = [{"type": "Feature", "properties": {"name": feature["properties"]["name"], "tier": feature["properties"]["tier"]},
               "geometry": feature["geometry"]}
              for feature in geometry["labels"] if feature["properties"]["tier"] <= 1 and not feature["properties"].get("site_id")]
    return {"business": sites + route + zones, "context": water + roads, "places": places}


def main() -> int:
    geometry = build_geometry()
    written = write_geojson(geometry) + draw_tiles(geometry)
    mapbox = mapbox_business(geometry)
    MAPBOX_DATA.mkdir(parents=True, exist_ok=True)
    for name, features in (("business.geojson", mapbox["business"]), ("context.geojson", mapbox["context"]),
                           ("places.geojson", mapbox["places"])):
        path = MAPBOX_DATA / name
        path.write_text(json.dumps(collection(features), ensure_ascii=False, separators=(",", ":")), encoding="utf-8")
        written.append(path)
    manifest = {
        "generated_by": "scripts/make_case_data.py",
        "seed": SEED,
        "crs": "OGC:CRS84 (lon/lat, WGS 84 axis order)",
        "provenance": ("Synthetic. Drawn from a fixed seed; no real place, dataset, or third-party "
                       "tile source is represented, and no attribution beyond this repository applies."),
        "datum_note": ("Synthetic geometry in plain lon/lat, so no GCJ-02 or BD-09 offset applies. "
                       "Do not copy this pattern to real China basemap data without resolving the datum."),
        "area": {"lon": [LON_MIN, LON_MAX], "lat": [LAT_MIN, LAT_MAX]},
        "tile_zooms": list(ZOOMS),
        "counts": {str(path.relative_to(ROOT)).replace("\\", "/"): len(json.loads(path.read_text(encoding="utf-8"))["features"])
                   for path in written if path.suffix == ".geojson"},
        "files": {str(path.relative_to(ROOT)).replace("\\", "/"): hashlib.sha256(path.read_bytes()).hexdigest()
                  for path in sorted(written)},
    }
    (OUT / "data-manifest.json").write_text(json.dumps(manifest, ensure_ascii=False, indent=2), encoding="utf-8")
    print(f"Wrote {len(written)} files ({len(manifest['counts'])} data layers, "
          f"{sum(1 for p in written if p.suffix == '.png')} tiles).")
    print("Counts:", manifest["counts"])
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
