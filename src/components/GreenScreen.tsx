import { useCallback, useEffect, useRef, useState } from 'react'
import { useEditor } from '../store/editorStore'
import { Segmented } from './ui'
import {
  BACKDROP_PRESETS,
  BACKDROP_RESOLUTIONS,
  DEFAULT_BACKDROP,
  EXIT_CONTROL_SECONDS,
  detectedResolution,
  nearestResolution,
  normalizeHex,
} from '../data/greenScreen'

type Orientation = 'landscape' | 'portrait'

// Safari before 16.4 only has the prefixed API, and iPhone Safari has neither
// for anything but <video> — hence the in-page fallback below.
type FsElement = HTMLElement & { webkitRequestFullscreen?: () => Promise<void> | void }
type FsDocument = Document & { webkitFullscreenElement?: Element | null; webkitExitFullscreen?: () => void }

const fullscreenElement = () => document.fullscreenElement ?? (document as FsDocument).webkitFullscreenElement ?? null

/**
 * A utility, not a design: it turns this screen into one flat colour to prop up
 * behind a subject as a chroma-key backdrop. It never asks for the camera or the
 * microphone — the selftest greps this file to keep it that way.
 *
 * The stage is mounted the whole time, already painted, and hidden by CSS until
 * it is the fullscreen element. That is what makes the switch instant: the
 * request is made synchronously inside the click, and there is no render between
 * the gesture and the colour for a white frame to slip into.
 */
