"""
Tests for src/python/enhance.py under desktop CPython.

The same module runs in Pyodide in the browser, so proving the maths here
proves the pipeline — only the FFI glue differs. Run with `npm run selftest`
(it is invoked automatically) or directly:  python scripts/test_enhance.py
"""

from __future__ import annotations

import sys
from pathlib import Path

import numpy as np

sys.path.insert(0, str(Path(__file__).resolve().parent.parent / "src" / "python"))

import enhance  # noqa: E402

FAILURES = 0


def check(name: str, condition: bool, detail: str = "") -> None:
    global FAILURES
    if condition:
        print(f"  ok   {name}")
    else:
        FAILURES += 1
        print(f"  FAIL {name}{' — ' + detail if detail else ''}")


def near(a: float, b: float, tol: float = 1e-3) -> bool:
    return abs(a - b) <= tol


def gradient_image(width: int = 64, height: int = 48, low: int = 90, high: int = 160) -> np.ndarray:
    """A low-contrast grey ramp with a bright square, plus opaque alpha."""
    img = np.zeros((height, width, 4), dtype=np.uint8)
    ramp = np.linspace(low, high, width).astype(np.uint8)
    img[..., :3] = ramp[None, :, None]
    img[10:20, 10:20, :3] = high
    img[..., 3] = 255
    return img


def noisy_image(seed: int = 7) -> np.ndarray:
    rng = np.random.default_rng(seed)
    base = np.zeros((64, 64, 4), dtype=np.uint8)
    base[..., :3] = 128
    base[:, 32:, :3] = 200  # a hard edge that denoise must keep
    noise = rng.normal(0, 14, size=(64, 64, 3))
    base[..., :3] = np.clip(base[..., :3].astype(np.float32) + noise, 0, 255).astype(np.uint8)
    base[..., 3] = 255
    return base


def contrast_of(img: np.ndarray) -> float:
    return float(img[..., :3].astype(np.float32).std())


print("python: colour round trip")
values = np.linspace(0.0, 1.0, 256, dtype=np.float32)
check("srgb round trip is lossless", np.allclose(enhance.linear_to_srgb(enhance.srgb_to_linear(values)), values, atol=1e-4))
check("linear midpoint is darker than sRGB", float(enhance.srgb_to_linear(np.float32(0.5))) < 0.25)

print("python: blur")
flat = np.full((32, 32, 3), 0.5, dtype=np.float32)
check("box blur preserves a flat field", np.allclose(enhance.box_blur(flat, 3), 0.5, atol=1e-5))
spike = np.zeros((33, 33, 1), dtype=np.float32)
spike[16, 16, 0] = 1.0
blurred = enhance.gaussian_blur(spike, 2.0)
check("gaussian conserves energy", near(float(blurred.sum()), 1.0, 0.02), f"sum={float(blurred.sum()):.4f}")
check("gaussian peak is at the centre", float(blurred.argmax()) == float(np.ravel_multi_index((16, 16, 0), blurred.shape)))
check("gaussian is symmetric", near(float(blurred[16, 14, 0]), float(blurred[16, 18, 0]), 1e-6))

print("python: clahe")
source = gradient_image()
result = enhance.clahe(source, clip=2.0, tiles=8)
check("clahe keeps the image shape", result.shape == source.shape)
check("clahe raises local contrast", contrast_of(result) > contrast_of(source), f"{contrast_of(source):.2f} → {contrast_of(result):.2f}")
check("clahe leaves alpha alone", np.array_equal(result[..., 3], source[..., 3]))
check("clahe at amount 0 is a no-op", np.abs(enhance.clahe(source, amount=0.0).astype(int) - source.astype(int)).max() <= 1)
grey = np.zeros((32, 32, 4), dtype=np.uint8)
grey[..., :3] = 128
grey[..., 3] = 255
check("clahe survives a flat image", enhance.clahe(grey).shape == grey.shape)

print("python: white balance")
cast = gradient_image()
cast[..., 2] = np.clip(cast[..., 2].astype(np.float32) * 0.55, 0, 255).astype(np.uint8)  # blue-starved
balanced = enhance.white_balance(cast, amount=1.0)


def channel_spread(img: np.ndarray) -> float:
    means = [float(img[..., c].mean()) for c in range(3)]
    return max(means) - min(means)


check("white balance neutralises a cast", channel_spread(balanced) < channel_spread(cast), f"{channel_spread(cast):.1f} → {channel_spread(balanced):.1f}")
check("white balance at amount 0 changes nothing", np.abs(enhance.white_balance(cast, 0.0).astype(int) - cast.astype(int)).max() <= 1)

