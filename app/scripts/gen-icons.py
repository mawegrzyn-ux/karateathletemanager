#!/usr/bin/env python3
"""Generates the PWA app icons: a white silhouette of a woman in a
high side-kick karate pose on a red-600 background. Original artwork
(not traced from any reference image). Rerun after changing the design;
outputs are committed to app/public/ since there's no build-time asset
pipeline for them."""

from PIL import Image, ImageDraw

RED = (220, 38, 38)  # tailwind red-600
WHITE = (255, 255, 255, 255)

# Figure drawn in a 200x200 normalized space, then scaled/centered per icon.
FIGURE_BOX = 200


def capsule(draw, p1, p2, width, fill):
    draw.line([p1, p2], fill=fill, width=round(width))
    r = width / 2
    for p in (p1, p2):
        draw.ellipse(
            [p[0] - r, p[1] - r, p[0] + r, p[1] + r], fill=fill
        )


def draw_figure(draw, scale, offset_x, offset_y, fill=WHITE):
    def pt(x, y):
        return (x * scale + offset_x, y * scale + offset_y)

    # Head + ponytail
    head_c = pt(95, 38)
    head_r = 15 * scale
    draw.ellipse(
        [head_c[0] - head_r, head_c[1] - head_r, head_c[0] + head_r, head_c[1] + head_r],
        fill=fill,
    )
    draw.polygon(
        [pt(107, 26), pt(128, 14), pt(124, 34), pt(112, 40)],
        fill=fill,
    )

    # Torso (neck to hip)
    capsule(draw, pt(95, 55), pt(88, 108), 32 * scale, fill)

    # Standing leg: hip -> knee -> foot
    capsule(draw, pt(80, 106), pt(75, 148), 22 * scale, fill)
    capsule(draw, pt(75, 148), pt(70, 189), 20 * scale, fill)

    # Kicking leg raised high to the side: hip -> knee -> foot
    capsule(draw, pt(99, 104), pt(138, 90), 22 * scale, fill)
    capsule(draw, pt(138, 90), pt(184, 50), 20 * scale, fill)

    # Front (guard) arm: shoulder -> elbow -> fist, chambered near chest
    capsule(draw, pt(77, 64), pt(59, 84), 15 * scale, fill)
    capsule(draw, pt(59, 84), pt(73, 99), 14 * scale, fill)

    # Rear arm, tucked back close to the torso for balance
    capsule(draw, pt(103, 64), pt(113, 78), 15 * scale, fill)
    capsule(draw, pt(113, 78), pt(104, 92), 14 * scale, fill)

    # Belt tails at the waist
    draw.polygon(
        [pt(83, 108), pt(76, 130), pt(87, 128), pt(90, 110)],
        fill=fill,
    )


def draw_icon(size, padding_ratio, out_path):
    img = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    draw = ImageDraw.Draw(img)

    corner_radius = round(size * 0.22)
    draw.rounded_rectangle(
        [(0, 0), (size - 1, size - 1)], radius=corner_radius, fill=RED
    )

    usable = size * (1 - padding_ratio * 2)
    scale = usable / FIGURE_BOX
    offset_x = (size - FIGURE_BOX * scale) / 2
    offset_y = (size - FIGURE_BOX * scale) / 2
    draw_figure(draw, scale, offset_x, offset_y)

    img.save(out_path)


# Standard (any) icons - fill the full canvas
draw_icon(192, 0.05, "public/icon-192.png")
draw_icon(512, 0.05, "public/icon-512.png")

# Maskable icons need extra safe-zone padding since the OS may crop to
# a circle/squircle - keep the figure within the center ~80%.
draw_icon(192, 0.15, "public/icon-maskable-192.png")
draw_icon(512, 0.15, "public/icon-maskable-512.png")

# Apple touch icon: iOS ignores alpha and rounds the corners itself,
# so render on an opaque square (no pre-rounded corners/transparency).
size = 180
img = Image.new("RGB", (size, size), RED)
draw = ImageDraw.Draw(img)
usable = size * 0.92
scale = usable / FIGURE_BOX
offset_x = (size - FIGURE_BOX * scale) / 2
offset_y = (size - FIGURE_BOX * scale) / 2
draw_figure(draw, scale, offset_x, offset_y, fill=(255, 255, 255))
img.save("public/apple-touch-icon.png")

# Favicon
draw_icon(32, 0.05, "public/favicon-32.png")

print("Icons generated.")
