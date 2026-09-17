import type { ImageObject, Project, SceneObject, ShapeObject, TextObject } from '../types'
import { boundingRect } from './geometry'
import { verdict, type RawReport, type Verdict } from './thumbnailScore'

// ---------------------------------------------------------------------------
// "Run a test" — the report layer.
//
// It has two halves, on purpose:
//
//   * The **pixel** half is `src/python/vision.py`: faces, subject separation,
//     background texture, text backing, colour harmony, saturation and edge
//     definition. Python returns ids, scores and raw values and knows no
//     English.
//   * The **scene** half is this file: objects, brand marks, labels and text
//     properties, read straight from the project. The editor knows what it
//     drew, so recovering it from the pixels with a detector would be slower,
//     less accurate and — for a design the user is still editing — pointless.
//
// Everything a person has to write lives here: the label for each check, how
// to read its number, and what to do when it is poor. Nothing in this file
// touches the worker, so all of it is exercised headlessly by the selftest.
// ---------------------------------------------------------------------------

export type CheckId =
  | 'faces'
  | 'subject'
  | 'background'
  | 'text_backing'
  | 'harmony'
  | 'saturation'
  | 'border'
  | 'safety'

/**
 * Must match `vision.CHECKS` exactly. `test_vision.py` asserts the Python side
 * emits these ids in this order and the selftest asserts every one has copy,
 * so a check added on one side fails the suite until the other catches up.
 */
export const CHECK_IDS: CheckId[] = [
  'faces',
  'subject',
  'background',
  'text_backing',
  'harmony',
  'saturation',
  'border',
  'safety',
]

export type Harmony = 'clash' | 'monochrome' | 'analogous' | 'triadic' | 'complementary'

export interface VisionCheck {
  id: CheckId
  score: number | null
  value: number | null
  /** Per-check extras: `count`, `harmony`, `dark`/`light`, and so on. */
  [key: string]: unknown
}

export interface FaceRegion {
  kind: 'face' | 'skin'
  /** Normalised [x, y, w, h], ready to draw over the preview. */
  box: number[]
  share: number
  fill: number
  aspect: number
}

export interface PaletteEntry {
  hex: string
  share: number
  hue: number
  saturation: number
  value: number
}

export interface RegionStats {
  hex: string
  luma: number
  share: number
  spread: number
  texture?: number
}

export interface BackingRow {
  box: number[]
  variation: number
  busyness: number
}

export interface VisionReport {
  width: number
  height: number
  faces: FaceRegion[]
  subject: RegionStats
  background: RegionStats
  color: {
    palette: PaletteEntry[]
    harmony: Harmony
    hues: number[]
    competing: number
    accent: string | null
    accent_share: number
    saturation: number
    score: number
  }
  text_backing: BackingRow[]
  checks: VisionCheck[]
}

/** What one round trip to Python returns. */
export interface TestReport {
  score: RawReport
  vision: VisionReport
}

// ------------------------------------------------------------------ copy ---

export interface CheckInfo {
  label: string
  /** Which tab it belongs under. */
  group: GroupId
  /** What the measurement is, in one line. */
  about: string
  /** Turns the raw measurement into a sentence. */
  read: (value: number, check: VisionCheck) => string
  /** What to do when the score is poor. */
  fix: string
  /** Shown when the check could not be measured at all. */
  absent: string
}

