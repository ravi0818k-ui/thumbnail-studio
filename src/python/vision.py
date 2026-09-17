"""
The vision report: what the rendered pixels say about faces, the subject, the
background, colour combination and edge definition.

This is the pixel half of "Run a test". The other half — the inventory of
objects, logos and text properties — is read from the editor's own scene graph
in TypeScript, because the app *knows* what it drew and guessing it back out of
the pixels would be strictly worse.

What it does and does not claim
-------------------------------
Everything here is classical image processing over numpy: chrominance
thresholding, connected components, spectral saliency, WCAG luminance and HSV
geometry. There is no neural model, which sets two honest limits:

  * Face regions are **candidates** found by skin chrominance and shape, not
    detections from a trained detector, and skin thresholding is known to be
    less reliable at the ends of the skin-tone range. The report says so.
  * Facial *expression* (the joy / sorrow / anger / surprise bars a cloud vision
    API prints) is not derivable this way, and neither is content
    classification. `safety` measures one thing — how much of the frame is
    skin-toned — and is labelled a measurement rather than a verdict. Inventing
    a confidence bar for the rest would be worse than leaving it out.

Runs unchanged under desktop CPython, which is how it is tested, and inside
Pyodide in the browser. numpy only.
"""

from __future__ import annotations

import numpy as np

from enhance import EPSILON, box_blur, label_components
from score import band, palette, ramp, resize, saliency_map, wcag_luma

__all__ = ["inspect", "CHECKS", "HARMONIES"]

#: Every check this module can emit. `engine/thumbnailTest.ts` must carry a
#: label, a reading and a fix for each one; both sides assert on this tuple, so
#: adding a check here fails the suite until the copy exists.
CHECKS = (
    "faces",
    "subject",
    "background",
    "text_backing",
    "harmony",
    "saturation",
    "border",
    "safety",
)

#: Colour relationships `harmony_of` can report, weakest first.
HARMONIES = ("clash", "monochrome", "analogous", "triadic", "complementary")

#: Width the pixel work is done at. Large enough that a headline's edges and a
#: face are still resolved, small enough that the whole report is well under a
#: second in WebAssembly.
WORK_WIDTH = 320

#: Masks and region statistics are computed at the saliency resolution; the
#: spectral residual is a low-frequency method and stops locating anything at
#: full size (see `score.saliency_map`).
MASK_WIDTH = 64

#: A skin-toned component smaller than this share of the frame is noise — a
#: hand, a colour cast on a prop, a JPEG artefact — not a face worth reporting.
FACE_MIN_SHARE = 0.004

#: A face is roughly as wide as it is tall. Outside this, the component is an
#: arm, a torso or a skin-coloured background, so it is reported as skin rather
#: than as a face candidate.
FACE_ASPECT = (0.55, 1.9)

#: A face fills most of its own bounding box. A limb or a background wash does
#: not, which is the cheapest way to tell them apart.
FACE_MIN_FILL = 0.34

#: The page your thumbnail sits on, in both YouTube themes. Relative luminance
#: of #0f0f0f and #f9f9f9 — what the border has to hold its own against.
PAGE_DARK_LUMA = 0.0129
PAGE_LIGHT_LUMA = 0.9473

#: Outer ring of the frame, as a share of the shorter side, used for the edge
#: check. Roughly the band an eye reads as "the edge of the picture".
BORDER_RING = 0.06

#: A hue below this saturation is a grey, a white or a black. Those are the
#: ground a design is built on, not colours competing in the combination, so
#: the harmony geometry ignores them.
CHROMA_MIN_SAT = 0.18

#: A colour under this share of the frame is a detail, not part of the scheme.
SCHEME_MIN_SHARE = 0.04


# ----------------------------------------------------------------- helpers ---


def rgb_to_hsv(rgb: np.ndarray) -> tuple[float, float, float]:
    """One sRGB triple in 0..255 to (hue in degrees, saturation, value)."""
    r, g, b = (float(c) / 255.0 for c in rgb[:3])
    high = max(r, g, b)
    low = min(r, g, b)
    span = high - low
    if span <= EPSILON:
        hue = 0.0
    elif high == r:
        hue = 60.0 * (((g - b) / span) % 6.0)
    elif high == g:
        hue = 60.0 * ((b - r) / span + 2.0)
    else:
        hue = 60.0 * ((r - g) / span + 4.0)
    saturation = 0.0 if high <= EPSILON else span / high
    return hue % 360.0, saturation, high


