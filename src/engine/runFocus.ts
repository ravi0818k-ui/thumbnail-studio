import { getLoadedAsset, type LoadedAsset } from './assets'
import { focusBlurAsset } from './pythonImage'
import { blurSigma, focusInverts, focusIsVisible, type FocusOptions, type FocusSelection } from './objectMask'

/**
 * Runs one focus blur and returns the new asset. Nothing is mutated: the
 * source asset stays in the registry, so Ctrl+Z restores it and a change of
 * strength re-blurs the original rather than stacking a second blur on top.
 */
export async function runFocus(selection: FocusSelection, options: FocusOptions): Promise<LoadedAsset | null> {
  const source = getLoadedAsset(selection.sourceAssetId)
  if (!source) return null
  const longEdge = Math.max(source.width, source.height)
  // At zero the answer is the pixels as they were, which is already sitting in
  // the registry — no reason to send them to Python to come back unchanged.
  if (!focusIsVisible(options, longEdge)) return source
  return focusBlurAsset(source, {
    region: selection.region,
    sigma: blurSigma(options.strength, longEdge),
    invert: focusInverts(options.target),
  })
}
