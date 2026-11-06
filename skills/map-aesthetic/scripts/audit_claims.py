#!/usr/bin/env python3
"""Re-check the claims recorded in references/implementation-status.md.

Documentation drifts. A claim about a number in the bundled demo is only useful
while the cited evidence is still true. Each entry below binds a documented
sentence to a regex in a demo file; the script verifies both ends and writes
output/claim-audit.json.

Usage:
    python <skill-dir>/scripts/audit_claims.py [--json] [--md]

Exit 1 when a documented anchor disappeared or a demo no longer matches its
recorded evidence. This checks the ledger, not the design: a claim may still be
marked NOT_IMPLEMENTED and pass.
"""
from __future__ import annotations

import argparse
import json
import re
import sys
from dataclasses import dataclass, asdict
from pathlib import Path

HERE = Path(__file__).resolve()
SKILL = HERE.parents[1]          # skills/map-aesthetic
ROOT = HERE.parents[3]           # repository root
DEMO = ROOT / "demo" / "three-directions"


@dataclass(frozen=True)
class Claim:
    id: str
    doc: str
    anchor: str
    evidence: str
    pattern: str
    expect: str                  # "present" or "absent"
    status: str                  # IMPLEMENTED / PARTIAL / NOT_IMPLEMENTED / NOT_APPLICABLE / DOC_DEFECT
    note: str


