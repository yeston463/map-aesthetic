"""Exercise the published archive as an extracted, self-contained skill."""

import subprocess
import sys
import tempfile
import unittest
from pathlib import Path
from zipfile import ZipFile

ROOT = Path(__file__).resolve().parents[1]


class SkillPackageTests(unittest.TestCase):
    def test_extracted_archive_has_license_and_validates_its_own_presets(self):
        with tempfile.TemporaryDirectory() as directory:
            temporary = Path(directory)
            archive_path = temporary / "skill.zip"
            subprocess.run(
                [sys.executable, str(ROOT / "scripts/package_skill.py"), "--output", str(archive_path)],
                check=True, capture_output=True,
            )
            with ZipFile(archive_path) as archive:
                names = archive.namelist()
                self.assertIn("map-aesthetic/SKILL.md", names)
                self.assertIn("map-aesthetic/LICENSE.txt", names)
                self.assertFalse(any("__pycache__" in name or name.endswith(".pyc") for name in names))
                self.assertTrue(all(name.startswith("map-aesthetic/") and ".." not in Path(name).parts for name in names))
                presets = [name for name in names
                           if name.startswith("map-aesthetic/assets/themes/") and name.endswith(".json")]
                self.assertTrue(presets, "the archive carries no theme presets to validate")
                archive.extractall(temporary / "extracted")
            skill = temporary / "extracted/map-aesthetic"
            self.assertEqual((skill / "LICENSE.txt").read_bytes(), (ROOT / "LICENSE").read_bytes())
            result = subprocess.run(
                [sys.executable, str(skill / "scripts/validate_theme.py")],
                capture_output=True, text=True,
            )
            self.assertEqual(result.returncode, 0, result.stderr)
            self.assertEqual(result.stdout.count("PASS "), len(presets))

    def test_packager_rejects_writing_into_its_own_source(self):
        result = subprocess.run(
            [sys.executable, str(ROOT / "scripts/package_skill.py"), "--output", str(ROOT / "skills/map-aesthetic/nested.zip")],
            capture_output=True, text=True,
        )
        self.assertNotEqual(result.returncode, 0)
        self.assertIn("outside the skill directory", result.stderr)


if __name__ == "__main__":
    unittest.main()
