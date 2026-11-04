#!/usr/bin/env python3
"""Measure what the case screenshots actually show, in CIEDE2000.

Each feature is sampled the way it is drawn, because one metric does not fit all:

  line     strongest pixel near several points along the stroke, against the local median
  point    median of a small box at the marker centre
  area     modal colour inside the polygon, ignoring its own boundary
  text     strongest pixel inside the label box, against the label box median

Reported quantities:
  fidelity     painted colour against the colour the style object declared. A token that
               never reaches the canvas is a bug, not a design decision.
  prominence   feature against what it is actually drawn on.
  semantics    area-vs-area distance, which is the only honest way to ask whether a
               no-data fill can be mistaken for a value class.

Colour distance comes from the skill's own validator so the case, the presets and the
validator cannot drift apart. These numbers describe the rendered result; they are not a
beauty score, and they are only meaningful next to the screenshots in cases/evidence.

    node scripts/verify_cases.mjs && python scripts/measure_case_pixels.py
"""
from __future__ import annotations

import importlib.util
import hashlib
import json
import statistics
import sys
from collections import Counter
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
EVIDENCE = ROOT / "cases" / "evidence"

spec = importlib.util.spec_from_file_location("theme_validator",
                                              ROOT / "skills/map-aesthetic/scripts/validate_theme.py")
validator = importlib.util.module_from_spec(spec)
spec.loader.exec_module(validator)

try:
    from PIL import Image
except ImportError:
    raise SystemExit("Missing Pillow. Install it with: python -m pip install pillow")

# Fixture heuristics, not a universal visibility threshold or a registered experiment.
MAX_FIDELITY_DELTA_E = 2.3
MIN_PROMINENCE_DELTA_E = 5.0        # same floor the theme presets clear
MIN_SEMANTICS_DELTA_E = 5.0

DECLARED_KEY = {"route": "route", "site": "siteFill", "district": "districtValue",
                "districtMissing": "districtMissing"}


def hex_of(rgb):
    return "#" + "".join(f"{int(round(channel)):02X}" for channel in rgb)


def pixels_in(image, box):
    x0, y0, x1, y1 = box
    return [image.getpixel((x, y))[:3]
            for x in range(max(0, x0), min(image.width, x1 + 1))
            for y in range(max(0, y0), min(image.height, y1 + 1))]


def median_colour(image, centre, radius):
    box = (centre["x"] - radius, centre["y"] - radius, centre["x"] + radius, centre["y"] + radius)
    found = pixels_in(image, box)
    if not found:
        return None, None
    local_median = [statistics.median(channel) for channel in zip(*found)]
    return hex_of(local_median), found


def annulus_median(image, centre, inner=12, outer=18):
    import math as _math
    pixels = []
    for angle in range(0, 360, 8):
        for radius in range(inner, outer + 1):
            px = int(centre["x"] + radius * _math.cos(_math.radians(angle)))
            py = int(centre["y"] + radius * _math.sin(_math.radians(angle)))
            if 0 <= px < image.width and 0 <= py < image.height:
                pixels.append(image.getpixel((px, py))[:3])
    return hex_of([statistics.median(channel) for channel in zip(*pixels)]) if pixels else None


def strongest(image, centre, radius):
    """The pixel furthest from the local background: what the feature really paints."""
    local_median, found = median_colour(image, centre, radius)
    if not found:
        return None, None
    best, best_distance = None, -1.0
    for pixel in found:
        distance = validator.delta_e(hex_of(pixel), local_median)
        if distance > best_distance:
            best, best_distance = hex_of(pixel), distance
    return best, best_distance


def modal(image, region, inset=6):
    box = (region["x0"] + inset, region["y0"] + inset, region["x1"] - inset, region["y1"] - inset)
    found = [hex_of(pixel) for pixel in pixels_in(image, box)]
    if not found:
        return None
    return Counter(found).most_common(1)[0][0]