export const CHECK_INFO: Record<CheckId, CheckInfo> = {
  faces: {
    label: 'Face presence',
    group: 'faces',
    about:
      'Whether a face-sized region of skin tone is in the frame, and how much of the frame the largest one covers.',
    read: (v, c) => {
      const count = Number(c.count ?? 0)
      return `${count === 1 ? 'one face candidate' : `${count} face candidates`}, the largest covering ${(v * 100).toFixed(1)}% of the frame`
    },
    fix: 'A face is the strongest single signal a thumbnail carries, and the usual mistake is having one that is too small to read at 168 px. Crop in until the head fills a fifth of the frame or more.',
    absent:
      'No face-sized skin region found. That is fine for a design that is not built on one — but if there is a person in here, they are too small or too dark for the detector to separate.',
  },
  subject: {
    label: 'Subject separation',
    group: 'contrast',
    about:
      'Contrast ratio between the salient part of the design and everything behind it — whether the subject has a silhouette.',
    read: (v) => `${v.toFixed(2)}:1 between subject and background`,
    fix: 'Put the subject against a darker or lighter ground, add a white outline around a cut-out, or blur and darken the background. 3:1 is the threshold for large graphics.',
    absent: 'Nothing could be separated from the background.',
  },
  background: {
    label: 'Background calm',
    group: 'background',
    about:
      'Fine texture in the background — foliage, brickwork, crowds, JPEG mush. A smooth gradient counts as calm, because it is.',
    read: (v) => `texture energy ${(v * 1000).toFixed(1)}`,
    fix: 'Blur the background, replace it with a flat colour or a gradient, or cut the subject out and drop it on a plain ground. Texture is what eats a headline at small sizes.',
    absent: 'The background could not be measured.',
  },
  text_backing: {
    label: 'Backing behind the words',
    group: 'text',
    about:
      'How much the picture varies underneath your text, measured with the letters blurred away so only the backing is read.',
    read: (v) => `the worst headline sits on backing varying by ${(v * 100).toFixed(1)}%`,
    fix: 'Give that layer a plate (the text background in its properties), a scrim behind it, or move it over a plainer part of the picture. Half-on, half-off a bright area is the worst case.',
    absent: 'No visible text layers, so there is no backing to measure.',
  },
  harmony: {
    label: 'Colour combination',
    group: 'color',
    about:
      'The relationship between the colours carrying the frame, and how many of them are competing at once.',
    read: (_v, c) => {
      const harmony = String(c.harmony ?? 'unknown')
      const competing = Number(c.competing ?? 0)
      return `${HARMONY_INFO[harmony as Harmony]?.label ?? harmony}, ${competing === 1 ? 'one colour' : `${competing} colours`} in the scheme`
    },
    fix: 'Pick one ground colour, one subject colour and one accent, and delete the fourth. More than three colours competing is the most common way a thumbnail palette fails.',
    absent: 'No colours to relate.',
  },
  saturation: {
    label: 'Colour intensity',
    group: 'color',
    about: 'Mean saturation across the dominant colours. Both ends of this are a real failure.',
    read: (v) => `mean saturation ${(v * 100).toFixed(0)}%`,
    fix: 'A washed-out frame has no punch on a busy page; a fully saturated one vibrates and leaves the accent nowhere to go. Desaturate the ground and keep the strongest colour for one keyword.',
    absent: 'No colours to measure.',
  },
  border: {
    label: 'Edge definition',
    group: 'contrast',
    about:
      "Contrast between the outer ring of your thumbnail and the YouTube page behind it, in whichever theme is worse.",
    read: (v, c) => `${v.toFixed(2)}:1 against the page (dark ${Number(c.dark ?? 0).toFixed(2)}:1, light ${Number(c.light ?? 0).toFixed(2)}:1)`,
    fix: 'A near-black edge dissolves into the dark theme and a near-white one into the light theme, and the card stops reading as a picture. Lift or darken the outer few percent, or add a subtle border.',
    absent: 'The edge could not be measured.',
  },
  safety: {
    label: 'Skin-toned area',
    group: 'safety',
    about:
      'The share of the frame that is skin-toned. A measurement, not a content rating — see the note under this tab.',
    read: (v) => `${(v * 100).toFixed(0)}% of the frame is skin-toned`,
    fix: 'A frame that is mostly bare skin draws advertiser scrutiny regardless of what it actually shows. If that is not the point of the video, crop or cover.',
    absent: 'Not measured.',
  },
}

export const HARMONY_INFO: Record<Harmony, { label: string; about: string }> = {
  complementary: {
    label: 'Complementary',
    about:
      'Opposite hues. The strongest way to separate a subject from its background, because it does not depend on brightness — which is why blue-and-orange is everywhere.',
  },
  triadic: {
    label: 'Triadic',
    about: 'Three hues evenly spaced. Lively and balanced, but you have to supply the contrast yourself.',
  },
  analogous: {
    label: 'Analogous',
    about: 'Neighbouring hues. Calm and cohesive; needs brightness contrast to keep the subject readable.',
  },
  monochrome: {
    label: 'Monochrome',
    about: 'One hue, or none. Safe and quiet — the accent has to come from brightness or from a single spot colour.',
  },
  clash: {
    label: 'No clear relationship',
    about:
      'The hues do not sit in a recognised relationship. Not automatically wrong, but unpredictable — and at 168 px unpredictable and bad look the same.',
  },
}

// ----------------------------------------------------------------- groups ---

