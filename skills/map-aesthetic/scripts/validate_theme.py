#!/usr/bin/env python3
"""Validate theme intent, UI contrast, cartographic separation, and token invariants.

Requires jsonschema. This does not validate native SDK styles or map readability.
"""

from __future__ import annotations

import argparse
import json
import math
import sys
from pathlib import Path

try:
    from jsonschema import Draft202012Validator
except ImportError:
    raise SystemExit("Missing jsonschema. Install it with: python -m pip install jsonschema")

SKILL_DIR = Path(__file__).resolve().parents[1]
SCHEMA_PATH = SKILL_DIR / "assets" / "theme.schema.json"

# Pre-registered floors. A CIEDE2000 difference near 2.3 is a just-noticeable
# difference over a large flat area, so 5.0 asks for a clearly visible edge rather
# than a barely detectable one. The floors are fixed before looking at any palette.
MIN_CONTEXT_DELTA_E = 5.0
MIN_CLASS_DELTA_E = 5.0
MIN_RAMP_STEP_DELTA_E = 5.0
MIN_UI_CONTRAST = 4.5
MIN_BOUNDARY_DELTA_E = 3.0
MIN_STATE_DELTA_E = 5.0
# When selection replaces the class fill, colour is the only signal left, so the
# emphasis must be further from every class than a mere ring would need to be.
MIN_REPLACING_SELECTION_DELTA_E = 8.0
MIN_UNPATTERNED_MISSING_DELTA_E = 8.0

# Context fills that sit on the ground and must read as separate surfaces.
# labelHalo is deliberately absent: a halo normally matches land so that text
# punches through roads and fills, so requiring separation there would reject a
# correct design.
CONTEXT_PAIRS = (("water", "land"), ("park", "land"), ("roadCasing", "land"))


def load_json(path: Path) -> object:
    """Reject non-JSON numbers and duplicate keys instead of accepting them silently."""

    def reject_constant(value: str) -> None:
        raise ValueError(f"Non-finite JSON value: {value}")

    def unique_object(pairs: list[tuple[str, object]]) -> dict:
        result = {}
        for key, value in pairs:
            if key in result:
                raise ValueError(f"Duplicate JSON key: {key}")
            result[key] = value
        return result

    return json.loads(
        path.read_text(encoding="utf-8"),
        parse_constant=reject_constant,
        object_pairs_hook=unique_object,
    )


def luminance(color: str) -> float:
    channels = [int(color[index : index + 2], 16) / 255 for index in (1, 3, 5)]
    linear = [value / 12.92 if value <= 0.04045 else ((value + 0.055) / 1.055) ** 2.4 for value in channels]
    return sum(value * weight for value, weight in zip(linear, (0.2126, 0.7152, 0.0722)))


def contrast(foreground: str, background: str) -> float:
    high, low = sorted((luminance(foreground), luminance(background)), reverse=True)
    return (high + 0.05) / (low + 0.05)


def channels(color: str) -> tuple[float, float, float]:
    return tuple(int(color[index : index + 2], 16) / 255 for index in (1, 3, 5))  # type: ignore[return-value]


def encode(value: float) -> float:
    return 12.92 * value if value <= 0.0031308 else 1.055 * value ** (1 / 2.4) - 0.055


def lab(color: str) -> tuple[float, float, float]:
    """Convert sRGB hex to CIE L*a*b* under D65."""
    r, g, b = ((value / 12.92 if value <= 0.04045 else ((value + 0.055) / 1.055) ** 2.4) for value in channels(color))
    x, y, z = (r * 0.4124 + g * 0.3576 + b * 0.1805,
               r * 0.2126 + g * 0.7152 + b * 0.0722,
               r * 0.0193 + g * 0.1192 + b * 0.9505)

    def forward(t: float) -> float:
        return t ** (1 / 3) if t > 0.008856 else 7.787 * t + 16 / 116

    fx, fy, fz = (forward(t / ref) for t, ref in zip((x, y, z), (0.95047, 1.0, 1.08883)))
    return 116 * fy - 16, 500 * (fx - fy), 200 * (fy - fz)