print("python: levels")
flat_capture = gradient_image(low=110, high=140)
stretched = enhance.levels(flat_capture)
check("levels expands the tonal range", contrast_of(stretched) > contrast_of(flat_capture))
check("levels keeps values in range", stretched.min() >= 0 and stretched.max() <= 255)

print("python: sharpen")
soft = enhance.gaussian_blur(gradient_image()[..., :3].astype(np.float32) / 255.0, 2.0)
soft_rgba = np.concatenate([np.rint(soft * 255).astype(np.uint8), np.full(soft.shape[:2] + (1,), 255, np.uint8)], axis=2)
sharpened = enhance.sharpen(soft_rgba, radius=2.0, amount=1.2)
check("sharpen restores edge detail", contrast_of(sharpened) > contrast_of(soft_rgba))
check("sharpen at amount 0 is a no-op", np.abs(enhance.sharpen(soft_rgba, amount=0.0).astype(int) - soft_rgba.astype(int)).max() <= 1)
check("sharpen does not clip out of range", sharpened.min() >= 0 and sharpened.max() <= 255)

# A cut-out must not grow a dark halo: transparent pixels cannot bleed inwards.
cutout = np.zeros((32, 32, 4), dtype=np.uint8)
cutout[8:24, 8:24, :3] = 220
cutout[8:24, 8:24, 3] = 255
edge_before = cutout[8, 8, :3].astype(int).mean()
edge_after = enhance.sharpen(cutout, radius=3.0, amount=1.0)[8, 8, :3].astype(int).mean()
check("sharpen does not darken a cut-out edge", edge_after >= edge_before - 6, f"{edge_before:.0f} → {edge_after:.0f}")

print("python: denoise")
noisy = noisy_image()
cleaned = enhance.denoise(noisy, strength=1.0)
left_noise_before = float(noisy[:, :30, :3].astype(np.float32).std())
left_noise_after = float(cleaned[:, :30, :3].astype(np.float32).std())
check("denoise smooths flat areas", left_noise_after < left_noise_before, f"{left_noise_before:.2f} → {left_noise_after:.2f}")
step_before = float(noisy[:, 34, :3].mean() - noisy[:, 29, :3].mean())
step_after = float(cleaned[:, 34, :3].mean() - cleaned[:, 29, :3].mean())
check("denoise keeps the edge", step_after > step_before * 0.8, f"step {step_before:.1f} → {step_after:.1f}")

print("python: tone")
bright = gradient_image(low=150, high=250)
recovered = enhance.tone(bright, highlights=-1.0)
check("negative highlights pull back the bright end", float(recovered[..., :3].max()) < float(bright[..., :3].max()))
dark = gradient_image(low=10, high=60)
opened = enhance.tone(dark, shadows=1.0)
check("positive shadows open the dark end", float(opened[..., :3].mean()) > float(dark[..., :3].mean()))
check("tone at zero is a no-op", np.abs(enhance.tone(bright).astype(int) - bright.astype(int)).max() <= 1)

print("python: temperature")
neutral = gradient_image()
warm = enhance.temperature(neutral, temp=1.0)
cool = enhance.temperature(neutral, temp=-1.0)
check("warm lifts red over blue", float(warm[..., 0].mean()) > float(warm[..., 2].mean()))
check("cool lifts blue over red", float(cool[..., 2].mean()) > float(cool[..., 0].mean()))

print("python: upscale")
small = gradient_image(width=32, height=24)
big = enhance.upscale(small, factor=2.0)
check("upscale doubles the pixels", big.shape[:2] == (48, 64), str(big.shape))
check("upscale keeps 4 channels and alpha", big.shape[2] == 4 and int(big[..., 3].min()) == 255)
check("upscale is sharper than bilinear", contrast_of(big) >= contrast_of(enhance._resize_bilinear(small, (64, 48))) - 0.5)
check("fractional factors work", enhance.upscale(small, factor=1.5).shape[:2] == (36, 48))

print("python: auto")
auto_result = enhance.auto(gradient_image(low=110, high=140))
check("auto improves a flat capture", contrast_of(auto_result) > contrast_of(gradient_image(low=110, high=140)))
check("auto at strength 0 is nearly a no-op", np.abs(enhance.auto(source, strength=0.0).astype(int) - source.astype(int)).max() <= 3)


