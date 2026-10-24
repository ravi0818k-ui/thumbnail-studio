import { useState } from 'react'
import { TUTORIAL_DURATION, TUTORIAL_VIDEO_ID, TUTORIAL_VIDEO_URL, YOUTUBE_SUBSCRIBE_URL } from '../data/links'

const STEPS = [
  { n: '01', title: 'Cut yourself out', text: 'One click removes the photo background.' },
  { n: '02', title: 'Make it pop', text: 'Big text, outline and glow that read on a phone.' },
  { n: '03', title: 'Preview like YouTube', text: 'See it in the feed before you upload.' },
]

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
      </div>
    </section>
  )
}
