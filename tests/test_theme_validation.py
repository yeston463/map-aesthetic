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

    def test_delta_e_matches_an_independent_metric(self):
        # Values produced by colour-science 0.4.7 (delta_E, method='CIE 2000').
        for color, other, expected in (
            ("#1C2C36", "#0C1A23", 5.59),
            ("#1C2C36", "#132632", 2.26),
            ("#177C6F", "#A15C27", 41.20),
            ("#000000", "#FFFFFF", 100.00),
            ("#1C2C36", "#1C2C36", 0.00),
        ):
            with self.subTest(pair=(color, other)):
                self.assertAlmostEqual(validator.delta_e(color, other), expected, delta=0.05)

    def test_context_surface_invisible_against_land_is_rejected(self):
        self.theme["cartography"]["water"] = self.theme["cartography"]["land"]
        self.assertTrue(any("water vs land" in error and "separate surface" in error
                            for error in validator.validate_theme(self.theme)))

    def test_halo_matching_land_is_not_flagged_as_a_separation_failure(self):
        # A label halo normally matches land so text reads across roads and fills.
        # Treating that as a defect would reject a correct design.
        self.theme["cartography"]["labelHalo"] = self.theme["cartography"]["land"]
        self.assertEqual(validator.validate_theme(self.theme), [])

    def test_indistinguishable_categories_are_rejected(self):
        self.theme["cartography"]["categorical"] = ["#177C6F", "#187D6F", "#6260A4", "#9A4567"]
        self.assertTrue(any("categorical" in error for error in validator.validate_theme(self.theme)))

    def test_non_monotonic_sequential_ramp_is_rejected(self):
        self.theme["cartography"]["sequential"] = ["#DEEEE8", "#A8CFC1", "#175445", "#68AC95", "#32826C"]
        self.assertTrue(any("monotonic" in error for error in validator.validate_theme(self.theme)))

    def test_non_finite_in_memory_number_is_rejected(self):
        # The CLI rejects non-finite text, so this path only exists for callers
        # that build a theme in memory.
        self.theme["cartography"]["route"]["widthPx"] = float("nan")
        self.assertTrue(any("finite" in error for error in validator.validate_theme(self.theme)))

    def test_presets_clear_the_separation_floors_with_margin(self):
        for path in PRESETS.glob("*.json"):
            cartography = validator.load_json(path)["cartography"]
            with self.subTest(preset=path.name):
                self.assertEqual(validator.check_separation(cartography), [])
                self.assertEqual(validator.check_semantics(cartography), [])
                for foreground, background in validator.CONTEXT_PAIRS:
                    self.assertGreater(validator.delta_e(cartography[foreground], cartography[background]),
                                       validator.MIN_CONTEXT_DELTA_E)

    def test_optional_thematic_fields_are_actually_optional(self):
        # A contract-1.0 theme carrying none of the new fields must still validate,
        # otherwise the additions are a silent breaking change.
        theme = validator.load_json(PRESETS / "quiet-analysis.json")
        for key in ("area", "missing", "diverging", "classes", "states"):
            del theme["cartography"][key]
        theme["cartography"]["selection"].pop("keepClassVisible")
        theme["schemaVersion"] = "1.0"
        self.assertEqual(validator.validate_theme(theme), [])

    def test_v11_extensions_cannot_silently_claim_v10(self):
        self.theme["schemaVersion"] = "1.0"
        self.assertTrue(validator.validate_theme(self.theme))

    def test_v11_version_is_accepted(self):
        self.theme["schemaVersion"] = "1.1"
        self.assertEqual(validator.validate_theme(self.theme), [])

    def test_missing_value_coloured_like_a_class_is_rejected(self):
        lowest = self.theme["cartography"]["sequential"][0]
        self.theme["cartography"]["missing"]["color"] = lowest
        self.assertTrue(any("missing.color" in error and "confusable" in error
                            for error in validator.validate_theme(self.theme)))

    def test_unpatterned_missing_needs_more_margin_than_patterned_missing(self):
        # #006A5B sits 6.53 dE2000 from class 配送站 and 7.53 from the nearest ramp stop:
        # enough with a hatch carrying the distinction, not enough when colour is alone.
        theme = validator.load_json(PRESETS / "quiet-analysis.json")
        theme["cartography"]["missing"]["color"] = "#006A5B"
        theme["cartography"]["missing"]["pattern"] = "none"
        failures = [error for error in validator.validate_theme(theme) if "missing.color" in error]
        self.assertTrue(failures, failures)
        theme["cartography"]["missing"]["pattern"] = "diagonal-hatch"
        self.assertEqual([error for error in validator.validate_theme(theme) if "missing.color" in error], [])

    def test_class_bound_to_an_off_palette_colour_is_rejected(self):
        self.theme["cartography"]["classes"][0]["color"] = "#FF00FF"
        self.assertTrue(any("not one of cartography.categorical" in error
                            for error in validator.validate_theme(self.theme)))

    def test_duplicate_class_ids_are_rejected(self):
        self.theme["cartography"]["classes"][1]["id"] = self.theme["cartography"]["classes"][0]["id"]
        self.assertTrue(any("ids must be unique" in error for error in validator.validate_theme(self.theme)))

    def test_selection_floor_depends_on_whether_the_class_fill_survives(self):
        # #006A5B is 6.53 dE2000 from class 配送站. As an added ring that is enough,
        # because the fill still says which class it is; as a replacing fill it is not,
        # because colour alone would then carry two meanings.
        self.theme["cartography"]["selection"]["color"] = "#006A5B"
        ring = validator.validate_theme(self.theme)
        self.assertEqual([error for error in ring if "selection.color" in error], [])
        self.theme["cartography"]["selection"]["keepClassVisible"] = False
        replacement = validator.validate_theme(self.theme)
        failures = [error for error in replacement if "selection.color" in error]
        self.assertTrue(failures, failures)
        self.assertTrue(all("replacing" in error for error in failures))

    def test_diverging_ramp_needs_a_centre_stop(self):
        self.theme["cartography"]["diverging"]["ramp"] = ["#2F6E8C", "#8FBDD3", "#D9A98C", "#A8542B"]
        self.assertTrue(any("odd number of stops" in error for error in validator.validate_theme(self.theme)))

    def test_diverging_ramp_that_does_not_turn_at_the_centre_is_rejected(self):
        self.theme["cartography"]["diverging"]["ramp"] = ["#2F6E8C", "#8FBDD3", "#EFEFEA", "#F5F0E0", "#FAF6EA"]
        self.assertTrue(any("move away from the centre" in error for error in validator.validate_theme(self.theme)))

    def test_status_colour_matching_a_class_colour_is_rejected(self):
        self.theme["cartography"]["states"]["alert"] = self.theme["cartography"]["classes"][0]["color"]
        self.assertTrue(any("states.alert vs class" in error for error in validator.validate_theme(self.theme)))

    def test_boundary_invisible_against_land_is_rejected(self):
        self.theme["cartography"]["area"]["boundaryColor"] = self.theme["cartography"]["land"]
        self.assertTrue(any("area.boundaryColor" in error for error in validator.validate_theme(self.theme)))


if __name__ == "__main__":
    unittest.main()
