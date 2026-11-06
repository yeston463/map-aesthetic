#!/usr/bin/env python3
"""Measure the three-direction demo against the skill's own colour contract.

The demo stores its palettes in ES modules, not theme JSON. This script exports
those colours, then reuses the shipped validator's CIEDE2000 / WCAG functions
and thresholds instead of reimplementing them. It answers the question left
open in DESIGN-NOTES.md: are the ramp steps, the categorical classes and the
no-data tone actually separable, and does the panel text pass contrast?

Usage:
    python scripts/measure_demo_themes.py [--json]

Writes output/theme-measurements.json. Exit 1 when a measurement falls below a
threshold from the skill's validator.
"""
from __future__ import annotations

import argparse
import importlib.util
import json
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
VALIDATOR = ROOT / "skills/map-aesthetic/scripts/validate_theme.py"
EXPORTER = ROOT / "scripts/export_demo_colors.mjs"
OUTPUT = ROOT / "output/theme-measurements.json"


def load_validator():
    spec = importlib.util.spec_from_file_location("map_validate_theme", VALIDATOR)
    module = importlib.util.module_from_spec(spec)
    assert spec.loader is not None
    spec.loader.exec_module(module)
    return module


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--json", action="store_true")
    args = parser.parse_args(argv)

    exported = subprocess.run([  # node is required because the palettes are ES modules
        "node", str(EXPORTER),
    ], cwd=ROOT, capture_output=True, text=True, check=True)
    palettes = json.loads(exported.stdout)
    validator = load_validator()
    thresholds = {
        "context": validator.MIN_CONTEXT_DELTA_E,
        "class": validator.MIN_CLASS_DELTA_E,
        "ramp_step": validator.MIN_RAMP_STEP_DELTA_E,
        "wcag_small_text": 4.5,
    }
    report = {"thresholds": thresholds, "directions": {}, "failed": 0}

    for name, data in palettes.items():
        cartography = {
            "land": data["basemap"]["land"],
            "water": data["basemap"]["water"],
            "park": data["basemap"]["park"],
            "roadCasing": data["basemap"]["roadCasing"],
            "categorical": data["categorical"],
            "sequential": data["sequential"],
        }
        contract_failures = validator.check_separation(cartography)

        def steps(ramp: list[str]) -> list[dict]:
            rows = []
            for index, (left, right) in enumerate(zip(ramp, ramp[1:])):
                normal = validator.delta_e(left, right)
                simulated = validator.delta_e(
                    validator.deuteranopia(left), validator.deuteranopia(right))
                rows.append({"step": f"{index}->{index + 1}", "left": left, "right": right,
                             "dE2000": round(normal, 2),
                             "dE2000_deuteranopia": round(simulated, 2),
                             "pass": normal >= thresholds["ramp_step"]})
            return rows

        class_pairs = []
        classes = data["categorical"]
        for index, left in enumerate(classes):
            for right in classes[index + 1:]:
                normal = validator.delta_e(left, right)
                simulated = validator.delta_e(
                    validator.deuteranopia(left), validator.deuteranopia(right))
                class_pairs.append({"pair": [left, right], "dE2000": round(normal, 2),
                                   "dE2000_deuteranopia": round(simulated, 2),
                                   "pass": min(normal, simulated) >= thresholds["class"]})

        ui = data["ui"]
        surface = ui["--surface"]
        contrasts = {
            "ink_on_surface": round(validator.contrast(ui["--ink"], surface), 2),
            "muted_on_surface": round(validator.contrast(ui["--muted"], surface), 2),
            "accent_on_surface": round(validator.contrast(ui["--accent"], surface), 2),
        }
        sequential_steps = steps(data["sequential"])
        diverging_steps = steps(data["diverging"])
        missing_vs_lowest = round(validator.delta_e(
            data["missing"], data["sequential"][0]), 2)

        failures = list(contract_failures)
        failures += [f"sequential {row['step']}: dE2000 {row['dE2000']} < {thresholds['ramp_step']}"
                     for row in sequential_steps if not row["pass"]]
        failures += [f"diverging {row['step']}: dE2000 {row['dE2000']} < {thresholds['ramp_step']}"
                     for row in diverging_steps if not row["pass"]]
        failures += [f"classes {row['pair']}: dE2000 {row['dE2000']} < {thresholds['class']}"
                     for row in class_pairs if not row["pass"]]
        failures += [f"{key}: {value} < {thresholds['wcag_small_text']}"
                     for key, value in contrasts.items()
                     if value < thresholds["wcag_small_text"]]
        if missing_vs_lowest < thresholds["class"]:
            failures.append(f"missing vs lowest ramp step: dE2000 {missing_vs_lowest} "
                            f"< {thresholds['class']}")

        report["directions"][name] = {
            "sequential_steps": sequential_steps,
            "diverging_steps": diverging_steps,
            "class_pairs": class_pairs,
            "missing_vs_lowest": missing_vs_lowest,
            "contrasts": contrasts,
            "contract_failures": contract_failures,
            "failures": failures,
        }
        report["failed"] += len(failures)

    OUTPUT.parent.mkdir(parents=True, exist_ok=True)
    OUTPUT.write_text(json.dumps(report, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    if args.json:
        print(json.dumps(report, ensure_ascii=False, indent=2))
    else:
        for name, row in report["directions"].items():
            print(f"\n{name}")
            print("  sequential dE2000 : " + ", ".join(
                str(item["dE2000"]) for item in row["sequential_steps"]))
            print("  diverging  dE2000 : " + ", ".join(
                str(item["dE2000"]) for item in row["diverging_steps"]))
            print("  class min  dE2000 : " + str(min(
                (item["dE2000"] for item in row["class_pairs"]), default="n/a")))
            print(f"  missing vs lowest : {row['missing_vs_lowest']}")
            print("  WCAG ink/muted/accent : " + "/".join(
                str(value) for value in row["contrasts"].values()))
            print(f"  failures: {len(row['failures'])}")
            for failure in row["failures"]:
                print(f"    - {failure}")
        print(f"\n{report['failed']} measurement(s) below threshold -> {OUTPUT}")
    return 1 if report["failed"] else 0


if __name__ == "__main__":
    sys.exit(main())
