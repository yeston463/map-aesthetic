#!/usr/bin/env python3
"""Scan a project for the map anti-patterns that can be decided without a browser.

The checks here read the source, not the rendered page, so they can run in CI
before anything is served. The rules come from `references/anti-patterns.md`; the
browser-side checks live in `scripts/consistency.mjs`.

Usage:
    python check_anti_patterns.py <path> [<path> ...] [--json]

A path may be a file or a directory; directories are walked for .js, .mjs, .ts,
.jsx, .tsx, .html, .css, .json and .py files.

Exit 1 when anything FAILs, 0 when clean, 2 when there was nothing to scan.
"""
from __future__ import annotations

import argparse
import json
import re
import sys
from pathlib import Path

SCAN_SUFFIXES = {".js", ".mjs", ".cjs", ".ts", ".jsx", ".tsx", ".html", ".css", ".json", ".py"}
SKIP_DIRS = {"node_modules", ".git", "dist", "build", "coverage", ".next", "vendor", "__pycache__"}

# The checker scans itself when it is run over its own directory, and the rule
# table lists the pure hues it looks for. Those literals are the rule, not a use
# of the colour, so the rule table is skipped.
SELF_RULE_FILES = {"check_anti_patterns.py", "consistency.mjs"}
# Both files hold the rule tables, so both are skipped when the checker is
# run over its own directory.

# A raw saturated colour: a fully saturated hue, or a pure primary. These are the
# debug colours that read as machine-made. The check is on the colour value, not
# on the word, because "red" in a comment is harmless and "#FF0000" in a style is
# not.
RAW_HUES = {
    "red": "#ff0000", "blue": "#0000ff", "green": "#008000", "lime": "#00ff00",
    "yellow": "#ffff00", "cyan": "#00ffff", "aqua": "#00ffff", "magenta": "#ff00ff",
    "fuchsia": "#ff00ff", "orange": "#ffa500", "purple": "#800080", "pink": "#ffc0cb",
    "silver": "#c0c0c0", "maroon": "#800000", "navy": "#000080", "teal": "#008080",
    "olive": "#808000", "limegreen": "#32cd32",
}
# Fully saturated primaries and secondaries in hex.
PURE_HEX = {
    "#ff0000", "#00ff00", "#0000ff", "#ffff00", "#00ffff", "#ff00ff",
    "#f00", "#0f0", "#00f", "#ff0", "#0ff", "#f0f",
}

# The default OpenStreetMap raster tile server. Not the OSM *data*, which is
# fine to derive from locally: the shared tile service is the thing that cannot
# be used as a themed basemap.
OSM_TILE_HOSTS = ("tile.openstreetmap.org", "tile.osm.org")

# Basemap providers that are outside the compliant set for China-area maps. The
# check is a warning: the source may legitimately target another region.
NON_COMPLIANT_BASEMAPS = {
    "basemaps.cartocdn.com": "CARTO renders OpenStreetMap data; use it only outside China",
    "api.mapbox.com": "Mapbox is not on the compliant provider list",
    "tiles.mapbox.com": "Mapbox is not on the compliant provider list",
    "tile.openstreetmap.org": "the public OSM tile service may not be used as a themed basemap",
}


class Finding:
    def __init__(self, rule: str, severity: str, path: Path, line: int, detail: str, fix: str):
        self.rule = rule
        self.severity = severity
        self.path = path
        self.line = line
        self.detail = detail
        self.fix = fix

    def to_dict(self) -> dict:
        return {"rule": self.rule, "severity": self.severity,
                "file": str(self.path), "line": self.line,
                "detail": self.detail, "fix": self.fix}


def walk(paths: list[str]) -> list[Path]:
    files: list[Path] = []
    for raw in paths:
        path = Path(raw)
        if path.is_file():
            if path.name not in SELF_RULE_FILES:
                files.append(path)
            continue
        for root, dirs, names in __import__("os").walk(path):
            dirs[:] = [d for d in dirs if d not in SKIP_DIRS]
            for name in names:
                if name in SELF_RULE_FILES:
                    continue
                candidate = Path(root) / name
                if candidate.suffix.lower() in SCAN_SUFFIXES:
                    files.append(candidate)
    return files


