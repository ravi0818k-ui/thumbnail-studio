import type { Project } from '../types'
import { renderToCanvas } from './renderer'
import { inspectImage } from './pythonImage'
import { occlusionRects, textRegions } from './thumbnailScore'
import type { TestReport } from './thumbnailTest'

/**
 * Renders the design and runs the full test over it. Split from
 * `thumbnailTest.ts` for the same reason `runScore.ts` is split from
 * `thumbnailScore.ts`: the rules and the copy there must stay free of the
 * `?worker` import, which a headless bundler cannot follow.
 */

/**
 * Width the design is rendered at before being measured. The same as the
 * scorer's, so the two halves of the report describe one frame and not two
 * slightly different ones.
 */
const ANALYSIS_WIDTH = 640

export async function testProject(project: Project): Promise<TestReport> {
  const canvas = renderToCanvas(project, ANALYSIS_WIDTH / project.width)
  const ctx = canvas.getContext('2d', { willReadFrequently: true })!
  const image = ctx.getImageData(0, 0, canvas.width, canvas.height)
  return (await inspectImage(image, {
    regions: textRegions(project),
    occlusion: occlusionRects(project),
  })) as TestReport
}
