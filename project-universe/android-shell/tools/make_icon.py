"""Draws the launcher icon (res/drawable/ic_launcher.png). Requires Pillow.

The mark matches the in-app logo: a sun, a tilted orbit and a violet planet
on a deep-space disc. Drawn at 4x and downsampled for smooth edges.
"""
import math
import sys
from pathlib import Path
from PIL import Image, ImageDraw, ImageFilter

S = 192
K = 4
W = S * K


def radial(size, inner, outer, cx, cy, r):
    img = Image.new('RGBA', (size, size))
    px = img.load()
    for y in range(size):
        for x in range(size):
            t = min(1.0, math.hypot(x - cx, y - cy) / r)
            px[x, y] = tuple(int(inner[i] + (outer[i] - inner[i]) * t) for i in range(4))
    return img


def main(out):
    small = 96  # gradients computed small, then scaled up
    bg = radial(small, (22, 38, 78, 255), (4, 7, 18, 255), small * 0.42, small * 0.38, small * 0.75).resize((W, W), Image.BICUBIC)
    mask = Image.new('L', (W, W), 0)
    ImageDraw.Draw(mask).ellipse((2 * K, 2 * K, W - 2 * K, W - 2 * K), fill=255)
    icon = Image.new('RGBA', (W, W), (0, 0, 0, 0))
    icon.paste(bg, (0, 0), mask)

    cx, cy = W / 2, W / 2
    # Sun glow
    glow = Image.new('RGBA', (W, W), (0, 0, 0, 0))
    ImageDraw.Draw(glow).ellipse((cx - 46 * K, cy - 46 * K, cx + 46 * K, cy + 46 * K), fill=(255, 170, 70, 120))
    glow = glow.filter(ImageFilter.GaussianBlur(18 * K))
    icon = Image.alpha_composite(icon, Image.composite(glow, Image.new('RGBA', (W, W)), mask))

    # Orbit ellipse, tilted
    orbit = Image.new('RGBA', (W, W), (0, 0, 0, 0))
    od = ImageDraw.Draw(orbit)
    rx, ry = 74 * K, 27 * K
    od.ellipse((cx - rx, cy - ry, cx + rx, cy + ry), outline=(98, 214, 255, 230), width=int(4.2 * K))
    orbit = orbit.rotate(24, resample=Image.BICUBIC, center=(cx, cy))
    icon = Image.alpha_composite(icon, orbit)

    d = ImageDraw.Draw(icon)
    sun_r = 27 * K
    d.ellipse((cx - sun_r, cy - sun_r, cx + sun_r, cy + sun_r), fill=(255, 196, 92, 255))
    hl = 17 * K
    d.ellipse((cx - hl - 6 * K, cy - hl - 6 * K, cx + hl - 6 * K, cy + hl - 6 * K), fill=(255, 226, 150, 255))

    # Planet on the orbit (upper right), drawn over the ring
    ang = math.radians(-24)
    t = math.radians(-38)
    px_, py_ = rx * math.cos(t), ry * math.sin(t)
    pxr = cx + px_ * math.cos(ang) - py_ * math.sin(ang)
    pyr = cy + px_ * math.sin(ang) + py_ * math.cos(ang)
    pr = 11 * K
    d.ellipse((pxr - pr - 3 * K, pyr - pr - 3 * K, pxr + pr + 3 * K, pyr + pr + 3 * K), fill=(6, 10, 24, 255))
    d.ellipse((pxr - pr, pyr - pr, pxr + pr, pyr + pr), fill=(161, 140, 255, 255))

    icon.resize((S, S), Image.LANCZOS).save(out, optimize=True)
    print(f'wrote {out}')


if __name__ == '__main__':
    main(Path(sys.argv[1] if len(sys.argv) > 1 else Path(__file__).resolve().parent.parent / 'res' / 'ic_launcher.png'))
