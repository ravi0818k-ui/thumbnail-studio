// ---------------------------------------------------------------------------
// Facts about the background remover's models, kept apart from the worker so
// the page and the selftest can read them without bundling the runtime.
// ---------------------------------------------------------------------------

export interface ModelInfo {
  id: string
  repo: string
  name: string
  licence: string
  /** Download size in MB, as shown before the first run. */
  megabytes: number
  role: string
}

export const REMOVER_MODELS: ModelInfo[] = [
  {
    id: 'general',
    repo: 'onnx-community/BiRefNet_lite-ONNX',
    name: 'BiRefNet-lite',
    licence: 'MIT',
    megabytes: 115,
    role: 'Finds the subject and its edges, hair included',
  },
  {
    id: 'cpu',
    repo: 'Orangebot/ormbg-ONNX',
    name: 'ormbg',
    licence: 'Apache-2.0',
    megabytes: 44,
    role: 'Stands in for BiRefNet on a computer without a usable GPU',
  },
  {
    id: 'person',
    repo: 'Xenova/modnet',
    name: 'MODNet',
    licence: 'Apache-2.0',
    megabytes: 7,
    role: 'Knows where a person ends — powers "Person only"',
  },
]

/** What the first photo downloads: one subject model (GPU or CPU, never both) plus the person model. */
export function downloadMegabytes(gpu: boolean): number {
  const pick = (id: string) => REMOVER_MODELS.find((m) => m.id === id)!.megabytes
  return pick(gpu ? 'general' : 'cpu') + pick('person')
}

/**
 * How much context, as a share of the photo's short side, the page sends
 * around a refine stroke. It must cover matte.refine_margin —
 * SAMPLE_REACH × SAMPLE_WIDEN + BAND — or the solver cannot see the known
 * colours it reaches for. The selftest reads matte.py and checks this.
 */
export const REFINE_MARGIN = 0.09

/**
 * When this share of the cut-out lies outside the person, the page suggests
 * "Person only": below it the extra is a strand or a shoulder bag, not a chair.
 */
export const PERSON_HINT_EXTRA = 0.12
