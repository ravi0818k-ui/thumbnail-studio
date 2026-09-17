import { useEffect, useMemo, useState } from 'react'
import { useEditor } from '../../store/editorStore'
import { BRAND_PRESETS, type BrandColor, type BrandPreset } from '../../data/brands'
import { templatesForBrand } from '../../data/templates'
import {
  brandElementObject,
  brandIconSlot,
  brandTextObject,
  cutoutPatch,
  textStylePatch,
} from '../../engine/brandApply'
import { runBrandQa, sampleColorShare, qaScore, type ColorShare, type QaItem } from '../../engine/brandQa'
import { measuredTextHeight } from '../../engine/text'
import { ensureFontLoaded } from '../../data/fonts'
import type { ImageObject, TextObject } from '../../types'
import TemplatePreview from '../TemplatePreview'
import { Section } from '../ui'

export default function BrandPanel() {
  const project = useEditor((s) => s.project)
  const selection = useEditor((s) => s.selection)
  const brandId = useEditor((s) => s.project.brandId)
  const setBrand = useEditor((s) => s.setBrand)
  const applyTemplate = useEditor((s) => s.applyTemplate)
  const addObject = useEditor((s) => s.addObject)
  const updateObject = useEditor((s) => s.updateObject)
  const setBackground = useEditor((s) => s.setBackground)
  const setCanvasSize = useEditor((s) => s.setCanvasSize)
  const pushHistory = useEditor((s) => s.pushHistory)

  const preset = useMemo(() => BRAND_PRESETS.find((b) => b.id === brandId) ?? BRAND_PRESETS[0], [brandId])
  const templates = useMemo(() => templatesForBrand(preset.id), [preset.id])

  const selected = project.objects.filter((o) => selection.includes(o.id))
  const selectedTexts = selected.filter((o): o is TextObject => o.type === 'text')
  const selectedImages = selected.filter((o): o is ImageObject => o.type === 'image')

  const applyTextStyle = async (id: string) => {
    const patch = textStylePatch(preset, id)
    await ensureFontLoaded(patch.fontFamily ?? preset.fonts.headline, patch.fontWeight ?? 400)
    if (selectedTexts.length > 0) {
      pushHistory()
      selectedTexts.forEach((t) => {
        updateObject<TextObject>(t.id, patch)
        const next = useEditor.getState().project.objects.find((o) => o.id === t.id) as TextObject
        if (next.autoHeight) updateObject<TextObject>(t.id, { height: measuredTextHeight(next) })
      })
      return
    }
    addObject(brandTextObject(preset, id, project))
  }

  const applyColor = (color: BrandColor) => {
    pushHistory()
    if (selected.length === 0) {
      setBackground({ kind: 'solid', color: color.hex })
      return
    }
    selected.forEach((obj) => {
      if (obj.type === 'text') updateObject<TextObject>(obj.id, { color: color.hex })
      if (obj.type === 'shape') updateObject(obj.id, { fill: color.hex, fillEnabled: true })
    })
  }

  return (
    <div>
      <h2 className="panel-title">Brand</h2>
      <div className="seg" style={{ marginBottom: 10 }}>
        {BRAND_PRESETS.map((b) => (
          <button key={b.id} className={preset.id === b.id ? 'active' : ''} onClick={() => setBrand(b.id)} title={b.description}>
            {b.name}
          </button>
        ))}
      </div>
      <p className="muted" style={{ marginTop: 0 }}>
        {preset.motto ? <b style={{ display: 'block', color: 'var(--text)' }}>{preset.motto}</b> : null}
        {preset.description}
      </p>
      {preset.tagline && (
        <p className="muted" style={{ letterSpacing: 2, textTransform: 'uppercase', fontSize: 11 }}>
          {preset.tagline}
        </p>
      )}

      <button
        className="btn primary block"
        style={{ marginTop: 10 }}
        onClick={() => {
          if (project.width !== preset.canvas.width || project.height !== preset.canvas.height) {
            setCanvasSize(preset.canvas.width, preset.canvas.height)
          }
          pushHistory()
          setBackground(JSON.parse(JSON.stringify(preset.backgrounds[0].value)))
        }}
      >
        Set up brand canvas
      </button>

      {templates.length > 0 && (
        <Section title="Layouts">
          <div className="tiles">
            {templates.map((t) => (
              <button key={t.id} className="tile" title={t.name} onClick={() => applyTemplate(t)}>
                <TemplatePreview template={t} width={260} />
                <span className="tile-label">{t.name}</span>
              </button>
            ))}
          </div>
        </Section>
      )}

      <Section title="Palette">
        <p className="muted" style={{ marginTop: 0, marginBottom: 8 }}>
          {selected.length > 0 ? 'Applies to the selected layer.' : 'Applies to the canvas background.'}
        </p>
        {preset.palette.map((color) => (
          <button key={color.role} className="brand-swatch" onClick={() => applyColor(color)} title={color.use}>
            <span style={{ background: color.hex }} />
            <span className="brand-swatch-text">
              <b>{color.name}</b>
              <em>
                {color.hex}
                {color.budget ? ` · ${color.budget[0]}–${color.budget[1]}%` : ''}
              </em>
            </span>
          </button>
        ))}
      </Section>

      <Section title="Type scale">
        <p className="muted" style={{ marginTop: 0, marginBottom: 8 }}>
          {preset.fonts.headline} for headlines, {preset.fonts.supporting} for everything else.
        </p>
        {preset.textStyles.map((style) => (
          <button
            key={style.id}
            className="brand-style"
            onClick={() => void applyTextStyle(style.id)}
            title={selectedTexts.length > 0 ? `Restyle selection as ${style.label}` : `Add ${style.label}`}
          >
            <span
              style={{
                fontFamily: `"${style.apply.fontFamily}", Impact, sans-serif`,
                fontWeight: style.apply.fontWeight,
                fontSize: style.tier === 'L1' ? 19 : style.tier === 'L2' ? 16 : 14,
                color: style.apply.color === '#FFFFFF' ? '#f8fafc' : style.apply.color,
                background: style.apply.bgEnabled ? style.apply.bgColor : undefined,
                padding: style.apply.bgEnabled ? '1px 6px' : undefined,
                borderRadius: 3,
              }}
            >
              {style.label}
            </span>
            <em>
              {style.tier} · {style.hint}
            </em>
          </button>
        ))}
      </Section>

      <Section title="Elements">
        <div className="grid-2">
          {preset.elementStyles.map((element) => (
            <button
              key={element.id}
              className="btn small"
              title={element.hint}
              onClick={() => addObject(brandElementObject(preset, element.id, project))}
            >
              {element.label}
            </button>
          ))}
        </div>
        {preset.iconSlot && (
          <>
            <button
              className="btn small block"
              style={{ marginTop: 8 }}
              onClick={() => {
                const slot = brandIconSlot(preset, project)
                if (slot) addObject(slot)
              }}
            >
              Add {preset.iconSlot.label.toLowerCase()} slot
            </button>
            {preset.attribution && (
              <p className="muted" style={{ marginTop: 8 }}>
                {preset.attribution}
              </p>
            )}
          </>
        )}
      </Section>

      <Section title="Creator photo">
        <button
          className="btn block"
          disabled={selectedImages.length === 0}
          onClick={() => {
            pushHistory()
            selectedImages.forEach((img) => updateObject<ImageObject>(img.id, cutoutPatch(preset)))
          }}
        >
          Apply cut-out treatment
        </button>
        <p className="muted" style={{ marginTop: 8 }}>
          {preset.cutout.requireOutline
            ? `${preset.cutout.effects.outline.width} px outline plus a soft shadow`
            : 'Shadow only — this brand does not outline the subject'}
          , and the natural grade (contrast +{preset.photoAdjustments.contrast}, highlights{' '}
          {preset.photoAdjustments.highlights}, shadows +{preset.photoAdjustments.shadows}, sharpness +
          {preset.photoAdjustments.sharpness}).
        </p>
      </Section>

      <Section title="Backgrounds">
        <div className="preset-grid">
          {preset.backgrounds.map((bg) => (
            <button
              key={bg.id}
              className="preset"
              title={bg.label}
              style={{
                background:
                  bg.value.kind === 'gradient'
                    ? `linear-gradient(${bg.value.gradient.from}, ${bg.value.gradient.to})`
                    : bg.value.kind === 'pattern'
                      ? bg.value.pattern.background
                      : bg.value.color,
              }}
              onClick={() => {
                pushHistory()
                setBackground(JSON.parse(JSON.stringify(bg.value)))
              }}
            />
          ))}
        </div>
      </Section>

      <QaSection preset={preset} />
    </div>
  )
}

function QaSection({ preset }: { preset: BrandPreset }) {
  const project = useEditor((s) => s.project)
  const [share, setShare] = useState<ColorShare | null>(null)

  // Sampling renders the canvas, so keep it off the typing/dragging path.
  useEffect(() => {
    const id = window.setTimeout(() => {
      try {
        setShare(sampleColorShare(project, preset))
      } catch {
        setShare(null)
      }
    }, 400)
    return () => window.clearTimeout(id)
  }, [project, preset])

  const items = useMemo(() => runBrandQa(project, share, preset), [project, share, preset])
  const { passed, checked } = qaScore(items)

  return (
    <Section title={`Final QA · ${passed}/${checked}`}>
      {items.map((item) => (
        <QaRow key={item.id} item={item} />
      ))}
    </Section>
  )
}

function QaRow({ item }: { item: QaItem }) {
  const mark = item.status === 'pass' ? '✓' : item.status === 'manual' ? '•' : item.status === 'fail' ? '✕' : '!'
  return (
    <div className={`qa-row qa-${item.status}`}>
      <span className="qa-mark">{mark}</span>
      <span>
        <b>{item.label}</b>
        <em>{item.detail}</em>
      </span>
    </div>
  )
}
