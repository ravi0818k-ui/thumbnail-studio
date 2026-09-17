import { useEffect, useMemo, useRef, useState } from 'react'
import { useEditor } from '../store/editorStore'
import { Field, Modal, Segmented, Slider } from './ui'
import { downloadBlob, exportBlob, safeFilename, type ExportFormat } from '../engine/export'
import { renderToCanvas } from '../engine/renderer'
import { formatConfig } from '../data/formats'

export default function ExportDialog() {
  const project = useEditor((s) => s.project)
  const settings = useEditor((s) => s.exportSettings)
  const setSettings = useEditor((s) => s.setExportSettings)
  const close = () => useEditor.getState().setExportOpen(false)
  const previewRef = useRef<HTMLCanvasElement>(null)
  const [busy, setBusy] = useState(false)
  const [size, setSize] = useState<string>('—')

  const dimensions = useMemo(
    () => `${project.width * settings.scale} × ${project.height * settings.scale}`,
    [project.width, project.height, settings.scale],
  )

  useEffect(() => {
    const host = previewRef.current
    if (!host) return
    // Fit the preview to a box so a 9:16 cover does not run off the dialog.
    const scale = Math.min(520 / project.width, 380 / project.height)
    const rendered = renderToCanvas(project, scale, settings.transparent && settings.format !== 'jpg')
    host.width = rendered.width
    host.height = rendered.height
    host.getContext('2d')!.drawImage(rendered, 0, 0)
  }, [project, settings.transparent, settings.format])

  // Show the real output size so people can judge quality settings.
  useEffect(() => {
    let cancelled = false
    void exportBlob(project, settings).then((blob) => {
      if (!cancelled) setSize(`${(blob.size / 1024).toFixed(0)} KB`)
    })
    return () => {
      cancelled = true
    }
  }, [project, settings])

  const download = async () => {
    setBusy(true)
    try {
      const blob = await exportBlob(project, settings)
      downloadBlob(blob, safeFilename(project.name, settings.format))
    } finally {
      setBusy(false)
    }
  }

  return (
    <Modal
      title={`Export ${formatConfig(project.format).shortLabel.toLowerCase()}`}
      onClose={close}
      footer={
        <>
          <button className="btn" onClick={close}>
            Back to editor
          </button>
          <button className="btn primary" disabled={busy} onClick={download}>
            {busy ? 'Preparing…' : `${formatConfig(project.format).exportLabel} · ${settings.format.toUpperCase()}`}
          </button>
        </>
      }
    >
      <div className="export-layout">
        <div>
          <div className="canvas-host" style={{ position: 'relative', aspectRatio: `${project.width} / ${project.height}` }}>
            <canvas ref={previewRef} style={{ position: 'absolute', inset: 0, width: '100%', height: '100%' }} />
          </div>
          <p className="muted" style={{ marginTop: 10 }}>
            Your thumbnail is ready — {dimensions} · about {size}.
          </p>
        </div>
        <div>
          <Field label="Format" stack>
            <Segmented
              value={settings.format}
              onChange={(format: ExportFormat) => setSettings({ format })}
              options={[
                { value: 'png', label: 'PNG' },
                { value: 'jpg', label: 'JPG' },
                { value: 'webp', label: 'WEBP' },
              ]}
            />
          </Field>
          <Field label="Scale" stack>
            <Segmented
              value={String(settings.scale)}
              onChange={(v) => setSettings({ scale: Number(v) })}
              options={[
                { value: '1', label: '1×' },
                { value: '2', label: '2×' },
                { value: '3', label: '3×' },
              ]}
            />
          </Field>
          {settings.format !== 'png' && (
            <Slider
              label="Quality"
              value={settings.quality}
              min={40}
              max={100}
              suffix="%"
              onChange={(quality) => setSettings({ quality })}
            />
          )}
          <label className="toggle" style={{ marginTop: 8 }}>
            <input
              type="checkbox"
              checked={settings.transparent}
              disabled={settings.format === 'jpg'}
              onChange={(e) => setSettings({ transparent: e.target.checked })}
            />
            <span>Transparent background</span>
          </label>
          {settings.format === 'jpg' && <p className="muted">JPG has no transparency — use PNG or WEBP.</p>}
          <p className="muted" style={{ marginTop: 14 }}>
            {project.format === 'shorts'
              ? 'YouTube accepts files up to 2 MB. 1080 × 1920 PNG at 1× is the safe default for a Shorts cover.'
              : 'YouTube accepts files up to 2 MB. 1280 × 720 PNG at 1× is the safe default.'}
          </p>
        </div>
      </div>
    </Modal>
  )
}
