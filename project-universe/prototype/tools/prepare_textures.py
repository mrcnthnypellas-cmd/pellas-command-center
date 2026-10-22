"""Resizes and recompresses the planet maps in assets/textures/ for mobile.

Source maps: Solar System Scope (https://www.solarsystemscope.com/textures/),
CC BY 4.0, based on NASA imagery. Fetched from PyVista's public mirror:
  2k_earth_daymap.jpg   from the pyvista wheel (pyvista/examples/)
  everything else       from https://raw.githubusercontent.com/pyvista/data/master/Data/solar_textures/

Usage: python3 tools/prepare_textures.py <dir with the downloaded source maps>
"""
import sys
from pathlib import Path
from PIL import Image

OUT = Path(__file__).resolve().parent.parent / 'assets' / 'textures'

# output name: (source file, width, JPEG quality)
MAPS = {
    'sun.jpg': ('sun.jpg', 1024, 80),
    'mercury.jpg': ('mercury.jpg', 1024, 80),
    'venus.jpg': ('venus_atmosphere.jpg', 1024, 82),
    'earth.jpg': ('2k_earth_daymap.jpg', 2048, 82),
    'moon.jpg': ('moon.jpg', 1024, 80),
    'mars.jpg': ('mars.jpg', 2048, 80),
    'jupiter.jpg': ('jupiter.jpg', 2048, 82),
    'saturn.jpg': ('saturn.jpg', 1024, 84),
    'uranus.jpg': ('uranus.jpg', 1024, 86),
    'neptune.jpg': ('neptune.jpg', 1024, 84),
}


def main(src):
    src = Path(src)
    OUT.mkdir(parents=True, exist_ok=True)
    total = 0
    for name, (source, width, quality) in MAPS.items():
        im = Image.open(src / source).convert('RGB').resize((width, width // 2), Image.LANCZOS)
        im.save(OUT / name, quality=quality, optimize=True, progressive=False)
        total += (OUT / name).stat().st_size
    # Saturn's rings: colour + transparency strip, inner edge on the left.
    ring = Image.open(src / 'saturn_ring_alpha.png').convert('RGBA').resize((1024, 32), Image.LANCZOS)
    ring.save(OUT / 'saturn_ring.png', optimize=True)
    total += (OUT / 'saturn_ring.png').stat().st_size
    print(f'wrote {len(MAPS) + 1} maps to {OUT} ({total // 1024} KB)')


if __name__ == '__main__':
    main(sys.argv[1])
