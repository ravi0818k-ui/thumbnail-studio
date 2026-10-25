import { useEffect, useRef, useState } from 'react'
import { useEditor } from '../store/editorStore'
import {
  THUMB_SIZES,
  decodeThumbnail,
  downloadName,
  fetchThumbnail,
  fetchVideoInfo,
  parseVideoId,
  saveBlob,
  toPng,
  watchUrl,
  type Decoded,
  type ThumbSize,
  type VideoInfo,
} from '../engine/ytThumbnail'

interface Still {
  size: ThumbSize
  blob: Blob
  url: string
  image: Decoded
}

type State =
  | { phase: 'idle' }
  | { phase: 'loading'; id: string }
  | { phase: 'error'; message: string }
  | { phase: 'done'; id: string; info: VideoInfo | null; stills: Still[] }

const EXAMPLE = 'https://www.youtube.com/watch?v=orR6_EoT-Nc'

const HOW = [
  { title: 'Copy the link', text: 'Share → Copy link on YouTube, or the address bar on desktop.' },
  { title: 'Paste it here', text: 'The thumbnail appears at every size YouTube has it.' },
  { title: 'Download PNG', text: 'Up to 1280 × 720, with the 4:3 black bars trimmed.' },
]

function release(state: State) {
  if (state.phase !== 'done') return
  for (const s of state.stills) {
    URL.revokeObjectURL(s.url)
    s.image.bitmap.close()
  }
}

/**
 * Paste a YouTube link, get that video's thumbnail at every size YouTube has
 * it, download it as PNG. Runs entirely in the browser (see ytThumbnail.ts).
 */