export type GroupId =
  | 'faces'
  | 'objects'
  | 'labels'
  | 'logos'
  | 'text'
  | 'contrast'
  | 'background'
  | 'color'
  | 'safety'

export interface GroupInfo {
  id: GroupId
  label: string
  /** One line under the tab, explaining what this tab is reading. */
  about: string
  /** True when the tab is read from the project rather than from the pixels. */
  scene: boolean
}

/**
 * The tabs, in reading order. `scene: true` marks the ones that come from the
 * project rather than the pixels, which the UI states plainly — a reader
 * should always know whether a number was measured or looked up.
 */
export const TEST_GROUPS: GroupInfo[] = [
  { id: 'faces', label: 'Faces', about: 'Skin-tone regions found in the rendered frame.', scene: false },
  { id: 'objects', label: 'Objects', about: 'Every layer in the design, and what it contributes.', scene: true },
  { id: 'labels', label: 'Labels', about: 'What this thumbnail is made of and what its words are doing.', scene: true },
  { id: 'logos', label: 'Logos', about: 'Brand marks and identity elements in the design.', scene: true },
  { id: 'text', label: 'Text', about: 'Every text layer, its type settings and what it measures on a phone.', scene: false },
  { id: 'contrast', label: 'Contrast', about: 'Subject against background, words against backing, frame against page.', scene: false },
  { id: 'background', label: 'Background', about: 'What is behind the subject and how quiet it is.', scene: false },
  { id: 'color', label: 'Colour', about: 'Dominant colours, their relationship and the combination score.', scene: false },
  { id: 'safety', label: 'Safe search', about: 'What can and cannot be determined offline.', scene: false },
]

/**
 * The honest limits of an offline report, shown on the tabs that a cloud
 * vision API would answer differently. Stating this is not a disclaimer for
 * its own sake: a reader who thinks "Face presence" came from a trained
 * detector will trust it in cases where it should not be trusted.
 */
export const LIMITS: Record<string, string> = {
  faces:
    'These are candidates from skin chrominance and shape, not a trained face detector, and skin thresholding is least reliable at the extremes of the skin-tone range. Facial expression — the joy / sorrow / anger / surprise readings a cloud vision API prints — cannot be derived this way, so it is not shown rather than guessed.',
  safety:
    'Content classification (adult, violent, medical, spoof) needs a trained classifier and a server to run it on. Everything here runs in your browser, so the only honest thing to report is the measurement: how much of the frame is skin-toned. Treat it as a prompt to look, not as a rating.',
  labels:
    'Read from your project, not recognised from the picture — so these describe what you built, not what a viewer or a classifier would name in it.',
}

// ------------------------------------------------------- the scene report ---

export interface ObjectRow {
  id: string
  /** What it is, in the reader's words rather than the type system's. */
  kind: string
  name: string
  /** Share of the canvas area its bounding box covers. */
  share: number
  /** Normalised [x, y, w, h], for the overlay. */
  box: number[]
  detail: string
  hidden: boolean
}

export interface TextRow {
  id: string
  text: string
  font: string
  weight: number
  size: number
  /** What the size becomes on the smallest mobile row, in CSS pixels. */
  mobilePx: number
  words: number
  caps: boolean
  plate: boolean
  box: number[]
  hidden: boolean
}

export interface LabelRow {
  label: string
  detail: string
}

export interface SceneReport {
  objects: ObjectRow[]
  text: TextRow[]
  labels: LabelRow[]
  logos: ObjectRow[]
  /** Layer count, which is the clutter number a designer actually watches. */
  layers: number
  fonts: string[]
  words: number
}

/** The width the smallest mobile row gives a thumbnail; see previewSurfaces. */
const MOBILE_ROW_WIDTH = 140

function normBox(project: Project, object: SceneObject): number[] {
  const box = boundingRect([object])
  if (!box) return [0, 0, 0, 0]
  return [
    box.x / project.width,
    box.y / project.height,
    box.width / project.width,
    box.height / project.height,
  ].map((v) => Math.round(v * 10000) / 10000)
}

/** Share of the canvas a normalised box covers. */
function areaShare(box: number[]): number {
  return Math.max(0, Math.min(1, box[2] * box[3]))
}

/** A layer whose name says it is a mark, for brands that place a wordmark. */
const LOGO_NAME = /\b(logo|wordmark|brand ?mark|watermark|badge)\b/i

