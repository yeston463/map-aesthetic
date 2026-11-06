#!/usr/bin/env python3
"""Create a skill-only release ZIP with a per-file manifest, no caches.

The archive contains exactly the files under skills/map-aesthetic plus a
generated MANIFEST.json (itself listed as the manifest, not as a payload file).
Verify the result with scripts/verify_skill_package.py; do not judge a release
by its filename alone.
"""

import argparse
import hashlib
import json
import sys
from datetime import datetime, timezone
from pathlib import Path
from zipfile import ZIP_DEFLATED, ZipFile

ROOT = Path(__file__).resolve().parents[1]
SKILL = ROOT / "skills/map-aesthetic"
MANIFEST_PATH = "map-aesthetic/MANIFEST.json"


def sha256(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()


def main() -> int:
    version = json.loads((ROOT / "package.json").read_text(encoding="utf-8"))["version"]
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--output", type=Path,
                        default=ROOT / ".tmp/releases" / f"map-aesthetic-{version}.zip")
    args = parser.parse_args()
    destination = args.output.resolve()
    if destination.is_relative_to(SKILL.resolve()):
        parser.error("The archive must be written outside the skill directory")

    files = sorted(path for path in SKILL.rglob("*") if path.is_file()
                   and "__pycache__" not in path.parts and path.suffix not in {".pyc", ".pyo"})
    for path in files:
        if not path.resolve().is_relative_to(SKILL.resolve()):
            parser.error(f"Skill file points outside the distributable directory: {path}")

    entries = []
    for path in files:
        data = path.read_bytes()
        entries.append({"path": f"map-aesthetic/{path.relative_to(SKILL).as_posix()}",
                        "sha256": sha256(data), "size": len(data)})
    manifest = {
        "skill": "map-aesthetic",
        "version": version,
        "generated_at": datetime.now(timezone.utc).isoformat(timespec="seconds"),
        "note": "Content-complete rebuild. Earlier .tmp/releases zips are stale and omit "
                "the executable checkers and the reference files added after 0.2.0.",
        "files": entries,
    }
    manifest_bytes = (json.dumps(manifest, ensure_ascii=False, indent=2) + "\n").encode("utf-8")

    destination.parent.mkdir(parents=True, exist_ok=True)
    with ZipFile(destination, "w", compression=ZIP_DEFLATED) as archive:
        archive.writestr(MANIFEST_PATH, manifest_bytes)
        for path, entry in zip(files, entries):
            archive.write(path, entry["path"])
    print(f"Created {destination}\nFiles: {len(files)} + MANIFEST.json"
          f"\nSHA256: {sha256(destination.read_bytes())}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
