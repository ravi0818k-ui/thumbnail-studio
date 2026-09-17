import { useEditor } from '../../store/editorStore'
import { createText } from '../../engine/factory'
import { TEXT_PRESETS } from '../../data/textPresets'
import { measuredTextHeight } from '../../engine/text'
import { ensureFontLoaded } from '../../data/fonts'
import type { TextObject } from '../../types'

export default function TextPanel() {
  const project = useEditor((s) => s.project)
  const addObject = useEditor((s) => s.addObject)
  const selection = useEditor((s) => s.selection)
  const updateSelected = useEditor((s) => s.updateSelected)

  const add = async (partial: Partial<TextObject>) => {
    const width = Math.round(project.width * 0.55)
    const obj = createText({ ...partial, width, x: Math.round(project.width * 0.08), y: Math.round(project.height * 0.2) })
    await ensureFontLoaded(obj.fontFamily, obj.fontWeight, obj.fontSize)
    obj.height = measuredTextHeight(obj)
    addObject(obj)
    useEditor.getState().setEditingText(obj.id)
  }

  const applyPreset = async (id: string) => {
    const preset = TEXT_PRESETS.find((p) => p.id === id)!
    const textSelected = project.objects.some((o) => selection.includes(o.id) && o.type === 'text')
    if (textSelected) {
      const state = useEditor.getState()
      state.pushHistory()
      await ensureFontLoaded(preset.apply.fontFamily ?? 'Anton', preset.apply.fontWeight ?? 400)
      updateSelected(preset.apply)
      return
    }
    await add({ ...preset.apply, text: 'YOUR TEXT' })
  }

  return (
    <div>
      <h2 className="panel-title">Text</h2>
      <button className="btn primary block" onClick={() => add({ text: 'YOUR TEXT', fontSize: 120 })}>
        + Add text
      </button>
      <div className="grid-3" style={{ marginTop: 8 }}>
        <button className="btn small" onClick={() => add({ text: 'Heading', fontSize: 110 })}>
          Heading
        </button>
        <button className="btn small" onClick={() => add({ text: 'Subheading', fontSize: 64, strokeWidth: 4 })}>
          Sub
        </button>
        <button
          className="btn small"
          onClick={() => add({ text: 'Body text', fontSize: 38, fontFamily: 'Inter', fontWeight: 600, uppercase: false, strokeWidth: 0 })}
        >
          Body
        </button>
      </div>

      <div className="section-head" style={{ marginTop: 20 }}>
        One-click styles
      </div>
      <div className="preset-grid">
        {TEXT_PRESETS.map((p) => (
          <button
            key={p.id}
            className="preset"
            onClick={() => applyPreset(p.id)}
            title={selection.length ? `Apply ${p.label} to selection` : `Add ${p.label} text`}
            style={{ background: p.preview.bg ?? '#0f1319' }}
          >
            <span
              style={{
                fontFamily: `"${p.apply.fontFamily}", Impact, sans-serif`,
                fontWeight: p.apply.fontWeight ?? 700,
                fontSize: 19,
                color: p.preview.color,
                WebkitTextStroke: p.preview.stroke ? `1.5px ${p.preview.stroke}` : undefined,
                textShadow: p.preview.shadow,
                textTransform: 'uppercase',
              }}
            >
              {p.label}
            </span>
          </button>
        ))}
      </div>
      <p className="muted" style={{ marginTop: 10 }}>
        Select a text layer first to restyle it, or click a style to drop in new text.
      </p>
    </div>
  )
}
