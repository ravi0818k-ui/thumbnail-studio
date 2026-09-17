"""
Thumbnail scoring: what the rendered pixels say about how this design will
perform, measured separately for desktop and for mobile.

This is the same idea as a vision API's image-properties analysis — dominant
colours, tonal range, sharpness, where the eye lands — with two differences
that matter for thumbnails:

  * It is run at the size each platform actually shows, not at 1280 px. Almost
    every failure is a failure of *scale*: a design that reads at full size and
    turns to mush at 168.
  * It is handed the text boxes from the editor, so it can measure contrast
    where the words actually are instead of trying to find them with OCR.

Desktop is scored at 360 px (the home-page grid) and mobile at 168 px. A 360 px
card on a phone held at reading distance subtends roughly the same angle as a
168 px card on a desktop monitor at arm's length, so the smaller number is the
honest simulation of a phone, not a pessimistic one.

Runs unchanged under desktop CPython, which is how it is tested, and inside
Pyodide in the browser. numpy only; Pillow is used for resampling when present.
"""

from __future__ import annotations

import numpy as np

from enhance import EPSILON, box_blur, luminance, srgb_to_linear, _resize_bilinear

__all__ = ["analyze", "PLATFORMS", "WEIGHTS", "METRICS"]

#: (id, width in CSS pixels) each platform is judged at.
PLATFORMS = (("desktop", 360), ("mobile", 168))

#: Reference width everything is measured against.
BASE_WIDTH = 640

#: Spectral residual saliency is a low-frequency method and the original paper
#: computes it on a downsampled image; at full size the residual turns into
#: ringing spread over the whole frame and stops locating anything.
SALIENCY_WIDTH = 64

METRICS = ("text", "detail", "focus", "palette", "range", "sharpness", "occlusion")

#: What matters where. Mobile leans on legibility and on surviving the
#: downscale; desktop can afford composition and colour.
WEIGHTS = {
    "desktop": {
        "text": 0.20,
        "detail": 0.05,
        "focus": 0.20,
        "palette": 0.15,
        "range": 0.20,
        "sharpness": 0.10,
        "occlusion": 0.10,
    },
    "mobile": {
        "text": 0.30,
        "detail": 0.25,
        "focus": 0.15,
        "palette": 0.10,
        "range": 0.10,
        "sharpness": 0.05,
        "occlusion": 0.05,
    },
}


# ----------------------------------------------------------------- helpers ---


def ramp(value: float, low: float, high: float) -> float:
    """0 at `low`, 100 at `high`, linear between, clipped outside."""
    if high == low:
        return 100.0
    return float(np.clip((value - low) / (high - low), 0.0, 1.0) * 100.0)


def band(value: float, low: float, high: float, spread: float) -> float:
    """100 inside [low, high], falling to 0 `spread` beyond either end."""
    if low <= value <= high:
        return 100.0
    distance = low - value if value < low else value - high
    return float(max(0.0, 1.0 - distance / max(spread, EPSILON)) * 100.0)


def wcag_luma(rgba: np.ndarray) -> np.ndarray:
    """Relative luminance in 0..1 — the quantity contrast ratios are built on."""
    return luminance(srgb_to_linear(rgba[..., :3].astype(np.float32) / 255.0))


def resize(rgba: np.ndarray, width: int) -> np.ndarray:
    height, source_width = rgba.shape[:2]
    target_w = max(1, int(round(width)))
    target_h = max(1, int(round(height * target_w / source_width)))
    if target_w == source_width and target_h == height:
        return rgba
    try:
        from PIL import Image

        # Area average, because that is what shrinking in a browser does. A
        # sharper filter would flatter the design and hide exactly the detail
        # loss this is here to measure.
        return np.asarray(Image.fromarray(rgba, "RGBA").resize((target_w, target_h), Image.BOX))
    except Exception:
        return _resize_bilinear(rgba, (target_w, target_h))


def saliency_map(gray: np.ndarray) -> np.ndarray:
    """
    Spectral residual saliency (Hou & Zhang, 2007): whatever is left of the
    log-amplitude spectrum once the statistically ordinary part is averaged out
    is the part of the image that stands out. Cheap, model-free, and good
    enough to answer "is there one clear focal point or is this a jumble".
    """
    spectrum = np.fft.fft2(gray)
    log_amplitude = np.log(np.abs(spectrum) + EPSILON)
    phase = np.angle(spectrum)
    residual = log_amplitude - box_blur(log_amplitude, 1)
    reconstructed = np.fft.ifft2(np.exp(residual + 1j * phase))
    salient = box_blur(np.abs(reconstructed) ** 2, 3)
    peak = float(salient.max())
    return salient / peak if peak > 0 else salient


