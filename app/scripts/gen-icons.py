#!/usr/bin/env python3
"""Generates the PWA app icons. Rerun after changing the design;
outputs are committed to app/public/ since there's no build-time
asset pipeline for them."""

from PIL import Image, ImageDraw, ImageFont

RED = (220, 38, 38)  # tailwind red-600
FONT_PATH = "/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf"


def draw_icon(size, padding_ratio, out_path):
    img = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    draw = ImageDraw.Draw(img)

    corner_radius = round(size * 0.22)
    draw.rounded_rectangle(
        [(0, 0), (size - 1, size - 1)], radius=corner_radius, fill=RED
    )

    text = "NK"
    font_size = round(size * (1 - padding_ratio * 2) * 0.62)
    font = ImageFont.truetype(FONT_PATH, font_size)
    bbox = draw.textbbox((0, 0), text, font=font)
    text_w = bbox[2] - bbox[0]
    text_h = bbox[3] - bbox[1]
    x = (size - text_w) / 2 - bbox[0]
    y = (size - text_h) / 2 - bbox[1]
    draw.text((x, y), text, font=font, fill=(255, 255, 255, 255))

    img.save(out_path)


# Standard (any) icons - fill the full canvas
draw_icon(192, 0.06, "public/icon-192.png")
draw_icon(512, 0.06, "public/icon-512.png")

# Maskable icons need extra safe-zone padding since the OS may crop to
# a circle/squircle - keep the glyph within the center ~80%.
draw_icon(192, 0.16, "public/icon-maskable-192.png")
draw_icon(512, 0.16, "public/icon-maskable-512.png")

# Apple touch icon: iOS ignores alpha and rounds the corners itself,
# so render on an opaque square (no pre-rounded corners/transparency).
size = 180
img = Image.new("RGB", (size, size), RED)
draw = ImageDraw.Draw(img)
font = ImageFont.truetype(FONT_PATH, round(size * 0.5))
text = "NK"
bbox = draw.textbbox((0, 0), text, font=font)
text_w = bbox[2] - bbox[0]
text_h = bbox[3] - bbox[1]
x = (size - text_w) / 2 - bbox[0]
y = (size - text_h) / 2 - bbox[1]
draw.text((x, y), text, font=font, fill=(255, 255, 255))
img.save("public/apple-touch-icon.png")

# Favicon
draw_icon(32, 0.06, "public/favicon-32.png")

print("Icons generated.")