function describe(object: SceneObject): { kind: string; detail: string } {
  if (object.type === 'text') {
    const text = object as TextObject
    return { kind: 'Text', detail: `${text.fontFamily} ${text.fontWeight} · ${Math.round(text.fontSize)} px` }
  }
  if (object.type === 'image') {
    const image = object as ImageObject
    if (image.icon) return { kind: 'Icon', detail: image.icon }
    if (image.useCutout && image.cutoutAssetId) return { kind: 'Cut-out photo', detail: 'background removed' }
    return { kind: 'Photo', detail: image.filter && image.filter !== 'none' ? `filter: ${image.filter}` : 'no filter' }
  }
  const shape = object as ShapeObject
  return {
    kind: 'Shape',
    detail: shape.fade?.enabled ? `${shape.shape} · faded to transparent` : shape.shape,
  }
}

/**
 * Everything the report can say without looking at a single pixel. Hidden
 * layers are listed but marked, because "why is my design missing something"
 * is answered by seeing it here greyed out rather than by it being absent.
 */
export function sceneReport(project: Project): SceneReport {
  const objects: ObjectRow[] = project.objects.map((object) => {
    const box = normBox(project, object)
    const { kind, detail } = describe(object)
    return {
      id: object.id,
      kind,
      name: object.name,
      share: Math.round(areaShare(box) * 10000) / 10000,
      box,
      detail,
      hidden: !!object.hidden,
    }
  })

  const texts = project.objects.filter((o): o is TextObject => o.type === 'text')
  const text: TextRow[] = texts.map((t) => {
    const box = normBox(project, t)
    const body = t.uppercase ? t.text.toUpperCase() : t.text
    return {
      id: t.id,
      text: body,
      font: t.fontFamily,
      weight: t.fontWeight,
      size: Math.round(t.fontSize),
      mobilePx: Math.round(((t.fontSize * MOBILE_ROW_WIDTH) / project.width) * 10) / 10,
      words: body.trim() ? body.trim().split(/\s+/).length : 0,
      caps: t.uppercase || (body.length > 2 && body === body.toUpperCase() && /[A-Z]/.test(body)),
      plate: t.bgEnabled,
      box,
      hidden: !!t.hidden,
    }
  })

  // Paired by index rather than looked up by id: `objects` is a 1:1 map over
  // `project.objects`, and pairing here keeps it that way if either changes.
  const logos = project.objects
    .map((object, i) => ({ object, row: objects[i] }))
    .filter(({ object, row }) => (object.type === 'image' && !!(object as ImageObject).icon) || LOGO_NAME.test(row.name))
    .map(({ row }) => row)

  const visible = project.objects.filter((o) => !o.hidden)
  const fonts = [...new Set(texts.filter((t) => !t.hidden).map((t) => t.fontFamily))]
  const words = text.filter((t) => !t.hidden).reduce((n, t) => n + t.words, 0)

  return {
    objects,
    text,
    labels: labelsFor(project, { visible, text, fonts }),
    logos,
    layers: visible.length,
    fonts,
    words,
  }
}

