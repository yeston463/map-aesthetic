"""Compose left/right comparison stills into side-by-side images.

Reads the output/street-atlas-study/assignment-beta.json record (which pairs
folder -> left/right), stitches the desktop and mobile screenshots, and writes
`compare-desktop.png` and `compare-mobile.png` next to the assignment file.
Run after `node demo/street-atlas-refined/compare.mjs` has captured the stills.
"""
from __future__ import annotations

from pathlib import Path
import json
import sys

from PIL import Image, ImageDraw, ImageFont

ROOT = Path(__file__).resolve().parent.parent.parent
STILL_DIR = ROOT / 'output' / 'street-atlas-study'
SPEC_PATH = STILL_DIR / 'assignment-beta.json'
FONT_BOLD = Path(r'C:/Windows/Fonts/msyhbd.ttc')

viewports = {
    'desktop': (1440, 900),
    'mobile': (390, 844),
}

labels = ('左', '右')


def compose(left: Image.Image, right: Image.Image) -> Image.Image:
    header = 44
    gap = 30
    width = left.width + gap + right.width
    height = header + max(left.height, right.height) + 8
    canvas = Image.new('RGB', (width, height), '#f4f1e8')
    draw = ImageDraw.Draw(canvas)
    title_font = ImageFont.truetype(str(FONT_BOLD), 20)
    for label, image, x in zip(labels, (left, right), (0, left.width + gap)):
        canvas.paste(image, (x, header))
        draw.text((x + image.width // 2, header // 2), label, fill='#514942', font=title_font, anchor='mm')
    draw.line([(left.width + gap // 2, 0), (left.width + gap // 2, height)], fill='#dcdcd2', width=1)
    return canvas


def run() -> int:
    spec = json.loads(SPEC_PATH.read_text(encoding='utf-8'))
    left_key = spec['left']
    right_key = spec['right']
    for key in viewports:
        left = Image.open(spec['stills'][left_key][key]).convert('RGB')
        right = Image.open(spec['stills'][right_key][key]).convert('RGB')
        canvas = compose(left, right)
        out_path = STILL_DIR / f'compare-{key}.png'
        canvas.save(out_path)
        spec.setdefault('images', {})[key] = out_path.name
        print(f'composed {out_path}')
    SPEC_PATH.write_text(json.dumps(spec, indent=2, ensure_ascii=False) + '\n', encoding='utf-8')
    return 0


if __name__ == '__main__':
    sys.exit(run())
