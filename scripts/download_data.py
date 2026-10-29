#!/usr/bin/env python3
"""Download OldNYC metadata only. Standard-library Python 3; no dependencies."""
import argparse
import json
import math
import re
import urllib.request
from pathlib import Path

SOURCE = 'https://raw.githubusercontent.com/oldnyc/oldnyc.github.io/master/data.json'

def convert(data):
    photos = []
    seen = set()
    for p in data['photos']:
        loc = p.get('location') or {}
        lat, lon = loc.get('lat'), loc.get('lon')
        if not all(isinstance(v, (int, float)) and math.isfinite(v) for v in (lat, lon)):
            continue
        if not (-90 <= lat <= 90 and -180 <= lon <= 180):
            continue
        identifier = str(p['photo_id'])
        if identifier in seen or not p.get('image_url') or not p.get('nypl_url'):
            continue
        seen.add(identifier)
        dates = p.get('date') or ' '.join(str(y) for y in p.get('years', []))
        year = re.search(r'\b(18\d{2}|19\d{2}|20\d{2})\b', dates)
        photos.append(dict(id=identifier, lat=round(lat, 6), lon=round(lon, 6),
            title=p.get('title') or p.get('original_title') or (p.get('geocode') or {}).get('source') or 'Untitled photograph',
            year=int(year[0]) if year else None, image=p['image_url'], nypl=p['nypl_url'], text=p.get('text') or ''))
    return photos

def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--input', type=Path, help='Use a previously downloaded data.json')
    parser.add_argument('--output', type=Path, default=Path(__file__).resolve().parents[1] / 'public/data/photos.json')
    args = parser.parse_args()
    if args.input:
        data = json.loads(args.input.read_text())
    else:
        with urllib.request.urlopen(SOURCE, timeout=120) as response:
            data = json.load(response)
    photos = convert(data)
    args.output.parent.mkdir(parents=True, exist_ok=True)
    temporary = args.output.with_suffix('.tmp')
    temporary.write_text(json.dumps(photos, ensure_ascii=False, separators=(',', ':')))
    temporary.replace(args.output)
    print(f'Wrote {len(photos):,} geolocated photos to {args.output}')

if __name__ == '__main__':
    main()
