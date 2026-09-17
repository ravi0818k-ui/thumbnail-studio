import { useEffect, useMemo, useState } from 'react'
import { useEditor } from '../store/editorStore'
import { Modal } from './ui'
import { renderToCanvas } from '../engine/renderer'
import { testProject } from '../engine/runTest'
import { PYTHON_DOWNLOAD_MB, onPythonStatus, pythonStatus } from '../engine/pythonImage'
import { METRIC_INFO, PLATFORM_INFO, verdict, type RawPlatform } from '../engine/thumbnailScore'
import {
  ACT_ON,
  CHECK_INFO,
  HARMONY_INFO,
  LIMITS,
  TEST_GROUPS,
  checksIn,
  headline,
  sceneReport,
  type GroupId,
  type ObjectRow,
  type TestReport,
  type VisionCheck,
} from '../engine/thumbnailTest'

/**
 * "Run a test": the full report on one design.
 *
 * Laid out like a vision API's console — the frame on the left with the
 * regions drawn over it, one tab per family of findings on the right — because
 * that is the layout the request was framed in and it is genuinely the right
 * one: every number here is about a *place* in the picture, and a number you
 * cannot point at is hard to act on.
 *
 * Two things it does not do, and says so rather than faking: no expression
 * readings (joy / sorrow / anger / surprise) and no content classification.
 * Both need a trained model on a server; everything here runs in the browser
 * over the pixels the editor just drew. See `LIMITS`.
 */
