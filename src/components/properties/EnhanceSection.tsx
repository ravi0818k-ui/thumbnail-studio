import { useEffect, useState } from 'react'
import { useEditor } from '../../store/editorStore'
import type { ImageObject } from '../../types'
import { Section } from '../ui'
import { getLoadedAsset } from '../../engine/assets'
import { forgetBrushCanvas } from '../../engine/backgroundRemoval'
import {
  ENHANCEMENTS,
  PYTHON_DOWNLOAD_MB,
  enhanceAsset,
  onPythonStatus,
  preloadPython,
  pythonStatus,
  type PythonEnhancement,
} from '../../engine/pythonImage'

/**
 * Image quality operations that run in Python (numpy) on WebAssembly — the
 * things Canvas 2D filters genuinely cannot do.
 */
export default function EnhanceSection({ object }: { object: ImageObject }) {
  const updateObject = useEditor((s) => s.updateObject)
  const pushHistory = useEditor((s) => s.pushHistory)
  const [engine, setEngine] = useState(pythonStatus())
  const [busy, setBusy] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [note, setNote] = useState<string | null>(null)

  useEffect(() => onPythonStatus(() => setEngine(pythonStatus())), [])

  // Enhancing always works on the version the canvas is showing, so it applies
  // to a cut-out once one exists — alpha is preserved by the pipeline.
  const usingCutout = object.useCutout && !!object.cutoutAssetId
  const targetId = usingCutout ? object.cutoutAssetId! : object.assetId

  const run = async (enhancement: PythonEnhancement) => {
    const asset = getLoadedAsset(targetId)
    if (!asset) return
    setBusy(enhancement.id)
    setError(null)
    setNote(null)
    try {
      const result = await enhanceAsset(asset, enhancement)
      pushHistory()
      if (usingCutout) {
        forgetBrushCanvas(object.cutoutAssetId!)
        updateObject<ImageObject>(object.id, { cutoutAssetId: result.id })
      } else {
        updateObject<ImageObject>(object.id, { assetId: result.id })
      }
      const grew = result.width !== asset.width
      setNote(
        grew
          ? `Now ${result.width} × ${result.height} px — same size on canvas, more detail to render from.`
          : `Applied to ${result.width} × ${result.height} px.`,
      )
    } catch (err) {
      setError(err instanceof Error ? err.message : 'The Python engine failed on this image.')
    } finally {
      setBusy(null)
    }
  }

  if (!object.assetId) return null

  return (
    <Section title="Enhance quality" defaultOpen={false}>
      {engine.status !== 'ready' && (
        <div className="stage-note" style={{ marginTop: 0, marginBottom: 10 }}>
          <span>
            {engine.status === 'loading' ? (
              <>Loading the Python engine — {engine.stage}…</>
            ) : engine.status === 'failed' ? (
              <>Python engine unavailable: {engine.stage}</>
            ) : (
              <>
                These run CPython + numpy on WebAssembly. The first use downloads about {PYTHON_DOWNLOAD_MB} MB, then
                the browser caches it.
              </>
            )}
          </span>
        </div>
      )}
      {engine.status === 'idle' && (
        <button className="btn small block" style={{ marginBottom: 10 }} onClick={preloadPython}>
          Load the Python engine now
        </button>
      )}

      <div className="grid-2">
        {ENHANCEMENTS.map((enhancement) => (
          <button
            key={enhancement.id}
            className="btn small"
            title={enhancement.hint}
            disabled={busy !== null}
            onClick={() => void run(enhancement)}
          >
            {busy === enhancement.id ? 'Working…' : enhancement.label}
          </button>
        ))}
      </div>

      {busy && (
        <div className="progress" style={{ marginTop: 10 }}>
          <span style={{ width: engine.status === 'ready' ? '75%' : '35%' }} />
        </div>
      )}
      {note && (
        <p className="muted" style={{ marginTop: 8 }}>
          {note} Undo (Ctrl+Z) restores the previous version.
        </p>
      )}
      {error && (
        <p className="muted" style={{ color: 'var(--accent)' }}>
          {error}
        </p>
      )}
      <p className="muted" style={{ marginTop: 8 }}>
        Applies to {usingCutout ? 'the cut-out' : 'the source image'} and re-renders every layer that uses it. Pixels
        never leave the browser.
      </p>
    </Section>
  )
}