def hue_gap(a: float, b: float) -> float:
    """Shortest distance between two hues on the wheel, in degrees (0..180)."""
    gap = abs(a - b) % 360.0
    return gap if gap <= 180.0 else 360.0 - gap


def contrast_ratio(a: float, b: float) -> float:
    """WCAG contrast ratio between two relative luminances."""
    high, low = (a, b) if a >= b else (b, a)
    return (high + 0.05) / (low + 0.05)


def _to_hex(rgb) -> str:
    return "#%02x%02x%02x" % tuple(int(np.clip(round(float(c)), 0, 255)) for c in rgb[:3])


def _mask_rect(shape: tuple[int, int], rect: list[float]) -> tuple[int, int, int, int]:
    """Normalised [x, y, w, h] to inclusive-exclusive pixel bounds."""
    height, width = shape
    x0 = int(np.clip(round(rect[0] * width), 0, width - 1))
    y0 = int(np.clip(round(rect[1] * height), 0, height - 1))
    x1 = int(np.clip(round((rect[0] + rect[2]) * width), x0 + 1, width))
    y1 = int(np.clip(round((rect[1] + rect[3]) * height), y0 + 1, height))
    return x0, y0, x1, y1


def check(id: str, score: float | None, value: float | None, **extra) -> dict:
    """One row of the report, in the shape `score.analyze` uses for metrics."""
    return {
        "id": id,
        "score": None if score is None else int(round(float(np.clip(score, 0.0, 100.0)))),
        "value": None if value is None else round(float(value), 4),
        **extra,
    }


# -------------------------------------------------------------------- faces ---


def skin_mask(rgb: np.ndarray) -> np.ndarray:
    """
    Skin-toned pixels, by the two rules that agree most often.

    The chrominance rule (Chai & Ngan) is the reliable half: skin clusters
    tightly in Cb/Cr almost independently of how light or dark the skin is,
    which is why the test is done there and not in RGB. The RGB rule is a
    second opinion that throws out the orange props, wood and skin-coloured
    backgrounds the chrominance box alone lets through.
    """
    r = rgb[..., 0].astype(np.float32)
    g = rgb[..., 1].astype(np.float32)
    b = rgb[..., 2].astype(np.float32)

    cb = 128.0 - 0.168736 * r - 0.331264 * g + 0.5 * b
    cr = 128.0 + 0.5 * r - 0.418688 * g - 0.081312 * b
    chroma = (cb >= 77.0) & (cb <= 127.0) & (cr >= 133.0) & (cr <= 173.0)

    high = np.maximum(np.maximum(r, g), b)
    low = np.minimum(np.minimum(r, g), b)
    rgb_rule = (
        (r > 60.0)
        & (g > 30.0)
        & (b > 15.0)
        & ((high - low) > 12.0)
        & (np.abs(r - g) > 10.0)
        & (r > g)
        & (r > b)
    )
    return chroma & rgb_rule


def face_regions(rgb: np.ndarray) -> tuple[list[dict], float]:
    """
    Skin components, each tagged `face` or `skin`, largest first — plus the
    share of the frame that is skin-toned at all.

    A component is called a face candidate when it is big enough to matter, is
    about as wide as it is tall, and fills its own bounding box. Everything
    else is reported as skin so a torso or a pair of hands is not announced as
    a second face.
    """
    mask = skin_mask(rgb)
    height, width = mask.shape
    area = float(height * width)
    skin_share = float(mask.sum()) / area
    if not mask.any():
        return [], 0.0

    rows, cols, lengths, roots, _sizes = label_components(mask)
    if rows.size == 0:
        return [], skin_share

    regions: list[dict] = []
    ends = cols + lengths
    for root in np.unique(roots):
        runs = roots == root
        pixels = float(lengths[runs].sum())
        share = pixels / area
        if share < FACE_MIN_SHARE:
            continue
        y0 = int(rows[runs].min())
        y1 = int(rows[runs].max()) + 1
        x0 = int(cols[runs].min())
        x1 = int(ends[runs].max())
        box_w = max(1, x1 - x0)
        box_h = max(1, y1 - y0)
        aspect = box_w / box_h
        fill = pixels / float(box_w * box_h)
        is_face = FACE_ASPECT[0] <= aspect <= FACE_ASPECT[1] and fill >= FACE_MIN_FILL
        regions.append(
            {
                "kind": "face" if is_face else "skin",
                "box": [
                    round(x0 / width, 4),
                    round(y0 / height, 4),
                    round(box_w / width, 4),
                    round(box_h / height, 4),
                ],
                "share": round(share, 4),
                "fill": round(fill, 3),
                "aspect": round(aspect, 3),
            }
        )

    regions.sort(key=lambda r: r["share"], reverse=True)
    return regions, skin_share


