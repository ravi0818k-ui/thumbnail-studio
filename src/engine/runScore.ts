import type { Project } from '../types'
import { renderToCanvas } from './renderer'
import { analyzeImage } from './pythonImage'
import { occlusionRects, textRegions, type RawReport } from './thumbnailScore'

/**
 * Renders the design and hands it to the Python scorer. Split from
 * `thumbnailScore.ts` so the rules and the copy there stay free of the worker
 * import, which a headless bundler cannot follow.
 */

/** Width the design is rendered at before being measured. */
const ANALYSIS_WIDTH = 640

export async function scoreProject(project: Project): Promise<RawReport> {
  const canvas = renderToCanvas(project, ANALYSIS_WIDTH / project.width)
  const ctx = canvas.getContext('2d', { willReadFrequently: true })!
  const image = ctx.getImageData(0, 0, canvas.width, canvas.height)
  return (await analyzeImage(image, {
    regions: textRegions(project),
    occlusion: occlusionRects(project),
  })) as RawReport
}
