"""
Tests for src/python/score.py under desktop CPython.

The scorer has to do more than run: a good thumbnail must out-score a bad one
on the metric that describes the difference. Every check here is a pair —
something designed to pass against something designed to fail — because an
absolute number from an image metric means nothing on its own.

Run with `npm run selftest` (invoked automatically) or directly:
    python scripts/test_score.py
"""

from __future__ import annotations

import sys
from pathlib import Path

import numpy as np

sys.path.insert(0, str(Path(__file__).resolve().parent.parent / "src" / "python"))

import score  # noqa: E402

FAILURES = 0


def check(name: str, condition: bool, detail: str = "") -> None:
    global FAILURES
    if condition:
        print(f"  ok   {name}")
    else:
        FAILURES += 1
        print(f"  FAIL {name}{' — ' + detail if detail else ''}")


def canvas(width: int = 640, height: int = 360, colour=(20, 24, 32)) -> np.ndarray:
    img = np.zeros((height, width, 4), dtype=np.uint8)
    img[..., :3] = colour
    img[..., 3] = 255
    return img


def block(img: np.ndarray, rect, colour) -> np.ndarray:
    x, y, w, h = rect
    height, width = img.shape[:2]
    x0, y0 = int(x * width), int(y * height)
    img[y0 : y0 + int(h * height), x0 : x0 + int(w * width), :3] = colour
    return img


def bars(img: np.ndarray, rect, colour, thickness: int, gap: int) -> np.ndarray:
    """Stand-in for text: a run of strokes, so it survives or dies on scale."""
    x, y, w, h = rect
    height, width = img.shape[:2]
    x0, y0 = int(x * width), int(y * height)
    x1, y1 = x0 + int(w * width), y0 + int(h * height)
    for bar in range(x0, x1, thickness + gap):
        img[y0:y1, bar : bar + thickness, :3] = colour
    return img


print("python: ramps")
check("ramp is 0 at the floor", score.ramp(1.0, 1.0, 5.0) == 0)
check("ramp is 100 at the ceiling", score.ramp(5.0, 1.0, 5.0) == 100)
check("ramp clips below", score.ramp(-4.0, 1.0, 5.0) == 0)
check("ramp clips above", score.ramp(99.0, 1.0, 5.0) == 100)
check("ramp is linear in between", abs(score.ramp(3.0, 1.0, 5.0) - 50) < 1e-6)
check("ramp survives a degenerate range", score.ramp(2.0, 1.0, 1.0) == 100)
check("band is 100 inside", score.band(0.4, 0.2, 0.6, 0.3) == 100)
check("band falls off outside", 0 < score.band(0.75, 0.2, 0.6, 0.3) < 100)
check("band bottoms out", score.band(1.0, 0.2, 0.6, 0.3) == 0)

print("python: contrast")
# Strokes with gaps, because a real text box contains ink *and* the ground
# behind it — a region of one flat colour has no contrast to measure.
white_on_black = bars(canvas(colour=(0, 0, 0)), (0.1, 0.3, 0.6, 0.3), (255, 255, 255), 12, 10)
grey_on_grey = bars(canvas(colour=(110, 110, 110)), (0.1, 0.3, 0.6, 0.3), (140, 140, 140), 12, 10)
region = [[0.1, 0.3, 0.6, 0.3]]
high = score.text_contrast(white_on_black, region)
low = score.text_contrast(grey_on_grey, region)
check("white on black is near the maximum ratio", high > 15, str(high))
check("grey on grey barely registers", low < 1.6, str(low))
check("contrast is ranked correctly", high > low * 5)
check("no text regions means no reading", score.text_contrast(white_on_black, []) is None)
check("a sub-pixel region is skipped", score.text_contrast(white_on_black, [[0.5, 0.5, 0.0001, 0.0001]]) is None)
flat_region = block(canvas(colour=(0, 0, 0)), (0.1, 0.3, 0.6, 0.3), (255, 255, 255))
check("a region of one flat colour reports no contrast", score.text_contrast(flat_region, region) < 1.01)

