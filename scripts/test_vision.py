"""
Tests for src/python/vision.py under desktop CPython.

Same discipline as test_score.py: an image metric's absolute value means
nothing, so almost every check is a *pair* — something built to pass against
something built to fail — and asserts the ordering, not the number.

Run with `npm run selftest` (invoked automatically) or directly:
    python scripts/test_vision.py
"""

from __future__ import annotations

import sys
from pathlib import Path

import numpy as np

sys.path.insert(0, str(Path(__file__).resolve().parent.parent / "src" / "python"))

import vision  # noqa: E402

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


def fill(img: np.ndarray, rect, colour) -> None:
    """rect is normalised (x, y, w, h)."""
    h, w = img.shape[:2]
    x0, y0 = int(rect[0] * w), int(rect[1] * h)
    x1, y1 = int((rect[0] + rect[2]) * w), int((rect[1] + rect[3]) * h)
    img[y0:y1, x0:x1, :3] = colour


def noise(img: np.ndarray, amount: int = 70, seed: int = 7) -> None:
    rng = np.random.default_rng(seed)
    grain = rng.integers(-amount, amount, size=img[..., :3].shape, dtype=np.int16)
    img[..., :3] = np.clip(img[..., :3].astype(np.int16) + grain, 0, 255).astype(np.uint8)


def score_of(report: dict, check_id: str):
    return next(c for c in report["checks"] if c["id"] == check_id)


#: A mid skin tone, and two more from either end of the range, so the detector
#: is not only tested against the tone it was easiest to tune for.
SKIN_MID = (198, 152, 122)
SKIN_LIGHT = (241, 208, 184)
SKIN_DEEP = (108, 72, 52)


# ------------------------------------------------------------- colour maths ---
print("vision: colour geometry")

check("hue of pure red is 0", abs(vision.rgb_to_hsv(np.array([255, 0, 0]))[0]) < 0.01)
check("hue of pure green is 120", abs(vision.rgb_to_hsv(np.array([0, 255, 0]))[0] - 120.0) < 0.01)
check("hue of pure blue is 240", abs(vision.rgb_to_hsv(np.array([0, 0, 255]))[0] - 240.0) < 0.01)
check("grey has no saturation", vision.rgb_to_hsv(np.array([128, 128, 128]))[1] < 0.001)
check("black has no value", vision.rgb_to_hsv(np.array([0, 0, 0]))[2] < 0.001)

check("the hue wheel wraps the short way", abs(vision.hue_gap(350.0, 10.0) - 20.0) < 0.01)
check("opposite hues are 180 apart", abs(vision.hue_gap(30.0, 210.0) - 180.0) < 0.01)
check("the gap is never negative", vision.hue_gap(200.0, 10.0) >= 0.0)

# The two anchors every contrast implementation is checked against.
check("black on white is 21:1", abs(vision.contrast_ratio(0.0, 1.0) - 21.0) < 0.01)
check("a colour against itself is 1:1", abs(vision.contrast_ratio(0.4, 0.4) - 1.0) < 0.001)
check("contrast is symmetric", vision.contrast_ratio(0.1, 0.8) == vision.contrast_ratio(0.8, 0.1))

print("vision: harmony")
check("one hue is monochrome", vision.harmony_of([210.0]) == "monochrome")
check("no hue is monochrome", vision.harmony_of([]) == "monochrome")
check("blue and orange are complementary", vision.harmony_of([210.0, 30.0]) == "complementary")
check("near-opposites still count", vision.harmony_of([210.0, 45.0]) == "complementary")
check("a 60 degree span is analogous", vision.harmony_of([30.0, 60.0, 80.0]) == "analogous")
check("red, green and blue are a triad", vision.harmony_of([0.0, 120.0, 240.0]) == "triadic")
check("an arbitrary spread clashes", vision.harmony_of([0.0, 75.0, 140.0]) == "clash")
check(
    "every harmony is a declared one",
    all(
        vision.harmony_of(h) in vision.HARMONIES
        for h in ([], [10.0], [10.0, 190.0], [0.0, 120.0, 240.0], [0.0, 75.0, 140.0])
    ),
)

# Complementary is the relationship that separates a subject from a background
# without leaning on brightness, so it has to out-score a clash.
check(
    "a complement beats a clash",
    vision.harmony_score("complementary", 2, 0.1) > vision.harmony_score("clash", 2, 0.1),
)
check(
    "crowding costs more than the relationship earns",
    vision.harmony_score("complementary", 7, 0.1) < vision.harmony_score("monochrome", 2, 0.1),
)
check(
    "an accent is worth something",
    vision.harmony_score("analogous", 2, 0.08) > vision.harmony_score("analogous", 2, 0.0),
)
check(
    "the score stays in range",
    all(
        0.0 <= vision.harmony_score(h, n, a) <= 100.0
        for h in vision.HARMONIES
        for n in (0, 1, 4, 12)
        for a in (0.0, 0.05, 0.9)
    ),
)


# -------------------------------------------------------------------- skin ---
print("vision: faces")

