#!/usr/bin/env python3
"""Validate theme intent, UI contrast, and a few cross-field invariants.

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
        if ratio < 4.5:
            failures.append(f"ui.{foreground} on ui.{background}: {ratio:.2f}:1 contrast; need at least 4.5:1")

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
    print("Checks cover structure, three UI contrast pairs, and token invariants; SDK support and visual quality need separate QA.")
    return 1 if failed else 0


if __name__ == "__main__":
    raise SystemExit(main())