export default function ThumbnailGrabberScreen() {
  const close = useEditor((s) => s.closeGrabber)
  const [text, setText] = useState('')
  const [state, setState] = useState<State>({ phase: 'idle' })
  const [selected, setSelected] = useState<ThumbSize | null>(null)
  const [trim, setTrim] = useState(true)
  const [saving, setSaving] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)
  const abortRef = useRef<AbortController | null>(null)
  const stateRef = useRef(state)
  stateRef.current = state

  useEffect(() => {
    inputRef.current?.focus()
    return () => {
      abortRef.current?.abort()
      release(stateRef.current)
    }
  }, [])

  const lookUp = async (raw: string) => {
    const id = parseVideoId(raw)
    if (!id) {
      setState({ phase: 'error', message: "That doesn't look like a YouTube link. Paste the address of a video, a Short or a youtu.be link." })
      return
    }
    if (state.phase === 'done' && state.id === id) return
    abortRef.current?.abort()
    const abort = new AbortController()
    abortRef.current = abort
    release(stateRef.current)
    setState({ phase: 'loading', id })
    try {
      const [info, ...blobs] = await Promise.all([
        fetchVideoInfo(id, abort.signal),
        ...THUMB_SIZES.map((s) => fetchThumbnail(id, s.id, abort.signal)),
      ])
      const stills: Still[] = []
      for (let i = 0; i < THUMB_SIZES.length; i++) {
        const blob = blobs[i] as Blob | null
        if (!blob) continue
        stills.push({ size: THUMB_SIZES[i].id, blob, url: URL.createObjectURL(blob), image: await decodeThumbnail(blob) })
      }
      if (abort.signal.aborted) return
      if (stills.length === 0) {
        setState({ phase: 'error', message: 'YouTube has no thumbnail for that video. Check the link — the video may be private or deleted.' })
        return
      }
      setSelected(stills[0].size)
      setState({ phase: 'done', id, info: info as VideoInfo | null, stills })
    } catch (err) {
      if ((err as Error).name === 'AbortError') return
      setState({ phase: 'error', message: "Couldn't reach YouTube. Check your connection and try again." })
    }
  }

  const still = state.phase === 'done' ? (state.stills.find((s) => s.size === selected) ?? state.stills[0]) : null
  const bars = still && trim ? still.image.bars : { top: 0, bottom: 0 }
  const hasBars = !!still && still.image.bars.top > 0
  const outHeight = still ? still.image.height - bars.top - bars.bottom : 0

  const downloadPng = async () => {
    if (state.phase !== 'done' || !still) return
    setSaving(true)
    try {
      saveBlob(await toPng(still.image, trim), downloadName(state.info?.title ?? null, state.id, still.size, 'png'))
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="tg-screen">
      <header className="rm-top">
        <button className="btn ghost" onClick={close} title="Back to Thumbnail Studio">
          ← Back
        </button>
        <h1 className="rm-title">YouTube thumbnail downloader</h1>
      </header>

      <div className="tg-body">
        <section className="tg-hero">
          <h2>Download any YouTube thumbnail</h2>
          <p>Paste a video link to get its thumbnail in full HD, then save it as a PNG.</p>
          <form
            className="tg-form"
            onSubmit={(e) => {
              e.preventDefault()
              void lookUp(text)
            }}
          >
            <input
              ref={inputRef}
              className="tg-input"
              type="text"
              inputMode="url"
              autoComplete="off"
              spellCheck={false}
              placeholder="https://www.youtube.com/watch?v=…"
              aria-label="YouTube video link"
              value={text}
              onChange={(e) => setText(e.target.value)}
              // A paste is the whole gesture: look it up without a second click.
              onPaste={(e) => {
                const pasted = e.clipboardData.getData('text')
                if (parseVideoId(pasted)) {
                  e.preventDefault()
                  setText(pasted.trim())
                  void lookUp(pasted)
                }
              }}
            />
            <button className="btn primary tg-go" type="submit" disabled={state.phase === 'loading' || !text.trim()}>
              {state.phase === 'loading' ? 'Fetching…' : 'Get thumbnail'}
            </button>
          </form>
          <p className="tg-hint">
            Works with watch links, youtu.be, Shorts, embeds and live links.{' '}
            {state.phase === 'idle' && (
              <button
                className="tg-example"
                onClick={() => {
                  setText(EXAMPLE)
                  void lookUp(EXAMPLE)
                }}
              >
                Try an example
              </button>
            )}
          </p>
        </section>

        {state.phase === 'idle' && (
          <ol className="tg-steps">
            {HOW.map((step, i) => (
              <li key={step.title}>
                <span>{i + 1}</span>
                <b>{step.title}</b>
                <em>{step.text}</em>
              </li>
            ))}
          </ol>
        )}

        {state.phase === 'error' && (
          <p className="tg-error" role="alert">
            {state.message}
          </p>
        )}

        {state.phase === 'loading' && (
          <div className="tg-result">
            <div className="tg-preview tg-skeleton" aria-busy="true" />
            <div className="tg-side" />
          </div>
        )}

        {state.phase === 'done' && still && (
          <div className="tg-result">
            <div>
              <div
                className="tg-preview"
                style={{ aspectRatio: `${still.image.width} / ${outHeight}` }}
              >
                <img
                  src={still.url}
                  alt={state.info?.title ? `Thumbnail of “${state.info.title}”` : 'Video thumbnail'}
                  style={{ marginTop: `${(-bars.top / still.image.width) * 100}%` }}
                />
              </div>
              <div className="tg-video">
                <b>{state.info?.title ?? state.id}</b>
                {state.info?.author && <span>{state.info.author}</span>}
                <a href={watchUrl(state.id)} target="_blank" rel="noopener noreferrer">
                  Watch on YouTube ↗
                </a>
              </div>
            </div>

            <aside className="tg-side">
              <h3>Size</h3>
              <div className="tg-sizes" role="radiogroup" aria-label="Thumbnail size">
                {THUMB_SIZES.map((size) => {
                  const have = state.stills.find((s) => s.size === size.id)
                  const h = have ? have.image.height - (trim ? have.image.bars.top + have.image.bars.bottom : 0) : size.height
                  return (
                    <button
                      key={size.id}
                      role="radio"
                      aria-checked={still.size === size.id}
                      className={`tg-size${still.size === size.id ? ' on' : ''}`}
                      disabled={!have}
                      onClick={() => setSelected(size.id)}
                    >
                      <b>{size.label}</b>
                      <span>{have ? `${have.image.width} × ${h}` : 'Not available for this video'}</span>
                    </button>
                  )
                })}
              </div>

              {hasBars && (
                <label className="tg-trim">
                  <input type="checkbox" checked={trim} onChange={(e) => setTrim(e.target.checked)} />
                  Trim the black bars
                </label>
              )}

              <button className="btn primary tg-download" onClick={downloadPng} disabled={saving}>
                ⬇ Download PNG · {still.image.width} × {outHeight}
              </button>
              <a
                className="tg-jpg"
                href={still.url}
                download={downloadName(state.info?.title ?? null, state.id, still.size, 'jpg')}
              >
                or the original JPG from YouTube
              </a>

              <p className="tg-note">
                Thumbnails belong to the creators who made them. Use one for reference or with the creator's permission.
              </p>
            </aside>
          </div>
        )}
      </div>
    </div>
  )
}
