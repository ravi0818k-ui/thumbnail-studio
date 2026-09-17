import { useEditor } from '../store/editorStore'
import type { ImageObject } from '../types'

const COPY: Record<string, string> = {
  erase: 'drag to rub the cut-out away',
  restore: 'drag to paint the original back',
  clean: 'drag over the leftover specks — the subject is never removed',
  blur: 'drag over the object — its shape is found for you, so you need not be neat',
}

const LABELS: Record<string, string> = {
  erase: 'Erase brush',
  restore: 'Restore brush',
  clean: 'Clean brush',
  blur: 'Object blur',
}

/**
 * Floating controls while a cut-out brush is active. It lives beside the stage
 * rather than inside it so the scrolling canvas cannot clip it, and it carries
 * the size control because the brush is useless if you cannot judge its size.
 */
export default function BrushBar() {
  const eraseMode = useEditor((s) => s.eraseMode)
  const brushSize = useEditor((s) => s.brushSize)
  const setBrushSize = useEditor((s) => s.setBrushSize)
  const setEraseMode = useEditor((s) => s.setEraseMode)
  const brushStatus = useEditor((s) => s.brushStatus)
  const croppingId = useEditor((s) => s.croppingId)
  const selected = useEditor((s) => s.project.objects.find((o) => o.id === s.selection[0])) as
    | ImageObject
    | undefined

  if (eraseMode === 'off' || croppingId) return null

  const usable =
    selected?.type === 'image' && (eraseMode === 'blur' || (!!selected.cutoutAssetId && selected.useCutout))
  const missing = eraseMode === 'blur' ? 'select a photo layer first' : 'select a cut-out layer first'

  return (
    <div className="crop-bar">
      <span className="crop-bar-label">
        <b>{LABELS[eraseMode]}</b>
      </span>
      <span className="kbd">{usable ? COPY[eraseMode] : missing}</span>
      <input
        type="range"
        min={4}
        max={200}
        value={brushSize}
        aria-label="Brush size"
        onChange={(e) => setBrushSize(Number(e.target.value))}
        style={{ width: 120 }}
      />
      <span className="crop-bar-label">
        <b>{brushSize}</b> px
      </span>
      {brushStatus && <span className="crop-bar-label">{brushStatus}</span>}
      <button className="btn small" onClick={() => setEraseMode('off')}>
        Done
      </button>
    </div>
  )
}
