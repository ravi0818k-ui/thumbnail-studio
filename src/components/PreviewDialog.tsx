import { useEffect, useMemo, useState } from 'react'
import { useEditor } from '../store/editorStore'
import { Modal, Segmented, Toggle } from './ui'
import { renderToCanvas } from '../engine/renderer'
import type { TextObject } from '../types'
import { groupedSurfaces, smallestSurface, type PreviewSurface } from '../data/previewSurfaces'
import ScoreCard from './ScoreCard'

type Theme = 'dark' | 'light'

/** Type below this many CSS pixels is not read, it is only glanced at. */
const LEGIBLE_PX = 10

const DESCRIPTION =
  'Lorem ipsum dolor sit amet, consectetur adipiscing elit, sed do eiusmod tempor incididunt ut labore et dolore magna aliqua.'

/**
 * Where the design meets its audience. A thumbnail is authored at 1280 px and
 * seen at 168, so this shows every real surface at its real width, in both
 * YouTube themes, optionally surrounded by competing videos — because the
 * question is never "does this look good", it is "does this win the row".
 *
 * Everything here is simulated chrome and is never part of an export.
 */
export default function PreviewDialog() {
  const project = useEditor((s) => s.project)
  const close = () => useEditor.getState().setPreviewOpen(false)
  const [url, setUrl] = useState('')
  const [theme, setTheme] = useState<Theme>('dark')
  const [neighbours, setNeighbours] = useState(true)
  const [gray, setGray] = useState(false)
  const [title, setTitle] = useState(project.name)

  useEffect(() => {
    // 2× the widest surface, so nothing in here is upscaled.
    setUrl(renderToCanvas(project, Math.min(2, 960 / project.width)).toDataURL('image/png'))
  }, [project])

  const groups = useMemo(() => groupedSurfaces(project.format), [project.format])
  const smallest = smallestSurface(project.format)

  // The smallest visible text is what decides whether a design survives being
  // shrunk, so compute what it actually measures on the worst surface.
  const smallestText = useMemo(() => {
    const sizes = project.objects
      .filter((o): o is TextObject => o.type === 'text' && !o.hidden && o.text.trim().length > 0)
      .map((o) => o.fontSize)
    return sizes.length > 0 ? Math.min(...sizes) : null
  }, [project.objects])
  const renderedPx = smallestText === null ? null : (smallestText * smallest.width) / project.width

  const shared = { url, title, theme, project }

  return (
    <Modal title="Preview" onClose={close} width={1020}>
      <div className="pv-toolbar">
        <input
          className="input pv-title-input"
          value={title}
          placeholder="Type the title you will publish with"
          onChange={(e) => setTitle(e.target.value)}
        />
        <Segmented
          value={theme}
          onChange={(next: Theme) => setTheme(next)}
          options={[
            { value: 'dark', label: 'Dark', title: "YouTube's default for most viewers" },
            { value: 'light', label: 'Light', title: 'Where a light thumbnail can disappear into the page' },
          ]}
        />
        <Toggle label="Competing videos" checked={neighbours} onChange={setNeighbours} />
        <Toggle label="Grayscale" checked={gray} onChange={setGray} />
      </div>

      <ScoreCard />

      {renderedPx !== null && (
        <div className={`pv-legibility${renderedPx < LEGIBLE_PX ? ' warn' : ''}`}>
          <b>{Math.round(smallestText!)} px</b> — your smallest text — renders at <b>{renderedPx.toFixed(1)} px</b> in
          the {smallest.label.toLowerCase()} ({smallest.width} px wide).
          {renderedPx < LEGIBLE_PX
            ? ' Nobody reads that. Make it bigger, or accept that it is decoration.'
            : ' That still reads.'}
        </div>
      )}

      <div className={`pv-body ${theme}${gray ? ' gray' : ''}`}>
        {groups.map(({ group, surfaces }) => (
          <section key={group} className="pv-group">
            <h4>{group}</h4>
            {surfaces.map((surface) => (
              <div key={surface.id} className="pv-slot">
                <div className="pv-slot-head">
                  <span className="pv-slot-label">{surface.label}</span>
                  <span className="pv-slot-size">
                    {surface.width} px · {Math.round((surface.width / project.width) * 100)}%
                  </span>
                </div>
                {surface.note && <p className="pv-slot-note">{surface.note}</p>}
                <Surface surface={surface} neighbours={neighbours} {...shared} />
              </div>
            ))}
          </section>
        ))}
      </div>

      <p className="muted pv-footnote">
        Sizes are what YouTube gives a thumbnail on a 1440 px desktop window and a 390 px phone. Grayscale is the
        squint test: if the design falls apart without colour, it is leaning on colour alone to separate the subject
        from the background. The interface drawn around your artwork is simulated — it is never exported.
      </p>
    </Modal>
  )
}

interface SurfaceProps {
  surface: PreviewSurface
  url: string
  title: string
  theme: Theme
  neighbours: boolean
  project: { width: number; height: number; format: string }
}

