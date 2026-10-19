#!/usr/bin/env python3
"""Encode same-artwork browser previews; keep original artwork and download paths."""
import hashlib
import json
from pathlib import Path
from PIL import Image

ROOT = Path(__file__).resolve().parents[1]
MANIFEST = ROOT / 'assets/mascot-evolution/preview-manifest.json'

def digest(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()

def encode(source, destination, quality, width=None):
    with Image.open(source) as original:
        image = original.convert('RGB')
        if width and image.width > width:
            image.thumbnail((width, round(width * image.height / image.width)), Image.Resampling.LANCZOS)
        image.save(destination, format='AVIF', quality=quality, speed=6)
        return {'path': destination.relative_to(ROOT).as_posix(), 'bytes': destination.stat().st_size, 'sha256': digest(destination), 'width': image.width, 'height': image.height, 'quality': quality}

mascot = json.loads((ROOT/'data/mascot.json').read_text())
paths = [asset['src'] for character in mascot['characters'] for asset in character['assets']] + [asset['src'] for asset in mascot['applications']]
rows = []
for path in paths + ['assets/background.png']:
    source = ROOT/path
    if source.suffix not in ('.webp','.png'):
        raise ValueError('Unexpected artwork source')
    variants = [encode(source, source.with_suffix('.avif'), 65 if source.name == 'background.png' else 55)]
    if source.name != 'background.png':
        variants.append(encode(source, source.with_name(source.stem+'-768.avif'), 55, 768))
    rows.append({'source': path, 'source_bytes': source.stat().st_size, 'source_sha256': digest(source), 'variants': variants})
MANIFEST.write_text(json.dumps({'format':'same-artwork-avif-previews-v1','images':rows},ensure_ascii=False,indent=2)+'\n')
print(json.dumps({'images':len(rows),'original_bytes':sum(row['source_bytes'] for row in rows),'full_avif_bytes':sum(row['variants'][0]['bytes'] for row in rows),'manifest':MANIFEST.relative_to(ROOT).as_posix()}))