export default function TestDialog() {
  const project = useEditor((s) => s.project)
  const close = () => useEditor.getState().setTestOpen(false)

  const [engine, setEngine] = useState(pythonStatus())
  const [report, setReport] = useState<TestReport | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [group, setGroup] = useState<GroupId>('faces')
  const [url, setUrl] = useState('')

  useEffect(() => onPythonStatus(() => setEngine(pythonStatus())), [])

  useEffect(() => {
    setUrl(renderToCanvas(project, Math.min(2, 960 / project.width)).toDataURL('image/png'))
  }, [project])

  const scene = useMemo(() => sceneReport(project), [project])

  const run = async () => {
    setBusy(true)
    setError(null)
    try {
      setReport(await testProject(project))
    } catch (err) {
      console.warn('The test could not run', err)
      setError('The Python engine could not start. It needs a connection the first time it is used.')
    } finally {
      setBusy(false)
    }
  }

  // Free once the runtime is warm, so the test is already there on open in
  // that case; before that it stays a button, because opening a dialog should
  // never quietly start a 15 MB download.
  useEffect(() => {
    if (pythonStatus().status === 'ready' && !report && !busy) void run()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const top = report ? headline(report) : null
  const active = TEST_GROUPS.find((g) => g.id === group)!

  return (
    <Modal title="Run a test" onClose={close} width={1060}>
      {!report ? (
        <div className="tt-start">
          <div>
            <b>Test this thumbnail</b>
            <p className="muted">
              Finds faces, separates the subject from the background, and measures contrast, background texture, the
              backing behind your words, edge definition against the YouTube page and how well your colours combine —
              then lists every layer, label and text setting in the design. CPython + numpy, running here in your
              browser
              {engine.status === 'idle' ? `; the first run downloads about ${PYTHON_DOWNLOAD_MB} MB.` : '.'}
            </p>
            {error && <p className="tt-error">{error}</p>}
          </div>
          <button className="btn primary" disabled={busy} onClick={() => void run()}>
            {busy ? 'Testing…' : 'Run a test'}
          </button>
        </div>
      ) : (
        <>
          <div className="tt-head">
            <div className={`tt-total ${top!.verdict}`}>
              <b>{top!.score}</b>
              <span>overall</span>
            </div>
            {report.score.platforms.map((platform) => (
              <PlatformDial key={platform.id} platform={platform} />
            ))}
            <div className="tt-summary">
              {top!.failing.length === 0 ? (
                <p>
                  <b>Nothing is failing.</b> Every check came back at {ACT_ON} or above. The remaining wins are
                  judgement calls, not measurements.
                </p>
              ) : (
                <p>
                  <b>
                    {top!.failing.length} check{top!.failing.length === 1 ? '' : 's'} worth acting on.
                  </b>{' '}
                  Weakest first: {top!.failing.slice(0, 3).map((c) => CHECK_INFO[c.id].label).join(', ')}.
                </p>
              )}
              <button className="btn small" disabled={busy} onClick={() => void run()}>
                {busy ? 'Testing…' : 'Run again'}
              </button>
            </div>
          </div>

          <div className="tt-tabs" role="tablist">
            {TEST_GROUPS.map((g) => {
              const checks = checksIn(g.id, report.vision.checks)
              const worst = checks.reduce<number | null>(
                (low, c) => (typeof c.score === 'number' && (low === null || c.score < low) ? c.score : low),
                null,
              )
              return (
                <button
                  key={g.id}
                  role="tab"
                  aria-selected={group === g.id}
                  className={`tt-tab${group === g.id ? ' active' : ''}`}
                  onClick={() => setGroup(g.id)}
                >
                  {g.label}
                  {worst !== null && <i className={`tt-dot ${verdict(worst)}`} />}
                </button>
              )
            })}
          </div>

          <div className="tt-body">
            <div className="tt-frame">
              <Annotated url={url} project={project} group={group} report={report} scene={scene} />
              <MobileView url={url} project={project} />
            </div>

            <div className="tt-panel" role="tabpanel">
              <p className="tt-about">
                {active.about}
                {active.scene && <span className="tt-source"> Read from your project, not from the pixels.</span>}
              </p>

              {checksIn(group, report.vision.checks).map((check) => (
                <CheckRow key={check.id} check={check} />
              ))}

              <GroupDetail group={group} report={report} scene={scene} />

              {LIMITS[group] && (
                <p className="tt-limit">
                  <b>What this cannot tell you.</b> {LIMITS[group]}
                </p>
              )}
            </div>
          </div>

          <p className="muted tt-foot">
            Measured on the rendered pixels at 640 px and on the project itself. Nothing is uploaded — the Python
            engine runs in a Web Worker in this tab.
          </p>
        </>
      )}
    </Modal>
  )
}

function PlatformDial({ platform }: { platform: RawPlatform }) {
  const info = PLATFORM_INFO[platform.id]
  return (
    <div className={`tt-dial ${verdict(platform.score)}`} title={info.about}>
      <b>{platform.score}</b>
      <span>{info.label}</span>
      <span className="tt-caption">{platform.width} px</span>
    </div>
  )
}

function CheckRow({ check }: { check: VisionCheck }) {
  const info = CHECK_INFO[check.id]
  if (check.score === null) {
    return (
      <div className="tt-check absent">
        <span className="tt-check-label">{info.label}</span>
        <p className="muted">{info.absent}</p>
      </div>
    )
  }
  const grade = verdict(check.score)
  return (
    <div className={`tt-check ${grade}`}>
      <div className="tt-check-head">
        <span className="tt-check-label">{info.label}</span>
        <span className="tt-bar">
          <span style={{ width: `${check.score}%` }} />
        </span>
        <b>{check.score}</b>
      </div>
      <p className="tt-reading">
        {check.value !== null ? info.read(check.value, check) : info.about}
      </p>
      {grade !== 'good' && <p className="tt-fix">{info.fix}</p>}
    </div>
  )
}

// ------------------------------------------------------------- the overlay ---

/**
 * The frame with whatever the active tab is about drawn over it. Boxes are
 * absolutely positioned in percentages rather than painted into a canvas, so
 * they stay crisp and can carry a real label.
 */
function Annotated({
  url,
  project,
  group,
  report,
  scene,
}: {
  url: string
  project: { width: number; height: number }
  group: GroupId
  report: TestReport
  scene: ReturnType<typeof sceneReport>
}) {
  const boxes: Array<{ box: number[]; label: string; kind: string }> = []
  if (group === 'faces') {
    for (const region of report.vision.faces) {
      boxes.push({
        box: region.box,
        label: `${region.kind === 'face' ? 'Face' : 'Skin'} · ${(region.share * 100).toFixed(1)}%`,
        kind: region.kind,
      })
    }
  } else if (group === 'objects') {
    for (const row of scene.objects) {
      if (!row.hidden) boxes.push({ box: row.box, label: row.kind, kind: 'object' })
    }
  } else if (group === 'logos') {
    for (const row of scene.logos) boxes.push({ box: row.box, label: row.name, kind: 'logo' })
  } else if (group === 'text') {
    for (const row of report.vision.text_backing) {
      boxes.push({ box: row.box, label: `varies ${(row.variation * 100).toFixed(1)}%`, kind: 'text' })
    }
  }

  return (
    <figure className="tt-annotated">
      <div className="tt-image" style={{ aspectRatio: `${project.width} / ${project.height}` }}>
        {url && <img src={url} alt="" />}
        {boxes.map((b, i) => (
          <span
            key={`${b.kind}-${i}`}
            className={`tt-box ${b.kind}`}
            style={{
              left: `${b.box[0] * 100}%`,
              top: `${b.box[1] * 100}%`,
              width: `${b.box[2] * 100}%`,
              height: `${b.box[3] * 100}%`,
            }}
          >
            <i>{b.label}</i>
          </span>
        ))}
      </div>
      <figcaption>
        {boxes.length > 0
          ? `${boxes.length} region${boxes.length === 1 ? '' : 's'} on this tab`
          : 'Nothing to outline on this tab'}
      </figcaption>
    </figure>
  )
}

/**
 * The same design in a phone, at the width the YouTube app actually gives it.
 * A desktop-sized preview is the single most misleading thing a thumbnail
 * designer can look at, so the mobile view sits beside every test rather than
 * behind a toggle.
 */
function MobileView({ url, project }: { url: string; project: { width: number; height: number } }) {
  return (
    <figure className="tt-phone-figure">
      <div className="tt-phone">
        <div className="tt-phone-notch" />
        <div className="tt-phone-screen">
          <div className="tt-phone-bar">
            <span className="tt-phone-logo">▶ YouTube</span>
            <span>⌕ ⋮</span>
          </div>
          <div className="tt-phone-card">
            <div className="tt-phone-thumb" style={{ aspectRatio: `${project.width} / ${project.height}` }}>
              {url && <img src={url} alt="" />}
              <span className="tt-phone-duration">14:56</span>
            </div>
            <div className="tt-phone-meta">
              <span className="tt-phone-avatar" />
              <div>
                <b>{project.width >= project.height ? 'Your video title goes here' : 'Your Short'}</b>
                <span>Your Channel · 123K views · 1h ago</span>
              </div>
            </div>
          </div>
          <div className="tt-phone-card ghost">
            <div className="tt-phone-thumb ghost" style={{ aspectRatio: `${project.width} / ${project.height}` }} />
            <div className="tt-phone-meta">
              <span className="tt-phone-avatar ghost" />
              <div>
                <i />
                <i className="short" />
              </div>
            </div>
          </div>
        </div>
      </div>
      {/* No pixel width claimed here: this frame is scaled to fit the dialog.
          Preview → Mobile → "In the app" is the one measured at the real
          360 px, and the legibility line there is the number to trust. */}
      <figcaption>
        In the app, as a full-width card. Open Preview for this at its true size and for the smaller rows.
      </figcaption>
    </figure>
  )
}

// -------------------------------------------------------- per-tab detail ---

function GroupDetail({
  group,
  report,
  scene,
}: {
  group: GroupId
  report: TestReport
  scene: ReturnType<typeof sceneReport>
}) {
  const vision = report.vision

  if (group === 'faces') {
    if (vision.faces.length === 0) return null
    return (
      <table className="tt-table">
        <thead>
          <tr>
            <th>Region</th>
            <th>Share</th>
            <th>Fill</th>
            <th>Aspect</th>
          </tr>
        </thead>
        <tbody>
          {vision.faces.map((f, i) => (
            <tr key={i}>
              <td>{f.kind === 'face' ? 'Face candidate' : 'Skin region'}</td>
              <td>{(f.share * 100).toFixed(1)}%</td>
              <td>{(f.fill * 100).toFixed(0)}%</td>
              <td>{f.aspect.toFixed(2)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    )
  }

  if (group === 'objects') {
    return (
      <>
        <p className="tt-stat">
          <b>{scene.layers}</b> visible layer{scene.layers === 1 ? '' : 's'}
          {scene.objects.length !== scene.layers && <> · {scene.objects.length - scene.layers} hidden</>}
        </p>
        <ObjectTable rows={scene.objects} />
      </>
    )
  }

  if (group === 'labels') {
    return (
      <div className="tt-labels">
        {scene.labels.map((l) => (
          <div key={l.label}>
            <b>{l.label}</b>
            <span className="muted">{l.detail}</span>
          </div>
        ))}
      </div>
    )
  }

  if (group === 'logos') {
    if (scene.logos.length === 0) {
      return (
        <p className="muted">
          No brand mark found. A recognisable channel needs something repeated — an icon, a wordmark or a consistent
          corner element. Name a layer “logo” and it will be listed here.
        </p>
      )
    }
    return <ObjectTable rows={scene.logos} />
  }

  if (group === 'text') {
    if (scene.text.length === 0) return <p className="muted">No text layers in this design.</p>
    return (
      <table className="tt-table">
        <thead>
          <tr>
            <th>Words</th>
            <th>Typeface</th>
            <th>Size</th>
            <th>On a phone</th>
            <th>Plate</th>
          </tr>
        </thead>
        <tbody>
          {scene.text.map((t) => (
            <tr key={t.id} className={t.hidden ? 'hidden' : undefined}>
              <td className="tt-words">{t.text || <span className="muted">empty</span>}</td>
              <td>
                {t.font} {t.weight}
                {t.caps && <span className="tt-pill">caps</span>}
              </td>
              <td>{t.size} px</td>
              <td className={t.mobilePx < 10 ? 'bad' : undefined}>{t.mobilePx.toFixed(1)} px</td>
              <td>{t.plate ? 'yes' : '—'}</td>
            </tr>
          ))}
        </tbody>
      </table>
    )
  }

  if (group === 'contrast') {
    const mobile = report.score.platforms.find((p) => p.id === 'mobile')
    const text = mobile?.metrics.find((m) => m.id === 'text')
    return (
      <>
        {text && text.value !== null && (
          <p className="tt-stat">
            <b>{text.value.toFixed(2)}:1</b> at the weakest text layer, measured at {mobile!.width} px.{' '}
            <span className="muted">{METRIC_INFO.text.about}</span>
          </p>
        )}
        <dl className="tt-props">
          <div>
            <dt>Subject</dt>
            <dd>
              <Swatch hex={vision.subject.hex} /> {vision.subject.hex} · {(vision.subject.share * 100).toFixed(0)}% of
              the frame
            </dd>
          </div>
          <div>
            <dt>Background</dt>
            <dd>
              <Swatch hex={vision.background.hex} /> {vision.background.hex} ·{' '}
              {(vision.background.share * 100).toFixed(0)}% of the frame
            </dd>
          </div>
        </dl>
      </>
    )
  }

  if (group === 'background') {
    return (
      <dl className="tt-props">
        <div>
          <dt>Mean colour</dt>
          <dd>
            <Swatch hex={vision.background.hex} /> {vision.background.hex}
          </dd>
        </div>
        <div>
          <dt>Tonal spread</dt>
          <dd>{(vision.background.spread * 100).toFixed(1)}% — how much the background's own brightness varies.</dd>
        </div>
        <div>
          <dt>Share of frame</dt>
          <dd>{(vision.background.share * 100).toFixed(0)}% sits behind the subject rather than in it.</dd>
        </div>
      </dl>
    )
  }

  if (group === 'color') {
    const harmony = HARMONY_INFO[vision.color.harmony]
    return (
      <>
        <div className="tt-palette">
          {vision.color.palette.map((c) => (
            <span
              key={c.hex}
              style={{ background: c.hex, flexGrow: Math.max(0.15, c.share) }}
              title={`${c.hex} · ${Math.round(c.share * 100)}% · hue ${c.hue}°`}
            />
          ))}
        </div>
        <table className="tt-table">
          <thead>
            <tr>
              <th>Colour</th>
              <th>Share</th>
              <th>Hue</th>
              <th>Saturation</th>
            </tr>
          </thead>
          <tbody>
            {vision.color.palette.map((c) => (
              <tr key={c.hex}>
                <td>
                  <Swatch hex={c.hex} /> {c.hex}
                </td>
                <td>{(c.share * 100).toFixed(1)}%</td>
                <td>{c.saturation < 0.18 ? <span className="muted">neutral</span> : `${c.hue.toFixed(0)}°`}</td>
                <td>{(c.saturation * 100).toFixed(0)}%</td>
              </tr>
            ))}
          </tbody>
        </table>
        <p className="tt-stat">
          <b>{harmony.label}.</b> <span className="muted">{harmony.about}</span>
        </p>
        {vision.color.accent && (
          <p className="muted">
            Strongest accent: <Swatch hex={vision.color.accent} /> {vision.color.accent}, covering{' '}
            {(vision.color.accent_share * 100).toFixed(1)}% of the frame.
          </p>
        )}
      </>
    )
  }

  return null
}

function ObjectTable({ rows }: { rows: ObjectRow[] }) {
  return (
    <table className="tt-table">
      <thead>
        <tr>
          <th>Layer</th>
          <th>Kind</th>
          <th>Detail</th>
          <th>Area</th>
        </tr>
      </thead>
      <tbody>
        {rows.map((row) => (
          <tr key={row.id} className={row.hidden ? 'hidden' : undefined}>
            <td>
              {row.name}
              {row.hidden && <span className="tt-pill">hidden</span>}
            </td>
            <td>{row.kind}</td>
            <td className="muted">{row.detail}</td>
            <td>{(row.share * 100).toFixed(1)}%</td>
          </tr>
        ))}
      </tbody>
    </table>
  )
}

function Swatch({ hex }: { hex: string }) {
  return <i className="tt-swatch" style={{ background: hex }} />
}