print("python: detail retention")
reference = score.wcag_luma(score.resize(canvas(), score.BASE_WIDTH))
chunky = block(canvas(), (0.1, 0.2, 0.5, 0.5), (255, 220, 0))
busy = bars(canvas(), (0.05, 0.1, 0.9, 0.8), (255, 220, 0), 1, 1)
chunky_loss = score.detail_retention(score.wcag_luma(score.resize(chunky, score.BASE_WIDTH)), chunky, 168)
busy_loss = score.detail_retention(score.wcag_luma(score.resize(busy, score.BASE_WIDTH)), busy, 168)
check("fine detail is lost at mobile size", busy_loss > chunky_loss * 3, f"{busy_loss:.4f} vs {chunky_loss:.4f}")
check("a big shape survives the shrink", chunky_loss < 0.02, str(chunky_loss))
check("desktop loses less than mobile", score.detail_retention(reference, busy, 360) < busy_loss)

print("python: saliency")
one_subject = block(canvas(), (0.6, 0.25, 0.25, 0.5), (255, 255, 255))
scattered = canvas()
rng = np.random.default_rng(3)
for _ in range(60):
    x, y = rng.random() * 0.9, rng.random() * 0.9
    scattered = block(scattered, (x, y, 0.06, 0.09), (255, 255, 255))
def attention(img):
    return score.focus_area(score.saliency_map(score.wcag_luma(score.resize(img, score.SALIENCY_WIDTH))))


two_zones = bars(block(canvas(colour=(14, 18, 26)), (0.55, 0.1, 0.4, 0.85), (235, 200, 170)),
                 (0.05, 0.3, 0.42, 0.3), (255, 255, 255), 14, 8)
area_one, cx, _ = attention(one_subject)
area_many, _, _ = attention(scattered)
area_two, _, _ = attention(two_zones)
check("one subject holds attention in one place", area_one < 0.12, f"{area_one:.3f}")
check("a cluttered design scatters it", area_many > area_one * 2.5, f"{area_many:.3f} vs {area_one:.3f}")
# Subject on one side, headline on the other, is good design, not clutter.
check("the two-zone layout is not punished", area_two < area_many / 2, f"{area_two:.3f} vs {area_many:.3f}")
check("the focal point is found on the right", cx > 0.5, str(cx))
check("a frame with nothing in it has no focus", score.focus_area(np.zeros((8, 8), np.float32))[0] == score.NO_FOCUS)
check("a flat frame needs half the area", attention(canvas(colour=(120, 120, 120)))[0] >= 0.45)

print("python: palette")
two_tone = block(canvas(colour=(16, 20, 28)), (0.0, 0.0, 0.35, 1.0), (255, 210, 0))
colours = score.palette(two_tone)
check("the dominant colour is found", colours[0]["share"] > 0.6, str(colours[0]))
check("the second colour is the accent", any(c["share"] > 0.3 for c in colours[1:]), str(colours))
check("hex values are well formed", all(len(c["hex"]) == 7 and c["hex"][0] == "#" for c in colours))
check("shares never exceed the frame", sum(c["share"] for c in colours) <= 1.0001)
check("a clear hierarchy scores well", score.palette_score([0.45, 0.3, 0.2, 0.03, 0.02]) > 70)
check("a flat wash scores badly", score.palette_score([0.98, 0.01, 0.01]) < 45)
check("confetti scores badly", score.palette_score([0.2, 0.2, 0.2, 0.2, 0.2]) < 70)
check("an empty palette is survivable", score.palette_score([]) == 0)

