import { useState } from 'react'
import { useEditor } from '../store/editorStore'
import { TUTORIAL_DURATION, TUTORIAL_VIDEO_ID, TUTORIAL_VIDEO_URL, YOUTUBE_SUBSCRIBE_URL } from '../data/links'
import { TUTORIALS } from '../data/tutorials'

// The walkthrough is the first lesson on /tutorials too; its steps live there.
const STEPS = TUTORIALS[0].learn.map((step, i) => ({ n: String(i + 1).padStart(2, '0'), ...step }))

/**
 * The getting-started video, dressed as the thing it teaches: a YouTube card
 * with the New badge and duration the Preview dialog draws. No watched bar —
 * the video's thumbnail paints its own, and two would stack.
 *
 * It is a facade. Until someone presses play only the still is fetched, so the
 * home screen stays fast and YouTube's player (and its cookies) never loads
 * for a visitor who did not ask for it. The embed is youtube-nocookie.
 */
export default function TutorialCard() {
  const [playing, setPlaying] = useState(false)
  const openTutorials = useEditor((s) => s.openTutorials)

  return (
    <section className="tutorial" aria-label="Video tutorial">
      <div className="tutorial-player">
        {playing ? (
          <iframe
            src={`https://www.youtube-nocookie.com/embed/${TUTORIAL_VIDEO_ID}?autoplay=1&rel=0&modestbranding=1`}
            title="Thumbnail Studio tutorial"
            allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
            referrerPolicy="strict-origin-when-cross-origin"
            allowFullScreen
          />
        ) : (
          <button className="tutorial-facade" onClick={() => setPlaying(true)} aria-label="Play the tutorial">
            <img
              src={`https://i.ytimg.com/vi/${TUTORIAL_VIDEO_ID}/maxresdefault.jpg`}
              alt=""
              loading="lazy"
              onError={(e) => {
                // Not every upload has a maxres still; hq always exists.
                const img = e.currentTarget
                if (!img.src.includes('hqdefault')) img.src = `https://i.ytimg.com/vi/${TUTORIAL_VIDEO_ID}/hqdefault.jpg`
              }}
            />
            <span className="tutorial-new">New</span>
            <span className="tutorial-duration">{TUTORIAL_DURATION}</span>
            <span className="tutorial-play" aria-hidden>
              <svg viewBox="0 0 24 24" width="30" height="30">
                <path d="M8 5.5v13l11-6.5z" fill="currentColor" />
              </svg>
            </span>
          </button>
        )}
      </div>

      <div className="tutorial-copy">
        <span className="tutorial-eyebrow">
          <i aria-hidden /> Tutorial · new here?
        </span>
        <h2>Your first thumbnail in 7 minutes</h2>
        <p className="tutorial-lede">Watch one design go from a plain photo to a finished, click-ready thumbnail.</p>
        <ol className="tutorial-steps">
          {STEPS.map((s) => (
            <li key={s.n}>
              <span>{s.n}</span>
              <div>
                <b>{s.title}</b>
                <em>{s.text}</em>
              </div>
            </li>
          ))}
        </ol>
        <div className="tutorial-actions">
          {playing ? (
            <a className="btn" href={TUTORIAL_VIDEO_URL} target="_blank" rel="noopener noreferrer">
              Open on YouTube ↗
            </a>
          ) : (
            <button className="btn primary" onClick={() => setPlaying(true)}>
              ▶ Watch tutorial
            </button>
          )}
          <a className="btn tutorial-subscribe" href={YOUTUBE_SUBSCRIBE_URL} target="_blank" rel="noopener noreferrer">
            Subscribe for more
          </a>
        </div>
        {/* A real link, so it can be opened in a new tab or copied; the click stays in the app. */}
        <a
          className="tutorial-more"
          href="/tutorials"
          onClick={(event) => {
            if (event.metaKey || event.ctrlKey || event.shiftKey || event.button !== 0) return
            event.preventDefault()
            openTutorials()
          }}
        >
          {TUTORIALS.length - 1} more short lessons · <b>Explore more videos →</b>
        </a>
      </div>
    </section>
  )
}