export default function GreenScreen() {
  const close = useEditor((s) => s.closeGreenScreen)
  const returnTo = useEditor((s) => s.greenScreenReturnTo)

  const [hex, setHex] = useState(DEFAULT_BACKDROP.hex)
  const [draft, setDraft] = useState(DEFAULT_BACKDROP.hex)
  const detected = detectedResolution(window.screen.width, window.screen.height, window.devicePixelRatio)
  const [resolutionId, setResolutionId] = useState(() => nearestResolution(detected.width, detected.height).id)
  const [orientation, setOrientation] = useState<Orientation>(() =>
    window.screen.height > window.screen.width ? 'portrait' : 'landscape',
  )
  // 'native' is the Fullscreen API; 'page' is the fallback that covers the
  // viewport where the API is missing or refused.
  const [mode, setMode] = useState<'off' | 'native' | 'page'>('off')
  const [exitVisible, setExitVisible] = useState(false)

  const stageRef = useRef<HTMLDivElement>(null)
  const hideTimer = useRef<number>()
  const wakeLock = useRef<{ release: () => Promise<void> } | null>(null)

  const resolution = BACKDROP_RESOLUTIONS.find((r) => r.id === resolutionId) ?? BACKDROP_RESOLUTIONS[0]
  const outW = orientation === 'landscape' ? resolution.width : resolution.height
  const outH = orientation === 'landscape' ? resolution.height : resolution.width

  const pick = (value: string) => {
    setHex(value)
    setDraft(value)
  }

  const onDraft = (value: string) => {
    setDraft(value)
    const valid = normalizeHex(value)
    if (valid) setHex(valid)
  }

  const exit = useCallback(() => {
    if (fullscreenElement()) {
      const doc = document as FsDocument
      if (document.exitFullscreen) void document.exitFullscreen().catch(() => {})
      else doc.webkitExitFullscreen?.()
    }
    setMode('off')
  }, [])

  const enter = () => {
    const el = stageRef.current as FsElement | null
    if (!el) return
    setExitVisible(false)
    const request = el.requestFullscreen?.bind(el) ?? el.webkitRequestFullscreen?.bind(el)
    if (!request) {
      setMode('page')
      return
    }
    setMode('native')
    try {
      const result = request()
      if (result && typeof result.catch === 'function') result.catch(() => setMode('page'))
    } catch {
      setMode('page')
    }
  }

  // Esc is handled by the browser in native mode; this notices it happened.
  useEffect(() => {
    const onChange = () => {
      if (!fullscreenElement()) setMode((m) => (m === 'native' ? 'off' : m))
    }
    document.addEventListener('fullscreenchange', onChange)
    document.addEventListener('webkitfullscreenchange', onChange)
    return () => {
      document.removeEventListener('fullscreenchange', onChange)
      document.removeEventListener('webkitfullscreenchange', onChange)
    }
  }, [])

  // The page fallback has no browser Esc behind it, so it supplies its own, and
  // tints the status bar so a phone's notch area matches the backdrop.
  useEffect(() => {
    if (mode !== 'page') return
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && exit()
    window.addEventListener('keydown', onKey)
    const meta = document.querySelector<HTMLMetaElement>('meta[name="theme-color"]')
    const previous = meta?.content
    if (meta) meta.content = hex
    const overflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      window.removeEventListener('keydown', onKey)
      if (meta && previous !== undefined) meta.content = previous
      document.body.style.overflow = overflow
    }
  }, [mode, hex, exit])

  // A backdrop that dims after thirty seconds is no backdrop. The Wake Lock API
  // asks no permission; where it is missing the screen simply follows its own
  // timeout. The lock is dropped whenever the tab is hidden, so take it again.
  useEffect(() => {
    if (mode === 'off') return
    const nav = navigator as Navigator & {
      wakeLock?: { request: (type: 'screen') => Promise<{ release: () => Promise<void> }> }
    }
    const acquire = () => {
      if (!nav.wakeLock || document.visibilityState !== 'visible') return
      nav.wakeLock
        .request('screen')
        .then((lock) => (wakeLock.current = lock))
        .catch(() => {})
    }
    acquire()
    document.addEventListener('visibilitychange', acquire)
    return () => {
      document.removeEventListener('visibilitychange', acquire)
      void wakeLock.current?.release().catch(() => {})
      wakeLock.current = null
    }
  }, [mode])

  useEffect(() => () => window.clearTimeout(hideTimer.current), [])
  // Leaving the screen while the colour is up must not strand the display in it.
  useEffect(() => () => void (fullscreenElement() && document.exitFullscreen?.().catch(() => {})), [])

  // A tap is the only way out on a phone, so it reveals the exit control; it
  // fades after a few still seconds so it is not in the shot.
  const revealExit = () => {
    setExitVisible(true)
    window.clearTimeout(hideTimer.current)
    hideTimer.current = window.setTimeout(() => setExitVisible(false), EXIT_CONTROL_SECONDS * 1000)
  }

  const download = () => {
    const canvas = document.createElement('canvas')
    canvas.width = outW
    canvas.height = outH
    const ctx = canvas.getContext('2d')
    if (!ctx) return
    ctx.fillStyle = hex
    ctx.fillRect(0, 0, outW, outH)
    // PNG, never JPEG: a lossy encoder dithers a flat field into blocks, and
    // blocks are exactly what a keyer trips over.
    canvas.toBlob((blob) => {
      if (!blob) return
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `backdrop-${hex.slice(1).toLowerCase()}-${outW}x${outH}.png`
      a.click()
      setTimeout(() => URL.revokeObjectURL(url), 1000)
    }, 'image/png')
  }

  const active = mode !== 'off'
  const matchesPreset = BACKDROP_PRESETS.some((p) => p.hex === hex)
  const isAppleTouch = /iPhone|iPod/.test(navigator.userAgent)

  return (
    <div className="app">
      <header className="topbar">
        <div className="brand">
          <img className="brand-mark" src="/logo.png" alt="" width={26} height={26} />
          <span>Thumbnail Studio</span>
        </div>
        <button className="btn ghost" onClick={close}>
          ← {returnTo === 'editor' ? 'Back to editor' : 'Home'}
        </button>
        <div className="spacer" />
        <span className="muted">No camera · no microphone · just colour</span>
      </header>

      <div className="home">
        <div className="home-inner">
          <h1 className="hero-title" style={{ fontSize: 30 }}>
            Green screen backdrop
          </h1>
          <p className="hero-sub">
            Turn this screen into a flat chroma-key colour and prop it up behind your subject while you shoot B-roll.
            Pick a colour, then go full screen — tap or press Esc to come back.
          </p>

          <div className="gs-layout">
            <button
              className="gs-preview"
              style={{ background: hex, aspectRatio: `${outW} / ${outH}` }}
              onClick={enter}
              aria-label="Fill the screen with this colour"
            >
              <span>Click to fill the screen</span>
            </button>

            <div className="gs-controls">
              <h2 className="h2" style={{ marginTop: 0 }}>
                Colour
              </h2>
              <div className="gs-swatches">
                {BACKDROP_PRESETS.map((p) => (
                  <button
                    key={p.id}
                    className={`gs-swatch${p.hex === hex ? ' active' : ''}`}
                    onClick={() => pick(p.hex)}
                    title={p.use}
                  >
                    <span style={{ background: p.hex }} />
                    <b>{p.label}</b>
                    <em>{p.hex}</em>
                  </button>
                ))}
              </div>
              <label className="gs-custom">
                <span className="color-swatch" style={{ background: hex }}>
                  <input type="color" value={hex.toLowerCase()} onChange={(e) => pick(normalizeHex(e.target.value)!)} />
                </span>
                <input
                  className="input"
                  value={draft}
                  onChange={(e) => onDraft(e.target.value)}
                  onBlur={() => setDraft(hex)}
                  aria-label="Custom colour"
                  spellCheck={false}
                />
                <span className="muted">{matchesPreset ? 'or pick any colour' : 'Custom colour'}</span>
              </label>
              <p className="muted gs-note">{BACKDROP_PRESETS.find((p) => p.hex === hex)?.use ?? ' '}</p>

              <h2 className="h2">Size</h2>
              <p className="muted gs-note">
                This screen is {detected.width} × {detected.height}. Full screen always fills it edge to edge; the size
                below is for a backdrop image to play on a TV or tablet that can't open this page.
              </p>
              <Segmented
                value={resolutionId}
                options={BACKDROP_RESOLUTIONS.map((r) => ({ value: r.id, label: r.label, title: `${r.width} × ${r.height}` }))}
                onChange={setResolutionId}
              />
              <div style={{ height: 8 }} />
              <Segmented<Orientation>
                value={orientation}
                options={[
                  { value: 'landscape', label: 'Landscape' },
                  { value: 'portrait', label: 'Portrait' },
                ]}
                onChange={setOrientation}
              />

              <div className="row" style={{ marginTop: 18, gap: 8, flexWrap: 'wrap' }}>
                <button className="btn primary" onClick={enter}>
                  Go full screen
                </button>
                <button className="btn ghost" onClick={download}>
                  Download {outW} × {outH} PNG
                </button>
              </div>
              {isAppleTouch && (
                <p className="muted gs-note" style={{ marginTop: 12 }}>
                  iPhone Safari cannot hide its own bars for a web page. For a true edge-to-edge fill, add this site to
                  your Home Screen and open it from there.
                </p>
              )}
            </div>
          </div>

          <h2 className="h2">Getting a clean key</h2>
          <ul className="gs-tips">
            <li>Turn the screen's brightness up and switch off night mode or True Tone — both tint the colour.</li>
            <li>Keep the subject a step or two in front of the screen so it doesn't throw green light onto them.</li>
            <li>Shoot the screen slightly out of focus; that hides the pixel grid and any moiré.</li>
            <li>Choose blue when the subject is wearing green, and green for everything else.</li>
          </ul>
        </div>
      </div>

      <div
        ref={stageRef}
        className={`gs-stage${mode === 'page' ? ' on' : ''}${exitVisible ? '' : ' idle'}`}
        style={{ background: hex, ['--gs-color' as string]: hex }}
        onPointerDown={active ? revealExit : undefined}
        aria-hidden={!active}
      >
        {active && exitVisible && (
          <button
            className="gs-exit"
            onPointerDown={(e) => e.stopPropagation()}
            onClick={exit}
          >
            Exit full screen
          </button>
        )}
      </div>
    </div>
  )
}