print("python: range and sharpness")
flat = canvas(colour=(128, 128, 128))
punchy = block(canvas(colour=(8, 8, 8)), (0.2, 0.2, 0.6, 0.6), (250, 250, 250))
check("a flat frame has no range", score.tonal_range(score.wcag_luma(flat)) < 0.01)
check("a punchy frame has range", score.tonal_range(score.wcag_luma(punchy)) > 0.7)
sharp_edges = score.sharpness(score.wcag_luma(punchy))
soft = score.resize(score.resize(punchy, 40), 640)
check("a blurred frame measures softer", score.sharpness(score.wcag_luma(soft)) < sharp_edges)

print("python: occlusion")
corner = block(canvas(), (0.75, 0.75, 0.25, 0.25), (255, 255, 255))
salient = score.saliency_map(score.wcag_luma(corner))
covered = score.occlusion_share(salient, [[0.7, 0.7, 0.3, 0.3]])
clear = score.occlusion_share(salient, [[0.0, 0.0, 0.2, 0.2]])
check("attention under the UI is counted", covered > clear * 3, f"{covered:.3f} vs {clear:.3f}")
check("no rectangles means nothing covered", score.occlusion_share(salient, []) == 0.0)

print("python: the report")
good = block(canvas(colour=(14, 18, 26)), (0.55, 0.1, 0.4, 0.85), (235, 200, 170))
good = bars(good, (0.05, 0.3, 0.42, 0.3), (255, 255, 255), 14, 8)
bad = bars(canvas(colour=(120, 118, 116)), (0.05, 0.3, 0.6, 0.12), (150, 148, 146), 1, 1)
text_region = [[0.05, 0.3, 0.42, 0.3]]
good_report = score.analyze(good, text_region)
bad_report = score.analyze(bad, [[0.05, 0.3, 0.6, 0.12]])

check("both platforms are reported", [p["id"] for p in good_report["platforms"]] == ["desktop", "mobile"])
check("scores are whole numbers in range", all(0 <= p["score"] <= 100 for p in good_report["platforms"]))
check("every metric is present", all(len(p["metrics"]) == len(score.METRICS) for p in good_report["platforms"]))
check(
    "a clear design out-scores a mushy one",
    good_report["platforms"][1]["score"] > bad_report["platforms"][1]["score"] + 15,
    f"{good_report['platforms'][1]['score']} vs {bad_report['platforms'][1]['score']}",
)
check(
    "thin low-contrast text is caught on mobile",
    next(m for m in bad_report["platforms"][1]["metrics"] if m["id"] == "text")["score"] < 30,
)
check("the palette comes back with the report", len(good_report["palette"]) >= 2)
check("the focal point is reported", 0 <= good_report["platforms"][0]["focus"]["x"] <= 1)

no_text = score.analyze(good, [])
check("a design with no text still scores", 0 < no_text["platforms"][0]["score"] <= 100)
check(
    "the text metric is absent rather than zero",
    next(m for m in no_text["platforms"][0]["metrics"] if m["id"] == "text")["score"] is None,
)
check(
    "dropping a metric renormalises instead of punishing",
    abs(no_text["platforms"][0]["score"] - good_report["platforms"][0]["score"]) < 40,
)

occluded = score.analyze(
    block(canvas(colour=(14, 18, 26)), (0.72, 0.72, 0.26, 0.24), (255, 255, 255)),
    [],
    {"mobile": [[0.7, 0.7, 0.3, 0.3]], "desktop": [[0.7, 0.7, 0.3, 0.3]]},
)
check(
    "content under the interface is penalised",
    next(m for m in occluded["platforms"][1]["metrics"] if m["id"] == "occlusion")["score"] < 70,
)

try:
    score.analyze(np.zeros((4, 4, 3), np.uint8))
    check("non-RGBA input is rejected", False)
except ValueError:
    check("non-RGBA input is rejected", True)

check("a 1-pixel image does not crash", score.analyze(canvas(1, 1))["platforms"][0]["score"] >= 0)

print("\nAll score checks passed." if FAILURES == 0 else f"\n{FAILURES} score check(s) failed.")
sys.exit(0 if FAILURES == 0 else 1)
