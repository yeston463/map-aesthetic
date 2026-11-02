"""Behavioral checks for invalid theme values and the published presets."""

import copy
import importlib.util
import json
import subprocess
import sys
import tempfile
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
SCRIPT = ROOT / "skills/map-aesthetic/scripts/validate_theme.py"
spec = importlib.util.spec_from_file_location("theme_validator", SCRIPT)
validator = importlib.util.module_from_spec(spec)
spec.loader.exec_module(validator)
PRESETS = ROOT / "skills/map-aesthetic/assets/themes"


class ThemeValidationTests(unittest.TestCase):
    def setUp(self):
        self.theme = validator.load_json(PRESETS / "quiet-analysis.json")

    def test_all_published_presets_are_valid(self):
        for path in PRESETS.glob("*.json"):
            with self.subTest(preset=path.name):
                self.assertEqual(validator.validate_theme(validator.load_json(path)), [])

    def test_poor_text_contrast_is_rejected(self):
        self.theme["ui"]["text"] = self.theme["ui"]["surface"]
        self.assertTrue(any("contrast" in error for error in validator.validate_theme(self.theme)))

    def test_scale_order_and_route_casing_are_rejected(self):
        self.theme["cartography"]["scale"]["detailBelowMpp"] = 100
        self.theme["cartography"]["route"]["casingWidthPx"] = 2
        errors = validator.validate_theme(self.theme)
        self.assertTrue(any("detailBelowMpp" in error for error in errors))
        self.assertTrue(any("casingWidthPx" in error for error in errors))

    def test_typo_and_sdk_options_are_not_silently_accepted(self):
        self.theme["ui"]["textColour"] = "#123456"
        self.assertTrue(validator.validate_theme(self.theme))

    def test_css_expressions_and_negative_sizes_are_rejected(self):
        self.theme["ui"]["surface"] = "var(--surface)"
        self.theme["cartography"]["site"]["radiusPx"] = -4
        self.assertGreaterEqual(len(validator.validate_theme(self.theme)), 2)

    def test_palette_hex_case_does_not_bypass_uniqueness(self):
        self.theme["cartography"]["categorical"] = ["#abcdef", "#ABCDEF", "#123456"]
        self.assertTrue(validator.validate_theme(self.theme))

    def test_non_finite_json_and_duplicate_keys_are_rejected(self):
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / "theme.json"
            for raw in ('{"value": NaN}', '{"value": 1, "value": 2}'):
                path.write_text(raw, encoding="utf-8")
                with self.assertRaises(ValueError):
                    validator.load_json(path)

    def test_cli_reports_invalid_file_with_nonzero_exit(self):
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / "bad.json"
            path.write_text(json.dumps({"schemaVersion": "unrecognized"}), encoding="utf-8")
            result = subprocess.run([sys.executable, str(SCRIPT), str(path)], capture_output=True, text=True)
            self.assertEqual(result.returncode, 1)
            self.assertIn("FAIL", result.stderr)

    def test_validation_does_not_mutate_tokens(self):
        original = copy.deepcopy(self.theme)
        validator.validate_theme(self.theme)
        self.assertEqual(self.theme, original)


if __name__ == "__main__":
    unittest.main()
