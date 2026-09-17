"""
Image quality pipeline for Thumbnail Studio.

This module runs inside Pyodide (CPython on WebAssembly) in a Web Worker, and
unchanged under desktop CPython, which is how it is tested. It only needs numpy;
Pillow is used for resampling when it is available.

Everything here is work the Canvas 2D API cannot do properly:

  * real local contrast (CLAHE) instead of a global contrast multiplier
  * a true unsharp mask with radius / amount / threshold
  * edge-preserving denoise (guided filter)
  * highlight and shadow recovery on a luminance curve, in linear light
  * grey-world white balance and percentile auto-levels
  * Lanczos upscaling

Conventions
-----------
Images are uint8 arrays shaped (height, width, 4) in RGBA order — exactly what
`ctx.getImageData` hands over. Alpha is never altered, and every blur is
alpha-premultiplied so cut-outs do not grow dark halos at their edges.
Tonal maths happens in linear light; sRGB is decoded on the way in and encoded
on the way out.
"""

from __future__ import annotations

import numpy as np

__all__ = ["apply_op", "OPS"]

EPSILON = 1e-6

# How fast a cut-out edge pixel hands its colour over to the interior: at this
# value anything below half coverage is recoloured completely.
DECONTAMINATE_FALLOFF = 2.0

OPS = (
    "auto",
    "clahe",
    "white_balance",
    "levels",
    "sharpen",
    "denoise",
    "upscale",
    "tone",
    "temperature",
    "despeckle",
    "defringe",
    "clean_matte",
    "focus_blur",
)


# ---------------------------------------------------------------- colour ---


def srgb_to_linear(x: np.ndarray) -> np.ndarray:
    return np.where(x <= 0.04045, x / 12.92, ((x + 0.055) / 1.055) ** 2.4)


def linear_to_srgb(x: np.ndarray) -> np.ndarray:
    x = np.clip(x, 0.0, 1.0)
    return np.where(x <= 0.0031308, x * 12.92, 1.055 * (x ** (1.0 / 2.4)) - 0.055)


def luminance(rgb: np.ndarray) -> np.ndarray:
    """Rec. 709 luma of a linear-light RGB image."""
    return rgb[..., 0] * 0.2126 + rgb[..., 1] * 0.7152 + rgb[..., 2] * 0.0722


def split(rgba: np.ndarray) -> tuple[np.ndarray, np.ndarray]:
    """Returns linear-light RGB in 0..1 and alpha in 0..1."""
    data = rgba.astype(np.float32) / 255.0
    return srgb_to_linear(data[..., :3]), data[..., 3]


def join(rgb: np.ndarray, alpha: np.ndarray) -> np.ndarray:
    out = np.empty(rgb.shape[:2] + (4,), dtype=np.uint8)
    out[..., :3] = np.rint(linear_to_srgb(rgb) * 255.0).astype(np.uint8)
    out[..., 3] = np.rint(np.clip(alpha, 0.0, 1.0) * 255.0).astype(np.uint8)
    return out


def apply_gain(rgb: np.ndarray, gain: np.ndarray) -> np.ndarray:
    """Scales every channel by a per-pixel gain, which preserves hue."""
    return np.clip(rgb * gain[..., None], 0.0, 1.0)


# ------------------------------------------------------------------ blur ---


def box_blur(img: np.ndarray, radius: int) -> np.ndarray:
    """
    Separable box blur via summed-area tables: O(pixels) regardless of radius,
    which is what keeps large radii affordable in WebAssembly.
    """
    radius = int(max(1, radius))
    if img.ndim == 2:
        return box_blur(img[..., None], radius)[..., 0]

    height, width = img.shape[:2]
    out = img.astype(np.float32, copy=True)

    # Horizontal pass.
    pad = np.pad(out, ((0, 0), (radius + 1, radius), (0, 0)), mode="edge")
    cumulative = np.cumsum(pad, axis=1)
    out = (cumulative[:, 2 * radius + 1 :] - cumulative[:, : width]) / (2 * radius + 1)

    # Vertical pass.
    pad = np.pad(out, ((radius + 1, radius), (0, 0), (0, 0)), mode="edge")
    cumulative = np.cumsum(pad, axis=0)
    out = (cumulative[2 * radius + 1 :] - cumulative[:height]) / (2 * radius + 1)
    return out


def gaussian_blur(img: np.ndarray, sigma: float) -> np.ndarray:
    """Three box passes approximate a Gaussian closely enough for photo work."""
    if sigma <= 0:
        return img.astype(np.float32, copy=True)
    radius = max(1, int(round(sigma * 1.5)))
    out = img
    for _ in range(3):
        out = box_blur(out, radius)
    return out