function Surface({ surface, url, title, neighbours, project }: SurfaceProps) {
  const ratio = `${project.width} / ${project.height}`
  const thumb = <Thumb url={url} width={surface.width} ratio={ratio} />

  switch (surface.layout) {
    case 'grid':
      return (
        <div className="pv-shelf">
          {neighbours && <Neighbour width={surface.width} ratio={ratio} seed={1} />}
          <div className="pv-card" style={{ width: surface.width }}>
            {thumb}
            <div className="pv-card-meta">
              <span className="pv-avatar" />
              <div>
                <span className="pv-line-title">{title}</span>
                <span className="pv-line-sub">Your Channel</span>
                <span className="pv-line-sub">123K views · 1 hour ago</span>
              </div>
            </div>
          </div>
          {neighbours && <Neighbour width={surface.width} ratio={ratio} seed={2} />}
        </div>
      )

    case 'row':
      return (
        <div className="pv-shelf column">
          {neighbours && <NeighbourRow width={surface.width} ratio={ratio} seed={3} />}
          <div className="pv-row">
            {thumb}
            <div>
              <span className="pv-line-title small">{title}</span>
              <span className="pv-line-sub">Your Channel</span>
              <span className="pv-line-sub">123K views · 1 hour ago</span>
            </div>
          </div>
          {neighbours && <NeighbourRow width={surface.width} ratio={ratio} seed={4} />}
        </div>
      )

    case 'feature':
      return (
        <div className="pv-row feature">
          {thumb}
          <div>
            <span className="pv-line-title large">{title}</span>
            <span className="pv-line-sub">123K views · 1 hour ago</span>
            <p className="pv-desc">{DESCRIPTION}</p>
            <span className="pv-line-sub">Your Channel</span>
          </div>
        </div>
      )

    case 'bare':
      return (
        <div className="pv-shelf">
          {neighbours && <Neighbour width={surface.width} ratio={ratio} seed={5} bare />}
          {thumb}
          {neighbours && <Neighbour width={surface.width} ratio={ratio} seed={6} bare />}
        </div>
      )

    case 'tv':
      return (
        <div className="pv-tv">
          <div className="pv-card" style={{ width: surface.width }}>
            {thumb}
            <span className="pv-line-title tv">{title}</span>
            <span className="pv-line-sub">Your Channel · 123K views</span>
          </div>
          {neighbours && <Neighbour width={surface.width * 0.8} ratio={ratio} seed={7} bare />}
        </div>
      )

    case 'immersive':
      return <Immersive url={url} title={title} width={surface.width} />
  }
}

function Thumb({ url, width, ratio }: { url: string; width: number; ratio: string }) {
  return (
    <div className="pv-thumb" style={{ width, aspectRatio: ratio }}>
      {url ? <img src={url} alt="" /> : null}
      <span className="pv-duration">14:56</span>
    </div>
  )
}

/** Enough variation between neighbours that the row does not read as a pattern. */
function shade(seed: number): string {
  return `brightness(${(0.82 + (seed % 3) * 0.13).toFixed(2)})`
}

/**
 * A competing video. Deliberately flat and grey: the point is not to simulate
 * anyone else's artwork, it is to show how much of the row your design owns.
 */
function Neighbour({ width, ratio, seed, bare }: { width: number; ratio: string; seed: number; bare?: boolean }) {
  return (
    <div className="pv-neighbour" style={{ width }}>
      <div className="pv-neighbour-thumb" style={{ aspectRatio: ratio, filter: shade(seed) }} />
      {!bare && (
        <div className="pv-card-meta">
          <span className="pv-avatar ghost" />
          <div style={{ flex: 1 }}>
            <span className="pv-ghost-line" />
            <span className="pv-ghost-line short" />
          </div>
        </div>
      )}
    </div>
  )
}

function NeighbourRow({ width, ratio, seed }: { width: number; ratio: string; seed: number }) {
  return (
    <div className="pv-row">
      <div className="pv-neighbour-thumb" style={{ width, aspectRatio: ratio, filter: shade(seed) }} />
      <div style={{ flex: 1 }}>
        <span className="pv-ghost-line" />
        <span className="pv-ghost-line short" />
      </div>
    </div>
  )
}

/** The Shorts player: your cover full-bleed with the app's controls over it. */
function Immersive({ url, title, width }: { url: string; title: string; width: number }) {
  return (
    <div className="phone" style={{ width }}>
      <div className="phone-screen" style={{ aspectRatio: '9 / 16' }}>
        {url ? <img src={url} alt="" /> : null}
        <div className="phone-chrome">
          <div className="phone-top">
            <span>Shorts</span>
            <span>🔍 ⋮</span>
          </div>
          <div className="phone-rail">
            <span>❤️</span>
            <span>💬</span>
            <span>↗</span>
            <span>⋯</span>
          </div>
          <div className="phone-bottom">
            <b style={{ display: 'block', fontSize: 13 }}>@yourchannel</b>
            <span style={{ fontSize: 12 }}>{title}</span>
          </div>
        </div>
      </div>
    </div>
  )
}