# --------------------------------------------------- subject vs background ---


def split_subject(salient: np.ndarray) -> np.ndarray:
    """
    The salient half of the frame, as a boolean mask.

    The threshold is the mean of the saliency map rather than a constant: the
    map is normalised per image, so a fixed cut would call a low-contrast
    design all background and a busy one all subject.
    """
    if salient.size == 0:
        return np.zeros_like(salient, dtype=bool)
    return salient >= max(float(salient.mean()), EPSILON)


def region_stats(rgba: np.ndarray, luma: np.ndarray, mask: np.ndarray) -> dict:
    """Mean colour, mean luminance and tonal spread inside a mask."""
    count = int(mask.sum())
    if count == 0:
        return {"hex": "#000000", "luma": 0.0, "spread": 0.0, "share": 0.0}
    pixels = rgba[..., :3][mask]
    values = luma[mask]
    return {
        "hex": _to_hex(pixels.mean(axis=0)),
        "luma": float(values.mean()),
        "spread": float(values.std()),
        "share": count / float(mask.size),
    }


def busyness(luma: np.ndarray) -> float:
    """
    Mean gradient magnitude — how much is going on, in one number.

    Sobel would be the textbook choice; a first difference is the same
    measurement for this purpose and costs a quarter as much, which matters
    when it runs in WebAssembly on every re-test.
    """
    if luma.shape[0] < 2 or luma.shape[1] < 2:
        return 0.0
    dx = np.abs(np.diff(luma, axis=1))
    dy = np.abs(np.diff(luma, axis=0))
    return float((dx.mean() + dy.mean()) * 0.5)