def check_raw_colours(text: str, path: Path) -> list[Finding]:
    """A raw saturated hue used as a colour value."""
    findings: list[Finding] = []
    # Hex form: #rgb or #rrggbb, case-insensitive.
    for match in re.finditer(r"#[0-9a-fA-F]{3,8}\b", text):
        value = match.group(0).lower()
        candidate = value if len(value) in (4, 7) else value[:7]
        if candidate in PURE_HEX:
            line = text.count("\n", 0, match.start()) + 1
            findings.append(Finding(
                "raw-colour", "fail", path, line,
                f"pure saturated colour {value}",
                "mix the hue with neutral or take a desaturated step of it; a pure hue reads as an error"))
    # Named form: a CSS colour keyword used as a value.
    for match in re.finditer(
            r"(?:color|fill|stroke|background|border(?:-\w+)?-color)\s*[:=]\s*['\"]?"
            r"(red|blue|lime|cyan|magenta|fuchsia|yellow|orange|pink|navy|teal|maroon|olive)\b",
            text, re.IGNORECASE):
        name = match.group(1).lower()
        line = text.count("\n", 0, match.start()) + 1
        findings.append(Finding(
            "raw-colour", "fail", path, line,
            f"raw colour keyword '{name}'",
            f"use a tint of {name}, not {RAW_HUES.get(name, name)}"))
    return findings


def check_opaque_fill(text: str, path: Path) -> list[Finding]:
    """A thematic area filled at full opacity over a basemap.

    Only the thematic layer counts. The basemap's own land, water and block fills
    are opaque by nature — a river that is half transparent is not a river — and a
    point marker that is half transparent is not a marker. So the check looks at
    the thematic area's own opacity, not at every fill in the file.
    """
    findings: list[Finding] = []

    # A thematic area's opacity, read from its own block.
    area = re.search(
        r"\b(?:area|districts?)\s*[:=]\s*\{(?:[^{}]|\{[^{}]*\})*?\}", text, re.DOTALL)
    if area:
        block = area.group(0)
        for match in re.finditer(r"fillOpacity\s*[:=]\s*1(?:\.0+)?\b", block):
            line = text.count("\n", 0, area.start() + match.start()) + 1
            findings.append(Finding(
                "opaque-fill", "fail", path, line,
                "the thematic area fills at 1.0 — a full-opacity fill erases the basemap under it",
                "use 0.35 at rest and 0.65 on hover; a polygon over a basemap never fills opaque"))

    # A style object that states a bare fillOpacity at the top level of a
    # districts block, as the packaged themes do.
    for match in re.finditer(
            r'"area"\s*:\s*\{[^}]*"fillOpacity"\s*:\s*1(?:\.0+)?\b', text, re.DOTALL):
        line = text.count("\n", 0, match.start()) + 1
        findings.append(Finding(
            "opaque-fill", "fail", path, line,
            'the thematic area fills at 1.0 — a full-opacity fill erases the basemap under it',
            "use 0.35 at rest and 0.65 on hover; a polygon over a basemap never fills opaque"))
    return findings


def check_default_popup(text: str, path: Path) -> list[Finding]:
    """A popup that is opened without a custom class or a restyled wrapper."""
    findings: list[Finding] = []
    if "bindPopup" not in text and "openPopup" not in text:
        return findings
    # The engine's default popup is used when no class name is set and the
    # stylesheet does not restyle the wrapper.
    styles_restyled = bool(
        re.search(r"\.leaflet-popup-content-wrapper\s*\{", text)
        or re.search(r"\.leaflet-popup\b[^{]*\{", text))
    if styles_restyled:
        return findings
    for match in re.finditer(r"bindPopup\s*\(", text):
        window = text[match.start():match.start() + 300]
        has_class = "className" in window
        if has_class:
            continue
        line = text.count("\n", 0, match.start()) + 1
        findings.append(Finding(
            "default-popup", "warn", path, line,
            "a popup is opened without a custom class",
            "restyle .leaflet-popup-content-wrapper and the tip, and pass a className"))
    return findings