# A skin-toned disc on a plain ground is the only thing in the frame that
# should come back as a face.
def face_image(tone=SKIN_MID, radius=0.16, ground=(20, 90, 60)) -> np.ndarray:
    img = canvas(colour=ground)
    h, w = img.shape[:2]
    ys, xs = np.mgrid[0:h, 0:w]
    cx, cy = w * 0.68, h * 0.5
    r = radius * h
    # An ellipse a little taller than wide, which is what a head is.
    disc = ((xs - cx) / (r * 0.82)) ** 2 + ((ys - cy) / r) ** 2 <= 1.0
    img[..., :3][disc] = tone
    return img


for name, tone in (("mid", SKIN_MID), ("light", SKIN_LIGHT), ("deep", SKIN_DEEP)):
    regions, share = vision.face_regions(face_image(tone)[..., :3])
    faces = [r for r in regions if r["kind"] == "face"]
    check(f"a {name} skin tone is found", len(faces) == 1, f"{len(faces)} faces, skin {share:.3f}")

# The green ground must not itself read as skin.
_regions, share = vision.face_regions(canvas(colour=(20, 90, 60))[..., :3])
check("a green ground is not skin", share < 0.01, f"{share:.4f}")
_regions, share = vision.face_regions(canvas(colour=(240, 240, 240))[..., :3])
check("a white ground is not skin", share < 0.01, f"{share:.4f}")

# A wide band of skin is a torso, not a face: same colour, wrong shape.
band = canvas(colour=(20, 90, 60))
fill(band, (0.05, 0.42, 0.9, 0.12), SKIN_MID)
regions, _share = vision.face_regions(band[..., :3])
check(
    "a wide skin band is not called a face",
    all(r["kind"] == "skin" for r in regions),
    str([r["kind"] for r in regions]),
)

# Two heads are two candidates.
two = canvas(colour=(20, 90, 60))
fill(two, (0.18, 0.3, 0.16, 0.26), SKIN_MID)
fill(two, (0.62, 0.3, 0.16, 0.26), SKIN_DEEP)
faces = [r for r in vision.face_regions(two[..., :3])[0] if r["kind"] == "face"]
check("two subjects are two candidates", len(faces) == 2, str(len(faces)))

# Specks must not be announced.
speck = canvas(colour=(20, 90, 60))
fill(speck, (0.5, 0.5, 0.01, 0.015), SKIN_MID)
check("a speck is below the floor", len(vision.face_regions(speck[..., :3])[0]) == 0)

# The reported box has to actually contain the face, or the overlay lies.
regions, _ = vision.face_regions(face_image()[..., :3])
box = regions[0]["box"]
check(
    "the box brackets the subject",
    0.5 < box[0] + box[2] / 2 < 0.85 and 0.35 < box[1] + box[3] / 2 < 0.65,
    str(box),
)
check("the box is inside the frame", all(0.0 <= v <= 1.0 for v in box) and box[0] + box[2] <= 1.001)


# -------------------------------------------------- subject and background ---
print("vision: subject and background")

check("busyness of a flat field is nil", vision.busyness(np.zeros((40, 40), dtype=np.float32)) < 1e-9)
grainy = canvas()
noise(grainy)
from score import wcag_luma  # noqa: E402

check(
    "noise is busier than a flat field",
    vision.busyness(wcag_luma(grainy)) > vision.busyness(wcag_luma(canvas())),
)

flat = vision.inspect(face_image())
busy = face_image()
noise(busy, amount=90)
busy_report = vision.inspect(busy)
check(
    "a calm background out-scores a noisy one",
    score_of(flat, "background")["score"] > score_of(busy_report, "background")["score"],
    f"{score_of(flat, 'background')['score']} vs {score_of(busy_report, 'background')['score']}",
)

# The reason the measure is a residual and not a gradient: a smooth ramp is a
# perfectly good background and must not be reported as a busy one.
ramped = canvas()
ramped[..., :3] = np.linspace(0, 255, ramped.shape[1], dtype=np.uint8)[None, :, None]
check(
    "a smooth gradient is not called busy",
    score_of(vision.inspect(ramped), "background")["score"] > 90,
    str(score_of(vision.inspect(ramped), "background")),
)
check(
    "texture ignores a smooth ramp but not noise",
    vision.masked_texture(wcag_luma(ramped), np.ones((4, 4), dtype=bool))
    < vision.masked_texture(wcag_luma(busy), np.ones((4, 4), dtype=bool)),
)

# A subject that shares its background's tone has no silhouette.
separated = canvas(colour=(12, 14, 18))
fill(separated, (0.55, 0.2, 0.3, 0.6), (250, 250, 250))
merged = canvas(colour=(12, 14, 18))
fill(merged, (0.55, 0.2, 0.3, 0.6), (26, 28, 34))
check(
    "a separated subject out-scores a merged one",
    score_of(vision.inspect(separated), "subject")["score"]
    > score_of(vision.inspect(merged), "subject")["score"],
)

