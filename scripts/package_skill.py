#!/usr/bin/env python3
"""Create a skill-only release ZIP without dependencies or generated caches."""

import argparse
import hashlib
import json
from pathlib import Path
from zipfile import ZIP_DEFLATED, ZipFile

ROOT = Path(__file__).resolve().parents[1]
SKILL = ROOT / "skills/map-aesthetic"


def main() -> int:
    version = json.loads((ROOT / "package.json").read_text(encoding="utf-8"))["version"]
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--output", type=Path, default=ROOT / ".tmp/releases" / f"map-aesthetic-{version}.zip")
    args = parser.parse_args()
    destination = args.output.resolve()
    if destination.is_relative_to(SKILL.resolve()):
        parser.error("The archive must be written outside the skill directory")
    files = sorted(path for path in SKILL.rglob("*") if path.is_file()
                   and "__pycache__" not in path.parts and path.suffix not in {".pyc", ".pyo"})
    for path in files:
        if not path.resolve().is_relative_to(SKILL.resolve()):
            parser.error(f"Skill file points outside the distributable directory: {path}")
    destination.parent.mkdir(parents=True, exist_ok=True)
    with ZipFile(destination, "w", compression=ZIP_DEFLATED) as archive:
        for path in files:
            archive.write(path, f"map-aesthetic/{path.relative_to(SKILL).as_posix()}")
    digest = hashlib.sha256(destination.read_bytes()).hexdigest()
    print(f"Created {destination}\nFiles: {len(files)}\nSHA256: {digest}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