def check_pin_density(text: str, path: Path) -> list[Finding]:
    """A pin layer with no clustering, where the point count is large."""
    findings: list[Finding] = []
    if not re.search(r"L\.marker\(|new\s+mapboxgl\.Marker\(|new\s+google\.maps\.Marker\(", text):
        return findings
    if re.search(r"cluster|MarkerCluster|supercluster|hexbin", text, re.IGNORECASE):
        return findings
    # A point count written down in the source is the only evidence available
    # without running the page.
    for match in re.finditer(r"(?:points|features|items|markers)\s*[:=]\s*\[([^\]]{200,})\]", text):
        line = text.count("\n", 0, match.start()) + 1
        findings.append(Finding(
            "pin-density", "warn", path, line,
            "a marker array is declared inline with many entries and no cluster layer",
            "above 30 points use a circle layer, a cluster layer, or a hexbin layer"))
    return findings


def check_attribution_style(text: str, path: Path) -> list[Finding]:
    """An attribution that is hidden or made unreadable."""
    findings: list[Finding] = []
    for pattern, detail in (
        (r"\.leaflet-control-attribution\s*\{[^}]*display\s*:\s*none",
         "the attribution control is hidden"),
        (r"\.leaflet-control-attribution\s*\{[^}]*opacity\s*:\s*0(?:\.\d+)?\b",
         "the attribution control is faded to nothing"),
        (r"\.leaflet-control-attribution\s*\{[^}]*font-size\s*:\s*0",
         "the attribution text is set to zero size"),
    ):
        for match in re.finditer(pattern, text, re.DOTALL):
            line = text.count("\n", 0, match.start()) + 1
            findings.append(Finding(
                "attribution-hidden", "fail", path, line, detail,
                "keep the attribution visible and legible; a provider can suspend the key over it"))
    return findings


def check_cursor(text: str, path: Path, project_has_cursor: bool = False) -> list[Finding]:
    """An interactive layer without a pointer cursor.

    Leaflet sets `cursor: pointer` on the paths it makes interactive, so a project
    that uses the engine's own interactivity is already correct and the check
    must not report it. A stylesheet in the same project declaring the cursor is
    equally correct: a JS file that binds a click is not expected to restyle the
    element itself. `project_has_cursor` is computed once per scan.
    """
    findings: list[Finding] = []
    if not re.search(r"bindPopup|\.on\(['\"]click|addEventListener\(['\"]click", text):
        return findings
    if project_has_cursor or re.search(r"cursor\s*:\s*pointer", text):
        return findings
    # The engine's own interactive path carries the cursor by default.
    if re.search(r"leaflet-interactive|bindPopup", text):
        return findings
    # Anything left handles clicks itself. Report each handler once. The old loop
    # only looked for bindPopup calls, but any bindPopup returns above, which made
    # this rule unreachable; the rule fixture suite caught that.
    triggers = re.finditer(
        r"addEventListener\(\s*['\"]click|\.on\(\s*['\"]click|bindPopup\s*\(", text)
    for match in triggers:
        line = text.count("\n", 0, match.start()) + 1
        findings.append(Finding(
            "cursor-pointer", "warn", path, line,
            "an interactive feature is bound without a pointer cursor",
            "set cursor: pointer on the interactive layer, or on the container the engine styles"))
    return findings