print("python: matte labelling")
mask = np.zeros((20, 20), dtype=bool)
mask[2:8, 2:8] = True  # one block
mask[12, 12] = True  # a speck
mask[15, 15] = True
mask[16, 16] = True  # touches the previous one diagonally
rows, cols, lengths, roots, sizes = enhance.label_components(mask)
check("runs cover every true pixel", int(lengths.sum()) == int(mask.sum()), f"{lengths.sum()} vs {mask.sum()}")
check("three components are found", len(set(roots.tolist())) == 3, str(sorted(set(roots.tolist()))))
check("the block is sized correctly", sizes.max() == 36, str(sizes.max()))
check("diagonal neighbours are one component", sorted(np.unique(sizes).tolist()) == [1.0, 2.0, 36.0], str(np.unique(sizes)))
check("an empty mask labels cleanly", enhance.label_components(np.zeros((4, 4), bool))[0].size == 0)
full = enhance.label_components(np.ones((5, 7), bool))
check("a full mask is one component", full[4].max() == 35 and len(set(full[3].tolist())) == 1)


def speckled(width: int = 48, height: int = 40) -> np.ndarray:
    """A solid subject block plus the stray pixels a matte leaves behind."""
    img = np.zeros((height, width, 4), dtype=np.uint8)
    img[8:32, 8:28, :3] = 200
    img[8:32, 8:28, 3] = 255
    for y, x in ((3, 40), (4, 41), (36, 6), (20, 44)):
        img[y, x, :3] = 255
        img[y, x, 3] = 255
    return img


print("python: despeckle")
src = speckled()
cleaned = enhance.despeckle(src, min_area=16)
check("the speckles are gone", cleaned[3, 40, 3] == 0 and cleaned[36, 6, 3] == 0 and cleaned[20, 44, 3] == 0)
check("the subject survives", cleaned[20, 20, 3] == 255 and int((cleaned[..., 3] > 0).sum()) == 24 * 20)
check("colour is untouched", np.array_equal(cleaned[..., :3], src[..., :3]))
check(
    "the subject survives an absurd min_area",
    int((enhance.despeckle(src, min_area=1e9)[..., 3] > 0).sum()) == 24 * 20,
)
check("min_area 0 removes nothing", np.array_equal(enhance.despeckle(src, min_area=0), src))
check("a fully transparent image is safe", enhance.despeckle(np.zeros((6, 6, 4), np.uint8), min_area=99).shape == (6, 6, 4))

region = np.zeros((40, 48), dtype=np.float32)
region[0:10, 36:48] = 1.0  # only covers the two specks top-right
brushed = enhance.despeckle(src, min_area=16, region=region)
check("a brush only clears what it covers", brushed[3, 40, 3] == 0 and brushed[36, 6, 3] == 255)
check("a brush leaves the subject alone", brushed[20, 20, 3] == 255)


print("python: defringe")
fringed = np.zeros((24, 24, 4), dtype=np.uint8)
fringed[6:18, 6:18] = (40, 60, 90, 255)  # dark subject
fringed[5, 6:18] = (250, 250, 250, 120)  # bright halo row from a light backdrop
out = enhance.defringe(fringed, strength=1.0, radius=2.0)
check("the halo takes the subject's colour", int(out[5, 12, 0]) < 90, str(out[5, 12]))
check("the halo keeps its alpha", out[5, 12, 3] == 120)
check("solid pixels are untouched", abs(int(out[12, 12, 0]) - 40) <= 2 and out[12, 12, 3] == 255)
check("shrink drops the faintest rim", enhance.defringe(fringed, shrink=0.6)[5, 12, 3] < 120)
check("strength 0 leaves colour alone", np.abs(enhance.defringe(fringed, strength=0.0).astype(int) - fringed.astype(int))[..., :3].max() <= 2)
check("an all-transparent matte is safe", np.array_equal(enhance.defringe(np.zeros((5, 5, 4), np.uint8)), np.zeros((5, 5, 4), np.uint8)))

print("python: clean_matte")
combined = enhance.clean_matte(speckled(), min_area=16, strength=1.0)
check("clean_matte despeckles", combined[3, 40, 3] == 0)
check("clean_matte keeps the subject", combined[20, 20, 3] == 255)
masked = enhance.clean_matte(speckled(), min_area=16, strength=1.0, region=region)
check("a region confines clean_matte", masked[36, 6, 3] == 255 and masked[3, 40, 3] == 0)
check(
    "apply_op passes the region through",
    enhance.apply_op(speckled(), "despeckle", {"min_area": 16}, region=region)[36, 6, 3] == 255,
)
try:
    enhance.apply_op(speckled(), "despeckle", {}, region=np.zeros((2, 2), np.float32))
    check("a mismatched region is rejected", False)
except ValueError:
    check("a mismatched region is rejected", True)

print("python: object mask")


def scene() -> np.ndarray:
    """
    Striped background, a lightly textured red block on it, and a second
    identical block that the first one does not touch.
    """
    img = np.zeros((72, 96, 4), dtype=np.uint8)
    img[..., 3] = 255
    stripes = np.where(np.arange(96) % 4 < 2, 60, 150).astype(np.uint8)
    img[..., :3] = stripes[None, :, None]
    for x0, x1 in ((8, 40), (64, 92)):
        block = np.where(np.arange(x1 - x0) % 8 < 4, 200, 215).astype(np.uint8)
        img[16:48, x0:x1, 0] = block[None, :]
        img[16:48, x0:x1, 1] = 40
        img[16:48, x0:x1, 2] = 40
    return img


