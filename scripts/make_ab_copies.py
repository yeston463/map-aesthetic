#!/usr/bin/env python3
"""Build two isolated working copies for the skill-vs-direct comparison.

Each copy excludes the shipped improvement, verifier, and evidence. The 'direct'
copy also excludes skills/. This prepares inputs only; separate folders do not
prevent parent-directory access or establish valid independent agent execution.
"""
from __future__ import annotations

import shutil
import sys
import tempfile
import argparse
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
WORK = ROOT / ".tmp" / "ab"
CASE = "cases/leaflet-raster"
SHARED = ["cases/serve.mjs", f"{CASE}/index.html", f"{CASE}/app.js", f"{CASE}/ui.css",
          f"{CASE}/style-baseline.js", f"{CASE}/data-manifest.json", "package.json", "package-lock.json"]
# README.md is deliberately absent: it documents the shipped improvement.
HIDDEN = [f"{CASE}/style-improved.js", "scripts/verify_cases.mjs", "scripts/measure_case_pixels.py",
          "cases/evidence", "cases/README.md", "evals", "docs"]


def build(name: str, with_skill: bool, work: Path) -> Path:
    work = work.resolve()
    target = work / name
    if name not in {"direct", "skill"} or not target.resolve().is_relative_to(work):
        raise ValueError("Invalid A/B destination")
    if target.exists():
        raise FileExistsError(f"Refusing to overwrite an existing experiment: {target}")
    target.mkdir(parents=True)
    for relative in SHARED:
        source = ROOT / relative
        destination = target / relative
        destination.parent.mkdir(parents=True, exist_ok=True)
        shutil.copytree(source, destination) if source.is_dir() else shutil.copy2(source, destination)
    for group in ("data", "tiles"):
        shutil.copytree(ROOT / CASE / group, target / CASE / group)
    if with_skill:
        shutil.copytree(ROOT / "skills", target / "skills", ignore=shutil.ignore_patterns('__pycache__', '*.pyc'))
    leaked = [relative for relative in HIDDEN if (target / relative).exists()]
    if leaked:
        raise SystemExit(f"{name} copy leaked the answer: {leaked}")
    (target / 'TASK.md').write_text(
        'Refine the logistics map for route reading, Chinese label clarity, and mobile site selection. '
        'Preserve data, the raster provider, and state meanings. Report actual changes and checks.\n'
        'Work only within the supplied experiment workspace and its provided dependencies. '
        'Do not read other arms, parent repositories, reference improvements, evaluator code, '
        'or previous reports/screenshots. If an implementation file is missing, implement it '
        'from the task rather than searching for an existing answer. Report missing resources.\n'
        'Setup: npm ci; npm run case:serve; open /cases/leaflet-raster/?variant=baseline.\n', encoding='utf-8')
    print(f"{name}: {sum(1 for item in target.rglob('*') if item.is_file())} files; skill available: {with_skill}")
    return target


if __name__ == "__main__":
    if not (ROOT / CASE / "style-baseline.js").is_file():
        raise SystemExit("case not built yet")
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--output', type=Path, help='New, empty experiment directory')
    args = parser.parse_args()
    WORK.mkdir(parents=True, exist_ok=True)
    if args.output:
        work = args.output.resolve()
        work.mkdir(parents=True, exist_ok=False)
    else:
        work = Path(tempfile.mkdtemp(prefix='experiment-', dir=WORK))
    build("direct", with_skill=False, work=work)
    build("skill", with_skill=True, work=work)
    print(f"\nCopies prepared under {work}. No agent run or A/B result is implied.")