print("vision: text backing")
plain = canvas(colour=(24, 26, 30))
textured = canvas(colour=(24, 26, 30))
# A hard light/dark split under the words is the case a plate exists to fix.
fill(textured, (0.0, 0.0, 0.5, 1.0), (235, 235, 235))
region = [[0.2, 0.35, 0.6, 0.3]]
quiet = vision.text_backing(wcag_luma(plain), region)
loud = vision.text_backing(wcag_luma(textured), region)
check("a plain backing varies less", quiet[0]["variation"] < loud[0]["variation"])
check(
    "a plain backing scores better",
    score_of(vision.inspect(plain, region), "text_backing")["score"]
    > score_of(vision.inspect(textured, region), "text_backing")["score"],
)
check("no text means no backing rows", vision.text_backing(wcag_luma(plain), []) == [])
check(
    "the backing check drops out with no text",
    score_of(vision.inspect(plain), "text_backing")["score"] is None,
)
# Worst first, because that is the one the report acts on.
many = vision.text_backing(wcag_luma(textured), [[0.0, 0.0, 0.45, 0.3], [0.4, 0.0, 0.2, 0.3]])
check(
    "backing rows are worst first",
    len(many) == 2 and many[0]["variation"] >= many[1]["variation"],
)

print("vision: border")
# Mid-grey holds its own against both themes; near-black vanishes into the
# dark page, and the weaker of the two themes is what the check reports.
mid = vision.inspect(canvas(colour=(130, 130, 130)))
sunk = vision.inspect(canvas(colour=(8, 9, 11)))
check(
    "a mid frame out-scores one that sinks into the page",
    score_of(mid, "border")["score"] > score_of(sunk, "border")["score"],
)
# `value` is stored to more places than the two per-theme readings, so this
# compares within their rounding rather than exactly.
check(
    "the border reports the weaker theme",
    abs(
        score_of(sunk, "border")["value"]
        - min(score_of(sunk, "border")["dark"], score_of(sunk, "border")["light"])
    )
    < 0.01,
)


# ------------------------------------------------------------ whole report ---
print("vision: report shape")

report = vision.inspect(face_image(), [[0.05, 0.1, 0.45, 0.3]])

check(
    "every declared check is emitted",
    [c["id"] for c in report["checks"]] == list(vision.CHECKS),
    str([c["id"] for c in report["checks"]]),
)
check(
    "every score is a percentage or absent",
    all(c["score"] is None or 0 <= c["score"] <= 100 for c in report["checks"]),
)
check("the source size is reported", report["width"] == 640 and report["height"] == 360)
check("the palette is populated", len(report["color"]["palette"]) > 0)
check(
    "every palette entry carries its geometry",
    all(
        set(("hex", "share", "hue", "saturation", "value")) <= set(e)
        for e in report["color"]["palette"]
    ),
)
check("the harmony is a declared one", report["color"]["harmony"] in vision.HARMONIES)
check("subject and background both get a colour", report["subject"]["hex"].startswith("#") and report["background"]["hex"].startswith("#"))
check(
    "subject and background shares are complementary",
    abs(report["subject"]["share"] + report["background"]["share"] - 1.0) < 0.02,
)

# A grey design has no scheme to report, and must not crash trying.
grey = vision.inspect(canvas(colour=(128, 128, 128)))
check("a greyscale design reports no competing hues", grey["color"]["competing"] == 0)
check("a greyscale design still scores harmony", score_of(grey, "harmony")["score"] is not None)

# Saturation is a band: both a washed-out and a vibrating frame are failures.
washed = vision.inspect(canvas(colour=(150, 148, 146)))
vivid = canvas(colour=(255, 0, 0))
fill(vivid, (0.5, 0.0, 0.5, 1.0), (0, 255, 0))
balanced = canvas(colour=(30, 40, 60))
fill(balanced, (0.55, 0.2, 0.3, 0.6), (220, 170, 60))
check(
    "a balanced palette beats a washed-out one",
    score_of(vision.inspect(balanced), "saturation")["score"]
    > score_of(washed, "saturation")["score"],
)
check(
    "a balanced palette beats a vibrating one",
    score_of(vision.inspect(balanced), "saturation")["score"]
    > score_of(vision.inspect(vivid), "saturation")["score"],
)

# Degenerate inputs: the report runs on every canvas the editor can produce.
check("a 1-pixel image does not crash", vision.inspect(canvas(1, 1))["width"] == 1)
check("a single row does not crash", vision.inspect(canvas(64, 1))["height"] == 1)
try:
    vision.inspect(np.zeros((4, 4, 3), dtype=np.uint8))
    check("non-RGBA input is rejected", False)
except ValueError:
    check("non-RGBA input is rejected", True)

# A text box hanging off the canvas is clamped, not an index error.
check(
    "an off-canvas text box is clamped",
    len(vision.text_backing(wcag_luma(canvas()), [[0.9, 0.9, 0.6, 0.6]])) == 1,
)

print()
if FAILURES:
    print(f"{FAILURES} vision check(s) failed.")
    sys.exit(1)
print("All vision checks passed.")
