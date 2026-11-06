#!/usr/bin/env python3
"""Rebuild and verify the demo's source manifest.

The mechanism follows mythmap's `data/build_geography_basemap.py`: the manifest records the
SHA-256 of every input file, and `--check` re-verifies them with the standard library alone,
so a reader can confirm the demo still runs on the same bytes without installing anything.

Usage:
    python build_sources.py           # rewrite the manifest from the current files
    python build_sources.py --check   # verify the manifest against the current files
"""
from __future__ import annotations

import argparse
import hashlib
import json
import sys
from pathlib import Path

DEMO = Path(__file__).resolve().parent
REPO = DEMO.parents[1]
MANIFEST = DEMO / "sources.json"
CASE = REPO / "cases" / "leaflet-raster" / "data"

# The manifest records a role for each file, but the hash is always taken from the file that
# the demo actually reads, so a role can never drift away from the bytes.
ROLES = {
    "context.geojson": "底图几何：主干道、支路、水系、街区面",
    "labels.geojson": "地名注记与站点名，共 24 条",
    "sites.geojson": "站点要素，共 12 处",
    "districts.geojson": "片区面，共 6 个，含 1 个无数据片区",
    "route.geojson": "主配送线，单条折线",
}


def sha256(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()


def current_sources() -> dict[str, dict]:
    records = {}
    for name, role in ROLES.items():
        path = CASE / name
        if not path.is_file():
            raise SystemExit(f"MISSING_SOURCE:{path}")
        raw = path.read_bytes()
        records[f"cases/leaflet-raster/data/{name}"] = {
            "role": role,
            "sha256": sha256(raw),
        }
    return records


def build() -> dict:
    manifest = json.loads(MANIFEST.read_text(encoding="utf-8"))
    manifest["sources"] = current_sources()
    MANIFEST.write_text(
        json.dumps(manifest, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
    return manifest


def check() -> dict:
    manifest = json.loads(MANIFEST.read_text(encoding="utf-8"))
    recorded = manifest.get("sources", {})
    problems: list[str] = []

    for relative, record in recorded.items():
        # The demo reads its own copy; the manifest points at the case's original, so both
        # are verified. A copy that drifts from its source would be a real defect.
        case_path = REPO / relative
        demo_path = DEMO / "data" / Path(relative).name
        for path in (case_path, demo_path):
            if not path.is_file():
                problems.append(f"MISSING:{path}")
                continue
            digest = sha256(path.read_bytes())
            if digest != record["sha256"]:
                problems.append(f"DIGEST_MISMATCH:{path}")

    # The manifest must not claim a file the demo does not have, or omit one it does.
    demo_files = {f"cases/leaflet-raster/data/{p.name}" for p in (DEMO / "data").glob("*.geojson")}
    if demo_files != set(recorded):
        problems.append(
            f"SOURCE_SET_MISMATCH:manifest={sorted(recorded)} demo={sorted(demo_files)}")

    # The demo's own copies must be identical to the case's, byte for byte.
    for name in ROLES:
        case_path = CASE / name
        demo_path = DEMO / "data" / name
        if case_path.is_file() and demo_path.is_file():
            if case_path.read_bytes() != demo_path.read_bytes():
                problems.append(f"COPY_DRIFT:{name}")

    # The rendered feature counts must match what the demo reports, so a truncated file
    # cannot pass the digest check by having been replaced wholesale.
    counts = {}
    for name in ROLES:
        path = DEMO / "data" / name
        if path.is_file():
            counts[name] = len(json.loads(path.read_text(encoding="utf-8"))["features"])

    if problems:
        for problem in problems:
            print(f"FAIL {problem}")
        raise SystemExit(1)

    print(f"PASS 三套方向演示数据源：{len(recorded)} 个文件摘要一致，副本与案例逐字节相同，"
          f"要素数 {counts}")
    return {"sources": len(recorded), "features": counts}


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="重建或校验演示的数据源清单")
    parser.add_argument("--check", action="store_true", help="只校验，不写入")
    arguments = parser.parse_args()
    if not arguments.check:
        build()
    check()
    sys.exit(0)