def line_probe(image, points):
    """Core colour of a cased line, and its distance from what the line is drawn on.

    The strongest-pixel rule would return the casing, which is legitimately the furthest
    colour from the background. The question here is whether the route core was painted
    as declared, so the centre of each segment is read directly.
    """
    cores, contrasts = [], []
    for start, end in zip(points, points[1:]):
        centre = {"x": (start["x"] + end["x"]) // 2, "y": (start["y"] + end["y"]) // 2}
        core, _ = median_colour(image, centre, 1)
        ring = annulus_median(image, centre)
        if core and ring:
            cores.append(core)
            contrasts.append(validator.delta_e(core, ring))
    if not cores:
        return None, None
    return Counter(cores).most_common(1)[0][0], round(statistics.median(contrasts), 2)


def area_semantics(image, entry, scale):
    """Class colours as actually painted, judged for order and mutual distance.

    A translucent fill has no single 'declared' pixel value, so fidelity is not a
    meaningful target for an area. What is meaningful is whether the painted classes
    still increase monotonically with the value and stay distinguishable from each
    other and from no-data.
    """
    out = []
    for item in entry["pixels"]["probe"].get("districts", []):
        region = item.get("region")
        if not region:
            continue
        box = {key: round(value * scale) for key, value in region.items()}
        colour = modal(image, box)
        if colour:
            out.append({"id": item["id"], "value": item["value"], "declared": item.get("paintedClass"),
                        "painted": colour})
    classes = [row for row in out if row["value"] is not None]
    missing = [row for row in out if row["value"] is None]
    classes.sort(key=lambda row: row["value"])
    lightness = [validator.luminance(row["painted"]) for row in classes]
    adjacent = [round(validator.delta_e(a["painted"], b["painted"]), 2)
                for a, b in zip(classes, classes[1:])]
    missing_gap = min((round(validator.delta_e(m["painted"], c["painted"]), 2)
                       for m in missing for c in classes), default=None)
    monotonic = all(b > a for a, b in zip(lightness, lightness[1:])) or all(b < a for a, b in zip(lightness, lightness[1:]))
    return {"classes": classes, "missing": missing, "adjacentDeltaE": adjacent,
            "minAdjacent": min(adjacent) if adjacent else None,
            "missingVsClassMin": missing_gap, "lightnessMonotonic": monotonic}


def measure_variant(image, entry):
    scale = entry["pixels"]["deviceScaleFactor"] or 1
    probe = {name: value for name, value in entry["pixels"]["probe"].items()}
    if isinstance(probe.get("routeLine"), list):
        probe["routeLine"] = [{"x": round(p["x"] * scale), "y": round(p["y"] * scale)} for p in probe["routeLine"]]
    for key in ("site", "ground"):
        if probe.get(key):
            probe[key] = {"x": round(probe[key]["x"] * scale), "y": round(probe[key]["y"] * scale)}
    for key in ("district", "districtMissing", "label"):
        if probe.get(key):
            probe[key] = {name: round(value * scale) for name, value in probe[key].items()}

    out = {}
    route_colour, route_distance = line_probe(image, probe["routeLine"])
    site_colour, _ = median_colour(image, probe["site"], 3)
    district_colour = modal(image, probe["district"]) if probe.get("district") else None
    missing_colour = modal(image, probe["districtMissing"]) if probe.get("districtMissing") else None
    label_colour, label_distance = strongest(image, {
        "x": (probe["label"]["x0"] + probe["label"]["x1"]) // 2,
        "y": (probe["label"]["y0"] + probe["label"]["y1"]) // 2,
    }, max(6, (probe["label"]["x1"] - probe["label"]["x0"]) // 2)) if probe.get("label") else (None, None)

    declared = entry["pixels"]["features"]
    out["route"] = {"painted": route_colour, "localContrast": route_distance,
                    "declared": declared.get("route"),
                    "fidelity": round(validator.delta_e(route_colour, declared["route"]), 2)
                    if route_colour and declared.get("route") else None}
    out["site"] = {"painted": site_colour,
                   "declared": declared.get("siteFill"),
                   "fidelity": round(validator.delta_e(site_colour, declared["siteFill"]), 2)
                   if site_colour and declared.get("siteFill") else None,
                   "vsDistrict": round(validator.delta_e(site_colour, district_colour), 2)
                   if site_colour and district_colour else None}
    out["district"] = {"painted": district_colour, "declared": declared.get("districtValue"),
                       "fidelity": round(validator.delta_e(district_colour, declared["districtValue"]), 2)
                       if district_colour and declared.get("districtValue") else None}
    out["districtMissing"] = {"painted": missing_colour, "declared": declared.get("districtMissing"),
                              "fidelity": round(validator.delta_e(missing_colour, declared["districtMissing"]), 2)
                              if missing_colour and declared.get("districtMissing") else None,
                              "vsDistrict": round(validator.delta_e(missing_colour, district_colour), 2)
                              if missing_colour and district_colour else None}
    out["label"] = {"painted": label_colour, "localContrast": label_distance,
                    "declared": declared.get("label")}
    return out


def main() -> int:
    report_path = EVIDENCE / "leaflet-report.json"
    if not report_path.is_file():
        raise SystemExit("No report found. Run: node scripts/verify_cases.mjs")
    captured = {}
    for group in json.loads(report_path.read_text(encoding="utf-8"))["captured"].values():
        captured.update(group)
    required = {"baseline", "improved", "attempt-filter", "attempt-opacity"}
    absent = required - captured.keys()
    if absent:
        raise SystemExit(f"Missing required capture metadata: {sorted(absent)}")

    table = {}
    for variant, entry in captured.items():
        path = EVIDENCE / f"{entry.get('prefix', 'leaflet')}-{variant}-map.png"
        if not path.is_file():
            raise SystemExit(f"Missing required screenshot: {path}")
        image = Image.open(path).convert("RGB")
        if entry.get('imageSha256') != hashlib.sha256(path.read_bytes()).hexdigest():
            raise SystemExit(f"{path.name}: screenshot hash does not match this capture report")
        scale = entry["pixels"]["deviceScaleFactor"] or 1
        clip = entry.get("clip") or {}
        expected = (round(clip.get("width", 0) * scale), round(clip.get("height", 0) * scale))
        if expected != (image.width, image.height):
            # Every probe coordinate assumes the image is exactly the captured element.
            # If it is not, the samples would be silently reading the wrong pixels.
            raise SystemExit(f"{path.name} is {image.width}x{image.height} but the recorded clip "
                             f"implies {expected[0]}x{expected[1]}; refusing to report measurements.")
        table[variant] = {"image": [image.width, image.height], "measured": measure_variant(image, entry),
                          "areas": area_semantics(image, entry, scale)}

    flagged = []
    observed = []
    for variant, row in table.items():
        areas = row["areas"]
        print(f"\n--- {variant} thematic areas as painted ---")
        for item in areas["classes"]:
            print(f'   class {item["id"]} value {item["value"]:>5}  declared {item["declared"]}  painted {item["painted"]}')
        for item in areas["missing"]:
            print(f'   missing {item["id"]}          declared {item["declared"]}  painted {item["painted"]}')
        print(f'   adjacent dE2000 {areas["adjacentDeltaE"]}  min {areas["minAdjacent"]}  '
              f'missing vs class min {areas["missingVsClassMin"]}  monotonic {areas["lightnessMonotonic"]}')
        # Judged on the shipped improvement; recorded on the baseline and the rejected
        # attempts, whose defects are the point of the case.
        judged = variant == "improved"
        def flag(code):
            (flagged if judged else observed).append(f"{variant}/{code}")
        if not areas["lightnessMonotonic"]:
            flag("area-order")
        if areas["minAdjacent"] is not None and areas["minAdjacent"] < MIN_SEMANTICS_DELTA_E:
            flag("area-adjacent")
        if areas["missingVsClassMin"] is not None and areas["missingVsClassMin"] < MIN_SEMANTICS_DELTA_E:
            flag("area-missing")
        print(f"\n=== {variant} ({row['image'][0]}x{row['image'][1]} px) ===")
        for feature, values in row["measured"].items():
            fidelity = values.get("fidelity")
            prominence = values.get("localContrast") or values.get("vsDistrict")
            notes = []
            # A translucent area has no single declared pixel value, so its fidelity is
            # reported but not judged; the area section above judges it instead.
            if fidelity is not None and fidelity > MAX_FIDELITY_DELTA_E and feature in ("route", "site"):
                notes.append(f"painted {values['painted']} is {fidelity} dE2000 from declared {values['declared']}")
                flag(f"{feature}/fidelity")
            if values.get("vsDistrict") is not None and values["vsDistrict"] < MIN_SEMANTICS_DELTA_E:
                notes.append(f"semantic distance {values['vsDistrict']}")
                flag(f"{feature}/semantics")
            if prominence is not None and feature in ("route", "label") and prominence < MIN_PROMINENCE_DELTA_E:
                notes.append(f"local contrast {prominence} below {MIN_PROMINENCE_DELTA_E}")
                flag(f"{feature}/prominence")
            print(f"   {feature:>15}  painted {values['painted']}  fidelity {fidelity if fidelity is not None else 'n/a':>6}"
                  f"  contrast {prominence if prominence is not None else 'n/a':>6}"
                  f"{'   <- ' + '; '.join(notes) if notes else ''}")

    if "baseline" in table and "improved" in table:
        print("\n=== baseline -> improved ===")
        for feature in ("route", "site", "district", "districtMissing", "label"):
            before = table["baseline"]["measured"][feature]
            after = table["improved"]["measured"][feature]
            keys = [key for key in ("localContrast", "vsDistrict", "fidelity")
                    if before.get(key) is not None and after.get(key) is not None]
            for key in keys:
                print(f"   {feature:>15} {key:<13} {before[key]:>6} -> {after[key]:>6}")

    out = EVIDENCE / "pixel-measurements.json"
    out.write_text(json.dumps({"metric": "CIEDE2000 (deltaE00), not WCAG contrast or a beauty score", "thresholds": {"maxFidelity": MAX_FIDELITY_DELTA_E,
                                              "minProminence": MIN_PROMINENCE_DELTA_E,
                                              "minSemantics": MIN_SEMANTICS_DELTA_E},
                               "variants": table}, ensure_ascii=False, indent=2), encoding="utf-8")
    print(f"\nWrote {out}")
    print("Flagged:", flagged or "none")
    print("Recorded defects on the baseline or rejected attempts:", observed or "none")
    return 1 if flagged else 0


if __name__ == "__main__":
    sys.exit(main())
