"""
Alpha matting for the background remover.

The segmentation models answer *what* the subject is, at 512-1024 px. This
module answers *where exactly its edge is*, at the photo's own resolution, and
what colour the subject really is along that edge. It is plain numpy, so it
runs unchanged in Pyodide and under desktop CPython (scripts/test_matte.py).

The pipeline:

1. ``trimap`` — fuse the models into three zones: definitely subject,
   definitely background, and an unsure band. The band is wide where the
   models' masks are soft (hair) and thin where they are crisp (a shoulder).
   A person mask, when there is one, vetoes everything far from the person:
   a general-purpose model keeps the chair a person sits in, because the pair
   is the most salient object in the frame.
2. ``solve_alpha`` — inside the unsure band, alpha is decided by colour. An
   iterated colour guided filter (He et al.) fits alpha as a local linear
   function of RGB, then re-pins the known zones, so the certainty at the two
   sides of the band propagates along colour edges — between curls, not across
   them.
3. ``estimate_foreground`` — blur-fusion foreground estimation (Forte & Pitié,
   2021). An edge pixel's colour is a mix of subject and background; solving
   for the subject's share removes the old background's tint from hair, so a
   cut-out does not glow orange on a new backdrop.

Arrays: images are float32 in 0..1 shaped (h, w, 3); masks are float32 (h, w).
"""

from __future__ import annotations

import numpy as np

from enhance import box_blur

try:  # Pillow is loaded in the worker and on desktop; the fallback is numpy.
    from PIL import Image
except ImportError:  # pragma: no cover
    Image = None

EPSILON = 1e-6

# A mask value this close to 0 or 1 is taken at its word.
SURE = 0.04

# The photo counts as a portrait when this much of the person mask lies inside
# the general cut-out and the person is at least this share of it. Otherwise
# the subject is something else (a product, a pet) and the person model is
# ignored.
PERSON_INSIDE = 0.8
PERSON_SHARE = 0.15

# The person model works at 512 px, so its edge is blurry by design. Its veto
# is grown by this share of the short side before it is applied, or it would
# shave off the very hair it is meant to protect.
PERSON_MARGIN = 0.025

# Width of the unsure band around a crisp edge, as a share of the short side.
BAND = 0.006

# Guided filter: window radius as a share of the short side, and the
# regulariser. A smaller eps follows colour more closely (more strands, more
# noise); this value keeps single hairs without inventing them in skin.
GF_RADIUS = 0.004
GF_EPS = 2e-4
GF_ITERATIONS = 1

# The filter is solved at this many pixels on the long side and its
# coefficients are upsampled — He's "fast guided filter". The coefficients are
# smooth, so this costs no visible detail and keeps a 12 MP photo affordable.
GF_WORK_EDGE = 1600

# wide_mean works at a scale where its radius is this many pixels.
WIDE_STEP = 6

# How far, as a share of the short side, an unsure pixel looks for the known
# subject and background colours it is a mix of.
SAMPLE_REACH = 0.02

# Below this RGB distance between the local subject and background colours,
# colour cannot tell them apart and the model's own opinion is kept instead.
SAMPLE_CONTRAST = 0.12

# How much further the search for a known colour goes, each time none is in
# reach, and how many times. Deep inside a mass of curls the nearest pixel the
# models were sure was background can be a long way off.
SAMPLE_WIDEN = 4
SAMPLE_STEPS = 3

# Share of a window that has to be known before its mean colour is trusted.
SAMPLE_FOUND = 0.005


def short_side(shape: tuple[int, ...]) -> int:
    return int(min(shape[0], shape[1]))


def _resize(arr: np.ndarray, shape: tuple[int, int]) -> np.ndarray:
    """
    Bilinear resample of a mask or an image to (height, width). Pillow's C
    resampler does it per channel on float data; the numpy fallback is
    separable — rows on the small side first — so it never gathers four
    full-size copies.
    """
    height, width = arr.shape[:2]
    if (height, width) == tuple(shape):
        return arr.astype(np.float32, copy=False)
    if Image is not None:
        planes = arr[..., None] if arr.ndim == 2 else arr
        out = np.empty(tuple(shape) + (planes.shape[2],), dtype=np.float32)
        for c in range(planes.shape[2]):
            plane = Image.fromarray(np.ascontiguousarray(planes[..., c], dtype=np.float32), mode="F")
            out[..., c] = np.asarray(plane.resize((shape[1], shape[0]), Image.BILINEAR), dtype=np.float32)
        return out[..., 0] if arr.ndim == 2 else out

    def axis(src: np.ndarray, size: int, along: int) -> np.ndarray:
        n = src.shape[along]
        pos = np.clip((np.arange(size, dtype=np.float32) + 0.5) * (n / size) - 0.5, 0, n - 1)
        lo = np.floor(pos).astype(int)
        hi = np.minimum(lo + 1, n - 1)
        frac = (pos - lo).reshape([-1 if i == along else 1 for i in range(src.ndim)])
        return np.take(src, lo, axis=along) * (1 - frac) + np.take(src, hi, axis=along) * frac

    return axis(axis(arr.astype(np.float32), shape[0], 0), shape[1], 1).astype(np.float32)


