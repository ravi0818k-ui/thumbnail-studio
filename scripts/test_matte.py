"""
Tests for src/python/matte.py under desktop CPython.

The scenes are synthetic so every expectation is exact: thin dark strands on a
coloured backdrop, with a "model mask" made by blurring the truth the way a
1024 px segmentation upsampled to photo size is blurred. The matte has to get
back closer to the truth than the mask it was given.

Run with `npm run selftest` (invoked automatically) or directly:
    python scripts/test_matte.py
"""

from __future__ import annotations

import sys
from pathlib import Path

import numpy as np

sys.path.insert(0, str(Path(__file__).resolve().parent.parent / "src" / "python"))

import matte  # noqa: E402
from enhance import box_blur  # noqa: E402

FAILURES = 0


def check(name: str, condition: bool, detail: str = "") -> None:
    global FAILURES
    if condition:
        print(f"  ok   {name}")
    else:
        FAILURES += 1
        print(f"  FAIL {name}{' — ' + detail if detail else ''}")


HAIR = np.array([0.08, 0.06, 0.05], dtype=np.float32)
WALL = np.array([0.85, 0.55, 0.20], dtype=np.float32)
SKY = np.array([0.92, 0.94, 0.96], dtype=np.float32)


def strands_scene(size: int = 400, backdrop=WALL):
    """A dark head with thin strands radiating out over a flat backdrop."""
    yy, xx = np.mgrid[0:size, 0:size].astype(np.float32)
    cy, cx = size * 0.55, size * 0.5
    radius = size * 0.22
    head = ((yy - cy) ** 2 + (xx - cx) ** 2) <= radius**2
    truth = head.astype(np.float32)
    angle = np.arctan2(yy - cy, xx - cx)
    dist = np.sqrt((yy - cy) ** 2 + (xx - cx) ** 2)
    # 24 strands, each about two pixels wide, reaching well past the head.
    for k in range(24):
        theta = -np.pi + (k + 0.5) * (2 * np.pi / 24)
        offset = np.abs(np.sin(angle - theta)) * dist
        strand = (offset <= 1.0) & (np.cos(angle - theta) > 0) & (dist <= radius * 1.7)
        truth = np.maximum(truth, strand.astype(np.float32))
    image = truth[..., None] * HAIR + (1 - truth[..., None]) * backdrop
    return image.astype(np.float32), truth, head


def model_mask(truth: np.ndarray, factor: int = 6) -> np.ndarray:
    """What a low-resolution model hands back: the truth averaged and smeared."""
    blurred = box_blur(truth, factor)
    return np.clip(blurred * 1.15, 0.0, 1.0).astype(np.float32)


def error(alpha: np.ndarray, truth: np.ndarray, where: np.ndarray) -> float:
    return float(np.abs(alpha - truth)[where].mean())


# ------------------------------------------------------------ primitives ---
print("matte primitives")
flat = np.full((40, 60), 0.3, dtype=np.float32)
check("resize to the same shape is identity", np.allclose(matte._resize(flat, (40, 60)), flat))
check("resize keeps a constant", np.allclose(matte._resize(flat, (80, 30)), 0.3, atol=1e-5))
dot = np.zeros((21, 21), dtype=bool)
dot[10, 10] = True
check("dilate grows a point into a box", int(matte.dilate(dot, 2).sum()) == 25)
check("erode removes a point", not matte.erode(dot, 1).any())
check("dilate by zero is identity", np.array_equal(matte.dilate(dot, 0), dot))
guide = np.random.default_rng(1).random((50, 50, 3)).astype(np.float32)
check(
    "the guided filter keeps a constant",
    np.allclose(matte.guided_filter(guide, np.full((50, 50), 0.7, np.float32), 3), 0.7, atol=1e-3),
)