def _crop(image: np.ndarray, rect: list[float]) -> np.ndarray | None:
    """Normalised [x, y, w, h] to a pixel patch, or None if it is too small."""
    height, width = image.shape[:2]
    x0 = int(np.clip(round(rect[0] * width), 0, width - 1))
    y0 = int(np.clip(round(rect[1] * height), 0, height - 1))
    x1 = int(np.clip(round((rect[0] + rect[2]) * width), x0 + 1, width))
    y1 = int(np.clip(round((rect[1] + rect[3]) * height), y0 + 1, height))
    patch = image[y0:y1, x0:x1]
    return patch if patch.size >= 4 else None


# ----------------------------------------------------------------- metrics ---


def text_contrast(rgba: np.ndarray, regions: list[list[float]]) -> float | None:
    """
    Worst contrast ratio between a text layer's ink and its own background,
    measured after the image has been shrunk to the platform's size — which is
    where thin type melts into the picture behind it.
    """
    ratios: list[float] = []
    lum = wcag_luma(rgba)
    for rect in regions:
        patch = _crop(lum, rect)
        if patch is None:
            continue
        # Percentiles rather than min/max: one stray pixel should not decide it,
        # and this reads the same for light-on-dark and dark-on-light.
        high = float(np.percentile(patch, 92))
        low = float(np.percentile(patch, 8))
        ratios.append((high + 0.05) / (low + 0.05))
    return min(ratios) if ratios else None


def detail_retention(reference_luma: np.ndarray, rgba: np.ndarray, width: int) -> float:
    """
    How much of the design survives the trip down to `width` and back. Small
    type, thin outlines and fine texture are what disappear.
    """
    shrunk = resize(rgba, width)
    restored = resize(shrunk, reference_luma.shape[1])
    restored_luma = wcag_luma(restored)
    if restored_luma.shape != reference_luma.shape:
        restored_luma = _resize_bilinear(
            np.repeat((restored_luma * 255).astype(np.uint8)[..., None], 4, axis=2),
            (reference_luma.shape[1], reference_luma.shape[0]),
        )[..., 0].astype(np.float32) / 255.0
    return float(np.mean(np.abs(reference_luma - restored_luma)))


#: A frame with nothing to look at needs half its area to hold half the
#: attention, which is the worst this measure can report.
NO_FOCUS = 0.5


def focus_area(salient: np.ndarray) -> tuple[float, float, float]:
    """
    The share of the frame needed to hold half of all the attention, and where
    that attention's centre of mass sits. Smaller is better.

    Two other formulations were tried and thrown away. Share-of-attention in
    the busiest tenth does not separate one subject from sixty — both put their
    energy on edges. Spatial spread does separate them, but it punishes the
    standard thumbnail layout of subject on one side and headline on the other,
    which is two focal points on purpose and perfectly good design. This one
    reads one subject at 0.06, that two-zone layout at 0.09, a cluttered frame
    at 0.27 and noise at 0.41, which is the ranking a designer would give.
    """
    total = float(salient.sum())
    if total <= 0:
        return NO_FOCUS, 0.5, 0.5
    ordered = np.sort(salient.reshape(-1))[::-1]
    cumulative = np.cumsum(ordered)
    needed = int(np.searchsorted(cumulative, total * 0.5)) + 1

    height, width = salient.shape
    ys, xs = np.mgrid[0:height, 0:width]
    cx = float((salient * xs).sum() / total) / max(1, width - 1)
    cy = float((salient * ys).sum() / total) / max(1, height - 1)
    return needed / ordered.size, cx, cy


def palette(rgba: np.ndarray, count: int = 5) -> list[dict]:
    """
    Dominant colours by pixel share — the same reading a vision API's image
    properties gives. Pixels are bucketed at 4 bits per channel and each
    reported colour is the true mean of its bucket, so the hex is a colour that
    is actually in the image rather than a quantised approximation.
    """
    pixels = rgba[..., :3].reshape(-1, 3).astype(np.int32)
    keys = (pixels[:, 0] >> 4) * 256 + (pixels[:, 1] >> 4) * 16 + (pixels[:, 2] >> 4)
    counts = np.bincount(keys, minlength=4096)
    order = np.argsort(counts)[::-1][:count]
    total = float(pixels.shape[0])
    out: list[dict] = []
    for bucket in order.tolist():
        if counts[bucket] == 0:
            continue
        mean = pixels[keys == bucket].mean(axis=0)
        out.append(
            {
                "hex": "#%02x%02x%02x" % tuple(int(round(c)) for c in mean),
                "share": float(counts[bucket] / total),
            }
        )
    return out