def _block_mean(arr: np.ndarray, factor: int) -> np.ndarray:
    """Average of each factor×factor block — a cheap, alias-free downsample."""
    height, width = arr.shape[:2]
    h, w = max(1, height // factor), max(1, width // factor)
    trimmed = arr[: h * factor, : w * factor]
    shape = (h, factor, w, factor) + arr.shape[2:]
    return trimmed.reshape(shape).mean(axis=(1, 3), dtype=np.float32)


def wide_mean(arr: np.ndarray, radius: int) -> np.ndarray:
    """
    A box blur for large radii, done on a block-averaged copy and resampled
    back. A mean over a window this wide is smooth by construction, so working
    at 1/factor of the size changes nothing visible — and it is the difference
    between a cut-out in seconds and a cut-out in half a minute under
    WebAssembly, where the full-size cumulative sums dominate.
    """
    factor = int(radius // WIDE_STEP)
    if factor <= 1:
        return box_blur(arr, radius)
    small = box_blur(_block_mean(arr, factor), max(1, int(round(radius / factor))))
    return _resize(small, arr.shape[:2])


def dilate(mask: np.ndarray, radius: int) -> np.ndarray:
    """Binary dilation by a box, via the summed-area blur: O(pixels) at any radius."""
    if radius < 1:
        return mask.astype(bool)
    return box_blur(mask.astype(np.float32), radius) > 1e-4


def erode(mask: np.ndarray, radius: int) -> np.ndarray:
    if radius < 1:
        return mask.astype(bool)
    return box_blur(mask.astype(np.float32), radius) > 1 - 1e-4


def person_is_subject(general: np.ndarray, person: np.ndarray) -> bool:
    """
    True when the person model found someone *inside* what the general model
    cut out, and that someone is a real part of it. The person need not be most
    of it — a whole armchair can outweigh the person sitting in it — but a
    person mask lying outside the cut-out (a face on a poster behind a
    product) or a speck of one does not make the photo a portrait.
    """
    person_area = float(person.sum())
    general_area = float(general.sum())
    if person_area < EPSILON or general_area < EPSILON:
        return False
    inside = float(np.minimum(general, person).sum()) / person_area
    return inside >= PERSON_INSIDE and person_area / general_area >= PERSON_SHARE


def person_zones(general: np.ndarray, person: np.ndarray | None) -> tuple[np.ndarray, np.ndarray] | None:
    """
    (reach, doubtful) for "Person only", or None when there is no person.

    Only the person model's confident core counts: it leaves a faint haze over
    whatever the person touches, and growing that haze would bring the chair
    straight back. Its alpha is never blended in — its 512 px fringe is a halo
    at photo size; the general model keeps the edge. Between the core and the
    edge of the reach (``doubtful``) the general model's certainty is not
    enough: that is where the wall behind the hair and the arm of the chair sit.
    """
    if person is None or not person_is_subject(general, person):
        return None
    margin = max(1, int(round(short_side(general.shape) * PERSON_MARGIN)))
    core = person > 0.5
    reach = dilate(core, margin)
    return reach, reach & ~core


def trimap(general: np.ndarray, person: np.ndarray | None = None) -> tuple[np.ndarray, np.ndarray, np.ndarray]:
    """
    (initial alpha, sure subject, sure background) from the model masks.

    The initial alpha is only a starting point for the unsure band; the two
    sure zones are what the solver is not allowed to change.
    """
    side = short_side(general.shape)
    band = max(1, int(round(side * BAND)))
    alpha = general.astype(np.float32)

    zones = person_zones(general, person)
    if zones is not None:
        reach, doubtful = zones
        alpha = np.where(reach, alpha, 0.0).astype(np.float32)
        far = ~reach
    else:
        far = np.zeros(alpha.shape, dtype=bool)
        doubtful = far

    soft = (alpha > SURE) & (alpha < 1 - SURE)
    # Soft regions of the mask are where hair is; grow the band through them,
    # and give every crisp edge at least a thin band so it can be re-fitted.
    unsure = dilate(soft, band) | (dilate(alpha >= 0.5, band) & dilate(alpha < 0.5, band)) | doubtful
    sure_fg = (alpha >= 1 - SURE) & ~unsure
    sure_bg = ((alpha <= SURE) & ~unsure) | far
    sure_fg &= ~sure_bg
    return alpha, sure_fg, sure_bg


def _guided_coefficients(guide: np.ndarray, p: np.ndarray, radius: int, eps: float) -> tuple[np.ndarray, np.ndarray]:
    """
    Colour guided filter coefficients: p ≈ a·I + b in every window. The 3×3
    covariance inverse is written out by cofactors so it vectorises.
    """
    mean_i = box_blur(guide, radius)
    mean_p = box_blur(p, radius)
    mean_ip = box_blur(guide * p[..., None], radius)
    cov_ip = mean_ip - mean_i * mean_p[..., None]

    def var(c1: int, c2: int) -> np.ndarray:
        return box_blur(guide[..., c1] * guide[..., c2], radius) - mean_i[..., c1] * mean_i[..., c2]

    rr = var(0, 0) + eps
    rg = var(0, 1)
    rb = var(0, 2)
    gg = var(1, 1) + eps
    gb = var(1, 2)
    bb = var(2, 2) + eps

    inv_rr = gg * bb - gb * gb
    inv_rg = gb * rb - rg * bb
    inv_rb = rg * gb - gg * rb
    inv_gg = rr * bb - rb * rb
    inv_gb = rb * rg - rr * gb
    inv_bb = rr * gg - rg * rg
    det = rr * inv_rr + rg * inv_rg + rb * inv_rb
    det = np.where(np.abs(det) < 1e-12, 1e-12, det)

    a = np.empty_like(guide)
    a[..., 0] = (inv_rr * cov_ip[..., 0] + inv_rg * cov_ip[..., 1] + inv_rb * cov_ip[..., 2]) / det
    a[..., 1] = (inv_rg * cov_ip[..., 0] + inv_gg * cov_ip[..., 1] + inv_gb * cov_ip[..., 2]) / det
    a[..., 2] = (inv_rb * cov_ip[..., 0] + inv_gb * cov_ip[..., 1] + inv_bb * cov_ip[..., 2]) / det
    b = mean_p - (a * mean_i).sum(axis=2)
    return box_blur(a, radius), box_blur(b, radius)


def guided_filter(guide: np.ndarray, p: np.ndarray, radius: int, eps: float = GF_EPS) -> np.ndarray:
    """Fast colour guided filter: coefficients solved on a downsample, applied at full size."""
    height, width = p.shape
    scale = min(1.0, GF_WORK_EDGE / float(max(height, width)))
    if scale < 1.0:
        small = (max(1, int(round(height * scale))), max(1, int(round(width * scale))))
        a, b = _guided_coefficients(_resize(guide, small), _resize(p, small), max(1, int(round(radius * scale))), eps)
        a = _resize(a, (height, width))
        b = _resize(b, (height, width))
    else:
        a, b = _guided_coefficients(guide, p, radius, eps)
    return (a * guide).sum(axis=2) + b


def _local_mean(image: np.ndarray, mask: np.ndarray, radius: int) -> tuple[np.ndarray, np.ndarray]:
    """Mean colour of the masked pixels around every pixel, and how many there were."""
    weight = wide_mean(mask.astype(np.float32), radius)
    mean = wide_mean(image * mask[..., None], radius) / (weight[..., None] + EPSILON)
    return mean, weight


def _sample(image: np.ndarray, mask: np.ndarray, radius: int) -> tuple[np.ndarray, np.ndarray]:
    """
    Local mean colour of a known zone, looking further afield where nothing is
    close: the wall behind a mass of curls can be a long way from any pixel
    the models were sure of, and without a sample it would stay subject.
    """
    mean, weight = _local_mean(image, mask, radius)
    found = weight > SAMPLE_FOUND
    for step in range(1, SAMPLE_STEPS):
        if found.all():
            break
        wider, wider_weight = _local_mean(image, mask, radius * SAMPLE_WIDEN**step)
        take = ~found & (wider_weight > SAMPLE_FOUND)
        mean = np.where(take[..., None], wider, mean)
        weight = np.where(take, wider_weight, weight)
        found |= take
    return mean, np.where(found, 1.0, 0.0).astype(np.float32)


def sample_alpha(
    image: np.ndarray, alpha: np.ndarray, sure_fg: np.ndarray, sure_bg: np.ndarray, side: int | None = None
) -> np.ndarray:
    """
    Alpha from colour: every unsure pixel is taken as a mix of the subject and
    background colours known nearby, and its alpha is where it falls on the
    line between them, I = αF + (1-α)B. The pale haze a soft model mask leaves
    over a bright sky matches the background and drops to zero; a dark strand
    matches the hair and stays. Where the two colours are too alike to tell
    apart, or one side has no known pixels in reach, the model's alpha stands.
    """
    radius = max(2, int(round((side or short_side(alpha.shape)) * SAMPLE_REACH)))
    fg, fg_weight = _sample(image, sure_fg, radius)
    bg, bg_weight = _sample(image, sure_bg, radius)
    diff = fg - bg
    spread = (diff * diff).sum(axis=2)
    estimate = np.clip(((image - bg) * diff).sum(axis=2) / (spread + EPSILON), 0.0, 1.0)
    confidence = np.clip(np.sqrt(spread) / SAMPLE_CONTRAST, 0.0, 1.0)
    confidence *= fg_weight * bg_weight
    return (estimate * confidence + alpha * (1 - confidence)).astype(np.float32)


def solve_alpha(
    image: np.ndarray,
    alpha: np.ndarray,
    sure_fg: np.ndarray,
    sure_bg: np.ndarray,
    iterations: int = GF_ITERATIONS,
    eps: float = GF_EPS,
    side: int | None = None,
) -> np.ndarray:
    """
    Alpha inside the unsure band, decided by colour; the sure zones are pinned.
    ``side`` is the photo's short side when ``image`` is a crop of it, so radii
    stay in proportion to the photo rather than to the crop.
    """
    side = side or short_side(alpha.shape)
    radius = max(1, int(round(side * GF_RADIUS)))
    pin = lambda a: np.where(sure_fg, 1.0, np.where(sure_bg, 0.0, a)).astype(np.float32)  # noqa: E731
    current = pin(sample_alpha(image, alpha, sure_fg, sure_bg, side))
    # The colour estimate is per pixel and so carries the photo's noise; the
    # guided filter keeps its edges and smooths that away.
    for _ in range(max(0, iterations)):
        filtered = np.clip(guided_filter(image, current, radius, eps), 0.0, 1.0)
        current = pin(filtered)
    return current


def _fusion_step(
    image: np.ndarray, fg: np.ndarray, bg: np.ndarray, alpha: np.ndarray, radius: int
) -> tuple[np.ndarray, np.ndarray]:
    a = alpha[..., None]
    blurred_a = wide_mean(alpha, radius)[..., None]
    blurred_fg = wide_mean(fg * a, radius) / (blurred_a + EPSILON)
    blurred_bg = wide_mean(bg * (1 - a), radius) / ((1 - blurred_a) + EPSILON)
    fg_out = blurred_fg + a * (image - a * blurred_fg - (1 - a) * blurred_bg)
    return np.clip(fg_out, 0.0, 1.0), blurred_bg


def estimate_foreground(image: np.ndarray, alpha: np.ndarray, side: int | None = None) -> np.ndarray:
    """
    Blur-fusion foreground estimate: a wide pass for the overall colours, then
    a narrow one for detail. Radii follow the paper (90, 6) at ~1 MP and scale
    with the photo.
    """
    scale = (side or short_side(alpha.shape)) / 1000.0
    fg, bg = _fusion_step(image, image, image, alpha, max(1, int(round(90 * scale))))
    fg, _ = _fusion_step(image, fg, bg, alpha, max(1, int(round(6 * scale))))
    return fg


def cutout(rgb: np.ndarray, general: np.ndarray, person: np.ndarray | None = None) -> tuple[np.ndarray, np.ndarray]:
    """(alpha, foreground colour) for a photo, from the model masks at photo size."""
    initial, sure_fg, sure_bg = trimap(general, person)
    alpha = solve_alpha(rgb, initial, sure_fg, sure_bg)
    zones = person_zones(general, person)
    if zones is not None:
        # "Person only" removes; it never adds. In the doubtful zone colour may
        # lower the general model's alpha but not raise it — otherwise the
        # pattern of a chair the model had already dropped comes back in
        # fragments wherever its colours resemble the person's.
        alpha = np.where(zones[1], np.minimum(alpha, initial), alpha).astype(np.float32)
    return alpha, estimate_foreground(rgb, alpha)


def person_info(general: np.ndarray, person: np.ndarray | None) -> dict:
    """
    What the UI needs to offer "Person only": whether the photo is a portrait,
    and how much of the general cut-out lies outside the person — a chair, a
    desk, a second object. Shares are of the general mask's area.
    """
    if person is None:
        return {"person": False, "extra": 0.0}
    if not person_is_subject(general, person):
        return {"person": False, "extra": 0.0}
    margin = max(1, int(round(short_side(general.shape) * PERSON_MARGIN)))
    reach = dilate(person > 0.5, margin)
    total = float(general.sum())
    extra = float(general[~reach].sum()) / total if total > EPSILON else 0.0
    return {"person": True, "extra": round(extra, 4)}


def run(mode: str, rgba: np.ndarray, first: np.ndarray, second: np.ndarray | None = None, options: dict | None = None):
    """
    Entry point for the worker bridge. Masks are uint8 0..255 at image size.

    - ``cutout``: ``first`` is the general model's mask, ``second`` the person
      model's (or None). ``options["person_only"]`` lets the person mask veto.
    - ``refine``: ``first`` is the current alpha, ``second`` the brush stroke.
      The page sends a crop around the stroke; ``options["side"]`` is the full
      photo's short side so the radii match the ones the cut-out used.

    Returns (RGBA uint8 with decontaminated colour, info dict).
    """
    options = options or {}
    rgb = rgba[..., :3].astype(np.float32) / 255.0
    a = first.astype(np.float32) / 255.0
    b = None if second is None else second.astype(np.float32) / 255.0
    if mode == "cutout":
        info = person_info(a, b)
        use_person = bool(options.get("person_only")) and b is not None
        alpha, fg = cutout(rgb, a, b if use_person else None)
        return compose(fg, alpha), info
    if mode == "refine":
        if b is None:
            raise ValueError("refine needs a brush stroke")
        side = int(options.get("side") or 0) or None
        alpha, fg = refine_region(rgb, a, b, side=side)
        return compose(fg, alpha), {}
    raise ValueError(f"unknown matte mode: {mode}")


def refine_margin(side: int) -> int:
    """
    How far past a stroke the refine brush has to see: far enough to find the
    known subject and background colours the colour search reaches for at its
    second step. The page crops this much around a stroke before sending it.
    """
    return int(round(side * SAMPLE_REACH * SAMPLE_WIDEN)) + max(4, int(round(side * BAND)))


def refine_region(
    rgb: np.ndarray, alpha: np.ndarray, region: np.ndarray, eps: float = GF_EPS, side: int | None = None
) -> tuple[np.ndarray, np.ndarray]:
    """
    The refine-hair brush. Inside the stroke nothing is trusted; just outside
    it, the current matte is. Colour then decides the stroke — so painting over
    a curl brings back the strands and leaves the gaps between them clear,
    which a plain restore brush cannot do.

    Work is confined to the stroke's bounding box (grown by the filter's reach)
    so a dab on a 12 MP photo costs a dab, not a whole-image solve.
    """
    stroke = region > 0.5
    if not stroke.any():
        return alpha, estimate_foreground(rgb, alpha)
    side = side or short_side(alpha.shape)
    reach = refine_margin(side)
    ys, xs = np.nonzero(stroke)
    top = max(0, int(ys.min()) - reach)
    bottom = min(alpha.shape[0], int(ys.max()) + reach + 1)
    left = max(0, int(xs.min()) - reach)
    right = min(alpha.shape[1], int(xs.max()) + reach + 1)

    crop_rgb = rgb[top:bottom, left:right]
    crop_alpha = alpha[top:bottom, left:right]
    crop_stroke = stroke[top:bottom, left:right]
    # Where colour has no evidence — the interior of a face, with no known
    # background in reach — the stroke keeps the alpha it had. A neutral seed
    # there would turn a refine dab inside the subject into a half-transparent hole.
    seed = crop_alpha.astype(np.float32)
    sure_fg = ~crop_stroke & (crop_alpha >= 1 - SURE)
    sure_bg = ~crop_stroke & (crop_alpha <= SURE)
    solved = solve_alpha(crop_rgb, seed, sure_fg, sure_bg, eps=eps, side=side)

    out = alpha.astype(np.float32, copy=True)
    out[top:bottom, left:right] = np.where(crop_stroke, solved, crop_alpha)
    return out, estimate_foreground(rgb, out, side)


def compose(rgb: np.ndarray, alpha: np.ndarray) -> np.ndarray:
    """uint8 RGBA from float colour and alpha."""
    out = np.empty(alpha.shape + (4,), dtype=np.uint8)
    out[..., :3] = np.clip(np.rint(rgb * 255.0), 0, 255).astype(np.uint8)
    out[..., 3] = np.clip(np.rint(alpha * 255.0), 0, 255).astype(np.uint8)
    return out
