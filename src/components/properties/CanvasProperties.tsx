import { useMemo, useState } from 'react'
import { useEditor, type GridMode } from '../../store/editorStore'
import { Field, NumberInput, Section, Segmented, Slider, Toggle } from '../ui'
import { FORMAT_LIST, formatConfig } from '../../data/formats'
import { analyzeDesign, type CheckStatus } from '../../engine/designAssistant'
import type { CanvasFormat } from '../../types'

export default function CanvasProperties() {
  const project = useEditor((s) => s.project)
  const setCanvasSize = useEditor((s) => s.setCanvasSize)
  const setFormat = useEditor((s) => s.setFormat)
  const setPanel = useEditor((s) => s.setPanel)
  const gridMode = useEditor((s) => s.gridMode)
  const setGridMode = useEditor((s) => s.setGridMode)
  const showGuides = useEditor((s) => s.showGuides)
  const snapping = useEditor((s) => s.snapping)
  const showSafeZone = useEditor((s) => s.showSafeZone)
  const toggleGuides = useEditor((s) => s.toggleGuides)
  const toggleSnapping = useEditor((s) => s.toggleSnapping)
  const toggleSafeZone = useEditor((s) => s.toggleSafeZone)
  const [custom, setCustom] = useState({ width: project.width, height: project.height })

  const config = formatConfig(project.format)

  return (
    <>
      <Section title="Format">
        <p className="muted" style={{ marginTop: 0 }}>
          Nothing selected. Click a layer on the canvas to edit it.
        </p>
        <div className="seg" style={{ marginBottom: 10 }}>
          {FORMAT_LIST.map((f) => (
            <button
              key={f.id}
              className={project.format === f.id ? 'active' : ''}
              title={`${f.label} · ${f.width} × ${f.height}`}
              onClick={() => project.format !== f.id && setFormat(f.id as CanvasFormat)}
            >
              {f.glyph} {f.shortLabel}
            </button>
          ))}
        </div>
        {config.presets.map((preset) => (
          <button
            key={preset.label}
            className={`btn small block${project.width === preset.width && project.height === preset.height ? ' active' : ''}`}
            style={{ marginBottom: 6 }}
            onClick={() => setCanvasSize(preset.width, preset.height)}
          >
            {preset.label}
            {preset.recommended && <span className="badge">recommended</span>}
          </button>
        ))}
        <div className="grid-2" style={{ marginTop: 8 }}>
          <Field label="W">
            <NumberInput value={custom.width} min={64} max={4096} onChange={(width) => setCustom((c) => ({ ...c, width }))} />
          </Field>
          <Field label="H">
            <NumberInput
              value={custom.height}
              min={64}
              max={4096}
              onChange={(height) => setCustom((c) => ({ ...c, height }))}
            />
          </Field>
        </div>
        <button
          className="btn small block"
          onClick={() => setCanvasSize(Math.round(custom.width), Math.round(custom.height))}
        >
          Apply custom size
        </button>
      </Section>

      <SafeZoneSection />

      <Section title="Background">
        <button className="btn block" onClick={() => setPanel('background')}>
          Open background panel
        </button>
      </Section>

      <Section title="View">
        <Field label="Grid" stack>
          <Segmented
            value={gridMode}
            onChange={(mode: GridMode) => setGridMode(mode)}
            options={[
              { value: 'none', label: 'Off' },
              { value: 'grid', label: 'Grid' },
              { value: 'thirds', label: 'Thirds' },
              { value: 'center', label: 'Center' },
            ]}
          />
        </Field>
        <Toggle label="Safe zone overlay" checked={showSafeZone} onChange={toggleSafeZone} />
        <Toggle label="Smart guides" checked={showGuides} onChange={toggleGuides} />
        <Toggle label="Snap to guides and objects" checked={snapping} onChange={toggleSnapping} />
        <p className="muted" style={{ marginTop: 8 }}>
          Overlays are editor-only — they never appear in an export.
        </p>
      </Section>

      <AssistantSection />
    </>
  )
}

function SafeZoneSection() {
  const project = useEditor((s) => s.project)
  const setSafeZone = useEditor((s) => s.setSafeZone)
  const resetSafeZone = useEditor((s) => s.resetSafeZone)
  const showSafeZone = useEditor((s) => s.showSafeZone)
  const toggleSafeZone = useEditor((s) => s.toggleSafeZone)
  const zone = project.safeZone
  const config = formatConfig(project.format)

  return (
    <Section title="Safe zone" defaultOpen={project.format === 'shorts'}>
      <Toggle label="Show safe zone" checked={showSafeZone} onChange={toggleSafeZone} />
      <p className="muted" style={{ margin: '8px 0 10px' }}>
        {config.safeZoneHint}
      </p>
      <div className="legend">
        <i style={{ background: 'rgba(255,59,92,0.45)' }} /> Restricted — may be covered
      </div>
      <div className="legend">
        <i style={{ background: 'rgba(245,165,36,0.45)' }} /> Warning — usable but crowded
      </div>
      <div className="legend" style={{ marginBottom: 10 }}>
        <i style={{ background: 'rgba(34,197,94,0.5)' }} /> Safe — put the key content here
      </div>
      <Slider label="Top" value={zone.top} min={0} max={40} suffix="%" historyTag="sz-top" onChange={(top) => setSafeZone({ top })} />
      <Slider
        label="Bottom"
        value={zone.bottom}
        min={0}
        max={40}
        suffix="%"
        historyTag="sz-bottom"
        onChange={(bottom) => setSafeZone({ bottom })}
      />
      <Slider label="Left" value={zone.left} min={0} max={30} suffix="%" historyTag="sz-left" onChange={(left) => setSafeZone({ left })} />
      <Slider
        label="Right"
        value={zone.right}
        min={0}
        max={30}
        suffix="%"
        historyTag="sz-right"
        onChange={(right) => setSafeZone({ right })}
      />
      <Slider
        label="Warning band"
        value={zone.warning}
        min={0}
        max={12}
        suffix="%"
        historyTag="sz-warning"
        onChange={(warning) => setSafeZone({ warning })}
      />
      <button className="btn small block" onClick={resetSafeZone}>
        Reset to {formatConfig(project.format).shortLabel} defaults
      </button>
    </Section>
  )
}

function AssistantSection() {
  const project = useEditor((s) => s.project)
  const report = useMemo(() => analyzeDesign(project), [project])
  const color = report.score >= 80 ? 'var(--ok)' : report.score >= 55 ? '#f5a524' : 'var(--accent)'

  return (
    <Section title="Readability">
      <div className="row" style={{ justifyContent: 'space-between' }}>
        <span className="muted">Composition score</span>
        <b style={{ color }}>{report.score}</b>
      </div>
      <div className="score">
        <span style={{ width: `${report.score}%`, background: color }} />
      </div>
      {report.checks.map((check) => (
        <div key={check.id} className={`qa-row qa-${statusClass(check.status)}`}>
          <span className="qa-mark">{check.status === 'pass' ? '✓' : check.status === 'warn' ? '!' : '✕'}</span>
          <span>
            <b>{check.label}</b>
            <em>{check.detail}</em>
          </span>
        </div>
      ))}
    </Section>
  )
}

function statusClass(status: CheckStatus): string {
  return status === 'pass' ? 'pass' : status === 'warn' ? 'warn' : 'fail'
}
