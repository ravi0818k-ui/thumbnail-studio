// ---------------------------------------------------------------------------
// Object masking — Premiere Pro's "select the thing, then treat it separately",
// with the selection grown from a scribble in Python (`select_object` in
// src/python/enhance.py).
//
// This module is deliberately free of worker imports so the selftest can reach
// it; `runFocus.ts` is the part that actually talks to Pyodide. Same split as
// thumbnailScore.ts / runScore.ts, and for the same reason: a `?worker` import
// cannot be bundled by esbuild.
// ---------------------------------------------------------------------------

/** Which side of the mask the blur lands on. */
export type FocusTarget = 'object' | 'background'

export interface FocusOptions {
  /** 0..100, mapped to a blur radius in `blurSigma`. */
  strength: number
  target: FocusTarget
}

/**
 * The last selection, kept so the strength can be changed without scribbling
 * again. `sourceAssetId` is the asset as it was *before* the blur, so a second
 * pass replaces the first instead of blurring an already blurred image.
 */
export interface FocusSelection {
  objectId: string
  sourceAssetId: string
  /** Which of the layer's two asset slots the result belongs in. */
  slot: 'asset' | 'cutout'
  /** Stroke coverage, one byte per pixel of the source asset. */
  region: Uint8Array
}

export const DEFAULT_FOCUS: FocusOptions = { strength: 55, target: 'background' }

export const FOCUS_TARGETS: { value: FocusTarget; label: string; hint: string }[] = [
  {
    value: 'background',
    label: 'Blur behind',
    hint: 'Scribble over the subject — everything else softens, the way a fast lens does it',
  },
  {
    value: 'object',
    label: 'Blur this',
    hint: 'Scribble over the clutter you want pushed back',
  },
]

/**
 * Strength to a Gaussian sigma in pixels of the source image. It is scaled by
 * the image's own size because a 24 px blur reads as heavy on a 640 px still
 * and as nothing at all on a 4K one; at full strength the radius is 4% of the
 * long edge, which is roughly where a face stops being recognisable.
 */
export function blurSigma(strength: number, longEdge: number): number {
  const amount = Math.max(0, Math.min(100, strength)) / 100
  return amount * longEdge * 0.04
}

/** The blur is off at zero, so there is nothing to send to Python. */
export function focusIsVisible(options: FocusOptions, longEdge: number): boolean {
  return blurSigma(options.strength, longEdge) >= 0.5
}

/** Python takes the mask as drawn and inverts it itself. */
export function focusInverts(target: FocusTarget): boolean {
  return target === 'background'
}
