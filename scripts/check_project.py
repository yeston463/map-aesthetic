#!/usr/bin/env python3
"""Check skill metadata, local Markdown links, package version, and theme files."""

from __future__ import annotations

import importlib.util
import json
import re
import sys
from pathlib import Path
from urllib.parse import unquote, urlsplit

import yaml

ROOT = Path(__file__).resolve().parents[1]
SKILL = ROOT / "skills" / "map-aesthetic"


def main() -> int:
    errors = []
    skill_text = (SKILL / "SKILL.md").read_text(encoding="utf-8")
    match = re.match(r"\A---\n(.*?)\n---(?:\n|$)", skill_text, re.DOTALL)
    if not match:
        errors.append("SKILL.md: missing YAML frontmatter")
    else:
        metadata = yaml.safe_load(match.group(1))
        if not isinstance(metadata, dict):
            errors.append("SKILL.md: frontmatter must be a mapping")
        else:
            if metadata.get("name") != SKILL.name:
                errors.append("SKILL.md: name must match installable directory")
            description = metadata.get("description")
            if not isinstance(description, str) or not 1 <= len(description) <= 1024:
                errors.append("SKILL.md: description must be 1..1024 characters")

    interface = yaml.safe_load((SKILL / "agents/openai.yaml").read_text(encoding="utf-8"))["interface"]
    if "$map-aesthetic" not in interface.get("default_prompt", ""):
        errors.append("openai.yaml: default_prompt must name the skill")
    if not 25 <= len(interface.get("short_description", "")) <= 64:
        errors.append("openai.yaml: short_description must be 25..64 characters")

    markdown = list(ROOT.glob("*.md"))
    for directory in ("skills", "docs", "evals", ".github"):
        markdown.extend((ROOT / directory).rglob("*.md"))
    link_pattern = re.compile(r"!?\[[^\]\n]*\]\(([^)\n]+)\)")
    for path in markdown:
        text = path.read_text(encoding="utf-8")
        # Ignore code examples; their paths are illustrative rather than links.
        text = re.sub(r"```[^\n]*\n.*?```", "", text, flags=re.DOTALL)
        for raw in link_pattern.findall(text):
            target = raw.strip().strip("<>")
            parts = urlsplit(target)
            if parts.scheme or parts.netloc or not parts.path:
                continue
            resolved = (path.parent / unquote(parts.path)).resolve()
            if not resolved.is_relative_to(ROOT):
                errors.append(f"{path.relative_to(ROOT)}: local link leaves repository: {target}")
            elif path.is_relative_to(SKILL) and not resolved.is_relative_to(SKILL):
                errors.append(f"{path.relative_to(ROOT)}: installed skill depends on a repository-only file: {target}")
            elif not resolved.exists():
                errors.append(f"{path.relative_to(ROOT)}: broken local link: {target}")

    package = json.loads((ROOT / "package.json").read_text(encoding="utf-8"))
    lock = json.loads((ROOT / "package-lock.json").read_text(encoding="utf-8"))
    if package["version"] != lock["version"] or package["version"] != lock["packages"][""]["version"]:
        errors.append("package.json and package-lock.json versions differ")

    module_path = SKILL / "scripts/validate_theme.py"
    spec = importlib.util.spec_from_file_location("theme_validator", module_path)
    validator = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(validator)
    for path in sorted((SKILL / "assets/themes").glob("*.json")):
        try:
            errors.extend(f"{path.name}: {error}" for error in validator.validate_theme(validator.load_json(path)))
        except (OSError, ValueError) as error:
            errors.append(f"{path.name}: {error}")

    for error in errors:
        print(f"FAIL {error}", file=sys.stderr)
    if errors:
        return 1
    print(f"PASS: skill metadata, {len(markdown)} Markdown files, theme presets, and package version")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
