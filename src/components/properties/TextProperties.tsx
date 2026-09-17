import { useEditor } from '../../store/editorStore'
import type { AutoFit, TextObject } from '../../types'
import { ColorInput, Field, NumberInput, Section, Segmented, Slider, Toggle } from '../ui'
import { ArrangeSection, EffectsSection, FeatherSection, TransformSection } from './CommonSections'
import { FONTS, FONT_CATEGORIES, ensureFontLoaded } from '../../data/fonts'
import { TEXT_PRESETS } from '../../data/textPresets'
import { autoSizePatch } from '../../engine/text'
import { SWATCHES } from '../../data/backgrounds'

export default function TextProperties({ object }: { object: TextObject }) {
  const updateObject = useEditor((s) => s.updateObject)
  const pushHistory = useEditor((s) => s.pushHistory)

  const set = (patch: Partial<TextObject>) => {
    updateObject<TextObject>(object.id, patch)
    // Auto Fit and auto-height both react to whatever just changed.
    const next = useEditor.getState().project.objects.find((o) => o.id === object.id) as TextObject
    const sized = autoSizePatch(next)
    if (Object.keys(sized).length > 0) updateObject<TextObject>(object.id, sized)
  }

  const font = FONTS.find((f) => f.family === object.fontFamily) ?? FONTS[0]

  return (
    <>
      <Section title="Text">
        <textarea
          className="input"
          value={object.text}
          onFocus={() => pushHistory(`text:${object.id}`)}
          onChange={(e) => set({ text: e.target.value })}
        />
        <div className="grid-2" style={{ marginTop: 8 }}>
          <Toggle
            label="Uppercase"
            checked={object.uppercase}
            onChange={(uppercase) => {
              pushHistory()
              set({ uppercase })
            }}
          />
          <Toggle
            label="Auto height"
            checked={object.autoHeight}
            onChange={(autoHeight) => {
              pushHistory()
              set({ autoHeight })
            }}
          />
        </div>
      </Section>

      <Section title="Auto fit">
        <Field label="Mode" stack>
          <Segmented
            value={object.autoFit}
            onChange={(autoFit: AutoFit) => {
              pushHistory()
              set({ autoFit })
            }}
            options={[
              { value: 'off', label: 'Off', title: 'Set the size by hand' },
              { value: 'width', label: 'Fit width', title: 'Shrink until every line fits the box width' },
              { value: 'box', label: 'Fit box', title: 'Fill the box in both directions' },
            ]}
          />
        </Field>
        <Toggle
          label="No wrap (break only where I do)"
          checked={object.noWrap}
          onChange={(noWrap) => {
            pushHistory()
            set({ noWrap })
          }}
        />
        <p className="muted" style={{ marginTop: 8 }}>
          {object.autoFit === 'off'
            ? 'Turn this on and the headline re-sizes itself as you retype it.'
            : `Font size is being calculated from the box — currently ${object.fontSize} px.`}
        </p>
      </Section>

      <Section title="Styles">
        <div className="preset-grid">
          {TEXT_PRESETS.map((p) => (
            <button
              key={p.id}
              className="preset"
              style={{ background: p.preview.bg ?? '#0f1319' }}
              onClick={async () => {
                pushHistory()
                await ensureFontLoaded(p.apply.fontFamily ?? 'Anton', p.apply.fontWeight ?? 400)
                set(p.apply)
              }}
            >
              <span
                style={{
                  fontFamily: `"${p.apply.fontFamily}", Impact, sans-serif`,
                  fontSize: 17,
                  color: p.preview.color,
                  WebkitTextStroke: p.preview.stroke ? `1.4px ${p.preview.stroke}` : undefined,
                  textShadow: p.preview.shadow,
                  textTransform: 'uppercase',
                }}
              >
                {p.label}
              </span>
            </button>
          ))}
        </div>
      </Section>

      <Section title="Font">
        <Field label="Family">
          <select
            className="select"
            value={object.fontFamily}
            onChange={async (e) => {
              pushHistory()
              const family = e.target.value
              await ensureFontLoaded(family, object.fontWeight, object.fontSize)
              set({ fontFamily: family })
            }}
          >
            {FONT_CATEGORIES.map((category) => (
              <optgroup key={category} label={category}>
                {FONTS.filter((f) => f.category === category).map((f) => (
                  <option key={f.family} value={f.family}>
                    {f.label}
                  </option>
                ))}
              </optgroup>
            ))}
          </select>
        </Field>
        <Field label="Weight">
          <select
            className="select"
            value={object.fontWeight}
            onChange={async (e) => {
              pushHistory()
              const weight = Number(e.target.value)
              await ensureFontLoaded(object.fontFamily, weight, object.fontSize)
              set({ fontWeight: weight })
            }}
          >
            {font.weights.map((w) => (
              <option key={w} value={w}>
                {w}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Size">
          <NumberInput
            value={object.fontSize}
            min={6}
            max={600}
            historyTag={`size:${object.id}`}
            onChange={(fontSize) => set({ fontSize })}
          />
          <input
            type="range"
            min={8}
            max={320}
            value={Math.min(object.fontSize, 320)}
            onPointerDown={() => pushHistory(`size:${object.id}`)}
            onChange={(e) => set({ fontSize: Number(e.target.value) })}
          />
        </Field>
        <Field label="Align">
          <Segmented
            value={object.align}
            onChange={(align) => {
              pushHistory()
              set({ align })
            }}
            options={[
              { value: 'left', label: '⇤' },
              { value: 'center', label: '↔' },
              { value: 'right', label: '⇥' },
            ]}
          />
        </Field>
        <Slider
          label="Line height"
          value={object.lineHeight}
          min={0.7}
          max={2.4}
          step={0.05}
          historyTag={`lh:${object.id}`}
          onChange={(lineHeight) => set({ lineHeight })}
        />
        <Slider
          label="Letter spacing"
          value={object.letterSpacing}
          min={-20}
          max={40}
          historyTag={`ls:${object.id}`}
          onChange={(letterSpacing) => set({ letterSpacing })}
        />
        <Toggle
          label="Italic"
          checked={object.italic}
          onChange={(italic) => {
            pushHistory()
            set({ italic })
          }}
        />
      </Section>

      <Section title="Colour & stroke">
        <Field label="Fill">
          <ColorInput
            value={object.color}
            historyTag={`color:${object.id}`}
            onChange={(color) => set({ color })}
          />
        </Field>
        <div className="swatches" style={{ marginBottom: 10 }}>
          {SWATCHES.map((c) => (
            <button
              key={c}
              className="swatch"
              style={{ background: c }}
              onClick={() => {
                pushHistory()
                set({ color: c })
              }}
            />
          ))}
        </div>
        <Field label="Stroke">
          <ColorInput
            value={object.strokeColor}
            historyTag={`stroke:${object.id}`}
            onChange={(strokeColor) => set({ strokeColor })}
          />
        </Field>
        <Slider
          label="Stroke width"
          value={object.strokeWidth}
          min={0}
          max={40}
          historyTag={`strokew:${object.id}`}
          onChange={(strokeWidth) => set({ strokeWidth })}
        />
        <Toggle
          label="Highlight plate"
          checked={object.bgEnabled}
          onChange={(bgEnabled) => {
            pushHistory()
            set({ bgEnabled })
          }}
        />
        {object.bgEnabled && (
          <div style={{ marginTop: 8 }}>
            <Field label="Plate">
              <ColorInput
                value={object.bgColor}
                historyTag={`plate:${object.id}`}
                onChange={(bgColor) => set({ bgColor })}
              />
            </Field>
            <Slider
              label="Padding"
              value={object.bgPadding}
              min={0}
              max={80}
              historyTag={`platepad:${object.id}`}
              onChange={(bgPadding) => set({ bgPadding })}
            />
            <Slider
              label="Radius"
              value={object.bgRadius}
              min={0}
              max={60}
              historyTag={`plater:${object.id}`}
              onChange={(bgRadius) => set({ bgRadius })}
            />
          </div>
        )}
      </Section>

      <EffectsSection object={object} />
      <FeatherSection object={object} />
      <TransformSection object={object} />
      <ArrangeSection object={object} />
    </>
  )
}
