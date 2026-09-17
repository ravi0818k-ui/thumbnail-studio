import { useEditor } from '../store/editorStore'
import { IconMinus, IconPlus } from './icons'
import { formatConfig } from '../data/formats'

const STEPS = [0.25, 0.5, 0.75, 1]

export default function ZoomBar() {
  const zoom = useEditor((s) => s.zoom)
  const fitZoom = useEditor((s) => s.fitZoom)
  const setZoom = useEditor((s) => s.setZoom)
  const project = useEditor((s) => s.project)
  const objects = useEditor((s) => s.project.objects.length)

  return (
    <div className="zoombar">
      <span>
        {formatConfig(project.format).glyph} {project.width} × {project.height}
      </span>
      <span className="badge">{objects} layers</span>
      <div className="spacer" />
      <button className="icon-btn" onClick={() => setZoom(zoom / 1.15)} title="Zoom out">
        <IconMinus />
      </button>
      <span className="zoom-value">{Math.round(zoom * 100)}%</span>
      <button className="icon-btn" onClick={() => setZoom(zoom * 1.15)} title="Zoom in">
        <IconPlus />
      </button>
      {STEPS.map((s) => (
        <button key={s} className="btn ghost small" onClick={() => setZoom(s)}>
          {s * 100}%
        </button>
      ))}
      <button className="btn ghost small" onClick={() => setZoom(fitZoom)}>
        Fit
      </button>
      <div className="spacer" />
      <span className="kbd">Ctrl + scroll to zoom</span>
    </div>
  )
}