CLAIMS = (
    Claim(
        "fill-rest", "references/anti-patterns.md",
        "Default `fill-opacity` for a thematic polygon over a basemap: **0.35**",
        "demo/three-directions/styles/light-operations.js", r"fillOpacity: 0\.42,", "present",
        "PARTIAL",
        "The demo rests at 0.42/0.44, not the 0.35 default; 0.35-0.5 is the documented raster band. "
        "The executable rule only forbids 1.0."),
    Claim(
        "fill-hover", "references/anti-patterns.md",
        "On hover it may rise to **0.65**",
        "demo/three-directions/app.js", r"fillOpacity = active \? '0\.65'", "present",
        "IMPLEMENTED",
        "Hover is a state, not a restyle: inline SVG style so CSS can transition it."),
    Claim(
        "motion-tokens", "references/interaction.md", "| `--m-out` | 200ms |",
        "demo/three-directions/app.js", r"active \? '140ms' : '200ms'", "present",
        "IMPLEMENTED",
        "Only the district hover uses the 140/200 tokens; buttons and panels still have no motion."),
    Claim(
        "thematic-panes", "references/anti-patterns.md",
        "The boundary layer is above the fill layer",
        "demo/three-directions/app.js", r"paneOf\('districts'\)", "present",
        "IMPLEMENTED",
        "Eight named panes are actually used (districts/boundary/casing/route/glow/sites/labels/"
        "selection). Before this round every business layer sat in overlayPane, so the pane-based "
        "opaque-fill rule inspected an empty pane. Measured: 6 fills, 6 boundaries, 12 glows, "
        "12 cores per direction."),
    Claim(
        "boundary-layer", "references/anti-patterns.md",
        "The boundary is a **separate line layer**",
        "demo/three-directions/app.js", r"districtBoundaries\[index\]\.setStyle", "present",
        "IMPLEMENTED",
        "The fill polygons are stroke:false; a separate polyline in the boundary pane (411) draws "
        "the outline above the fill pane (410). Hover widens it to 2.5px in the accent. The "
        "boundary colour is a tuned theme token; a 25%-lighter fallback is computed by lighten()."),
    Claim(
        "point-glow", "references/anti-patterns.md", "Two layers, not one:",
        "demo/three-directions/app.js", r"const siteGlows = data\.sites\.features\.map", "present",
        "IMPLEMENTED",
        "Each site now has a translucent 10-16px glow in pane 435 plus a crisp core whose radius "
        "still carries throughput. The glow is non-interactive and carries a 0.8px blur."),
    Claim(
        "core-outline", "references/anti-patterns.md", "**The core.**",
        "demo/three-directions/app.js", r"weight: weight \|\| 1", "present",
        "IMPLEMENTED",
        "The core keeps a 1px-or-more outline so overlapping points do not merge."),
    Claim(
        "camera-flyto", "references/anti-patterns.md",
        "`essential` is a Mapbox/MapLibre option and **does not exist in Leaflet**",
        "demo/three-directions/app.js", r"map\.flyTo\(map\.getCenter\(\)", "present",
        "IMPLEMENTED",
        "The zoom actions use Leaflet flyTo with duration 1.6s, shortened to 0.25s under "
        "prefers-reduced-motion. The instant animate:false pans inside selectSite / "
        "revealAboveSheet are boundary corrections, which the guidance explicitly allows."),
    Claim(
        "panel-blur", "references/anti-patterns.md", "The blur needs a backdrop to blur",
        "demo/three-directions/ui.css", r"backdrop-filter: blur\(16px\)", "present",
        "IMPLEMENTED",
        "The legend card and the compass are floating HUD panels with a translucent ground "
        "(alpha 0.92-0.94, kept above 0.9 so contrast is measured against the HUD surface) "
        "and a 16px backdrop blur."),
    Claim(
        "panel-column", "references/anti-patterns.md", "A map is the page.",
        "demo/three-directions/ui.css", r"\.panel \{ min-height: 0; background: var\(--surface\); border-left",
        "present", "PARTIAL",
        "The fixed 272px column still exists for intent, layers and the site list, but the legend "
        "and the compass now live on the canvas. The demo is a hybrid, not a pure floating-HUD "
        "composition."),
    Claim(
        "hud-legend", "references/anti-patterns.md", "The legend is part of the map",
        "demo/three-directions/hud.js", r"const GROUPS = \[", "present",
        "IMPLEMENTED",
        "The legend is grouped into line/site, value classes and no-data, states the unit, the "
        "ramp direction, the class breaks and the count per class. It is collapsible with a 44px "
        "control and folds automatically when a popup would overlap it."),
    Claim(
        "hud-compass", "SKILL.md", "A map is not the interface",
        "demo/three-directions/hud.js", r"function compassSvg\(kind\)", "present",
        "IMPLEMENTED",
        "Three different north indicators: a thin-line rose (operations), a dashed seal with a "
        "serif north character (city guide), and a 24-tick instrument dial (monitoring). They "
        "state 000 degrees rather than pretending to be bearing instruments."),
    Claim(
        "hud-yields", "SKILL.md", "Coordinate overlays and side panels",
        "demo/three-directions/app.js", r"function syncHudWithPopup\(\)", "present",
        "IMPLEMENTED",
        "Leaflet's transformed mapPane traps every pane in one stacking context, so a popup can "
        "never layer above a sibling HUD. The demo measures the intersection and folds the "
        "legend instead, then restores it on popupclose."),
    Claim(
        "theme-measurement", "references/anti-patterns.md",
        "These scales are perceptually ordered and tested.",
        "scripts/measure_demo_themes.py", r"validator\.check_separation", "present",
        "IMPLEMENTED",
        "The three palettes are exported from their ES modules and measured with the shipped "
        "validator's CIEDE2000 / deuteranopia / WCAG functions. All ramps, class pairs, context "
        "surfaces and text contrasts now clear the thresholds; output/theme-measurements.json."),
    Claim(
        "tabular-numbers", "references/anti-patterns.md",
        "Every figure the reader compares",
        "demo/three-directions/ui.css", r"tabular-nums", "present",
        "IMPLEMENTED",
        "Found by the browser rule in an earlier round and fixed."),
    Claim(
        "close-button", "references/anti-patterns.md",
        "The close button has a hit area of at least 32 by 32 pixels",
        "demo/three-directions/ui.css", r"a\.leaflet-popup-close-button \{[^}]*width: 44px", "present",
        "IMPLEMENTED",
        "Found only after a popup was actually opened in the regression gate; the engine selector "
        "is more specific, so the fix has to match it."),
    Claim(
        "class-breaks", "references/anti-patterns.md",
        "The class breaks are computed from the data and shown in the legend",
        "demo/three-directions/styles/light-operations.js", r"breaks: \[400, 800, 1200\]", "present",
        "PARTIAL",
        "Breaks are fixed per direction, not computed at runtime; the legend does state them. The "
        "demo comment claiming otherwise was corrected."),
    Claim(
        "colour-scale", "references/anti-patterns.md",
        "These scales are perceptually ordered and tested.",
        "demo/three-directions/styles/light-operations.js", r"ramp: \['#e9f2f9'", "present",
        "IMPLEMENTED (documented deviation)",
        "The demo uses self-authored ramps; DESIGN-NOTES.md now states why (4 classes, three "
        "different grounds) and states each ramp's direction. CIEDE2000 separability is still "
        "unmeasured, so this is documentation compliance, not a tested scale."),
    Claim(
        "attribution", "references/anti-patterns.md", "The attribution.",
        "demo/three-directions/app.js", r"addAttribution\('合成数据", "present",
        "IMPLEMENTED",
        "A named source is present on the map, independent of the optional raster layer."),
    Claim(
        "deep-link", "SKILL.md", "Make the judgement executable",
        "demo/three-directions/app.js", r"params\.get\('site'\)", "present",
        "IMPLEMENTED",
        "?site=S01 opens a popup on load, so popup-covers-feature is actually evaluated instead "
        "of being SKIP at every width."),
    Claim(
        "rule-fixtures", "SKILL.md", "A taste that cannot be stated as a rule cannot be checked",
        "tests-node/rule-fixtures.test.mjs", r"const BROWSER_CASES = \{", "present",
        "IMPLEMENTED",
        "26 browser + 9 static rules each have a violation fixture and a compliant fixture; "
        "the record is output/rule-coverage.json."),
)


