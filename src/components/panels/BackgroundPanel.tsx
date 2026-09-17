import { useRef } from 'react'
import { useEditor } from '../../store/editorStore'
import { BACKGROUND_PRESETS, SWATCHES } from '../../data/backgrounds'
import { ColorInput, Field, Segmented, Slider } from '../ui'
import { registerBlob } from '../../engine/assets'
import type { GradientDirection, PatternKind } from '../../types'

const DIRECTIONS: { value: GradientDirection; label: string }[] = [
  { value: 'to-right', label: '→' },
  { value: 'to-bottom-right', label: '↘' },
  { value: 'to-bottom', label: '↓' },
  { value: 'to-bottom-left', label: '↙' },
  { value: 'to-left', label: '←' },
  { value: 'radial', label: '◎' },
]

const PATTERNS: PatternKind[] = ['grid', 'dots', 'diagonal', 'rays', 'noise']

export default function BackgroundPanel() {
  const background = useEditor((s) => s.project.background)
  const setBackground = useEditor((s) => s.setBackground)
  const pushHistory = useEditor((s) => s.pushHistory)
  const fileRef = useRef<HTMLInputElement>(null)

  return (
    <div>
      <h2 className="panel-title">Background</h2>

      <div className="section-head">Presets</div>
      <div className="preset-grid" style={{ marginBottom: 18 }}>
        {BACKGROUND_PRESETS.map((p) => (
          <button
            key={p.id}
            className="preset"
            title={p.label}
            style={{ background: previewCss(p.value) }}
            onClick={() => {
              pushHistory()
              setBackground(p.value)
            }}
          />
        ))}
      </div>

      <Field label="Type">
        <Segmented
          value={background.kind}
          onChange={(kind) => {
            pushHistory()
            setBackground({ kind })
          }}
          options={[
            { value: 'solid', label: 'Solid' },
            { value: 'gradient', label: 'Gradient' },
            { value: 'image', label: 'Image' },
            { value: 'pattern', label: 'Pattern' },
          ]}
        />
      </Field>

      {background.kind === 'solid' && (
        <>
          <Field label="Colour">
            <ColorInput value={background.color} historyTag="bg-color" onChange={(color) => setBackground({ color })} />
          </Field>
          <div className="swatches">
            {SWATCHES.map((c) => (
              <button
                key={c}
                className="swatch"
                style={{ background: c }}
                onClick={() => {
                  pushHistory()
                  setBackground({ color: c })
                }}
              />
            ))}
          </div>
        </>
      )}

      {background.kind === 'gradient' && (
        <>
          <Field label="From">
            <ColorInput
              value={background.gradient.from}
              historyTag="bg-from"
              onChange={(from) => setBackground({ gradient: { ...background.gradient, from } })}
            />
          </Field>
          <Field label="To">
            <ColorInput
              value={background.gradient.to}
              historyTag="bg-to"
              onChange={(to) => setBackground({ gradient: { ...background.gradient, to } })}
            />
          </Field>
          <Field label="Direction">
            <div className="row wrap">
              {DIRECTIONS.map((d) => (
                <button
                  key={d.value}
                  className={`btn small${background.gradient.direction === d.value ? ' active' : ''}`}
                  onClick={() => {
                    pushHistory()
                    setBackground({ gradient: { ...background.gradient, direction: d.value } })
                  }}
                >
                  {d.label}
                </button>
              ))}
            </div>
          </Field>
        </>
      )}

      {background.kind === 'image' && (
        <>
          <button className="btn block" onClick={() => fileRef.current?.click()}>
            Choose image…
          </button>
          <input
            ref={fileRef}
            type="file"
            accept="image/*"
            hidden
            onChange={async (e) => {
              const file = e.target.files?.[0]
              if (!file) return
              const asset = await registerBlob(file, file.name)
              pushHistory()
              setBackground({ assetId: asset.id })
            }}
          />
          <div style={{ marginTop: 12 }}>
            <Slider
              label="Blur"
              value={background.imageBlur}
              min={0}
              max={100}
              historyTag="bg-blur"
              onChange={(imageBlur) => setBackground({ imageBlur })}
            />
            <Slider
              label="Darken"
              value={background.imageDim}
              min={0}
              max={100}
              historyTag="bg-dim"
              onChange={(imageDim) => setBackground({ imageDim })}
            />
          </div>
          {!background.assetId && <p className="muted">No background image selected yet.</p>}
        </>
      )}

      {background.kind === 'pattern' && (
        <>
          <Field label="Pattern">
            <select
              className="select"
              value={background.pattern.kind}
              onChange={(e) => {
                pushHistory()
                setBackground({ pattern: { ...background.pattern, kind: e.target.value as PatternKind } })
              }}
            >
              {PATTERNS.map((p) => (
                <option key={p} value={p}>
                  {p[0].toUpperCase() + p.slice(1)}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Ink">
            <ColorInput
              value={background.pattern.color}
              historyTag="bg-pattern-color"
              onChange={(color) => setBackground({ pattern: { ...background.pattern, color } })}
            />
          </Field>
          <Field label="Base">
            <ColorInput
              value={background.pattern.background}
              historyTag="bg-pattern-base"
              onChange={(bg) => setBackground({ pattern: { ...background.pattern, background: bg } })}
            />
          </Field>
          <Slider
            label="Scale"
            value={background.pattern.scale}
            min={8}
            max={120}
            historyTag="bg-pattern-scale"
            onChange={(scale) => setBackground({ pattern: { ...background.pattern, scale } })}
          />
        </>
      )}
    </div>
  )
}

function previewCss(bg: (typeof BACKGROUND_PRESETS)[number]['value']): string {
  if (bg.kind === 'gradient') {
    const { from, to, direction } = bg.gradient
    if (direction === 'radial') return `radial-gradient(circle, ${from}, ${to})`
    const map: Record<string, string> = {
      'to-right': 'to right',
      'to-bottom': 'to bottom',
      'to-bottom-right': 'to bottom right',
      'to-bottom-left': 'to bottom left',
      'to-left': 'to left',
    }
    return `linear-gradient(${map[direction] ?? 'to bottom right'}, ${from}, ${to})`
  }
  if (bg.kind === 'pattern') return bg.pattern.background
  return bg.color
}