def delta_e(color: str, other: str) -> float:
    """CIEDE2000 between two hex colors, the metric these floors are stated in."""
    lightness1, a1, b1 = lab(color)
    lightness2, a2, b2 = lab(other)
    chroma1, chroma2 = math.hypot(a1, b1), math.hypot(a2, b2)
    mean_chroma = (chroma1 + chroma2) / 2
    factor = 0.5 * (1 - math.sqrt(mean_chroma ** 7 / (mean_chroma ** 7 + 25 ** 7))) if mean_chroma else 0
    a1p, a2p = (1 + factor) * a1, (1 + factor) * a2
    chroma1p, chroma2p = math.hypot(a1p, b1), math.hypot(a2p, b2)
    hue1 = math.degrees(math.atan2(b1, a1p)) % 360
    hue2 = math.degrees(math.atan2(b2, a2p)) % 360
    delta_lightness, delta_chroma = lightness2 - lightness1, chroma2p - chroma1p
    if chroma1p * chroma2p == 0:
        delta_hue = 0.0
    elif abs(hue2 - hue1) <= 180:
        delta_hue = hue2 - hue1
    elif hue2 - hue1 > 180:
        delta_hue = hue2 - hue1 - 360
    else:
        delta_hue = hue2 - hue1 + 360
    delta_h = 2 * math.sqrt(chroma1p * chroma2p) * math.sin(math.radians(delta_hue) / 2)
    mean_lightness = (lightness1 + lightness2) / 2
    mean_chromap = (chroma1p + chroma2p) / 2
    if chroma1p * chroma2p == 0:
        mean_hue = hue1 + hue2
    elif abs(hue1 - hue2) <= 180:
        mean_hue = (hue1 + hue2) / 2
    elif hue1 + hue2 < 360:
        mean_hue = (hue1 + hue2 + 360) / 2
    else:
        mean_hue = (hue1 + hue2 - 360) / 2
    t = (1 - 0.17 * math.cos(math.radians(mean_hue - 30)) + 0.24 * math.cos(math.radians(2 * mean_hue))
         + 0.32 * math.cos(math.radians(3 * mean_hue + 6)) - 0.20 * math.cos(math.radians(4 * mean_hue - 63)))
    weight_lightness = 1 + (0.015 * (mean_lightness - 50) ** 2) / math.sqrt(20 + (mean_lightness - 50) ** 2)
    weight_chroma = 1 + 0.045 * mean_chromap
    weight_hue = 1 + 0.015 * mean_chromap * t
    rotation = 30 * math.exp(-((mean_hue - 275) / 25) ** 2)
    radius = 2 * math.sqrt(mean_chromap ** 7 / (mean_chromap ** 7 + 25 ** 7)) if mean_chromap else 0
    cross = -math.sin(math.radians(2 * rotation)) * radius
    return math.sqrt((delta_lightness / weight_lightness) ** 2 + (delta_chroma / weight_chroma) ** 2
                     + (delta_h / weight_hue) ** 2 + cross * (delta_chroma / weight_chroma) * (delta_h / weight_hue))


def deuteranopia(color: str) -> str:
    """Approximate red-green colour-vision deficiency so class pairs are screened for it."""
    r, g, b = ((value / 12.92 if value <= 0.04045 else ((value + 0.055) / 1.055) ** 2.4) for value in channels(color))
    values = (0.625 * r + 0.375 * g, 0.7 * r + 0.3 * g, b)
    return "#" + "".join(f"{round(encode(max(0.0, min(1.0, value))) * 255):02X}" for value in values)


def check_separation(cartography: dict) -> list[str]:
    """Measure whether context surfaces and data classes are visually separable."""
    failures = []
    land = cartography["land"]
    for foreground, background in CONTEXT_PAIRS:
        distance = delta_e(cartography[foreground], cartography[background])
        if distance < MIN_CONTEXT_DELTA_E:
            failures.append(f"cartography.{foreground} vs {background}: dE2000 {distance:.2f}; "
                            f"need at least {MIN_CONTEXT_DELTA_E} to read as a separate surface")

    classes = cartography["categorical"]
    for index, color in enumerate(classes):
        for other in classes[index + 1 :]:
            normal = delta_e(color, other)
            simulated = delta_e(deuteranopia(color), deuteranopia(other))
            if min(normal, simulated) < MIN_CLASS_DELTA_E:
                failures.append(f"cartography.categorical {color} vs {other}: dE2000 {normal:.2f} "
                                f"(colour-blind {simulated:.2f}); classes need at least {MIN_CLASS_DELTA_E}")

    ramp = cartography["sequential"]
    lightness = [luminance(color) for color in ramp]
    ordered = all(b > a for a, b in zip(lightness, lightness[1:])) or all(b < a for a, b in zip(lightness, lightness[1:]))
    if not ordered:
        failures.append("cartography.sequential: lightness must increase or decrease monotonically with value")
    for index, color in enumerate(ramp[:-1]):
        distance = delta_e(color, ramp[index + 1])
        if distance < MIN_RAMP_STEP_DELTA_E:
            failures.append(f"cartography.sequential step {index}->{index + 1}: dE2000 {distance:.2f}; "
                            f"adjacent classes need at least {MIN_RAMP_STEP_DELTA_E}")
    return failures