def scribble(rows: slice, cols: slice) -> np.ndarray:
    region = np.zeros((72, 96), dtype=np.float32)
    region[rows, cols] = 1.0
    return region


base = scene()
drawn = scribble(slice(28, 34), slice(14, 34))
mask = enhance.select_object(base, drawn)

check("the mask is a 0..1 map the size of the image", mask.shape == (72, 96) and mask.min() >= 0 and mask.max() <= 1)
check("the scribble grows to fill the object it was drawn on", mask[20:44, 12:36].mean() > 0.9, f"{mask[20:44, 12:36].mean():.2f}")
check("it stops at the object's edge", mask[0:8, 4:40].mean() < 0.02, f"{mask[0:8, 4:40].mean():.3f}")
# An identical object elsewhere in the frame is a different object. Colour
# alone would take it; only connectivity tells them apart.
check("a separate object of the same colour is left alone", mask[20:44, 68:88].mean() < 0.05, f"{mask[20:44, 68:88].mean():.3f}")
check("an empty scribble selects nothing", float(enhance.select_object(base, np.zeros((72, 96), np.float32)).max()) == 0.0)
check(
    "a single dab still selects the object",
    enhance.select_object(base, scribble(slice(30, 32), slice(22, 24)))[20:44, 12:36].mean() > 0.8,
)
# The bound on how far a scribble may reach is what keeps one leak through a
# shadow from handing back the whole frame.
tight = enhance.select_object(base, drawn, spread=0.0)
check("spread bounds how far the selection may travel", tight.sum() < mask.sum())

print("python: focus blur")


def detail_in(img: np.ndarray, rows: slice, cols: slice) -> float:
    """
    Fine detail left in a patch, as the average step between neighbouring
    pixels. Plain variance would not do: blurring an object also pulls its
    surroundings inward, and that gradient keeps the variance up even once
    every bit of texture is gone.
    """
    patch = img[rows, cols, 0].astype(np.float32)
    return float(np.abs(np.diff(patch, axis=1)).mean())

sharp_block = detail_in(base, slice(20, 44), slice(16, 32))
sharp_stripes = detail_in(base, slice(0, 6), slice(4, 40))

blurred = enhance.focus_blur(base, drawn, sigma=4.0)
check("blurring the object softens it", detail_in(blurred, slice(20, 44), slice(16, 32)) < sharp_block * 0.5)
check("and leaves the rest of the frame alone", near(detail_in(blurred, slice(0, 6), slice(4, 40)), sharp_stripes, 1.0))

behind = enhance.focus_blur(base, drawn, sigma=4.0, invert=True)
check("inverted, the background goes soft", detail_in(behind, slice(0, 6), slice(4, 40)) < sharp_stripes * 0.5)
check("and the subject stays sharp", detail_in(behind, slice(20, 44), slice(16, 32)) > sharp_block * 0.7)

check("no blur means no change", np.array_equal(enhance.focus_blur(base, drawn, sigma=0.0), base))
# apply_op runs every operation with no region in the dispatch test below, so
# a missing scribble has to mean "nothing selected", not "blur everything".
check("no scribble means no change", np.array_equal(enhance.focus_blur(base, None, sigma=8.0), base))

faded = scene()
faded[..., 3] = 128
check("alpha is carried through untouched", np.array_equal(enhance.focus_blur(faded, drawn, sigma=4.0)[..., 3], faded[..., 3]))

dispatched = enhance.apply_op(base, "focus_blur", {"sigma": 4.0}, drawn)
check("apply_op routes the region to the blur", np.array_equal(dispatched, blurred))

print("python: dispatch")
for op in enhance.OPS:
    out = enhance.apply_op(gradient_image(), op, {})
    check(f"apply_op runs '{op}'", out.ndim == 3 and out.shape[2] == 4 and out.dtype == np.uint8)
try:
    enhance.apply_op(gradient_image(), "nope", {})
    check("unknown operations are rejected", False)
except ValueError:
    check("unknown operations are rejected", True)
try:
    enhance.apply_op(np.zeros((4, 4, 3), np.uint8), "auto", {})
    check("non-RGBA input is rejected", False)
except ValueError:
    check("non-RGBA input is rejected", True)

print("\nAll python checks passed." if FAILURES == 0 else f"\n{FAILURES} python check(s) failed.")
sys.exit(0 if FAILURES == 0 else 1)
