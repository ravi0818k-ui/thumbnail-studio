import { useEditor } from '../../store/editorStore'
import { createText } from '../../engine/factory'
import { TEXT_PRESETS } from '../../data/textPresets'
import { measuredTextHeight } from '../../engine/text'
import { ensureFontLoaded } from '../../data/fonts'
import { guideRect, innermostGuide } from '../../data/formats'
import { autoSizePatch } from '../../engine/text'
import { familyWeights, nearestOf } from '../../engine/customFonts'
import FontUpload from '../FontUpload'
import type { TextObject } from '../../types'
import { TEXT_PARTS, TEXT_PART_GROUPS, TEXT_SHADOWS, scrimIndex, withShadowStyle, type TextPart } from '../../data/textCollection'
import { ELEMENTS } from '../../data/elements'
import { createElement, createShape } from '../../engine/factory'
import TextPartPreview from '../TextPartPreview'

/** The photo shadows offered here — the Elements panel's scrims that sit under text. */
const PHOTO_SHADOWS = ['shadow-bottom', 'shadow-top', 'shadow-vignette']

export default function TextPanel() {
  const project = useEditor((s) => s.project)
  const addObject = useEditor((s) => s.addObject)
  const selection = useEditor((s) => s.selection)
  const updateSelected = useEditor((s) => s.updateSelected)

  const add = async (partial: Partial<TextObject>) => {
    // On a banner, new text lands centred in the band every device shows —
    // the thumbnail's upper-left spot is TV-only there.
    const guide = innermostGuide(project.format)
    const band = guide ? guideRect(guide, project.width, project.height) : null
    const width = Math.round(band ? band.width * 0.8 : project.width * 0.55)
    const x = Math.round(band ? band.x + (band.width - width) / 2 : project.width * 0.08)
    const obj = createText({ ...partial, width, x, y: Math.round(project.height * 0.2) })
    await ensureFontLoaded(obj.fontFamily, obj.fontWeight, obj.fontSize)
    obj.height = measuredTextHeight(obj)
    if (band) obj.y = Math.round(band.y + (band.height - obj.height) / 2)
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

  const addPart = async (part: TextPart) => {
    const objects = part.build(project.width, project.height)
    await Promise.all(objects.map((o) => (o.type === 'text' ? ensureFontLoaded(o.fontFamily, o.fontWeight, o.fontSize) : null)))
    // Measured once the face is in, so each box is exactly as tall as its wrapped text.
    const sized = objects.map((o) => (o.type === 'text' && o.autoHeight ? { ...o, ...autoSizePatch(o) } : o))
    useEditor.getState().addObjects(sized)
  }

  const applyShadow = (id: string) => {
    const style = TEXT_SHADOWS.find((t) => t.id === id)!
    const state = useEditor.getState()
    const targets = state.project.objects.filter((o) => state.selection.includes(o.id))
    if (targets.length === 0) return
    state.pushHistory()
    for (const o of targets) state.updateObject(o.id, { effects: withShadowStyle(o.effects, style) })
  }

  const addPhotoShadow = (id: string | null) => {
    const state = useEditor.getState()
    const { width, height, objects } = state.project
    const scrim = id
      ? createElement(ELEMENTS.find((e) => e.id === id)!, width, height)
      : createShape({ name: 'Dim', shape: 'rect', x: 0, y: 0, width, height, fill: '#000000', opacity: 45, cornerRadius: 0 })
    state.addObject(scrim, { at: scrimIndex(objects) })
  }

  // A family uploaded while text is selected goes straight onto that text.
  const applyUploaded = (family: string) => {
    const state = useEditor.getState()
    const texts = state.project.objects.filter((o): o is TextObject => o.type === 'text' && state.selection.includes(o.id))
    if (texts.length === 0) return
    state.pushHistory()
    const weights = familyWeights(family) ?? []
    for (const t of texts) {
      state.updateObject<TextObject>(t.id, { fontFamily: family, fontWeight: nearestOf(weights, t.fontWeight) })
      const next = useEditor.getState().project.objects.find((o) => o.id === t.id) as TextObject
      const sized = autoSizePatch(next)
      if (Object.keys(sized).length > 0) state.updateObject<TextObject>(t.id, sized)
    }
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
        Text collection
      </div>
      {TEXT_PART_GROUPS.map((group) => (
        <div key={group} className="part-group">
          <span className="part-group-name">{group}</span>
          <div className="part-grid">
            {TEXT_PARTS.filter((p) => p.group === group).map((part) => (
              <button key={part.id} className="part-tile" onClick={() => addPart(part)} title={part.hint}>
                <TextPartPreview part={part} />
                <span>{part.label}</span>
              </button>
            ))}
          </div>
        </div>
      ))}

      <div className="section-head" style={{ marginTop: 20 }}>
        Text shadow
      </div>
      <div className="shadow-grid">
        {TEXT_SHADOWS.map((t) => (
          <button
            key={t.id}
            className={`shadow-chip shadow-${t.id}`}
            onClick={() => applyShadow(t.id)}
            disabled={selection.length === 0}
            title={selection.length === 0 ? 'Select a layer first' : t.hint}
          >
            <span>Aa</span>
            {t.label}
          </button>
        ))}
      </div>

      <div className="section-head" style={{ marginTop: 20 }}>
        Shadow behind text
      </div>
      <div className="grid-2">
        {PHOTO_SHADOWS.map((id) => (
          <button key={id} className="btn small" onClick={() => addPhotoShadow(id)}>
            {ELEMENTS.find((e) => e.id === id)!.label}
          </button>
        ))}
        <button className="btn small" onClick={() => addPhotoShadow(null)}>
          Dim whole photo
        </button>
      </div>
      <p className="muted" style={{ marginTop: 8 }}>
        Shadows go in just above your photo, under every word, so the text stays bright.
      </p>

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

      <div className="section-head" style={{ marginTop: 20 }}>
        Your fonts
      </div>
      <FontUpload onAdded={applyUploaded} />
    </div>
  )
}
