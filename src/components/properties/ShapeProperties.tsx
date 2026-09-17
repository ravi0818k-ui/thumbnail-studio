import { useEditor } from '../../store/editorStore'
import { DEFAULT_FADE, type FadeFrom, type ShapeFade, type ShapeObject } from '../../types'
import { ColorInput, Field, Section, Segmented, Slider, Toggle } from '../ui'
import { ArrangeSection, EffectsSection, FeatherSection, TransformSection } from './CommonSections'
import { SWATCHES } from '../../data/backgrounds'

/** A shadow square to its edge, the way it starts. */
const STRAIGHT = 90
/** Below this the edge is nearly parallel to the side it comes from. */
const MIN_ANGLE = 10

/**
 * The black shadow: a scrim that fades the fill out across the shape, so white
 * text can sit over a full-bleed photo.
 */
function ShadowSection({ object }: { object: ShapeObject }) {
  const updateObject = useEditor((s) => s.updateObject)
  const pushHistory = useEditor((s) => s.pushHistory)
  const fade = object.fade ?? DEFAULT_FADE
  const patch = (part: Partial<ShapeFade>) => updateObject<ShapeObject>(object.id, { fade: { ...fade, ...part } })

  const preset = (part: Partial<ShapeFade>, fill?: string) => {
    pushHistory()
    updateObject<ShapeObject>(object.id, {
      fade: { ...fade, enabled: true, ...part },
      ...(fill ? { fill, fillEnabled: true } : {}),
    })
  }

  return (
    <Section title="Shadow" defaultOpen={fade.enabled}>
      <div className="grid-2" style={{ marginBottom: 10 }}>
        <button className="btn small" onClick={() => preset({ from: 'left', softness: 70, midpoint: 45 }, '#000000')}>
          Black left
        </button>
        <button className="btn small" onClick={() => preset({ from: 'bottom', softness: 60, midpoint: 35 }, '#000000')}>
          Black bottom
        </button>
        <button className="btn small" onClick={() => preset({ from: 'edges', softness: 90, midpoint: 62 }, '#000000')}>
          Vignette
        </button>
        <button
          className="btn small"
          title="A hard diagonal edge, like a wedge cut across the frame"
          onClick={() => preset({ from: 'left', softness: 8, midpoint: 52, angle: 52 }, '#000000')}
        >
          Angled wedge
        </button>
      </div>

      <Toggle
        label="Fade the fill"
        checked={fade.enabled}
        onChange={(enabled) => {
          pushHistory()
          patch({ enabled })
        }}
      />
      {fade.enabled && (
        <>
          <Field label="Solid at" stack>
            <Segmented
              value={fade.from}
              onChange={(from: FadeFrom) => {
                pushHistory()
                patch({ from })
              }}
              options={[
                { value: 'left', label: 'Left' },
                { value: 'right', label: 'Right' },
                { value: 'top', label: 'Top' },
                { value: 'bottom', label: 'Bottom' },
                { value: 'edges', label: 'Edges', title: 'A vignette — clear in the middle, solid at the rim' },
                { value: 'center', label: 'Centre', title: 'A spotlight — solid in the middle, clear at the rim' },
              ]}
            />
          </Field>
          <Slider
            label="Softness"
            value={fade.softness}
            min={0}
            max={100}
            historyTag={`fade-soft:${object.id}`}
            onChange={(softness) => patch({ softness })}
          />
          <Slider
            label="Position"
            value={fade.midpoint}
            min={0}
            max={100}
            historyTag={`fade-mid:${object.id}`}
            onChange={(midpoint) => patch({ midpoint })}
          />
          {fade.from !== 'edges' && fade.from !== 'center' && (
            <Slider
              label="Angle"
              // Read like a protractor: 90 degrees is square to the side the
              // shadow comes from, and the edge leans further the more of the
              // slider you use. The stored value is the angle itself, so the
              // handle runs the other way.
              value={STRAIGHT - (fade.angle ?? STRAIGHT)}
              min={0}
              max={STRAIGHT - MIN_ANGLE}
              display={(lean) => `${STRAIGHT - lean}°`}
              historyTag={`fade-angle:${object.id}`}
              onChange={(lean) => patch({ angle: STRAIGHT - lean })}
            />
          )}
          <p className="muted">
            The fill fades to transparent away from the solid edge. <b>Angle</b> leans that edge: 90° is straight, and
            the smaller it goes the more diagonal the shadow — the shape itself never moves, so the canvas stays
            covered. Opacity on the Transform section controls how dark it gets.
          </p>
        </>
      )}
    </Section>
  )
}

export default function ShapeProperties({ object }: { object: ShapeObject }) {
  const updateObject = useEditor((s) => s.updateObject)
  const pushHistory = useEditor((s) => s.pushHistory)
  const set = (patch: Partial<ShapeObject>) => updateObject<ShapeObject>(object.id, patch)

  return (
    <>
      <ShadowSection object={object} />
      <Section title="Shape">
        <Toggle
          label="Fill"
          checked={object.fillEnabled}
          onChange={(fillEnabled) => {
            pushHistory()
            set({ fillEnabled })
          }}
        />
        {object.fillEnabled && (
          <>
            <Field label="Colour">
              <ColorInput value={object.fill} historyTag={`fill:${object.id}`} onChange={(fill) => set({ fill })} />
            </Field>
            <div className="swatches" style={{ marginBottom: 10 }}>
              {SWATCHES.map((c) => (
                <button
                  key={c}
                  className="swatch"
                  style={{ background: c }}
                  onClick={() => {
                    pushHistory()
                    set({ fill: c })
                  }}
                />
              ))}
            </div>
          </>
        )}
        <Toggle
          label="Border"
          checked={object.strokeEnabled}
          onChange={(strokeEnabled) => {
            pushHistory()
            set({ strokeEnabled })
          }}
        />
        {object.strokeEnabled && (
          <>
            <Field label="Colour">
              <ColorInput
                value={object.stroke}
                historyTag={`shapestroke:${object.id}`}
                onChange={(stroke) => set({ stroke })}
              />
            </Field>
            <Slider
              label="Width"
              value={object.strokeWidth}
              min={1}
              max={60}
              historyTag={`shapestrokew:${object.id}`}
              onChange={(strokeWidth) => set({ strokeWidth })}
            />
          </>
        )}
        {(object.shape === 'roundRect' || object.shape === 'rect') && (
          <Slider
            label="Corner radius"
            value={object.cornerRadius}
            min={0}
            max={Math.round(Math.min(object.width, object.height) / 2)}
            historyTag={`shaperadius:${object.id}`}
            onChange={(cornerRadius) => set({ cornerRadius, shape: cornerRadius > 0 ? 'roundRect' : 'rect' })}
          />
        )}
        {(object.shape === 'polygon' || object.shape === 'star') && (
          <>
            <Slider
              label="Points"
              value={object.points}
              min={3}
              max={20}
              historyTag={`points:${object.id}`}
              onChange={(points) => set({ points })}
            />
            {object.shape === 'star' && (
              <Slider
                label="Inner radius"
                value={object.innerRatio}
                min={0.1}
                max={0.95}
                step={0.01}
                historyTag={`inner:${object.id}`}
                onChange={(innerRatio) => set({ innerRatio })}
              />
            )}
          </>
        )}
      </Section>

      <EffectsSection object={object} />
      <FeatherSection object={object} />
      <TransformSection object={object} />
      <ArrangeSection object={object} />
    </>
  )
}