def check_tabular_numbers(text: str, path: Path) -> list[Finding]:
    """A stylesheet that sets figures without tabular figures.

    Only a stylesheet can settle this: the rule is about the CSS, and the
    figures themselves live in the markup. A stylesheet that mentions figures
    and never sets tabular figures is the case worth reporting.
    """
    findings: list[Finding] = []
    if path.suffix.lower() != ".css":
        return findings
    if "tabular-nums" in text:
        return findings
    if not re.search(r"坐标|经度|纬度|面积|人口|数量|业务量|件\b|\.status|\.readout|\boutput\b", text):
        return findings
    line = 1
    findings.append(Finding(
        "tabular-numbers", "warn", path, line,
        "the stylesheet holds figures but never sets font-variant-numeric: tabular-nums",
        "a column of numbers jitters without it; set it on the element that holds them"))
    return findings


def check_basemap_source(text: str, path: Path) -> list[Finding]:
    """A basemap URL from a provider that needs checking."""
    findings: list[Finding] = []
    for host, note in NON_COMPLIANT_BASEMAPS.items():
        if host not in text:
            continue
        line = text.count("\n", 0, text.index(host)) + 1
        severity = "fail" if host in OSM_TILE_HOSTS else "warn"
        findings.append(Finding(
            "basemap-provider", severity, path, line,
            f"{host} — {note}",
            "use a compliant provider (Tencent, AMap, Baidu, Tianditu) for China-area maps, "
            "or the project's own vector geometry"))
    return findings


def check_attribution_present(text: str, path: Path) -> list[Finding]:
    """A tile layer with no attribution of its own."""
    findings: list[Finding] = []
    if not re.search(r"L\.tileLayer|tileLayer\(|raster", text):
        return findings
    if re.search(r"attribution\s*:", text) or re.search(r"addAttribution", text):
        return findings
    for match in re.finditer(r"L\.tileLayer\s*\(", text):
        window = text[match.start():match.start() + 600]
        if "attribution" in window:
            continue
        line = text.count("\n", 0, match.start()) + 1
        findings.append(Finding(
            "attribution-missing", "fail", path, line,
            "a tile layer has no attribution",
            "name the data source; a provider's terms usually require it and can suspend the key"))
    return findings


CHECKS = (
    check_raw_colours,
    check_opaque_fill,
    check_default_popup,
    check_pin_density,
    check_attribution_style,
    check_cursor,
    check_tabular_numbers,
    check_basemap_source,
    check_attribution_present,
)


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description="Scan a project for map anti-patterns.")
    parser.add_argument("paths", nargs="*", help="files or directories to scan")
    parser.add_argument("--json", action="store_true", help="print the findings as JSON")
    arguments = parser.parse_args(argv)

    if not arguments.paths:
        print("usage: python check_anti_patterns.py <path> [<path> ...] [--json]")
        return 2

    files = walk(arguments.paths)
    if not files:
        print("nothing to scan")
        return 2

    loaded: list[tuple[Path, str]] = []
    for file in files:
        try:
            loaded.append((file, file.read_text(encoding="utf-8", errors="replace")))
        except OSError:
            continue
    project_has_cursor = any(
        re.search(r"cursor\s*:\s*pointer", text) for _, text in loaded)

    findings: list[Finding] = []
    for file, text in loaded:
        for check in CHECKS:
            if check is check_cursor:
                findings.extend(check(text, file, project_has_cursor))
            else:
                findings.extend(check(text, file))

    fails = [f for f in findings if f.severity == "fail"]
    warns = [f for f in findings if f.severity == "warn"]

    if arguments.json:
        print(json.dumps({"files_scanned": len(files),
                          "findings": [f.to_dict() for f in findings],
                          "fails": len(fails), "warns": len(warns)}, indent=2))
        return 1 if fails else 0

    print(f"scanned {len(files)} files")
    for finding in findings:
        mark = "FAIL" if finding.severity == "fail" else "WARN"
        print(f"  {mark} {finding.rule}: {finding.path}:{finding.line}")
        print(f"        {finding.detail}")
        print(f"        fix: {finding.fix}")
    print(f"\n{len(fails)} FAIL, {len(warns)} WARN")
    return 1 if fails else 0


if __name__ == "__main__":
    sys.exit(main())