def check_semantics(cartography: dict) -> list[str]:
    """Rules for the thematic fields. Absent fields are skipped, so a v1.0 theme still passes."""
    failures = []
    land = cartography["land"]
    classes = [entry["color"] for entry in cartography.get("classes", [])]
    ramps = list(cartography.get("sequential", [])) + list(cartography.get("diverging", {}).get("ramp", []))

    area = cartography.get("area")
    if area:
        distance = delta_e(area["boundaryColor"], land)
        if distance < MIN_BOUNDARY_DELTA_E:
            failures.append(f"cartography.area.boundaryColor vs land: dE2000 {distance:.2f}; "
                            f"a thematic boundary needs at least {MIN_BOUNDARY_DELTA_E} to close each area")

    missing = cartography.get("missing")
    if missing:
        floor = MIN_CLASS_DELTA_E if missing["pattern"] != "none" else MIN_UNPATTERNED_MISSING_DELTA_E
        comparators = {"land": land, **{f"class {index}": color for index, color in enumerate(classes)},
                       **{f"ramp {index}": color for index, color in enumerate(ramps)}}
        for label, color in comparators.items():
            distance = delta_e(missing["color"], color)
            if distance < floor:
                failures.append(f"cartography.missing.color vs {label}: dE2000 {distance:.2f}; no data must not "
                                f"be confusable with a value class (needs {floor}"
                                f"{'' if missing['pattern'] != 'none' else ', and pattern is none'})")

    diverging = cartography.get("diverging")
    if diverging:
        ramp = diverging["ramp"]
        if len(ramp) % 2 == 0:
            failures.append("cartography.diverging.ramp must have an odd number of stops so one stop is the midpoint")
        else:
            lightness = [luminance(color) for color in ramp]
            centre = len(ramp) // 2
            first = lightness[:centre + 1]
            second = lightness[centre:]
            turning = (all(b > a for a, b in zip(first, first[1:])) and all(b < a for a, b in zip(second, second[1:]))
                       or all(b < a for a, b in zip(first, first[1:])) and all(b > a for a, b in zip(second, second[1:])))
            if not turning:
                failures.append("cartography.diverging.ramp must move away from the centre stop in both directions")
        for index, color in enumerate(ramp[:-1]):
            distance = delta_e(color, ramp[index + 1])
            if distance < MIN_RAMP_STEP_DELTA_E:
                failures.append(f"cartography.diverging step {index}->{index + 1}: dE2000 {distance:.2f}; "
                                f"needs at least {MIN_RAMP_STEP_DELTA_E}")

    entries = cartography.get("classes", [])
    identifiers = [entry["id"] for entry in entries]
    if len(set(identifiers)) != len(identifiers):
        failures.append("cartography.classes: ids must be unique; they are the binding, not the colours")
    palette = {color.lower() for color in cartography["categorical"]}
    for entry in entries:
        if entry["color"].lower() not in palette:
            failures.append(f"cartography.classes {entry['id']}: colour is not one of cartography.categorical; "
                            "binding a class to an off-palette colour lets a later restyle reassign it")
        distance = delta_e(entry["color"], land)
        if distance < MIN_CLASS_DELTA_E:
            failures.append(f"cartography.classes {entry['id']} vs land: dE2000 {distance:.2f}; "
                            f"a class must clear {MIN_CLASS_DELTA_E} on the ground it sits on")
    for index, color in enumerate(classes):
        for other in classes[index + 1:]:
            distance = delta_e(color, other)
            if distance < MIN_CLASS_DELTA_E:
                failures.append(f"cartography.classes {identifiers[index]} vs {identifiers[index + 1 + classes[index + 1:].index(other)]}: "
                                f"dE2000 {distance:.2f}; classes need at least {MIN_CLASS_DELTA_E}")

    selection = cartography["selection"]
    keep = selection.get("keepClassVisible", True)
    floor = MIN_CLASS_DELTA_E if keep else MIN_REPLACING_SELECTION_DELTA_E
    for index, color in enumerate(classes):
        distance = delta_e(selection["color"], color)
        if distance < floor:
            failures.append(f"cartography.selection.color vs class {identifiers[index]}: dE2000 {distance:.2f}; "
                            f"{'a selection ring' if keep else 'a replacing selection fill'} "
                            f"needs at least {floor} from every class")

    states = cartography.get("states")
    if states:
        for name in ("alert", "hover"):
            for index, color in enumerate(classes):
                distance = delta_e(states[name], color)
                if distance < MIN_STATE_DELTA_E:
                    failures.append(f"cartography.states.{name} vs class {identifiers[index]}: dE2000 {distance:.2f}; "
                                    f"status and class are drawn on the same feature and need {MIN_STATE_DELTA_E}")
            distance = delta_e(states[name], land)
            if distance < MIN_STATE_DELTA_E:
                failures.append(f"cartography.states.{name} vs land: dE2000 {distance:.2f}; needs {MIN_STATE_DELTA_E}")
        distance = delta_e(states["disabled"], land)
        if distance < MIN_BOUNDARY_DELTA_E:
            failures.append(f"cartography.states.disabled vs land: dE2000 {distance:.2f}; a filtered-out feature "
                            f"should still be visible, needs {MIN_BOUNDARY_DELTA_E}")
    return failures


