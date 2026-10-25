import { useEffect, useState } from 'react'
import { useEditor } from '../store/editorStore'
import { TEMPLATES } from '../data/templates'
import { YOUTUBE_SUBSCRIBE_URL } from '../data/links'
import { routeForPath } from '../router'
import {
  TRY_TEMPLATE_ID,
  TUTORIALS,
  lessonPath,
  readWatched,
  tutorialById,
  tutorialStill,
  tutorialUrl,
  writeWatched,
  type Tutorial,
  type TutorialAction,
} from '../data/tutorials'

function setLessonParam(id: string | null) {
  if (routeForPath(window.location.pathname)?.screen !== 'tutorials') return
  const url = new URL(window.location.href)
  if (id) url.searchParams.set('v', id)
  else url.searchParams.delete('v')
  window.history.replaceState(window.history.state, '', url.pathname + url.search)
}

/** `?v=` names the lesson to open, so one video can be linked on its own. */
function lessonFromAddress(): Tutorial {
  return tutorialById(new URLSearchParams(window.location.search).get('v')) ?? TUTORIALS[0]
}

/**
 * The channel's lessons, laid out like a YouTube watch page — a big player and
 * an "Up next" list — because that is a layout every visitor already knows.
 *
 * Like the home card, the player is a facade: only stills are fetched until
 * someone presses play, and the embed is youtube-nocookie.
 */
export default function TutorialsScreen() {
  const close = useEditor((s) => s.closeTutorials)
  const [current, setCurrent] = useState(lessonFromAddress)
  const [playing, setPlaying] = useState(false)
  const [watched, setWatched] = useState(readWatched)

  // Keep ?v= on the address so the page can be shared as it stands, and drop it
  // on the way out so the home page does not inherit it. Both check the path:
  // on the first render from home the address is still "/", since useRouteSync
  // (in the parent) pushes /tutorials after this runs.
  useEffect(() => setLessonParam(current.id), [current])
  useEffect(() => () => setLessonParam(null), [])

  const play = (lesson: Tutorial) => {
    setCurrent(lesson)
    setPlaying(true)
    if (!watched.includes(lesson.id)) {
      const next = [...watched, lesson.id]
      setWatched(next)
      writeWatched(next)
    }
  }

  const choose = (lesson: Tutorial) => {
    play(lesson)
    document.querySelector('.tt-main')?.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }

  const playedCount = TUTORIALS.filter((t) => watched.includes(t.id)).length
  const index = TUTORIALS.indexOf(current)
  const next = TUTORIALS[index + 1] ?? null

  return (
    <div className="tt-screen">
      <header className="rm-top">
        <button className="btn ghost" onClick={close} title="Back to Thumbnail Studio">
          ← Back
        </button>
        <h1 className="rm-title">Tutorials</h1>
        <div className="spacer" />
        <a className="btn tutorial-subscribe" href={YOUTUBE_SUBSCRIBE_URL} target="_blank" rel="noopener noreferrer">
          Subscribe on YouTube
        </a>
      </header>

      <div className="tt-body">
        <main className="tt-main">
          <div className="tutorial-player">
            {playing ? (
              <iframe
                key={current.id}
                src={`https://www.youtube-nocookie.com/embed/${current.id}?autoplay=1&rel=0&modestbranding=1`}
                title={current.title}
                allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
                referrerPolicy="strict-origin-when-cross-origin"
                allowFullScreen
              />
            ) : (
              <button className="tutorial-facade" onClick={() => play(current)} aria-label={`Play: ${current.title}`}>
                <Still id={current.id} size="maxresdefault" />
                <span className="tutorial-duration">{current.duration}</span>
                <span className="tutorial-play" aria-hidden>
                  <svg viewBox="0 0 24 24" width="30" height="30">
                    <path d="M8 5.5v13l11-6.5z" fill="currentColor" />
                  </svg>
                </span>
              </button>
            )}
          </div>

          <div className="tt-info">
            <span className="tutorial-eyebrow">
              <i aria-hidden /> Lesson {index + 1} of {TUTORIALS.length}
            </span>
            <h2>{current.title}</h2>
            <p className="tutorial-lede">{current.summary}</p>

            <TryIt lesson={current} />

            <h3 className="tt-h3">What you'll learn</h3>
            <ol className="tutorial-steps">
              {current.learn.map((step, i) => (
                <li key={step.title}>
                  <span>{String(i + 1).padStart(2, '0')}</span>
                  <div>
                    <b>{step.title}</b>
                    <em>{step.text}</em>
                  </div>
                </li>
              ))}
            </ol>

            <div className="tutorial-actions">
              {next && (
                <button className="btn" onClick={() => choose(next)}>
                  Next lesson: {next.title.length > 34 ? next.title.slice(0, 32).trimEnd() + '…' : next.title}
                </button>
              )}
              <a className="btn ghost" href={tutorialUrl(current.id)} target="_blank" rel="noopener noreferrer">
                Open on YouTube ↗
              </a>
            </div>
          </div>
        </main>

        <aside className="tt-side" aria-label="Up next">
          <div className="tt-side-head">
            <b>Up next</b>
            <span>
              {playedCount} of {TUTORIALS.length} played
            </span>
          </div>
          <div className="tt-progress" aria-hidden>
            <i style={{ width: `${(playedCount / TUTORIALS.length) * 100}%` }} />
          </div>

          <ol className="tt-list">
            {TUTORIALS.map((lesson, i) => {
              const seen = watched.includes(lesson.id)
              return (
                <li key={lesson.id}>
                  {/* A real link, so a lesson can be opened in a new tab or copied. */}
                  <a
                    className={`tt-item${lesson === current ? ' on' : ''}`}
                    href={lessonPath(lesson.id)}
                    aria-current={lesson === current ? 'true' : undefined}
                    onClick={(event) => {
                      if (event.metaKey || event.ctrlKey || event.shiftKey || event.button !== 0) return
                      event.preventDefault()
                      choose(lesson)
                    }}
                  >
                    <span className="tt-thumb">
                      <Still id={lesson.id} size="mqdefault" />
                      <span className="tutorial-duration">{lesson.duration}</span>
                      {lesson === current && playing && <span className="tt-now">Playing</span>}
                    </span>
                    <span className="tt-meta">
                      {i === 0 && <span className="tt-start">Start here</span>}
                      <b>{lesson.title}</b>
                      <em>{seen ? '✓ Played' : 'Youtubethumbnail Studio'}</em>
                    </span>
                  </a>
                </li>
              )
            })}
          </ol>
        </aside>
      </div>
    </div>
  )
}