def upsample_mask(mask: np.ndarray, shape: tuple[int, int]) -> np.ndarray:
    """Nearest-neighbour resample of a boolean mask up to `shape`."""
    height, width = shape
    mh, mw = mask.shape
    if mh == height and mw == width:
        return mask
    ys = np.clip(np.arange(height) * mh // max(1, height), 0, mh - 1)
    xs = np.clip(np.arange(width) * mw // max(1, width), 0, mw - 1)
    return mask[ys[:, None], xs[None, :]]


#: Radius the background's high-frequency energy is measured against, as a
#: share of the width. Wide enough that a smooth gradient falls entirely inside
#: the blur and reads as calm, tight enough to keep foliage, brickwork and
#: JPEG mush on the other side of it.
TEXTURE_RADIUS = 0.015


def masked_texture(luma: np.ndarray, mask: np.ndarray) -> float:
    """
    High-frequency energy over the masked pixels — how *textured* the region
    is, which for a background is the thing that matters.

    Three decisions here, two of which were wrong in the first cut:

      * It is a residual against a blur, not a gradient. A mean gradient calls
        a smooth left-to-right ramp as busy as television static, and a
        gradient is a perfectly good thumbnail background.
      * The residual is taken over the whole picture and the mask applied
        *afterwards*. Zeroing the other region first draws a hard edge along
        the mask boundary, and that edge — not the background — then dominates.
      * It is measured at the working resolution, not at the mask's own 64 px,
        because area-averaging down to 64 px removes exactly the fine texture
        this check exists to find.
    """
    if luma.shape[0] < 3 or luma.shape[1] < 3:
        return 0.0
    radius = max(1, int(round(luma.shape[1] * TEXTURE_RADIUS)))
    residual = luma - box_blur(luma, radius)
    selected = upsample_mask(mask, luma.shape)
    if not selected.any():
        return float(residual.std())
    return float(residual[selected].std())


def text_backing(luma: np.ndarray, regions: list[list[float]]) -> list[dict]:
    """
    How restless the picture is behind each headline, worst first.

    The text itself is in these pixels and its own edges would dominate a
    gradient reading, so the image is blurred first: at this radius the letters
    smear away and what is left is the variation of the *backing* — the thing
    that decides whether type needs a plate behind it.
    """
    if not regions:
        return []
    blurred = box_blur(luma, max(1, int(round(luma.shape[1] * 0.02))))
    out: list[dict] = []
    for rect in regions:
        x0, y0, x1, y1 = _mask_rect(blurred.shape, rect)
        patch = blurred[y0:y1, x0:x1]
        if patch.size < 4:
            continue
        out.append(
            {
                "box": [round(v, 4) for v in rect],
                "variation": round(float(patch.std()), 4),
                "busyness": round(busyness(patch), 4),
            }
        )
    out.sort(key=lambda r: r["variation"], reverse=True)
    return out


def border_contrast(luma: np.ndarray) -> tuple[float, float, float]:
    """
    Contrast between the frame's outer ring and the page behind it, in both
    themes, plus the ring's own luminance.

    A thumbnail whose edge matches the page loses its shape: the card stops
    reading as a picture and starts reading as part of the background. The
    weaker of the two themes is the one that decides it, because you do not get
    to choose which one the viewer is using.
    """
    height, width = luma.shape
    ring = max(1, int(round(min(height, width) * BORDER_RING)))
    mask = np.zeros((height, width), dtype=bool)
    mask[:ring, :] = True
    mask[-ring:, :] = True
    mask[:, :ring] = True
    mask[:, -ring:] = True
    edge = float(luma[mask].mean())
    return (
        contrast_ratio(edge, PAGE_DARK_LUMA),
        contrast_ratio(edge, PAGE_LIGHT_LUMA),
        edge,
    )


# ------------------------------------------------------------------ colour ---


def harmony_of(hues: list[float]) -> str:
    """
    The colour relationship the scheme is closest to.

    Tested in order of how demanding each shape is, because a set can satisfy
    more than one and the most specific reading is the informative one. The
    tolerances are the ones colour theory is taught with: a complement is
    180° apart, a triad 120°, and analogous colours sit inside one 60° span.
    """
    if len(hues) <= 1:
        return "monochrome"
    if len(hues) >= 3:
        triad = sorted(hues[:3])
        gaps = sorted(
            [hue_gap(triad[0], triad[1]), hue_gap(triad[1], triad[2]), hue_gap(triad[0], triad[2])]
        )
        if all(abs(gap - 120.0) <= 30.0 for gap in gaps[:2]) and gaps[2] >= 90.0:
            return "triadic"
    pairs = [hue_gap(a, b) for i, a in enumerate(hues) for b in hues[i + 1 :]]
    if any(abs(gap - 180.0) <= 30.0 for gap in pairs):
        return "complementary"
    if all(gap <= 60.0 for gap in pairs):
        return "analogous"
    return "clash"


def harmony_score(harmony: str, competing: int, accent_share: float) -> float:
    """
    How well the combination will hold up at thumbnail size.

    Complementary scores highest because separating a subject from its
    background is the whole job and opposite hues do it without relying on
    brightness. Analogous and triadic are sound but need the designer to supply
    the contrast elsewhere. Monochrome is safe and quiet. A clash is not
    "wrong" — it is unpredictable, which at 168 px is the same problem.
    """
    base = {
        "complementary": 92.0,
        "triadic": 82.0,
        "analogous": 78.0,
        "monochrome": 70.0,
        "clash": 42.0,
    }[harmony]
    # More than three colours fighting is the single most common way a
    # thumbnail palette fails, so it costs more than the relationship earns.
    crowding = max(0, competing - 3) * 14.0
    # One small, strong accent is what a highlighted keyword needs to exist.
    accent = band(accent_share, 0.02, 0.22, 0.2) * 0.12
    return float(np.clip(base - crowding + accent, 0.0, 100.0))


def color_report(colours: list[dict]) -> dict:
    """Palette geometry: hues, the relationship, and what competes with what."""
    entries = []
    for colour in colours:
        rgb = np.array(
            [int(colour["hex"][i : i + 2], 16) for i in (1, 3, 5)],
            dtype=np.float32,
        )
        hue, saturation, value = rgb_to_hsv(rgb)
        entries.append(
            {
                "hex": colour["hex"],
                "share": round(float(colour["share"]), 4),
                "hue": round(hue, 1),
                "saturation": round(saturation, 3),
                "value": round(value, 3),
            }
        )

    scheme = [
        e for e in entries if e["saturation"] >= CHROMA_MIN_SAT and e["share"] >= SCHEME_MIN_SHARE
    ]
    hues = [e["hue"] for e in scheme]
    harmony = harmony_of(hues)
    competing = len(scheme)
    # The accent is the most saturated colour that is not carrying the frame.
    accents = [e for e in scheme[1:]] or scheme
    accent = max(accents, key=lambda e: e["saturation"]) if accents else None
    accent_share = float(accent["share"]) if accent else 0.0
    saturation = float(np.mean([e["saturation"] for e in entries])) if entries else 0.0

    return {
        "palette": entries,
        "harmony": harmony,
        "hues": [round(h, 1) for h in hues],
        "competing": competing,
        "accent": accent["hex"] if accent else None,
        "accent_share": round(accent_share, 4),
        "saturation": round(saturation, 3),
        "score": round(harmony_score(harmony, competing, accent_share), 1),
    }


# -------------------------------------------------------------- the report ---


def inspect(
    rgba: np.ndarray,
    regions: list[list[float]] | None = None,
) -> dict:
    """
    Run the full pixel report. `regions` are normalised text boxes from the
    editor, used to measure the backing behind the words.

    Returns plain data: ids, scores and raw values. Every label, reading and
    piece of advice is written on the TypeScript side, exactly as with
    `score.analyze`.
    """
    if rgba.ndim != 3 or rgba.shape[2] != 4:
        raise ValueError("expected an RGBA image")
    regions = regions or []

    work = resize(rgba, WORK_WIDTH)
    work_luma = wcag_luma(work)
    tiny = resize(work, MASK_WIDTH)
    tiny_luma = wcag_luma(tiny)

    salient = saliency_map(tiny_luma)
    subject_mask = split_subject(salient)
    subject = region_stats(tiny, tiny_luma, subject_mask)
    background = region_stats(tiny, tiny_luma, ~subject_mask)

    faces, skin_share = face_regions(work[..., :3])
    face_count = sum(1 for r in faces if r["kind"] == "face")
    biggest_face = next((r for r in faces if r["kind"] == "face"), None)

    colours = palette(work)
    colour = color_report(colours)

    backing = text_backing(work_luma, regions)
    worst_backing = backing[0]["variation"] if backing else None

    separation = contrast_ratio(subject["luma"], background["luma"])
    background_texture = masked_texture(work_luma, ~subject_mask)
    dark_ratio, light_ratio, edge_luma = border_contrast(work_luma)
    weaker_edge = min(dark_ratio, light_ratio)

    checks = [
        # A face is the strongest single signal a thumbnail can carry, and the
        # usual failure is that it is there but too small to read at 168 px.
        check(
            "faces",
            None if biggest_face is None else ramp(biggest_face["share"], 0.015, 0.09),
            None if biggest_face is None else biggest_face["share"],
            count=face_count,
            skin=round(skin_share, 4),
        ),
        # 3:1 is the WCAG threshold for large graphics; a subject that does not
        # clear it against its own background has no silhouette.
        check("subject", ramp(separation, 1.4, 4.5), separation, subject_share=round(subject["share"], 4)),
        # Downhill: a calm background is a good background.
        check(
            "background",
            ramp(-background_texture, -0.050, -0.006),
            background_texture,
            hex=background["hex"],
            spread=round(background["spread"], 4),
        ),
        check(
            "text_backing",
            None if worst_backing is None else ramp(-worst_backing, -0.22, -0.04),
            worst_backing,
            boxes=len(backing),
        ),
        check(
            "harmony",
            colour["score"],
            colour["accent_share"],
            harmony=colour["harmony"],
            competing=colour["competing"],
        ),
        # Both ends are a real failure: a washed-out frame has no punch, and a
        # fully saturated one vibrates and loses its own accent.
        check("saturation", band(colour["saturation"], 0.25, 0.68, 0.3), colour["saturation"]),
        check(
            "border",
            ramp(weaker_edge, 1.15, 2.6),
            weaker_edge,
            dark=round(dark_ratio, 2),
            light=round(light_ratio, 2),
            luma=round(edge_luma, 4),
        ),
        # Not a content classification — see the module docstring. This is the
        # skin-toned share of the frame and nothing more.
        check("safety", ramp(-skin_share, -0.62, -0.42), skin_share),
    ]

    return {
        "width": int(rgba.shape[1]),
        "height": int(rgba.shape[0]),
        "faces": faces,
        "subject": {
            "hex": subject["hex"],
            "luma": round(subject["luma"], 4),
            "share": round(subject["share"], 4),
            "spread": round(subject["spread"], 4),
        },
        "background": {
            "hex": background["hex"],
            "luma": round(background["luma"], 4),
            "share": round(background["share"], 4),
            "spread": round(background["spread"], 4),
            "texture": round(background_texture, 4),
        },
        "color": colour,
        "text_backing": backing,
        "checks": checks,
    }