def validate_theme(theme: object, schema: dict | None = None) -> list[str]:
    """Return actionable errors. An empty list is not a cartographic approval."""
    if schema is None:
        schema = load_json(SCHEMA_PATH)
    Draft202012Validator.check_schema(schema)
    errors = sorted(Draft202012Validator(schema).iter_errors(theme), key=lambda error: str(list(error.absolute_path)))
    if errors:
        return [f"{'.'.join(str(part) for part in error.absolute_path) or '$'}: {error.message}" for error in errors]

    failures = []
    ui = theme["ui"]
    for foreground, background in (("text", "surface"), ("mutedText", "surface"), ("accentText", "accent")):
        ratio = contrast(ui[foreground], ui[background])
        if ratio < MIN_UI_CONTRAST:
            failures.append(f"ui.{foreground} on ui.{background}: {ratio:.2f}:1 contrast; "
                            f"need at least {MIN_UI_CONTRAST}:1")

    cartography = theme["cartography"]
    route = cartography["route"]
    if route["casingWidthPx"] <= route["widthPx"]:
        failures.append("cartography.route.casingWidthPx must exceed widthPx (total outer stroke width)")
    scale = cartography["scale"]
    if scale["detailBelowMpp"] >= scale["overviewAboveMpp"]:
        failures.append("cartography.scale.detailBelowMpp must be below overviewAboveMpp")
    for key in ("categorical", "sequential"):
        colors = cartography[key]
        if len({color.lower() for color in colors}) != len(colors):
            failures.append(f"cartography.{key}: colors must be unique ignoring hex case")

    failures.extend(check_separation(cartography))
    failures.extend(check_semantics(cartography))

    def check_finite(value: object, path: str = "$") -> None:
        if isinstance(value, float) and not math.isfinite(value):
            failures.append(f"{path}: number must be finite")
        elif isinstance(value, dict):
            for key, child in value.items():
                check_finite(child, f"{path}.{key}")
        elif isinstance(value, list):
            for index, child in enumerate(value):
                check_finite(child, f"{path}[{index}]")

    check_finite(theme)
    return failures


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("themes", nargs="*", type=Path, help="Theme JSON files; defaults to packaged themes")
    args = parser.parse_args(argv)
    paths = args.themes or sorted((SKILL_DIR / "assets" / "themes").glob("*.json"))
    if not paths:
        parser.error("No theme files found")
    failed = False
    for path in paths:
        try:
            errors = validate_theme(load_json(path))
        except (OSError, ValueError) as error:
            errors = [str(error)]
        if errors:
            failed = True
            for error in errors:
                print(f"FAIL {path}: {error}", file=sys.stderr)
        else:
            print(f"PASS {path}")
    print("Checks cover structure, three UI contrast pairs, cartographic separation in dE2000, and token "
          "invariants; SDK support, label readability, and visual quality need separate QA.")
    return 1 if failed else 0


if __name__ == "__main__":
    raise SystemExit(main())