function Still({ id, size }: { id: string; size: 'maxresdefault' | 'mqdefault' }) {
  return (
    <img
      src={tutorialStill(id, size)}
      alt=""
      loading="lazy"
      onError={(e) => {
        // Not every upload has a maxres still; hq always exists.
        const img = e.currentTarget
        const fallback = tutorialStill(id, 'hqdefault')
        if (img.src !== fallback) img.src = fallback
      }}
    />
  )
}

/** Watch it, then do it: the button that opens the feature the lesson teaches. */
function TryIt({ lesson }: { lesson: Tutorial }) {
  return (
    <div className="tt-try">
      <div>
        <b>Try it now</b>
        <span>{lesson.ctaNote}</span>
      </div>
      <button className="btn primary" onClick={() => tryIt(lesson.action)}>
        ✦ {lesson.cta}
      </button>
    </div>
  )
}

/**
 * Opens a lesson's feature. The demos start a fresh project from a template,
 * so they never touch whatever the creator was working on.
 */
export function tryIt(action: TutorialAction) {
  const store = useEditor.getState()
  if (action === 'templates') {
    store.setScreen('templates')
    return
  }
  const template = TEMPLATES.find((t) => t.id === TRY_TEMPLATE_ID)
  store.newProject({ format: 'thumbnail' })
  if (template) useEditor.getState().applyTemplate(template)
  const state = useEditor.getState()
  if (action === 'preview') state.setPreviewOpen(true)
  else if (action === 'icons') useEditor.setState({ panel: 'icons' })
  else {
    state.select([])
    state.setWatchedBar({ on: true })
  }
}
