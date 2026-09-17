import { useEffect, useState } from 'react'
import { useEditor } from '../store/editorStore'
import {
  METRIC_INFO,
  PLATFORM_INFO,
  verdict,
  weakest,
  type RawPlatform,
  type RawReport,
} from '../engine/thumbnailScore'
import { scoreProject } from '../engine/runScore'
import { PYTHON_DOWNLOAD_MB, onPythonStatus, pythonStatus } from '../engine/pythonImage'

/**
 * The score, measured over the rendered pixels in Python. It runs by itself
 * once the engine is warm; before that it is a button, because opening Preview
 * should never quietly start a 15 MB download.
 */
export default function ScoreCard() {
  const project = useEditor((s) => s.project)
  const [engine, setEngine] = useState(pythonStatus())
  const [report, setReport] = useState<RawReport | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => onPythonStatus(() => setEngine(pythonStatus())), [])

  const run = async () => {
    setBusy(true)
    setError(null)
    try {
      setReport(await scoreProject(project))
    } catch (err) {
      console.warn('Scoring failed', err)
      setError('The Python engine could not run. It needs a connection the first time it is used.')
    } finally {
      setBusy(false)
    }
  }

  // Free once the runtime is already loaded, so score on open in that case.
  useEffect(() => {
    if (pythonStatus().status === 'ready' && !report && !busy) void run()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  if (!report) {
    return (
      <div className="score-card empty">
        <div>
          <b>Score this thumbnail</b>
          <p className="muted" style={{ margin: '4px 0 0' }}>
            Measures contrast, focal clarity, colour hierarchy, tonal range, sharpness and what survives being shrunk —
            separately for desktop and mobile. Runs CPython + numpy here in the browser
            {engine.status === 'idle' ? `; the first run downloads about ${PYTHON_DOWNLOAD_MB} MB.` : '.'}
          </p>
          {error && (
            <p className="muted" style={{ color: 'var(--accent)', marginBottom: 0 }}>
              {error}
            </p>
          )}
        </div>
        <button className="btn primary" disabled={busy} onClick={() => void run()}>
          {busy ? 'Measuring…' : 'Run'}
        </button>
      </div>
    )
  }

  return (
    <div className="score-card">
      <div className="score-platforms">
        {report.platforms.map((platform) => (
          <PlatformScore key={platform.id} platform={platform} />
        ))}
        <div className="score-palette">
          <span className="score-caption">Dominant colours</span>
          <div className="score-swatches">
            {report.palette.map((colour) => (
              <span
                key={colour.hex}
                className="score-swatch"
                style={{ background: colour.hex, flexGrow: Math.max(0.15, colour.share) }}
                title={`${colour.hex} · ${Math.round(colour.share * 100)}%`}
              />
            ))}
          </div>
          <span className="score-caption">
            {report.palette.map((c) => `${c.hex} ${Math.round(c.share * 100)}%`).join(' · ')}
          </span>
        </div>
      </div>

      <div className="score-metrics">
        {report.platforms.map((platform) => {
          const worst = weakest(platform)
          return (
            <div key={platform.id} className="score-column">
              <h5>
                {PLATFORM_INFO[platform.id].label} · {platform.width} px
              </h5>
              {platform.metrics.map((metric) => {
                const info = METRIC_INFO[metric.id]
                if (metric.score === null) {
                  return (
                    <div key={metric.id} className="score-row muted" title={info.about}>
                      <span className="score-row-label">{info.label}</span>
                      <span className="score-row-value">not applicable</span>
                    </div>
                  )
                }
                return (
                  <div key={metric.id} className={`score-row ${verdict(metric.score)}`} title={info.about}>
                    <span className="score-row-label">{info.label}</span>
                    <span className="score-bar">
                      <span style={{ width: `${metric.score}%` }} />
                    </span>
                    <span className="score-row-value">{metric.score}</span>
                  </div>
                )
              })}
              {worst && worst.score !== null && worst.score < 75 && (
                <p className="score-advice">
                  <b>{METRIC_INFO[worst.id].label}</b> is the weak point —{' '}
                  {worst.value !== null && `${METRIC_INFO[worst.id].read(worst.value)}. `}
                  {METRIC_INFO[worst.id].fix}
                </p>
              )}
            </div>
          )
        })}
      </div>

      <div className="score-foot">
        <span className="muted">
          Measured on the rendered pixels at each platform's own size, not on the 1280 px canvas. Nothing is uploaded.
        </span>
        <button className="btn small" disabled={busy} onClick={() => void run()}>
          {busy ? 'Measuring…' : 'Re-score'}
        </button>
      </div>
    </div>
  )
}

function PlatformScore({ platform }: { platform: RawPlatform }) {
  const info = PLATFORM_INFO[platform.id]
  return (
    <div className={`score-dial ${verdict(platform.score)}`} title={info.about}>
      <b>{platform.score}</b>
      <span>{info.label}</span>
      <span className="score-caption">{platform.width} px</span>
    </div>
  )
}
