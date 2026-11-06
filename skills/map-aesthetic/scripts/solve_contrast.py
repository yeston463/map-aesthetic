#!/usr/bin/env python3
"""Solve for a readable colour against a ground.

A contrast rule that only says "raise the contrast" leaves the designer guessing.
This prints the nearest colour, at the same hue and saturation, that reaches a
target ratio against a given ground — and it says which way to move.

Usage:
    python solve_contrast.py --ground "#f2f4f6" --color "#78828d" --target 4.5
    python solve_contrast.py --ground "#f2f4f6" --color "#78828d" --target 4.5 --mode darker
    python solve_contrast.py --ground "#f2f4f6" --color "#78828d" --target 4.5 --pick

The math runs in OKLCH, so the hue is preserved: the result is the same colour made
readable, not a different colour that happens to pass.
"""
from __future__ import annotations

import argparse
import math
import sys


def hex_to_rgb(color: str) -> tuple[float, float, float]:
    value = color.strip().lstrip("#")
    if len(value) == 3:
        value = "".join(ch * 2 for ch in value)
    if len(value) != 6:
        raise SystemExit(f"Not a hex colour: {color}")
    return tuple(int(value[i : i + 2], 16) / 255 for i in (0, 2, 4))


def rgb_to_hex(rgb: tuple[float, float, float]) -> str:
    return "#" + "".join(f"{round(max(0.0, min(1.0, c)) * 255):02x}" for c in rgb)


def srgb_to_linear(channel: float) -> float:
    return channel / 12.92 if channel <= 0.04045 else ((channel + 0.055) / 1.055) ** 2.4


def linear_to_srgb(channel: float) -> float:
    return channel * 12.92 if channel <= 0.0031308 else 1.055 * channel ** (1 / 2.4) - 0.055


def luminance(rgb: tuple[float, float, float]) -> float:
    r, g, b = (srgb_to_linear(c) for c in rgb)
    return 0.2126 * r + 0.7152 * g + 0.0722 * b


def contrast(a: tuple[float, float, float], b: tuple[float, float, float]) -> float:
    la, lb = luminance(a), luminance(b)
    hi, lo = (la, lb) if la > lb else (lb, la)
    return (hi + 0.05) / (lo + 0.05)


def rgb_to_oklch(rgb: tuple[float, float, float]) -> tuple[float, float, float]:
    r, g, b = (srgb_to_linear(c) for c in rgb)
    l = 0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b
    m = 0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b
    s = 0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b
    l_, m_, s_ = (math.copysign(abs(v) ** (1 / 3), v) for v in (l, m, s))
    lightness = 0.2104542553 * l_ + 0.7936177850 * m_ - 0.0040720468 * s_
    a = 1.9779984951 * l_ - 2.4285922050 * m_ + 0.4505937099 * s_
    bb = 0.0259040371 * l_ + 0.7827717662 * m_ - 0.8086757660 * s_
    chroma = math.hypot(a, bb)
    hue = math.degrees(math.atan2(bb, a)) % 360 if chroma > 1e-6 else 0.0
    return lightness, chroma, hue


def oklch_to_rgb(lightness: float, chroma: float, hue: float) -> tuple[float, float, float]:
    h = math.radians(hue)
    a = chroma * math.cos(h)
    bb = chroma * math.sin(h)
    l_ = lightness + 0.3963377774 * a + 0.2158037573 * bb
    m_ = lightness - 0.1055613458 * a - 0.0638541728 * bb
    s_ = lightness - 0.0894841775 * a - 1.2914855480 * bb
    l, m, s = l_**3, m_**3, s_**3
    r = +4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s
    g = -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s
    b = -0.0041960863 * l - 0.7034186147 * m + 1.7076147010 * s
    return tuple(linear_to_srgb(c) for c in (r, g, b))


def solve(ground: str, color: str, target: float, mode: str) -> dict:
    ground_rgb = hex_to_rgb(ground)
    color_rgb = hex_to_rgb(color)
    lightness, chroma, hue = rgb_to_oklch(color_rgb)

    def ratio_at(level: float) -> float:
        candidate = oklch_to_rgb(level, chroma, hue)
        return contrast(candidate, ground_rgb)

    if mode == "auto":
        mode = "darker" if lightness > 0.5 else "lighter"

    low, high = 0.0, 1.0
    if mode == "darker":
        # Walk down until the ratio is met.
        best = lightness
        for step in range(400):
            level = lightness * (1 - step / 400)
            if ratio_at(level) >= target:
                best = level
                break
        solved = oklch_to_rgb(best, chroma, hue)
    else:
        best = lightness
        for step in range(400):
            level = lightness + (1 - lightness) * (step / 400)
            if ratio_at(level) >= target:
                best = level
                break
        solved = oklch_to_rgb(best, chroma, hue)

    return {
        "ground": ground,
        "color": color,
        "before_ratio": round(contrast(color_rgb, ground_rgb), 3),
        "target": target,
        "after_ratio": round(contrast(solved, ground_rgb), 3),
        "before": rgb_to_hex(color_rgb),
        "after": rgb_to_hex(solved),
        "direction": mode,
        "oklch": {
            "lightness": round(lightness, 4),
            "chroma": round(chroma, 4),
            "hue": round(hue, 1),
            "solved_lightness": round(best, 4),
        },
    }


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description="Solve for a readable colour against a ground.")
    parser.add_argument("--ground", required=True, help="the ground colour, hex")
    parser.add_argument("--color", required=True, help="the text colour to fix, hex")
    parser.add_argument("--target", type=float, default=4.5, help="the ratio to reach")
    parser.add_argument("--mode", choices=["darker", "lighter", "auto"], default="auto")
    parser.add_argument("--pick", action="store_true", help="print only the resulting hex")
    arguments = parser.parse_args(argv)

    result = solve(arguments.ground, arguments.color, arguments.target, arguments.mode)
    if arguments.pick:
        print(result["after"])
        return 0

    print(f"ground        {result['ground']}")
    print(f"colour        {result['before']}  ratio {result['before_ratio']}:1  (target {arguments.target}:1)")
    print(f"move          {result['direction']}")
    print(f"oklch         L {result['oklch']['lightness']} -> {result['oklch']['solved_lightness']}  "
          f"C {result['oklch']['chroma']}  H {result['oklch']['hue']}")
    print(f"result        {result['after']}  ratio {result['after_ratio']}:1")
    if result["after_ratio"] < result["target"]:
        print("  (the hue cannot reach the target on this ground; a different hue is needed)")
        return 1
    return 0


if __name__ == "__main__":
    sys.exit(main())
