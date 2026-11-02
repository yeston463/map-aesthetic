#!/usr/bin/env python3
"""Check skill metadata, local Markdown links, README parity, package version, and theme files."""

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
ADAPTER_PATTERN = re.compile(r"references/adapters/([a-z0-9-]+)\.md")


def load_json(path: Path, errors: list[str]) -> object:
    try:
        return json.loads(path.read_text(encoding="utf-8"))
    except (OSError, UnicodeDecodeError, json.JSONDecodeError) as error:
        errors.append(f"{path.relative_to(ROOT)}: cannot read JSON ({error})")
    return None


def check_skill_metadata(errors: list[str]) -> None:
    try:
        skill_text = (SKILL / "SKILL.md").read_text(encoding="utf-8")
    except OSError as error:
        errors.append(f"SKILL.md: cannot read ({error})")
        return
    match = re.match(r"\A---\n(.*?)\n---(?:\n|$)", skill_text, re.DOTALL)
    if not match:
        errors.append("SKILL.md: missing YAML frontmatter")
        return
    try:
        metadata = yaml.safe_load(match.group(1))
    except yaml.YAMLError as error:
        errors.append(f"SKILL.md: frontmatter is not valid YAML ({error})")
        return
    if not isinstance(metadata, dict):
        errors.append("SKILL.md: frontmatter must be a mapping")
        return
    if metadata.get("name") != SKILL.name:
        errors.append("SKILL.md: name must match installable directory")
    description = metadata.get("description")
    if not isinstance(description, str) or not 1 <= len(description) <= 1024:
        errors.append("SKILL.md: description must be 1..1024 characters")


def check_interface(errors: list[str]) -> None:
    path = SKILL / "agents/openai.yaml"
    try:
        document = yaml.safe_load(path.read_text(encoding="utf-8"))
    except (OSError, UnicodeDecodeError, yaml.YAMLError) as error:
        errors.append(f"openai.yaml: cannot read ({error})")
        return
    if not isinstance(document, dict) or not isinstance(document.get("interface"), dict):
        errors.append("openai.yaml: must define an 'interface' mapping")
        return
    values = document["interface"]
    if "$map-aesthetic" not in str(values.get("default_prompt", "")):
        errors.append("openai.yaml: default_prompt must name the skill")
    if not 25 <= len(str(values.get("short_description", ""))) <= 64:
        errors.append("openai.yaml: short_description must be 25..64 characters")


def adapters_in_readme(path: Path, errors: list[str]) -> set[str]:
    if not path.is_file():
        errors.append(f"{path.name}: missing")
        return set()
    return set(ADAPTER_PATTERN.findall(path.read_text(encoding="utf-8")))


def check_readme_parity(errors: list[str]) -> None:
    """Keep support claims identical across the two README coverage tables."""
    english = adapters_in_readme(ROOT / "README.md", errors)
    chinese = adapters_in_readme(ROOT / "README.zh-CN.md", errors)
    if not english or not chinese:
        errors.append("READMEs: no adapter references found in a coverage table")
        return
    if english != chinese:
        errors.append(f"READMEs: coverage differs, only-en={sorted(english - chinese)} "
                      f"only-zh={sorted(chinese - english)}")


def main() -> int:
    errors = []
    check_skill_metadata(errors)
    check_interface(errors)
    check_readme_parity(errors)

    markdown = list(ROOT.glob("*.md"))
    for directory in ("skills", "docs", "evals", ".github"):
        markdown.extend((ROOT / directory).rglob("*.md"))
    link_pattern = re.compile(r"!?\[[^\]\n]*\]\(([^)\n]+)\)")
    for path in markdown:
        try:
            text = path.read_text(encoding="utf-8")
        except (OSError, UnicodeDecodeError) as error:
            errors.append(f"{path.relative_to(ROOT)}: cannot read ({error})")
            continue
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

    package = load_json(ROOT / "package.json", errors)
    lock = load_json(ROOT / "package-lock.json", errors)
    for name, data in (("package.json", package), ("package-lock.json", lock)):
        if isinstance(data, dict) and "version" not in data:
            errors.append(f"{name}: missing 'version'")
    if isinstance(package, dict) and isinstance(lock, dict) and "version" in package and "version" in lock:
        locked_root = lock.get("packages", {}).get("", {})
        if isinstance(locked_root, dict) and "version" in locked_root and package["version"] != locked_root["version"]:
            errors.append("package.json and package-lock.json root package versions differ")
        if package["version"] != lock["version"]:
            errors.append("package.json and package-lock.json versions differ")

    module_path = SKILL / "scripts/validate_theme.py"
    spec = importlib.util.spec_from_file_location("theme_validator", module_path)
    validator = importlib.util.module_from_spec(spec)
    try:
        spec.loader.exec_module(validator)
    except (Exception, SystemExit) as error:  # noqa: BLE001 - a broken validator must be reported, not raised
        errors.append(f"validate_theme.py: cannot load ({error})")
        validator = None

    presets = sorted((SKILL / "assets/themes").rglob("*.json"))
    if not presets:
        errors.append("assets/themes: no theme presets found to validate")
    if validator is not None:
        for path in presets:
            try:
                errors.extend(f"{path.relative_to(SKILL)}: {error}" for error in validator.validate_theme(validator.load_json(path)))
            except (OSError, ValueError) as error:
                cause = validator.SCHEMA_PATH if "theme.schema.json" in str(error) else path
                errors.append(f"{cause.relative_to(ROOT)}: {error}")

    for error in errors:
        print(f"FAIL {error}", file=sys.stderr)
    if errors:
        return 1
    print(f"PASS: skill metadata, {len(markdown)} Markdown files, README coverage parity, "
          f"{len(presets)} theme presets, and package version")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