# ------------------------------------------------------------- strands ---
print("matte strands")
image, truth, head = strands_scene()
coarse = model_mask(truth)
alpha, fg = matte.cutout(image, coarse)
outside = ~matte.dilate(head, 2)
strand_px = (truth > 0.5) & outside
gaps = (truth < 0.5) & outside & (coarse > 0.05)
check("the model mask really is wrong between strands", float(coarse[gaps].mean()) > 0.1, f"{coarse[gaps].mean():.3f}")
check(
    "strands come back stronger than the model had them",
    float(alpha[strand_px].mean()) > float(coarse[strand_px].mean()) + 0.15,
    f"matte {alpha[strand_px].mean():.3f} vs mask {coarse[strand_px].mean():.3f}",
)
check(
    "gaps between strands clear out",
    float(alpha[gaps].mean()) < float(coarse[gaps].mean()) * 0.5,
    f"matte {alpha[gaps].mean():.3f} vs mask {coarse[gaps].mean():.3f}",
)
check(
    "overall the matte is closer to the truth than the mask",
    error(alpha, truth, outside) < error(coarse, truth, outside) * 0.7,
    f"{error(alpha, truth, outside):.4f} vs {error(coarse, truth, outside):.4f}",
)
check("the solid head stays solid", float(alpha[matte.erode(head, 4)].min()) > 0.98)
far_bg = ~matte.dilate(truth > 0.5, 20)
check("far background stays clear", float(alpha[far_bg].max()) < 0.02)
check("alpha stays in range", float(alpha.min()) >= 0.0 and float(alpha.max()) <= 1.0)

# ---------------------------------------------------------------- haze ---
print("matte haze")
sky_image, sky_truth, _ = strands_scene(backdrop=SKY)
hazy = np.clip(box_blur(sky_truth, 14) * 1.3, 0, 1).astype(np.float32)  # a wide soft fringe
sky_alpha, _ = matte.cutout(sky_image, hazy)
haze = (sky_truth < 0.5) & (hazy > 0.1) & (hazy < 0.6)
check("the fringe over a bright sky is haze to begin with", float(hazy[haze].mean()) > 0.15)
check(
    "the haze is removed",
    float(sky_alpha[haze].mean()) < 0.06,
    f"{sky_alpha[haze].mean():.3f}",
)

# ------------------------------------------------------ decontamination ---
print("matte foreground colour")
# A four-pixel blend, about what a strand's edge is at photo size.
mix_alpha = np.zeros((120, 120), dtype=np.float32)
mix_alpha[:, :50] = 1.0
mix_alpha[:, 50:54] = np.linspace(1, 0, 6, dtype=np.float32)[1:-1][None, :]
mixed = mix_alpha[..., None] * HAIR + (1 - mix_alpha[..., None]) * WALL
estimate = matte.estimate_foreground(mixed.astype(np.float32), mix_alpha)
edge = (mix_alpha > 0.25) & (mix_alpha < 0.75)
observed_error = float(np.abs(mixed[edge] - HAIR).mean())
estimated_error = float(np.abs(estimate[edge] - HAIR).mean())
check(
    "edge colour loses the wall's tint",
    estimated_error < observed_error * 0.25,
    f"{estimated_error:.3f} vs observed {observed_error:.3f}",
)
check("solid subject keeps its colour", np.allclose(estimate[:, :40], HAIR, atol=0.02))

# -------------------------------------------------------- person veto ---
print("matte person veto")
size = 300
person = np.zeros((size, size), dtype=np.float32)
person[60:300, 110:190] = 1.0
chair = np.zeros_like(person)
chair[120:300, 20:280] = 1.0
general = np.maximum(person, chair)
scene = np.where(person[..., None] > 0.5, HAIR, np.where(chair[..., None] > 0.5, WALL * 0.6, SKY)).astype(np.float32)
check("a person filling most of the cut-out is the subject", matte.person_is_subject(person, person))
with_veto, _ = matte.cutout(scene, general, person)
without, _ = matte.cutout(scene, general)
check("person only removes the chair", float(with_veto[200:280, 30:60].max()) < 0.05)
check("person only keeps the person", float(with_veto[150:250, 130:170].min()) > 0.98)
check("whole subject keeps the chair", float(without[200:280, 30:60].min()) > 0.98)
# "Person only" may remove what the general model kept, never add what it
# dropped: a chair the model already excluded must not creep back in.
dropped = person.copy()
patterned = np.where(person[..., None] > 0.5, HAIR, np.where(chair[..., None] > 0.5, HAIR * 1.3, SKY)).astype(np.float32)
veto_only, _ = matte.cutout(patterned, dropped, person)
check(
    "person only never adds back what the model dropped",
    float(veto_only[(chair > 0.5) & (person < 0.5)].max()) < 0.02,
    f"{veto_only[(chair > 0.5) & (person < 0.5)].max():.3f}",
)
info = matte.person_info(general, person)
check("info reports a person", info["person"] is True)
check("info reports the extra share", 0.3 < info["extra"] < 0.9, str(info))
not_a_person = np.zeros_like(person)
not_a_person[0:20, 0:20] = 1.0
check("a stray person mask does not make a portrait", not matte.person_is_subject(general, not_a_person))
untouched, _ = matte.cutout(scene, general, not_a_person)
check("and then it vetoes nothing", float(untouched[200:280, 30:60].min()) > 0.98)
check("info says no person", matte.person_info(general, not_a_person) == {"person": False, "extra": 0.0})

