import { useEditor } from '../../store/editorStore'
import { DEFAULT_MASK, type Effects, type FeatherMask, type MaskShape, type SceneObject } from '../../types'
import { ColorInput, Field, NumberInput, Section, Segmented, Slider, Toggle } from '../ui'

export function TransformSection({ object }: { object: SceneObject }) {
  const updateObject = useEditor((s) => s.updateObject)
  const alignSelected = useEditor((s) => s.alignSelected)
  const pushHistory = useEditor((s) => s.pushHistory)

  const set = (patch: Partial<SceneObject>) => updateObject(object.id, patch)

  return (
    <Section title="Position & size">
      <div className="grid-2">
        <Field label="X">
          <NumberInput value={object.x} historyTag={`x:${object.id}`} onChange={(x) => set({ x })} />
        </Field>
        <Field label="Y">
          <NumberInput value={object.y} historyTag={`y:${object.id}`} onChange={(y) => set({ y })} />
        </Field>
        <Field label="W">
          <NumberInput value={object.width} min={1} historyTag={`w:${object.id}`} onChange={(width) => set({ width })} />
        </Field>
        <Field label="H">
          <NumberInput
            value={object.height}
            min={1}
            historyTag={`h:${object.id}`}
            onChange={(height) => set({ height })}
          />
        </Field>
      </div>
      <Slider
        label="Rotation"
        value={object.rotation}
        min={-180}
        max={180}
        suffix="°"
        historyTag={`rot:${object.id}`}
        onChange={(rotation) => set({ rotation })}
      />
      <Slider
        label="Opacity"
        value={object.opacity}
        min={0}
        max={100}
        suffix="%"
        historyTag={`op:${object.id}`}
        onChange={(opacity) => set({ opacity })}
      />
      <div className="section-head" style={{ marginTop: 4 }}>
        Align
      </div>
      <div className="grid-3" style={{ marginBottom: 6 }}>
        <button className="btn small" onClick={() => alignSelected('left')} title="Align left">
          ⇤
        </button>
        <button className="btn small" onClick={() => alignSelected('center-h')} title="Centre horizontally">
          ⇔
        </button>
        <button className="btn small" onClick={() => alignSelected('right')} title="Align right">
          ⇥
        </button>
        <button className="btn small" onClick={() => alignSelected('top')} title="Align top">
          ⇡
        </button>
        <button className="btn small" onClick={() => alignSelected('center-v')} title="Centre vertically">
          ⇕
        </button>
        <button className="btn small" onClick={() => alignSelected('bottom')} title="Align bottom">
          ⇣
        </button>
      </div>
      <div className="row">
        <button
          className="btn small"
          onClick={() => {
            pushHistory()
            set({ rotation: 0 })
          }}
        >
          Reset rotation
        </button>
      </div>
    </Section>
  )
}

export function ArrangeSection({ object }: { object: SceneObject }) {
  const moveLayer = useEditor((s) => s.moveLayer)
  const duplicateSelected = useEditor((s) => s.duplicateSelected)
  const removeSelected = useEditor((s) => s.removeSelected)
  const updateObject = useEditor((s) => s.updateObject)
  const pushHistory = useEditor((s) => s.pushHistory)
  return (
    <Section title="Arrange" defaultOpen={false}>
      <div className="grid-2">
        <button className="btn small" onClick={() => moveLayer(object.id, 'front')}>
          Bring to front
        </button>
        <button className="btn small" onClick={() => moveLayer(object.id, 'back')}>
          Send to back
        </button>
        <button className="btn small" onClick={() => moveLayer(object.id, 'forward')}>
          Forward
        </button>
        <button className="btn small" onClick={() => moveLayer(object.id, 'backward')}>
          Backward
        </button>
        <button className="btn small" onClick={duplicateSelected}>
          Duplicate
        </button>
        <button
          className="btn small"
          onClick={() => {
            pushHistory()
            updateObject(object.id, { locked: !object.locked })
          }}
        >
          {object.locked ? 'Unlock' : 'Lock'}
        </button>
      </div>
      <button className="btn small block" style={{ marginTop: 8 }} onClick={removeSelected}>
        Delete layer
      </button>
    </Section>
  )
}

/**
 * Premiere Pro's mask controls on a layer: a region that reveals it, with a
 * feathered edge and an expansion. It is the tool for blending a photo into the
 * background, and for taking the hard cut off a cut-out's silhouette.
 */