def check(claim: Claim) -> dict:
    doc_path = SKILL / claim.doc
    evidence_path = ROOT / claim.evidence
    doc_ok = doc_path.is_file() and claim.anchor in doc_path.read_text(encoding="utf-8")
    if not evidence_path.is_file():
        evidence_ok = False
        detail = "evidence file missing"
    else:
        text = evidence_path.read_text(encoding="utf-8")
        found = re.search(claim.pattern, text, re.DOTALL) is not None
        evidence_ok = found if claim.expect == "present" else not found
        detail = f"pattern {claim.expect} -> {'match' if found else 'no match'}"
    row = asdict(claim)
    row.update({"doc_anchor_ok": doc_ok, "evidence_ok": evidence_ok, "detail": detail,
                "ok": doc_ok and evidence_ok})
    return row


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--json", action="store_true", help="print the full result as JSON")
    parser.add_argument("--md", action="store_true", help="print a markdown table")
    args = parser.parse_args(argv)

    rows = [check(claim) for claim in CLAIMS]
    failures = [row for row in rows if not row["ok"]]
    record = {"claims": len(rows), "ok": len(rows) - len(failures), "failed": len(failures),
              "rows": rows}
    out = ROOT / "output" / "claim-audit.json"
    out.parent.mkdir(parents=True, exist_ok=True)
    out.write_text(json.dumps(record, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")

    if args.json:
        print(json.dumps(record, ensure_ascii=False, indent=2))
    elif args.md:
        print("| claim | status | doc anchor | demo evidence |")
        print("| --- | --- | --- | --- |")
        for row in rows:
            print(f"| {row['id']} | {row['status']} | "
                  f"{'ok' if row['doc_anchor_ok'] else 'MISSING'} | "
                  f"{'ok' if row['evidence_ok'] else 'MISMATCH'} |")
    else:
        for row in rows:
            mark = "ok  " if row["ok"] else "FAIL"
            print(f"{mark} {row['id']}: {row['status']}  "
                  f"(anchor {'ok' if row['doc_anchor_ok'] else 'MISSING'}, {row['detail']})")
        print(f"\n{len(rows) - len(failures)}/{len(rows)} claims still verifiable -> {out}")
    return 1 if failures else 0


if __name__ == "__main__":
    sys.exit(main())
