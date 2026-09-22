#!/usr/bin/env python3
"""Build apps/desktop/icon.iconset from the Cairn source artwork.

Electrobun's `mac.icons` points at the .iconset folder and runs iconutil on it,
so this script owns everything upstream of that: it lifts the cairn off the
generated artwork, re-lays it out on Apple's icon grid, and renders every size.

Why re-layout instead of shipping the source PNG directly: the generated art
fills 80% of its canvas edge to edge, but macOS expects the icon body to be
824pt inside a 1024pt canvas, with the subject comfortably inside that. Pasting
the raw art would push the stones under the Dock's squircle mask.

Usage: python3 scripts/make-iconset.py [source.png]
"""

from pathlib import Path
import subprocess
import sys

import numpy as np
from PIL import Image

HERE = Path(__file__).resolve().parent
APP_DIR = HERE.parent
DEFAULT_SOURCE = APP_DIR / "icon.src.png"
ICONSET = APP_DIR / "icon.iconset"

# Apple's macOS icon grid: a 824pt body centred in a 1024pt canvas.
CANVAS = 1024
BODY = 824
# Supersample the whole composite, then downsample once. Cheaper to reason
# about than per-element antialiasing, and the superellipse mask needs it.
SS = 4

# Superellipse exponent. n=5 tracks Apple's continuous corner closely enough
# that the icon sits flush with system icons in the Dock; a plain rounded
# rectangle reads visibly "cornered" next to them.
SQUIRCLE_N = 5.0

# Sampled from the source artwork so the rebuilt background matches what the
# generator produced, widened slightly at both ends for a little more depth.
BG_TOP_LEFT = (18, 14, 10)
BG_BOTTOM_RIGHT = (38, 30, 23)
STONE = (235, 227, 213)

# A near-black icon disappears against a dark wallpaper — macOS draws no border
# of its own. A hairline rim a few shades above the background restores the
# edge without reading as a stroke.
RIM_RGB = (62, 52, 43)
RIM_ALPHA = 0.55
RIM_WIDTH_PT = 2.0

# Fraction of the body height the stack occupies. The source art runs to 80% of
# its own canvas; that is too tall once the body is inset into the icon grid.
SUBJECT_HEIGHT = 0.70

# Luminance ramp separating stones from background. The artwork is two flat
# tones ~150 apart, so anything inside this band is edge antialiasing.
LUMA_FLOOR = 90.0
LUMA_CEIL = 170.0

ICONSET_SIZES = (
    ("icon_16x16.png", 16),
    ("icon_16x16@2x.png", 32),
    ("icon_32x32.png", 32),
    ("icon_32x32@2x.png", 64),
    ("icon_128x128.png", 128),
    ("icon_128x128@2x.png", 256),
    ("icon_256x256.png", 256),
    ("icon_256x256@2x.png", 512),
    ("icon_512x512.png", 512),
    ("icon_512x512@2x.png", 1024),
)


def subject_alpha(source: Path) -> np.ndarray:
    """Lift the stones off the background as a single antialiased alpha mask."""
    rgb = np.asarray(Image.open(source).convert("RGB")).astype(np.float64)
    luma = rgb @ (0.2126, 0.7152, 0.0722)
    alpha = np.clip((luma - LUMA_FLOOR) / (LUMA_CEIL - LUMA_FLOOR), 0.0, 1.0)

    rows = np.where(alpha.max(axis=1) > 0.01)[0]
    cols = np.where(alpha.max(axis=0) > 0.01)[0]
    if rows.size == 0 or cols.size == 0:
        raise SystemExit(f"no subject found in {source}")
    return alpha[rows[0] : rows[-1] + 1, cols[0] : cols[-1] + 1]


def superellipse(size: int, exponent: float) -> np.ndarray:
    """Signed field of a centred superellipse; <= 1.0 is inside the shape."""
    axis = (np.arange(size) + 0.5) / size * 2.0 - 1.0
    u = np.abs(axis)[None, :] ** exponent
    v = np.abs(axis)[:, None] ** exponent
    return (u + v) ** (1.0 / exponent)


def gradient(size: int, start: tuple[int, ...], end: tuple[int, ...]) -> np.ndarray:
    """Top-left to bottom-right linear ramp across the body."""
    axis = np.linspace(0.0, 1.0, size)
    t = ((axis[:, None] + axis[None, :]) / 2.0)[:, :, None]
    return np.array(start)[None, None, :] * (1 - t) + np.array(end)[None, None, :] * t


def render(source: Path) -> Image.Image:
    body_px = BODY * SS
    field = superellipse(body_px, SQUIRCLE_N)

    rgb = gradient(body_px, BG_TOP_LEFT, BG_BOTTOM_RIGHT)

    # Rim: the outermost band of the superellipse, blended over the gradient.
    rim_t = (RIM_WIDTH_PT * SS) / (body_px / 2.0)
    rim = np.clip((field - (1.0 - rim_t)) / rim_t, 0.0, 1.0) * (field <= 1.0)
    rgb = rgb * (1 - rim[:, :, None] * RIM_ALPHA) + np.array(RIM_RGB)[None, None, :] * (
        rim[:, :, None] * RIM_ALPHA
    )

    body = Image.fromarray(rgb.round().astype(np.uint8), "RGB")

    # Place the stack: scaled to a fixed share of the body height, centred.
    alpha = subject_alpha(source)
    src_h, src_w = alpha.shape
    target_h = int(round(body_px * SUBJECT_HEIGHT))
    target_w = int(round(src_w * target_h / src_h))
    stack = Image.fromarray((alpha * 255).round().astype(np.uint8), "L").resize(
        (target_w, target_h), Image.LANCZOS
    )
    body.paste(
        Image.new("RGB", (target_w, target_h), STONE),
        ((body_px - target_w) // 2, (body_px - target_h) // 2),
        stack,
    )

    # Mask the body to the superellipse, then inset it into the icon canvas.
    body_mask = Image.fromarray(
        (np.clip((1.0 - field) * (body_px / 2.0) + 0.5, 0.0, 1.0) * 255)
        .round()
        .astype(np.uint8),
        "L",
    )
    body.putalpha(body_mask)

    canvas = Image.new("RGBA", (CANVAS * SS, CANVAS * SS), (0, 0, 0, 0))
    inset = (CANVAS - BODY) * SS // 2
    canvas.paste(body, (inset, inset))
    return canvas.resize((CANVAS, CANVAS), Image.LANCZOS)


def main() -> None:
    source = Path(sys.argv[1]) if len(sys.argv) > 1 else DEFAULT_SOURCE
    if not source.exists():
        raise SystemExit(f"source artwork not found: {source}")

    master = render(source)
    ICONSET.mkdir(exist_ok=True)
    for name, size in ICONSET_SIZES:
        master.resize((size, size), Image.LANCZOS).save(ICONSET / name)
    master.save(APP_DIR / "icon.png")

    # Not consumed by the build — Electrobun runs iconutil itself — but it lets
    # you preview the real thing in Finder without a full package run.
    subprocess.run(
        ["iconutil", "-c", "icns", str(ICONSET), "-o", str(APP_DIR / "icon.icns")],
        check=True,
    )
    print(f"wrote {ICONSET} ({len(ICONSET_SIZES)} sizes), icon.png, icon.icns")


if __name__ == "__main__":
    main()