export function FeatherSection({ object }: { object: SceneObject }) {
  const updateObject = useEditor((s) => s.updateObject)
  const pushHistory = useEditor((s) => s.pushHistory)
  const mask = object.mask ?? DEFAULT_MASK

  const patch = (part: Partial<FeatherMask>) => updateObject(object.id, { mask: { ...mask, ...part } } as never)
  const preset = (part: Partial<FeatherMask>) => {
    pushHistory()
    patch({ enabled: true, ...part })
  }

  // The longest edge sets a sane ceiling: feathering further than the layer is
  // wide only produces a layer that has faded away entirely.
  const limit = Math.round(Math.max(20, Math.min(object.width, object.height) / 2))

  return (
    <Section title="Feather" defaultOpen={false}>
      <div className="grid-2" style={{ marginBottom: 12 }}>
        <button
          className="btn small"
          title="Fade all four edges into the background"
          onClick={() => preset({ shape: 'rect', feather: Math.round(limit * 0.5), expand: 0, invert: false })}
        >
          Soft edges
        </button>
        <button
          className="btn small"
          title="An oval vignette — the usual way to drop a portrait onto a background"
          onClick={() => preset({ shape: 'ellipse', feather: Math.round(limit * 0.8), expand: 0, invert: false })}
        >
          Oval vignette
        </button>
        <button
          className="btn small"
          title="Soften the layer's own outline — a cut-out subject or a glyph"
          onClick={() => preset({ shape: 'subject', feather: 6, expand: 0, invert: false })}
        >
          Soften cut-out
        </button>
        <button
          className="btn small"
          title="Pull the cut-out edge in to lose a bright rim"
          onClick={() => preset({ shape: 'subject', feather: 3, expand: -2, invert: false })}
        >
          Choke edge
        </button>
      </div>

      <Toggle
        label="Feather mask"
        checked={mask.enabled}
        onChange={(enabled) => {
          pushHistory()
          patch({ enabled })
        }}
      />

      {mask.enabled && (
        <>
          <Field label="Shape" stack>
            <Segmented
              value={mask.shape}
              onChange={(shape: MaskShape) => {
                pushHistory()
                patch({ shape })
              }}
              options={[
                { value: 'rect', label: 'Edges', title: 'Fade the four edges of the layer' },
                { value: 'ellipse', label: 'Oval', title: 'An oval region inside the layer' },
                { value: 'subject', label: 'Subject', title: "The layer's own shape — a cut-out silhouette or glyphs" },
              ]}
            />
          </Field>
          <Slider
            label="Feather"
            value={mask.feather}
            min={0}
            max={mask.shape === 'subject' ? 60 : limit}
            suffix="px"
            historyTag={`feather:${object.id}`}
            onChange={(feather) => patch({ feather })}
          />
          <Slider
            label="Expand"
            value={mask.expand}
            min={-40}
            max={mask.shape === 'subject' ? 40 : limit}
            suffix="px"
            historyTag={`feather-expand:${object.id}`}
            onChange={(expand) => patch({ expand })}
          />
          <Toggle
            label="Invert"
            checked={mask.invert}
            onChange={(invert) => {
              pushHistory()
              patch({ invert })
            }}
          />
          <p className="muted">
            {mask.shape === 'subject'
              ? 'Softens the layer’s own edge — a cut-out subject or the letterforms of a text layer. Expand grows or chokes that edge before it is softened; a negative value pulls a bright rim off a cut-out.'
              : 'The falloff sits inside the layer, so nothing is clipped at the edge. Expand pushes the hard part of the mask back out towards the box.'}
            {' '}Effects are built from the feathered shape, so an outline follows it.
          </p>
        </>
      )}
    </Section>
  )
}