/** Patterns in a headline that change how it is read. */
const WORD_SIGNALS: Array<{ label: string; test: RegExp; detail: string }> = [
  { label: 'Question', test: /\?/, detail: 'A question makes the viewer supply the answer — the cheapest hook there is.' },
  { label: 'Number', test: /\d/, detail: 'A figure is concrete and reads fast. It is also the first thing lost if the type is too small.' },
  { label: 'Currency', test: /[$₹€£¥]|\b(crore|lakh|million|billion)\b/i, detail: 'A money figure promises a specific outcome, which is why it out-performs a vague one.' },
  { label: 'Superlative', test: /\b(best|worst|never|always|every|only|first|last|ever|most)\b/i, detail: 'A superlative raises the stake. It also raises the bar the video has to clear.' },
  { label: 'Negative frame', test: /\b(no|not|don'?t|stop|avoid|mistake|wrong|fail|can'?t)\b/i, detail: 'Naming the problem lands harder than promising the fix, because the viewer already has the problem.' },
  { label: 'Second person', test: /\b(you|your|you'?re)\b/i, detail: 'Addressing the viewer directly turns a topic into their topic.' },
]

function labelsFor(
  project: Project,
  scene: { visible: SceneObject[]; text: TextRow[]; fonts: string[] },
): LabelRow[] {
  const labels: LabelRow[] = []
  const images = scene.visible.filter((o): o is ImageObject => o.type === 'image')
  const photos = images.filter((o) => !o.icon)
  const cutouts = photos.filter((o) => o.useCutout && o.cutoutAssetId)
  const icons = images.filter((o) => !!o.icon)
  const shapes = scene.visible.filter((o) => o.type === 'shape')
  const visibleText = scene.text.filter((t) => !t.hidden)

  if (cutouts.length > 0) {
    labels.push({ label: 'Cut-out subject', detail: `${cutouts.length} layer${cutouts.length === 1 ? '' : 's'} with the background removed.` })
  }
  const fullBleed = photos.find((o) => {
    const box = normBox(project, o)
    return box[2] >= 0.92 && box[3] >= 0.92
  })
  if (fullBleed) labels.push({ label: 'Full-bleed photo', detail: 'A photograph covering the whole frame, so everything else sits on top of it.' })
  if (photos.length > 0 && !fullBleed && cutouts.length === 0) {
    labels.push({ label: 'Placed photo', detail: 'A photograph occupying part of the frame.' })
  }
  if (photos.length === 0) labels.push({ label: 'No photography', detail: 'Built from type, shapes and icons alone.' })
  if (icons.length > 0) labels.push({ label: 'Iconography', detail: `${icons.length} icon${icons.length === 1 ? '' : 's'} from the library.` })
  if (shapes.length > 0) labels.push({ label: 'Graphic elements', detail: `${shapes.length} shape${shapes.length === 1 ? '' : 's'} — plates, scrims or accents.` })

  if (visibleText.length === 0) {
    labels.push({ label: 'Wordless', detail: 'No text at all. The picture is carrying the whole hook.' })
  } else {
    const total = visibleText.reduce((n, t) => n + t.words, 0)
    labels.push({
      label: total <= 4 ? 'Short headline' : total <= 7 ? 'Medium headline' : 'Text-heavy',
      detail: `${total} word${total === 1 ? '' : 's'} across ${visibleText.length} layer${visibleText.length === 1 ? '' : 's'}.`,
    })
    if (visibleText.every((t) => t.caps)) labels.push({ label: 'All caps', detail: 'Loud and uniform. It also removes the word shapes that make reading fast.' })
    if (scene.fonts.length > 2) {
      labels.push({ label: 'Mixed typefaces', detail: `${scene.fonts.length} families: ${scene.fonts.join(', ')}. Two is a system; four is a collection.` })
    }
    const headline = visibleText.reduce((big, t) => (t.size > big.size ? t : big))
    for (const signal of WORD_SIGNALS) {
      if (signal.test.test(headline.text)) labels.push({ label: signal.label, detail: signal.detail })
    }
  }

  if (project.brandId) {
    labels.push({ label: 'Brand layout', detail: `Follows the ${project.brandId} preset, so Brand QA can grade it against its own rules.` })
  }
  return labels
}

// ----------------------------------------------------------- the headline ---

export interface Headline {
  score: number
  verdict: Verdict
  /** The checks worth acting on, worst first. */
  failing: VisionCheck[]
}

/** Checks below this are worth putting in front of the reader. */
export const ACT_ON = 75

/**
 * One number for the whole test, and the checks behind it.
 *
 * It is the mean of the mobile platform score and every vision check that
 * could be measured — mobile rather than desktop because that is where most
 * impressions are, and an unmeasurable check drops out rather than counting as
 * zero, exactly as `score.analyze` treats a missing metric.
 */
export function headline(report: TestReport): Headline {
  const scored = report.vision.checks.filter((c) => typeof c.score === 'number') as Array<
    VisionCheck & { score: number }
  >
  const mobile = report.score.platforms.find((p) => p.id === 'mobile')
  const parts = [...scored.map((c) => c.score), ...(mobile ? [mobile.score] : [])]
  const score = parts.length > 0 ? Math.round(parts.reduce((a, b) => a + b, 0) / parts.length) : 0
  return {
    score,
    verdict: verdict(score),
    failing: [...scored].filter((c) => c.score < ACT_ON).sort((a, b) => a.score - b.score),
  }
}

/** The checks belonging to one tab, in `CHECK_IDS` order. */
export function checksIn(group: GroupId, checks: VisionCheck[]): VisionCheck[] {
  return CHECK_IDS.filter((id) => CHECK_INFO[id].group === group)
    .map((id) => checks.find((c) => c.id === id))
    .filter((c): c is VisionCheck => c !== undefined)
}