def blur_premultiplied(rgb: np.ndarray, alpha: np.ndarray, sigma: float) -> np.ndarray:
    """Blurs colour without letting transparent pixels bleed into the subject."""
    weight = np.maximum(alpha, EPSILON)[..., None]
    blurred = gaussian_blur(rgb * weight, sigma)
    norm = gaussian_blur(weight, sigma)
    return blurred / np.maximum(norm, EPSILON)


# ----------------------------------------------------------- operations ---


def clahe(rgba: np.ndarray, clip: float = 2.0, tiles: int = 8, amount: float = 1.0) -> np.ndarray:
    """
    Contrast Limited Adaptive Histogram Equalisation on luminance.

    Local contrast is what makes a flat phone photo read as "crisp"; a global
    contrast slider cannot do this because it moves every pixel the same way.
    The per-tile mappings are interpolated bilinearly so tiles never show.
    """
    rgb, alpha = split(rgba)
    height, width = rgb.shape[:2]
    tiles_y = max(1, min(int(tiles), max(1, height // 16)))
    tiles_x = max(1, min(int(tiles), max(1, width // 16)))

    lum = np.clip(luminance(rgb), 0.0, 1.0)
    quantised = np.clip((lum * 255.0).astype(np.int32), 0, 255)

    edges_y = np.linspace(0, height, tiles_y + 1).astype(int)
    edges_x = np.linspace(0, width, tiles_x + 1).astype(int)
    maps = np.zeros((tiles_y, tiles_x, 256), dtype=np.float32)

    for i in range(tiles_y):
        for j in range(tiles_x):
            tile = quantised[edges_y[i] : edges_y[i + 1], edges_x[j] : edges_x[j + 1]]
            if tile.size == 0:
                maps[i, j] = np.linspace(0.0, 1.0, 256, dtype=np.float32)
                continue
            hist = np.bincount(tile.ravel(), minlength=256).astype(np.float32)
            # Clipping the histogram is what stops flat areas turning to noise.
            limit = max(1.0, float(clip) * tile.size / 256.0)
            excess = np.maximum(hist - limit, 0.0).sum()
            hist = np.minimum(hist, limit) + excess / 256.0
            cdf = np.cumsum(hist)
            maps[i, j] = cdf / max(cdf[-1], EPSILON)

    centres_y = (edges_y[:-1] + edges_y[1:]) / 2.0
    centres_x = (edges_x[:-1] + edges_x[1:]) / 2.0
    iy, fy = _interp_index(np.arange(height), centres_y)
    ix, fx = _interp_index(np.arange(width), centres_x)

    iy_col = iy[:, None]
    ix_row = ix[None, :]
    fy_col = fy[:, None]
    fx_row = fx[None, :]
    iy1 = np.minimum(iy_col + 1, tiles_y - 1)
    ix1 = np.minimum(ix_row + 1, tiles_x - 1)

    top = maps[iy_col, ix_row, quantised] * (1 - fx_row) + maps[iy_col, ix1, quantised] * fx_row
    bottom = maps[iy1, ix_row, quantised] * (1 - fx_row) + maps[iy1, ix1, quantised] * fx_row
    equalised = top * (1 - fy_col) + bottom * fy_col

    target = lum * (1.0 - amount) + equalised * amount
    gain = (target + EPSILON) / (lum + EPSILON)
    return join(apply_gain(rgb, gain), alpha)


def _interp_index(positions: np.ndarray, centres: np.ndarray) -> tuple[np.ndarray, np.ndarray]:
    """Neighbouring tile index and blend factor for each row or column."""
    if centres.size < 2:
        return np.zeros(positions.shape, dtype=np.int32), np.zeros(positions.shape, dtype=np.float32)
    index = np.clip(np.searchsorted(centres, positions) - 1, 0, centres.size - 2)
    span = np.maximum(centres[index + 1] - centres[index], EPSILON)
    fraction = np.clip((positions - centres[index]) / span, 0.0, 1.0)
    return index.astype(np.int32), fraction.astype(np.float32)


def white_balance(rgba: np.ndarray, amount: float = 1.0) -> np.ndarray:
    """Grey-world balance: neutralises a colour cast from mixed lighting."""
    rgb, alpha = split(rgba)
    mask = alpha > 0.05
    if not mask.any():
        return rgba.copy()
    means = np.array([rgb[..., c][mask].mean() for c in range(3)], dtype=np.float32)
    means = np.maximum(means, EPSILON)
    target = float(means.mean())
    scale = (target / means) ** float(np.clip(amount, 0.0, 1.0))
    return join(np.clip(rgb * scale, 0.0, 1.0), alpha)


def levels(rgba: np.ndarray, low: float = 0.5, high: float = 99.5, amount: float = 1.0) -> np.ndarray:
    """Percentile stretch on luminance — recovers a washed-out capture."""
    rgb, alpha = split(rgba)
    lum = luminance(rgb)
    mask = alpha > 0.05
    sample = lum[mask] if mask.any() else lum.ravel()
    lo = float(np.percentile(sample, float(low)))
    hi = float(np.percentile(sample, float(high)))
    if hi - lo < 1e-3:
        return rgba.copy()
    stretched = np.clip((lum - lo) / (hi - lo), 0.0, 1.0)
    target = lum * (1.0 - amount) + stretched * amount
    gain = (target + EPSILON) / (lum + EPSILON)
    return join(apply_gain(rgb, gain), alpha)


def sharpen(rgba: np.ndarray, radius: float = 2.0, amount: float = 1.0, threshold: float = 0.0) -> np.ndarray:
    """
    Unsharp mask in linear light. `threshold` (0..1) protects smooth areas such
    as skin and sky from being sharpened into noise.
    """
    rgb, alpha = split(rgba)
    blurred = blur_premultiplied(rgb, alpha, float(radius))
    detail = rgb - blurred
    if threshold > 0:
        strength = np.clip((np.abs(detail) - float(threshold)) / max(float(threshold), EPSILON), 0.0, 1.0)
        detail = detail * strength
    return join(np.clip(rgb + detail * float(amount), 0.0, 1.0), alpha)


def denoise(rgba: np.ndarray, strength: float = 1.0, radius: int = 3) -> np.ndarray:
    """
    Guided filter: averages flat areas while leaving edges intact, so noise from
    a phone or webcam goes without the subject turning to plastic.
    """
    rgb, alpha = split(rgba)
    eps = float(np.clip(strength, 0.05, 4.0)) * 0.01
    radius = int(max(1, radius))
    mean = box_blur(rgb, radius)
    mean_sq = box_blur(rgb * rgb, radius)
    variance = np.maximum(mean_sq - mean * mean, 0.0)
    a = variance / (variance + eps)
    b = mean - a * mean
    filtered = box_blur(a, radius) * rgb + box_blur(b, radius)
    return join(np.clip(filtered, 0.0, 1.0), alpha)


def tone(rgba: np.ndarray, highlights: float = 0.0, shadows: float = 0.0) -> np.ndarray:
    """
    Highlight and shadow recovery. Both take -1..1: negative highlights pull
    blown areas back, positive shadows open up the dark end.
    """
    rgb, alpha = split(rgba)
    lum = np.clip(luminance(rgb), 0.0, 1.0)
    highlight_mask = lum**2
    shadow_mask = (1.0 - lum) ** 2
    gain = 1.0 + float(highlights) * 0.8 * highlight_mask + float(shadows) * 0.8 * shadow_mask
    return join(apply_gain(rgb, np.maximum(gain, 0.0)), alpha)


def temperature(rgba: np.ndarray, temp: float = 0.0, tint: float = 0.0) -> np.ndarray:
    """Channel scaling in linear light: warmer or cooler, green or magenta."""
    rgb, alpha = split(rgba)
    scale = np.array(
        [1.0 + float(temp) * 0.28, 1.0 - float(tint) * 0.18, 1.0 - float(temp) * 0.28],
        dtype=np.float32,
    )
    return join(np.clip(rgb * scale, 0.0, 1.0), alpha)


def upscale(rgba: np.ndarray, factor: float = 2.0, sharpen_after: float = 0.35) -> np.ndarray:
    """
    Lanczos resampling — far better than the browser's bilinear scaling when a
    small upload has to fill a 1920 px canvas. A light unsharp pass afterwards
    restores the bite that any resampler costs you.
    """
    height, width = rgba.shape[:2]
    target = (max(1, int(round(width * factor))), max(1, int(round(height * factor))))
    try:
        from PIL import Image

        resized = np.asarray(Image.fromarray(rgba, "RGBA").resize(target, Image.LANCZOS))
    except Exception:
        resized = _resize_bilinear(rgba, target)
    if sharpen_after > 0:
        resized = sharpen(resized, radius=1.0, amount=float(sharpen_after))
    return resized


def _resize_bilinear(rgba: np.ndarray, target: tuple[int, int]) -> np.ndarray:
    """Fallback used only if Pillow is unavailable."""
    out_w, out_h = target
    height, width = rgba.shape[:2]
    ys = np.clip(np.linspace(0, height - 1, out_h), 0, height - 1)
    xs = np.clip(np.linspace(0, width - 1, out_w), 0, width - 1)
    y0 = np.floor(ys).astype(int)
    x0 = np.floor(xs).astype(int)
    y1 = np.minimum(y0 + 1, height - 1)
    x1 = np.minimum(x0 + 1, width - 1)
    wy = (ys - y0).astype(np.float32)[:, None, None]
    wx = (xs - x0).astype(np.float32)[None, :, None]
    source = rgba.astype(np.float32)
    top = source[y0][:, x0] * (1 - wx) + source[y0][:, x1] * wx
    bottom = source[y1][:, x0] * (1 - wx) + source[y1][:, x1] * wx
    return np.rint(top * (1 - wy) + bottom * wy).astype(np.uint8)


def auto(rgba: np.ndarray, strength: float = 1.0) -> np.ndarray:
    """
    The one-click pass: neutralise the cast, open the tonal range, add local
    contrast, then a restrained sharpen. Tuned to look corrected, not processed.
    """
    strength = float(np.clip(strength, 0.0, 1.0))
    out = white_balance(rgba, amount=0.6 * strength)
    out = levels(out, low=0.5, high=99.5, amount=0.7 * strength)
    out = clahe(out, clip=1.6, tiles=8, amount=0.65 * strength)
    out = sharpen(out, radius=1.2, amount=0.35 * strength, threshold=0.02)
    return out


# ----------------------------------------------------------- matte clean ---
#
# What background removal leaves behind, and what to do about it:
#
#   * speckles — a handful of stray pixels the segmentation kept, scattered in
#     the empty area. They are tiny islands of alpha that touch nothing, so
#     connected-component labelling finds them exactly.
#   * a bright rim — edge pixels whose colour is still a blend with the old
#     background. Erasing them eats into the subject; recolouring them from the
#     nearest solid pixel keeps the shape and drops the halo.
#
# Both need neighbourhood analysis Canvas 2D cannot do, which is why they live
# here.


def _runs_of(mask: np.ndarray) -> tuple[np.ndarray, np.ndarray, np.ndarray]:
    """
    Row-wise runs of True as (row, column, length) arrays.

    Runs rather than pixels: a matte has a few thousand of them where it has
    millions of pixels, which is what makes labelling affordable in WebAssembly.
    A spacer column is padded onto each row so no run can wrap into the next.
    """
    height, width = mask.shape
    padded = np.zeros((height, width + 1), dtype=bool)
    padded[:, :width] = mask
    flat = padded.reshape(-1).astype(np.int8)
    edges = np.flatnonzero(np.diff(np.concatenate(([np.int8(0)], flat, [np.int8(0)]))))
    starts = edges[0::2]
    ends = edges[1::2]
    rows = starts // (width + 1)
    return rows, starts - rows * (width + 1), ends - starts


def label_components(mask: np.ndarray) -> tuple[np.ndarray, np.ndarray, np.ndarray, np.ndarray, np.ndarray]:
    """
    8-connected component labelling over runs, with union-find.

    Returns `(rows, cols, lengths, roots, sizes)`: one entry per run, `roots`
    giving each run's component and `sizes` that component's pixel count.
    """
    rows, cols, lengths = _runs_of(mask)
    count = rows.size
    if count == 0:
        empty = np.zeros(0, dtype=np.int64)
        return rows, cols, lengths, empty, empty.astype(np.float64)

    parent = list(range(count))

    def find(node: int) -> int:
        root = node
        while parent[root] != root:
            root = parent[root]
        while parent[node] != root:  # path compression
            parent[node], node = root, parent[node]
        return root

    def union(a: int, b: int) -> None:
        ra, rb = find(a), find(b)
        if ra != rb:
            parent[max(ra, rb)] = min(ra, rb)

    # Runs come out in row-major order, so each row owns a contiguous slice.
    last_row = int(rows[-1])
    row_start = np.searchsorted(rows, np.arange(last_row + 2), side="left").tolist()
    row_start.append(count)
    col_list = cols.tolist()
    end_list = (cols + lengths).tolist()

    for row in range(1, last_row + 1):
        above, above_end = row_start[row - 1], row_start[row]
        here, here_end = row_start[row], row_start[row + 1]
        i, j = above, here
        while i < above_end and j < here_end:
            # Touching diagonally counts, hence the one-pixel slack.
            if col_list[i] <= end_list[j] and col_list[j] <= end_list[i]:
                union(i, j)
            if end_list[i] < end_list[j]:
                i += 1
            else:
                j += 1

    roots = np.array([find(i) for i in range(count)], dtype=np.int64)
    totals = np.bincount(roots, weights=lengths.astype(np.float64), minlength=count)
    return rows, cols, lengths, roots, totals[roots]


def _run_coverage(
    rows: np.ndarray, cols: np.ndarray, lengths: np.ndarray, roots: np.ndarray, region: np.ndarray
) -> np.ndarray:
    """Per-run share of its component's pixels lying under `region` (0..1)."""
    covered = np.zeros(rows.size, dtype=np.float64)
    row_list, col_list, len_list = rows.tolist(), cols.tolist(), lengths.tolist()
    for i in range(rows.size):
        start = col_list[i]
        covered[i] = float(region[row_list[i], start : start + len_list[i]].sum())
    totals = np.bincount(roots, weights=covered, minlength=rows.size)
    return totals[roots]


def despeckle(
    rgba: np.ndarray,
    min_area: float = 64.0,
    threshold: float = 0.5,
    keep_largest: bool = True,
    region: np.ndarray | None = None,
) -> np.ndarray:
    """
    Clears islands of matte smaller than `min_area` pixels.

    The largest component is always kept, so the subject can never be the thing
    that disappears — which is what makes this safe to run with a generous
    `min_area`. With `region` given (a 0..1 brush mask) only components whose
    pixels are mostly under the brush are considered.
    """
    alpha = rgba[..., 3]
    solid = alpha > int(round(float(threshold) * 255.0))
    rows, cols, lengths, roots, sizes = label_components(solid)
    if rows.size == 0:
        return rgba.copy()

    drop = sizes < float(min_area)
    if keep_largest:
        drop &= sizes < sizes.max()
    if region is not None:
        drop &= _run_coverage(rows, cols, lengths, roots, region) >= sizes * 0.5

    out = rgba.copy()
    row_list, col_list, len_list = rows.tolist(), cols.tolist(), lengths.tolist()
    for i in np.flatnonzero(drop).tolist():
        start = col_list[i]
        out[row_list[i], start : start + len_list[i], 3] = 0
    return out


def defringe(rgba: np.ndarray, strength: float = 1.0, radius: float = 2.0, shrink: float = 0.0) -> np.ndarray:
    """
    Kills the halo left along a cut-out edge.

    Partly transparent edge pixels still carry a blend of the old background —
    a bright rim against a light backdrop. Rather than erase them (which eats
    into hair), their colour is replaced by the nearest solid interior colour,
    extrapolated outward with a normalised blur, in proportion to how
    transparent they are. Alpha, and so the silhouette, is untouched except by
    `shrink`, which raises the transparency floor to drop the faintest rim
    pixels entirely.
    """
    rgb, alpha = split(rgba)
    strength = float(np.clip(strength, 0.0, 1.0))

    solid = (alpha >= 0.92).astype(np.float32)
    if solid.max() <= 0.0:
        return rgba.copy()

    # Normalised convolution: blur colour and coverage together, then divide,
    # which carries interior colour outward without the edge going dark.
    # Two box passes, not a Gaussian: this only has to carry colour a few
    # pixels outward, and a proper Gaussian here costs three times as much.
    colour = rgb * solid[..., None]
    weight = solid
    spread = int(max(1, round(float(radius))))
    for _ in range(2):
        colour = box_blur(colour, spread)
        weight = box_blur(weight, spread)
    extrapolated = colour / np.maximum(weight, EPSILON)[..., None]

    # A pixel at half coverage is half old background, so its stored colour is
    # already more backdrop than subject: replace it outright rather than in
    # proportion. The factor is what makes the rim actually disappear instead
    # of merely dimming.
    mix = np.clip((1.0 - alpha) * DECONTAMINATE_FALLOFF * strength, 0.0, 1.0) * (alpha > 0.004)
    out_rgb = rgb * (1.0 - mix[..., None]) + extrapolated * mix[..., None]

    shrink = float(np.clip(shrink, 0.0, 0.9))
    if shrink > 0:
        alpha = np.clip((alpha - shrink) / (1.0 - shrink), 0.0, 1.0)
    return join(np.clip(out_rgb, 0.0, 1.0), alpha)


def clean_matte(
    rgba: np.ndarray,
    min_area: float = 64.0,
    strength: float = 1.0,
    radius: float = 2.0,
    shrink: float = 0.0,
    threshold: float = 0.5,
    region: np.ndarray | None = None,
) -> np.ndarray:
    """One pass over a fresh cut-out: drop the specks, then clean the edge."""
    out = despeckle(rgba, min_area=min_area, threshold=threshold, region=region)
    if strength <= 0 and shrink <= 0:
        return out
    if region is None:
        return defringe(out, strength=strength, radius=radius, shrink=shrink)

    # Under a brush the edge work stays inside the stroke, so only the patch the
    # stroke touches is processed — a stroke costs the same on a 4K cut-out as
    # on a small one. Labelling above still saw the whole image, so the subject
    # is still recognised as the largest component.
    ys, xs = np.nonzero(region > 0.004)
    if ys.size == 0:
        return out
    pad = int(max(2, round(float(radius) * 4)))
    height, width = out.shape[:2]
    y0, y1 = max(0, int(ys.min()) - pad), min(height, int(ys.max()) + 1 + pad)
    x0, x1 = max(0, int(xs.min()) - pad), min(width, int(xs.max()) + 1 + pad)
    patch = out[y0:y1, x0:x1]
    cleaned = defringe(patch, strength=strength, radius=radius, shrink=shrink)
    blend = np.clip(region[y0:y1, x0:x1], 0.0, 1.0)[..., None]
    out[y0:y1, x0:x1] = np.rint(patch.astype(np.float32) * (1.0 - blend) + cleaned.astype(np.float32) * blend).astype(
        np.uint8
    )
    return out


# ----------------------------------------------------------- object mask ---
#
# Premiere Pro's object mask in plain numpy: a scribble says "this thing", and
# the selection is grown out from it until it runs into the edges of whatever it
# was drawn on. Three decisions worth recording.
#
#   * The flood runs on a downsample (SELECT_MAX_EDGE). The mask is feathered
#     before it is used, so the detail lost on the way down never shows, and a
#     4K still segments as fast as a small one.
#   * Growth is gated twice. A neighbouring pixel joins only if the step to it
#     is small — an edge stops the flood — *and* its colour is still close to
#     the scribble's own, so a long gradient cannot walk the selection off the
#     object one imperceptible step at a time.
#   * The scribble's own bounding box, grown by `spread`, bounds the result.
#     Without it a single leak through a shadow hands back the whole frame, and
#     the creator has no idea why.

SELECT_MAX_EDGE = 320
# The smallest bounding box a scribble is credited with, as a share of the
# frame. Without a floor here a single dab could only ever select a dab-sized
# object, when a dab on a face plainly means the face.
SELECT_MIN_REACH = 0.08
# Above this radius a blur is computed on a downsample instead of in place.
BLUR_FAST_SIGMA = 8.0
SELECT_NEIGHBOURS = ((0, 1), (0, -1), (1, 0), (-1, 0))


def _shift(arr: np.ndarray, dy: int, dx: int) -> np.ndarray:
    """`arr` translated by (dy, dx), the vacated border filled with zeros."""
    height, width = arr.shape[:2]
    out = np.zeros_like(arr)
    out[max(0, dy) : height + min(0, dy), max(0, dx) : width + min(0, dx)] = arr[
        max(0, -dy) : height + min(0, -dy), max(0, -dx) : width + min(0, -dx)
    ]
    return out


def _nearest(arr: np.ndarray, shape: tuple[int, int]) -> np.ndarray:
    """Nearest-neighbour resample, which works for masks and for colour alike."""
    height, width = arr.shape[:2]
    ys = np.rint(np.linspace(0, height - 1, max(1, shape[0]))).astype(int)
    xs = np.rint(np.linspace(0, width - 1, max(1, shape[1]))).astype(int)
    return arr[ys][:, xs]


def _close(mask: np.ndarray, radius: int) -> np.ndarray:
    """
    Fills the holes a specular highlight or a printed logo punches in an
    otherwise solid object: dilate, then erode by the same amount.
    """
    grown = box_blur(mask.astype(np.float32), radius) > 0.05
    return box_blur(grown.astype(np.float32), radius) > 0.95


def _scaled_blur(img: np.ndarray, sigma: float) -> np.ndarray:
    """
    A big blur, done on a downsample. Nothing finer than the blur radius
    survives it, so averaging those pixels first costs nothing visually and
    turns a 4K focus blur from seconds into a fraction of one. The final box
    pass is what hides the blocks the cheap upsample leaves behind.
    """
    if sigma <= BLUR_FAST_SIGMA:
        return gaussian_blur(img, sigma)
    scale = BLUR_FAST_SIGMA / float(sigma)
    height, width = img.shape[:2]
    small_shape = (max(1, int(round(height * scale))), max(1, int(round(width * scale))))
    small = _nearest(box_blur(img, max(1, int(round(0.5 / scale)))), small_shape)
    return box_blur(_nearest(gaussian_blur(small, BLUR_FAST_SIGMA), (height, width)), max(1, int(round(0.75 / scale))))


def select_object(
    rgba: np.ndarray,
    region: np.ndarray,
    tolerance: float = 0.18,
    spread: float = 3.0,
    feather: float = 2.0,
    edge: float = 0.0,
) -> np.ndarray:
    """
    Grows the scribble in `region` out to the edges of the thing it sits on.

    Returns a 0..1 mask the size of the image. An empty scribble selects
    nothing rather than everything, because the caller is about to blur
    whatever comes back.
    """
    height, width = rgba.shape[:2]
    drawn = region > 0.5
    if not drawn.any():
        return np.zeros((height, width), dtype=np.float32)

    rgb = rgba[..., :3].astype(np.float32) / 255.0
    scale = min(1.0, float(SELECT_MAX_EDGE) / max(height, width))
    small_shape = (max(1, int(round(height * scale))), max(1, int(round(width * scale))))
    if scale < 1.0:
        # Average before sampling, or a single noisy pixel becomes a whole
        # block of the image the flood has to reason about.
        rgb = box_blur(rgb, max(1, int(round(0.5 / scale))))
    small = _nearest(rgb, small_shape)
    seeds = _nearest(drawn.astype(np.float32), small_shape) > 0.25
    if not seeds.any():
        # A thin stroke can fall between samples on a very large image; keep at
        # least its centre, so a click always selects something.
        ys, xs = np.nonzero(drawn)
        cy = int(round(float(ys.mean()) * (small_shape[0] - 1) / max(1, height - 1)))
        cx = int(round(float(xs.mean()) * (small_shape[1] - 1) / max(1, width - 1)))
        seeds[cy, cx] = True

    reference = small[seeds].mean(axis=0)
    tol = max(0.02, float(tolerance))
    step = max(0.01, float(edge) if edge > 0 else tol * 0.6)

    # Precomputed once: for each direction, whether the step between a pixel and
    # that neighbour is small enough to flow across. The loop below is then pure
    # boolean work, which is what makes a few hundred iterations affordable.
    links = [((dy, dx), np.abs(small - _shift(small, dy, dx)).max(axis=2) <= step) for dy, dx in SELECT_NEIGHBOURS]

    ys, xs = np.nonzero(seeds)
    floor = SELECT_MIN_REACH * max(small_shape)
    reach_y = float(spread) * max(float(int(ys.max()) - int(ys.min()) + 1), floor)
    reach_x = float(spread) * max(float(int(xs.max()) - int(xs.min()) + 1), floor)
    bounds = np.zeros(small_shape, dtype=bool)
    bounds[
        max(0, int(ys.min() - reach_y)) : int(ys.max() + reach_y) + 1,
        max(0, int(xs.min() - reach_x)) : int(xs.max() + reach_x) + 1,
    ] = True

    allowed = (np.abs(small - reference).max(axis=2) <= tol * 2.0) & bounds
    allowed |= seeds  # whatever its colour, what the creator drew on is selected

    mask = seeds.copy()
    for _ in range(2 * (small_shape[0] + small_shape[1])):
        grown = mask
        for (dy, dx), link in links:
            grown = grown | (_shift(mask, dy, dx) & link)
        grown &= allowed
        if int(grown.sum()) == int(mask.sum()):
            break
        mask = grown

    full = _nearest(_close(mask, 2).astype(np.float32), (height, width))
    # The feather has to be at least one block of the upsample or the mask
    # arrives with visible stair-steps along every diagonal.
    sigma = max(float(feather), 0.75 / max(scale, EPSILON))
    return np.clip(_scaled_blur(full, sigma), 0.0, 1.0).astype(np.float32)


def focus_blur(
    rgba: np.ndarray,
    region: np.ndarray | None = None,
    sigma: float = 12.0,
    invert: bool = False,
    tolerance: float = 0.18,
    spread: float = 3.0,
    feather: float = 2.0,
    edge: float = 0.0,
) -> np.ndarray:
    """
    Blurs the scribbled object — or, inverted, everything except it, which is
    the depth-of-field look: the creator stays sharp and the room falls away.

    No scribble selects nothing, so the image comes back untouched rather than
    uniformly blurred.
    """
    if region is None:
        return rgba.copy()
    mask = select_object(rgba, region, tolerance=tolerance, spread=spread, feather=feather, edge=edge)
    if invert:
        mask = 1.0 - mask
    if sigma <= 0 or not (mask > EPSILON).any():
        return rgba.copy()

    rgb, alpha = split(rgba)
    # Premultiplying is only needed where there is transparency to bleed in, and
    # it doubles the work — a photograph is usually opaque everywhere.
    if float(alpha.min()) >= 1.0 - EPSILON:
        blurred = _scaled_blur(rgb, float(sigma))
    else:
        weight = np.maximum(alpha, EPSILON)[..., None]
        blurred = _scaled_blur(rgb * weight, float(sigma)) / np.maximum(_scaled_blur(weight, float(sigma)), EPSILON)
    blend = mask[..., None]
    return join(rgb * (1.0 - blend) + blurred * blend, alpha)


# ------------------------------------------------------------- dispatch ---


def apply_op(
    rgba: np.ndarray, op: str, params: dict | None = None, region: np.ndarray | None = None
) -> np.ndarray:
    """
    Single entry point, so the worker only has to know operation names.

    `region` is an optional 0..1 mask the size of the image. The matte
    operations use it to confine themselves to a brush stroke; the tonal
    operations ignore it.
    """
    params = params or {}
    if rgba.ndim != 3 or rgba.shape[2] != 4:
        raise ValueError("expected an RGBA image")
    if region is not None and region.shape != rgba.shape[:2]:
        raise ValueError("region must match the image size")

    if op == "auto":
        return auto(rgba, float(params.get("strength", 1.0)))
    if op == "clahe":
        return clahe(
            rgba,
            clip=float(params.get("clip", 2.0)),
            tiles=int(params.get("tiles", 8)),
            amount=float(params.get("amount", 1.0)),
        )
    if op == "white_balance":
        return white_balance(rgba, amount=float(params.get("amount", 1.0)))
    if op == "levels":
        return levels(
            rgba,
            low=float(params.get("low", 0.5)),
            high=float(params.get("high", 99.5)),
            amount=float(params.get("amount", 1.0)),
        )
    if op == "sharpen":
        return sharpen(
            rgba,
            radius=float(params.get("radius", 2.0)),
            amount=float(params.get("amount", 1.0)),
            threshold=float(params.get("threshold", 0.0)),
        )
    if op == "denoise":
        return denoise(rgba, strength=float(params.get("strength", 1.0)), radius=int(params.get("radius", 3)))
    if op == "upscale":
        return upscale(
            rgba,
            factor=float(params.get("factor", 2.0)),
            sharpen_after=float(params.get("sharpen_after", 0.35)),
        )
    if op == "tone":
        return tone(rgba, highlights=float(params.get("highlights", 0.0)), shadows=float(params.get("shadows", 0.0)))
    if op == "temperature":
        return temperature(rgba, temp=float(params.get("temp", 0.0)), tint=float(params.get("tint", 0.0)))
    if op == "despeckle":
        return despeckle(
            rgba,
            min_area=float(params.get("min_area", 64.0)),
            threshold=float(params.get("threshold", 0.5)),
            region=region,
        )
    if op == "defringe":
        return defringe(
            rgba,
            strength=float(params.get("strength", 1.0)),
            radius=float(params.get("radius", 2.0)),
            shrink=float(params.get("shrink", 0.0)),
        )
    if op == "clean_matte":
        return clean_matte(
            rgba,
            min_area=float(params.get("min_area", 64.0)),
            strength=float(params.get("strength", 1.0)),
            radius=float(params.get("radius", 2.0)),
            shrink=float(params.get("shrink", 0.0)),
            threshold=float(params.get("threshold", 0.5)),
            region=region,
        )
    if op == "focus_blur":
        return focus_blur(
            rgba,
            region,
            sigma=float(params.get("sigma", 12.0)),
            invert=bool(params.get("invert", 0)),
            tolerance=float(params.get("tolerance", 0.18)),
            spread=float(params.get("spread", 3.0)),
            feather=float(params.get("feather", 2.0)),
            edge=float(params.get("edge", 0.0)),
        )
    raise ValueError(f"unknown operation: {op}")