export function EffectsSection({ object }: { object: SceneObject & { effects: Effects } }) {
  const updateObject = useEditor((s) => s.updateObject)
  const pushHistory = useEditor((s) => s.pushHistory)
  const fx = object.effects

  const patch = (part: Partial<Effects>) => updateObject(object.id, { effects: { ...fx, ...part } } as never)

  const quick = (name: 'white-outline' | 'black-outline' | 'glow' | 'drop-shadow') => {
    pushHistory()
    switch (name) {
      case 'white-outline':
        patch({ outline: { enabled: true, color: '#ffffff', width: 10 } })
        break
      case 'black-outline':
        patch({ outline: { enabled: true, color: '#000000', width: 10 } })
        break
      case 'glow':
        patch({ glow: { enabled: true, color: '#ffd400', blur: 36, intensity: 2 } })
        break
      case 'drop-shadow':
        patch({ shadow: { enabled: true, color: '#000000', blur: 28, offsetX: 10, offsetY: 16, opacity: 70 } })
        break
    }
  }

  return (
    <Section title="Effects">
      <div className="grid-2" style={{ marginBottom: 12 }}>
        <button className="btn small" onClick={() => quick('white-outline')}>
          White outline
        </button>
        <button className="btn small" onClick={() => quick('black-outline')}>
          Black outline
        </button>
        <button className="btn small" onClick={() => quick('glow')}>
          Glow
        </button>
        <button className="btn small" onClick={() => quick('drop-shadow')}>
          Drop shadow
        </button>
      </div>

      <EffectToggle
        label="Outline"
        enabled={fx.outline.enabled}
        onToggle={(enabled) => {
          pushHistory()
          patch({ outline: { ...fx.outline, enabled } })
        }}
      >
        <Field label="Colour">
          <ColorInput
            value={fx.outline.color}
            historyTag={`outline-color:${object.id}`}
            onChange={(color) => patch({ outline: { ...fx.outline, color } })}
          />
        </Field>
        <Slider
          label="Width"
          value={fx.outline.width}
          min={1}
          max={60}
          historyTag={`outline-width:${object.id}`}
          onChange={(width) => patch({ outline: { ...fx.outline, width } })}
        />
      </EffectToggle>

      <EffectToggle
        label="Glow"
        enabled={fx.glow.enabled}
        onToggle={(enabled) => {
          pushHistory()
          patch({ glow: { ...fx.glow, enabled } })
        }}
      >
        <Field label="Colour">
          <ColorInput
            value={fx.glow.color}
            historyTag={`glow-color:${object.id}`}
            onChange={(color) => patch({ glow: { ...fx.glow, color } })}
          />
        </Field>
        <Slider
          label="Spread"
          value={fx.glow.blur}
          min={2}
          max={120}
          historyTag={`glow-blur:${object.id}`}
          onChange={(blur) => patch({ glow: { ...fx.glow, blur } })}
        />
        <Slider
          label="Intensity"
          value={fx.glow.intensity}
          min={1}
          max={4}
          historyTag={`glow-int:${object.id}`}
          onChange={(intensity) => patch({ glow: { ...fx.glow, intensity } })}
        />
      </EffectToggle>

      <EffectToggle
        label="Shadow"
        enabled={fx.shadow.enabled}
        onToggle={(enabled) => {
          pushHistory()
          patch({ shadow: { ...fx.shadow, enabled } })
        }}
      >
        <Field label="Colour">
          <ColorInput
            value={fx.shadow.color}
            historyTag={`shadow-color:${object.id}`}
            onChange={(color) => patch({ shadow: { ...fx.shadow, color } })}
          />
        </Field>
        <Slider
          label="Blur"
          value={fx.shadow.blur}
          min={0}
          max={100}
          historyTag={`shadow-blur:${object.id}`}
          onChange={(blur) => patch({ shadow: { ...fx.shadow, blur } })}
        />
        <Slider
          label="Offset X"
          value={fx.shadow.offsetX}
          min={-80}
          max={80}
          historyTag={`shadow-x:${object.id}`}
          onChange={(offsetX) => patch({ shadow: { ...fx.shadow, offsetX } })}
        />
        <Slider
          label="Offset Y"
          value={fx.shadow.offsetY}
          min={-80}
          max={80}
          historyTag={`shadow-y:${object.id}`}
          onChange={(offsetY) => patch({ shadow: { ...fx.shadow, offsetY } })}
        />
        <Slider
          label="Opacity"
          value={fx.shadow.opacity}
          min={0}
          max={100}
          suffix="%"
          historyTag={`shadow-op:${object.id}`}
          onChange={(opacity) => patch({ shadow: { ...fx.shadow, opacity } })}
        />
      </EffectToggle>

      <EffectToggle
        label="Colour overlay"
        enabled={fx.overlay.enabled}
        onToggle={(enabled) => {
          pushHistory()
          patch({ overlay: { ...fx.overlay, enabled } })
        }}
      >
        <Field label="Colour">
          <ColorInput
            value={fx.overlay.color}
            historyTag={`overlay-color:${object.id}`}
            onChange={(color) => patch({ overlay: { ...fx.overlay, color } })}
          />
        </Field>
        <Slider
          label="Amount"
          value={fx.overlay.opacity}
          min={0}
          max={100}
          suffix="%"
          historyTag={`overlay-op:${object.id}`}
          onChange={(opacity) => patch({ overlay: { ...fx.overlay, opacity } })}
        />
      </EffectToggle>
    </Section>
  )
}

function EffectToggle({
  label,
  enabled,
  onToggle,
  children,
}: {
  label: string
  enabled: boolean
  onToggle: (enabled: boolean) => void
  children: React.ReactNode
}) {
  return (
    <div style={{ marginBottom: 10 }}>
      <label className="toggle" style={{ marginBottom: enabled ? 8 : 0 }}>
        <input type="checkbox" checked={enabled} onChange={(e) => onToggle(e.target.checked)} />
        <span style={{ fontWeight: 600 }}>{label}</span>
      </label>
      {enabled && <div style={{ paddingLeft: 4 }}>{children}</div>}
    </div>
  )
}
