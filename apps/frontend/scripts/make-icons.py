"""Genera los iconos PNG de la PWA (requiere Pillow). Uso: python3 scripts/make-icons.py"""
from pathlib import Path
from PIL import Image, ImageDraw

OUT = Path(__file__).resolve().parent.parent / "public" / "icons"
OUT.mkdir(parents=True, exist_ok=True)
S = 4  # supersampling
BG = (59, 47, 224, 255)
FG = (255, 255, 255, 255)


def draw_logo(size: int, maskable: bool) -> Image.Image:
    n = size * S
    img = Image.new("RGBA", (n, n), (0, 0, 0, 0))
    d = ImageDraw.Draw(img)
    if maskable:
        d.rectangle([0, 0, n, n], fill=BG)
        scale = 0.62  # zona segura
    else:
        d.rounded_rectangle([0, 0, n - 1, n - 1], radius=int(n * 0.22), fill=BG)
        scale = 0.74
    c = n / 2
    half = n * scale / 2
    w = max(2, int(n * 0.03))
    arm = half * 0.42
    # marcas de recorte en las cuatro esquinas (motivo de hoja de contactos)
    for sx in (-1, 1):
        for sy in (-1, 1):
            x, y = c + sx * half, c + sy * half
            d.line([(x, y), (x - sx * arm, y)], fill=FG, width=w)
            d.line([(x, y), (x, y - sy * arm)], fill=FG, width=w)
    # figura: cabeza y hombros
    r = half * 0.22
    cy = c - half * 0.14
    d.ellipse([c - r, cy - r, c + r, cy + r], fill=FG)
    sw = half * 0.52
    top = cy + r + half * 0.10
    bottom = c + half * 0.58
    d.pieslice([c - sw, top, c + sw, bottom + (bottom - top)], 180, 360, fill=FG)
    d.rectangle([c - sw, bottom, c + sw, bottom + w], fill=BG)
    return img.resize((size, size), Image.LANCZOS)


for name, size, maskable in [
    ("icon-192.png", 192, False),
    ("icon-512.png", 512, False),
    ("icon-maskable-512.png", 512, True),
    ("apple-touch-icon.png", 180, True),
]:
    draw_logo(size, maskable).save(OUT / name, optimize=True)
    print("ok", name)