# ---------------------------------------------------------- refine brush ---
print("matte refine brush")
lost = alpha.copy()
yy, xx = np.mgrid[0 : truth.shape[0], 0 : truth.shape[1]]
stroke = ((yy - 60) ** 2 + (xx - 200) ** 2) <= 45**2  # over the top strands
lost[stroke] = 0.0  # the removal took this hair away
refined, _ = matte.refine_region(image, lost, stroke.astype(np.float32))
in_stroke_strands = stroke & (truth > 0.5) & outside
in_stroke_gaps = stroke & (truth < 0.5) & ~matte.dilate(truth > 0.5, 2)
check("the stroke really covers strands", int(in_stroke_strands.sum()) > 30, str(int(in_stroke_strands.sum())))
check("refine brings the strands back", float(refined[in_stroke_strands].mean()) > 0.6, f"{refined[in_stroke_strands].mean():.3f}")
check("refine keeps the gaps clear", float(refined[in_stroke_gaps].mean()) < 0.1, f"{refined[in_stroke_gaps].mean():.3f}")
check("refine never touches outside the stroke", np.array_equal(refined[~stroke], lost[~stroke]))
# A dab inside the solid subject, nowhere near the background, must leave it
# solid — with no colour evidence, the stroke keeps what it had.
interior = ((yy - 220) ** 2 + (xx - 200) ** 2) <= 25**2
kept, _ = matte.refine_region(image, alpha, interior.astype(np.float32))
check("refine inside the subject leaves it solid", float(kept[interior].min()) > 0.98, f"{kept[interior].min():.3f}")
same, _ = matte.refine_region(image, lost, np.zeros_like(lost))
check("an empty stroke changes nothing", np.array_equal(same, lost))
# The page sends only a crop around the stroke. Given the photo's scale, the
# crop must solve the same as the whole photo — without it, radii shrink with
# the crop and the known colours fall outside it.
margin = matte.refine_margin(400)
ys, xs = np.nonzero(stroke)
top, left = max(0, ys.min() - margin), max(0, xs.min() - margin)
bottom, right = min(400, ys.max() + margin + 1), min(400, xs.max() + margin + 1)
cropped, _ = matte.refine_region(
    image[top:bottom, left:right], lost[top:bottom, left:right], stroke[top:bottom, left:right].astype(np.float32), side=400
)
whole = refined[top:bottom, left:right]
inside = stroke[top:bottom, left:right]
check(
    "a cropped stroke solves like the whole photo",
    float(np.abs(cropped - whole)[inside].mean()) < 0.02,
    f"{np.abs(cropped - whole)[inside].mean():.4f}",
)

# ----------------------------------------------------------- entry point ---
print("matte entry point")
rgba = np.zeros(image.shape[:2] + (4,), dtype=np.uint8)
rgba[..., :3] = np.rint(image * 255).astype(np.uint8)
rgba[..., 3] = 255
out, info = matte.run("cutout", rgba, np.rint(coarse * 255).astype(np.uint8), None)
check("cutout returns RGBA bytes at image size", out.shape == rgba.shape and out.dtype == np.uint8)
check("cutout without a person mask reports none", info == {"person": False, "extra": 0.0})
out2, _ = matte.run("refine", rgba, out[..., 3], (stroke * 255).astype(np.uint8))
check("refine returns RGBA bytes", out2.shape == rgba.shape)
check("refine leaves alpha outside the stroke alone", np.array_equal(out2[..., 3][~stroke], out[..., 3][~stroke]))
for label, call in (
    ("unknown mode raises", lambda: matte.run("nope", rgba, out[..., 3])),
    ("refine without a stroke raises", lambda: matte.run("refine", rgba, out[..., 3], None)),
):
    try:
        call()
        check(label, False)
    except ValueError:
        check(label, True)

print("\nAll matte checks passed." if FAILURES == 0 else f"\n{FAILURES} matte check(s) failed.")
sys.exit(1 if FAILURES else 0)
