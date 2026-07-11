#!/usr/bin/env python3
"""Generates the PWA app icons from the user-supplied source artwork
(app/scripts/assets/logo-source.jpg): a white silhouette of a karate
practitioner in a side-kick pose on a red background. Rerun after
changing the source image; outputs are committed to app/public/ since
there's no build-time asset pipeline for them.
"""

from PIL import Image, ImageDraw

SOURCE = "scripts/assets/logo-source.jpg"


def dominant_border_color(im):
    w, h = im.size
    samples = [
        im.getpixel((2, 2)),
        im.getpixel((w - 3, 2)),
        im.getpixel((2, h - 3)),
        im.getpixel((w - 3, h - 3)),
        im.getpixel((w // 2, 2)),
    ]
    r = round(sum(p[0] for p in samples) / len(samples))
    g = round(sum(p[1] for p in samples) / len(samples))
    b = round(sum(p[2] for p in samples) / len(samples))
    return (r, g, b)


def make_square(im, bg):
    w, h = im.size
    side = max(w, h)
    canvas = Image.new("RGB", (side, side), bg)
    canvas.paste(im, ((side - w) // 2, (side - h) // 2))
    return canvas


def make_icon(square_img, bg, size, padding_ratio, out_path, rounded=True, corner_radius_ratio=0.22):
    canvas = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    draw = ImageDraw.Draw(canvas)
    if rounded:
        radius = round(size * corner_radius_ratio)
        draw.rounded_rectangle([(0, 0), (size - 1, size - 1)], radius=radius, fill=bg + (255,))
    else:
        draw.rectangle([(0, 0), (size - 1, size - 1)], fill=bg + (255,))

    usable = size * (1 - padding_ratio * 2)
    resized = square_img.resize((round(usable), round(usable)), Image.LANCZOS)
    offset = (round((size - usable) / 2), round((size - usable) / 2))
    canvas.paste(resized, offset)
    canvas.save(out_path)


source = Image.open(SOURCE).convert("RGB")
bg = dominant_border_color(source)
square = make_square(source, bg)

# Standard (any) icons - fill the full canvas
make_icon(square, bg, 192, 0.05, "public/icon-192.png")
make_icon(square, bg, 512, 0.05, "public/icon-512.png")

# Maskable icons need extra safe-zone padding since the OS may crop to
# a circle/squircle - keep the artwork within the center ~80%.
make_icon(square, bg, 192, 0.15, "public/icon-maskable-192.png")
make_icon(square, bg, 512, 0.15, "public/icon-maskable-512.png")

# Apple touch icon: iOS ignores alpha and rounds the corners itself,
# so render on an opaque square (no pre-rounded corners/transparency).
apple = Image.new("RGB", (180, 180), bg)
usable = 180 * 0.92
resized = square.resize((round(usable), round(usable)), Image.LANCZOS)
offset = (round((180 - usable) / 2), round((180 - usable) / 2))
apple.paste(resized, offset)
apple.save("public/apple-touch-icon.png")

# Favicon
make_icon(square, bg, 32, 0.05, "public/favicon-32.png")

print("Icons generated.")
