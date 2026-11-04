"""Regressions for review evidence and non-destructive experiment preparation."""
import importlib.util
import json
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

ROOT = Path(__file__).resolve().parents[1]


def load(name):
    spec = importlib.util.spec_from_file_location(name, ROOT / 'scripts' / f'{name}.py')
    module = importlib.util.module_from_spec(spec); spec.loader.exec_module(module)
    return module


class CaseToolsTests(unittest.TestCase):
    def test_measurement_cannot_pass_without_required_capture_metadata(self):
        module = load('measure_case_pixels')
        with tempfile.TemporaryDirectory() as temporary:
            folder = Path(temporary)
            (folder / 'leaflet-report.json').write_text(json.dumps({'captured': {'leaflet': {}}}), encoding='utf-8')
            with patch.object(module, 'EVIDENCE', folder):
                with self.assertRaisesRegex(SystemExit, 'Missing required capture'):
                    module.main()

    def test_measurement_cannot_skip_a_missing_screenshot(self):
        module = load('measure_case_pixels')
        with tempfile.TemporaryDirectory() as temporary:
            folder = Path(temporary)
            captured = {name: {} for name in ('baseline', 'improved', 'attempt-filter', 'attempt-opacity')}
            (folder / 'leaflet-report.json').write_text(json.dumps({'captured': {'leaflet': captured}}), encoding='utf-8')
            with patch.object(module, 'EVIDENCE', folder):
                with self.assertRaisesRegex(SystemExit, 'Missing required screenshot'):
                    module.main()

    def test_ab_preparation_preserves_existing_experiment(self):
        module = load('make_ab_copies')
        with tempfile.TemporaryDirectory() as temporary:
            folder = Path(temporary); (folder / 'direct').mkdir()
            sentinel = folder / 'direct/result.txt'; sentinel.write_text('keep', encoding='utf-8')
            with self.assertRaises(FileExistsError):
                module.build('direct', False, folder)
            self.assertEqual(sentinel.read_text(), 'keep')

    def test_measurement_rejects_screenshot_from_another_report(self):
        module = load('measure_case_pixels')
        from PIL import Image
        with tempfile.TemporaryDirectory() as temporary:
            folder = Path(temporary)
            captured = {name: {'imageSha256': 'wrong'} for name in ('baseline', 'improved', 'attempt-filter', 'attempt-opacity')}
            (folder / 'leaflet-report.json').write_text(json.dumps({'captured': {'leaflet': captured}}), encoding='utf-8')
            Image.new('RGB', (1, 1)).save(folder / 'leaflet-baseline-map.png')
            with patch.object(module, 'EVIDENCE', folder):
                with self.assertRaisesRegex(SystemExit, 'screenshot hash'):
                    module.main()

    def test_ab_inputs_match_except_for_skill_availability(self):
        module = load('make_ab_copies')
        with tempfile.TemporaryDirectory() as temporary:
            folder = Path(temporary)
            direct = module.build('direct', False, folder)
            skill = module.build('skill', True, folder)
            ordinary = lambda root: {str(path.relative_to(root)): path.read_bytes() for path in root.rglob('*')
                                     if path.is_file() and 'skills' not in path.relative_to(root).parts}
            self.assertEqual(ordinary(direct), ordinary(skill))
            self.assertFalse((direct / 'skills').exists())
            self.assertTrue((skill / 'skills/map-aesthetic/SKILL.md').exists())
            for name in ('direct', 'skill'):
                self.assertFalse((folder / name / 'cases/leaflet-raster/style-improved.js').exists())


if __name__ == '__main__':
    unittest.main()