def palette_score(shares: list[float]) -> float:
    """
    A thumbnail wants a clear colour hierarchy: one colour owning a good part of
    the frame, and few colours competing with it. Both a single flat wash and a
    confetti of equal colours read badly at 168 px.
    """
    if not shares:
        return 0.0
    dominant = band(shares[0], 0.22, 0.62, 0.3)
    competing = sum(1 for s in shares if s >= 0.08)
    return float(dominant * 0.6 + ramp(-competing, -5.0, -2.0) * 0.4)


def tonal_range(lum: np.ndarray) -> float:
    """Spread between the near-darkest and near-brightest tones."""
    return float(np.percentile(lum, 95) - np.percentile(lum, 5))


def sharpness(lum: np.ndarray) -> float:
    """
    Laplacian energy: the standard blur detector. Reported as a standard
    deviation so the number is comparable between images of different sizes.
    """
    lap = (
        lum[1:-1, 2:] + lum[1:-1, :-2] + lum[2:, 1:-1] + lum[:-2, 1:-1] - 4.0 * lum[1:-1, 1:-1]
    )
    return float(lap.std()) if lap.size else 0.0


def occlusion_share(salient: np.ndarray, rects: list[list[float]]) -> float:
    """How much of the design's attention sits where the app draws its own UI."""
    total = float(salient.sum())
    if total <= 0 or not rects:
        return 0.0
    covered = np.zeros(salient.shape, dtype=bool)
    for rect in rects:
        height, width = salient.shape
        x0 = int(np.clip(round(rect[0] * width), 0, width))
        y0 = int(np.clip(round(rect[1] * height), 0, height))
        x1 = int(np.clip(round((rect[0] + rect[2]) * width), x0, width))
        y1 = int(np.clip(round((rect[1] + rect[3]) * height), y0, height))
        covered[y0:y1, x0:x1] = True
    return float(salient[covered].sum() / total)


# -------------------------------------------------------------- the report ---


def _weighted(scores: dict[str, float | None], weights: dict[str, float]) -> float:
    """Missing metrics drop out and the rest are renormalised, never zeroed."""
    total = 0.0
    used = 0.0
    for key, weight in weights.items():
        value = scores.get(key)
        if value is None:
            continue
        total += value * weight
        used += weight
    return round(total / used) if used > 0 else 0


def analyze(
    rgba: np.ndarray,
    regions: list[list[float]] | None = None,
    occlusion: dict[str, list[list[float]]] | None = None,
) -> dict:
    """
    Score a rendered thumbnail. `regions` are normalised text boxes from the
    editor; `occlusion` maps a platform id to the normalised rectangles its
    interface covers. Returns plain data — every label and every piece of
    advice is written on the TypeScript side.
    """
    if rgba.ndim != 3 or rgba.shape[2] != 4:
        raise ValueError("expected an RGBA image")
    regions = regions or []
    occlusion = occlusion or {}

    reference = resize(rgba, BASE_WIDTH)
    reference_luma = wcag_luma(reference)
    colours = palette(reference)

    platforms = []
    for name, width in PLATFORMS:
        small = resize(rgba, width)
        small_luma = wcag_luma(small)
        salient = saliency_map(wcag_luma(resize(small, SALIENCY_WIDTH)))
        attention_area, cx, cy = focus_area(salient)

        ratio = text_contrast(small, regions)
        loss = detail_retention(reference_luma, rgba, width)
        spread = tonal_range(small_luma)
        edge = sharpness(small_luma)
        covered = occlusion_share(salient, occlusion.get(name, []))

        scores: dict[str, float | None] = {
            # 4.5:1 is the readable floor; 7:1 is what a strong thumbnail has.
            "text": None if ratio is None else ramp(ratio, 2.0, 7.0),
            "detail": ramp(-loss, -0.10, -0.02),
            # Tighter is better, so the ramp runs downhill.
            "focus": ramp(-attention_area, -0.30, -0.08),
            "palette": palette_score([c["share"] for c in colours]),
            "range": ramp(spread, 0.25, 0.70),
            "sharpness": ramp(edge, 0.010, 0.055),
            "occlusion": ramp(-covered, -0.35, -0.05),
        }
        values = {
            "text": ratio,
            "detail": loss,
            "focus": attention_area,
            "palette": colours[0]["share"] if colours else 0.0,
            "range": spread,
            "sharpness": edge,
            "occlusion": covered,
        }

        platforms.append(
            {
                "id": name,
                "width": width,
                "score": _weighted(scores, WEIGHTS[name]),
                "focus": {"x": round(cx, 3), "y": round(cy, 3)},
                "metrics": [
                    {
                        "id": key,
                        "score": None if scores[key] is None else round(scores[key]),
                        "value": None if values[key] is None else round(float(values[key]), 4),
                    }
                    for key in METRICS
                ],
            }
        )

    return {
        "width": int(rgba.shape[1]),
        "height": int(rgba.shape[0]),
        "palette": colours,
        "platforms": platforms,
    }
