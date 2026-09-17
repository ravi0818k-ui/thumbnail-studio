import { useState } from 'react'
import { useEditor } from '../store/editorStore'
import {
  ALGORITHM_MYTH,
  ART_COMPONENTS,
  ART_VS_SCIENCE,
  CHECKLIST,
  CHECKLIST_COUNT,
  CLOSING_RULE,
  CLOSING_THOUGHT,
  CLUTTER_TEST,
  CLUTTER_TRAPS,
  CONTRAST_LEVERS,
  CONTRAST_RULE,
  CORE_QUESTION,
  CROSS_LINKS,
  EMOTION_CHAIN,
  EMOTION_RULE,
  FINAL_QUESTIONS,
  FOOTAGE_EMOTIONS,
  FUNDAMENTALS_FORMULA,
  FUNDAMENTALS_INTRO,
  FUNDAMENTALS_PRINCIPLE,
  HIERARCHY_RULE,
  HIERARCHY_STEPS,
  HOOK_COMPARISON,
  IDENTITY_GOAL,
  IDENTITY_RULE,
  IDENTITY_SIGNALS,
  MOMENT_TABLE,
  PILLAR_CONNECTOR,
  PILLARS,
  QUICK_SUMMARY,
  RECORDING_HABIT,
  RESEARCH_INPUTS,
  RESEARCH_TRAP,
  SCIENCE_CONCEPTS,
  SMALL_SIZE_TEST,
  STORY_PATTERNS,
  STORY_RULE,
  TEXT_LENGTH_EXAMPLE,
  THREE_SECOND_TEST,
  THUMBNAIL_EMOTIONS,
  TITLE_PAIRING,
  YT_CONTEXT,
} from '../data/fundamentals'

/**
 * The fundamentals course, and the third sibling of `ColorScreen` and
 * `FontScreen`: a page because it is read rather than operated, opened from
 * home or from the editor, and holding no design knowledge of its own.
 *
 * Unlike the other two it has nothing to apply — the lessons are about
 * decisions, not properties — so instead of apply buttons it hands off to the
 * font and colour guides, which is where those two fundamentals already live.
 */
export default function FundamentalsScreen() {
  const closeFundamentals = useEditor((s) => s.closeFundamentals)
  const returnTo = useEditor((s) => s.fundamentalsReturnTo)
  const openColorGuide = useEditor((s) => s.openColorGuide)
  const openFontGuide = useEditor((s) => s.openFontGuide)

  // Deliberately not persisted: the checklist is a pass over one design, and a
  // stale tick carried into the next thumbnail would be worse than no tick.
  const [ticked, setTicked] = useState<Record<string, boolean>>({})
  const toggle = (key: string) => setTicked((t) => ({ ...t, [key]: !t[key] }))
  const done = Object.values(ticked).filter(Boolean).length

  const openGuide = (id: string) => (id === 'fonts' ? openFontGuide() : openColorGuide())

  return (
    <div className="app">
      <header className="topbar">
        <div className="brand">
          <span className="brand-mark">▶</span>
          <span>Thumbnail Studio</span>
        </div>
        <button className="btn ghost" onClick={closeFundamentals}>
          ← {returnTo === 'editor' ? 'Back to editor' : 'Home'}
        </button>
        <div className="spacer" />
        <span className="muted">Research → Emotion → Message → Design → Test</span>
      </header>

      <div className="home">
        <div className="home-inner">
          <h1 className="hero-title" style={{ fontSize: 30 }}>
            Thumbnail designing: the fundamentals
          </h1>
          {FUNDAMENTALS_INTRO.map((p) => (
            <p key={p} className="hero-sub" style={{ marginBottom: 10 }}>
              {p}
            </p>
          ))}
          <blockquote className="fd-quote">{CORE_QUESTION}</blockquote>
          <p className="fp-principle">{FUNDAMENTALS_PRINCIPLE}</p>

          <h2 className="h2">The three fundamentals</h2>
          <div className="fd-pillars">
            {PILLARS.map((p) => (
              <section key={p.id} className="fd-pillar" style={{ borderTopColor: p.accent }}>
                <h3>
                  <span aria-hidden>{p.icon}</span> {p.title}
                </h3>
                <p className="muted">{p.kicker}</p>
                <ul>
                  {p.items.map((item) => (
                    <li key={item} style={{ background: p.accent }}>
                      {item}
                    </li>
                  ))}
                </ul>
              </section>
            ))}
          </div>
          <section className="fd-connector">
            <b>
              <span aria-hidden>{PILLAR_CONNECTOR.icon}</span> {PILLAR_CONNECTOR.title}
            </b>
            <p>{PILLAR_CONNECTOR.body}</p>
          </section>

          <h2 className="h2">1 · Research — don’t design in isolation</h2>
          <div className="fd-versus">
            <div className="fd-versus-bad">
              <span className="cp-brief-title">Most people start with</span>
              <b>{RESEARCH_TRAP.wrong}</b>
            </div>
            <div className="fd-versus-good">
              <span className="cp-brief-title">Good designers start with</span>
              <b>{RESEARCH_TRAP.right}</b>
            </div>
          </div>
          <div className="cp-brief">
            <section className="cp-brief-card">
              <h3 className="cp-brief-title">Research should include</h3>
              <div className="fd-chips">
                {RESEARCH_INPUTS.map((r) => (
                  <span key={r}>{r}</span>
                ))}
              </div>
            </section>
            <section className="cp-brief-card">
              <h3 className="cp-brief-title">Mine your own footage for</h3>
              <div className="fd-chips">
                {FOOTAGE_EMOTIONS.map((e) => (
                  <span key={e}>{e}</span>
                ))}
              </div>
            </section>
          </div>

          <h3 className="fd-h3">The habit worth building</h3>
          <p className="fp-lead">{RECORDING_HABIT}</p>
          <table className="fd-table">
            <thead>
              <tr>
                <th>Video moment</th>
                <th>Emotion</th>
                <th>Thumbnail idea</th>
              </tr>
            </thead>
            <tbody>
              {MOMENT_TABLE.map((row) => (
                <tr key={row.moment}>
                  <td>{row.moment}</td>
                  <td>{row.emotion}</td>
                  <td className="fd-idea">{row.idea}</td>
                </tr>
              ))}
            </tbody>
          </table>

          <h2 className="h2">2 · Emotion — the hidden power</h2>
          <p className="fp-lead">
            People don’t connect with information alone. They connect with meaning and emotion. Same video, two hooks:
          </p>
          <div className="fd-hooks">
            {HOOK_COMPARISON.map((h) => (
              <div key={h.id} className={`fd-hook fd-hook-${h.id}`}>
                <span className="cp-brief-title">{h.label}</span>
                <strong>{h.text}</strong>
                <p className="muted">{h.note}</p>
              </div>
            ))}
          </div>
          <div className="fd-chain">
            {EMOTION_CHAIN.map((link, i) => (
              <span key={link}>
                {i > 0 && <em>→</em>}
                <b>{link}</b>
              </span>
            ))}
          </div>
          <div className="fd-emotions">
            {THUMBNAIL_EMOTIONS.map((e) => (
              <span key={e.name}>
                <i aria-hidden>{e.emoji}</i>
                {e.name}
              </span>
            ))}
          </div>
          <p className="fp-note">{EMOTION_RULE}</p>

          <h2 className="h2">3 · The thumbnail should tell a story</h2>
          <div className="fd-stories">
            {STORY_PATTERNS.map((s) => (
              <div key={s.id} className="fd-story">
                <span className="cp-brief-title">{s.name}</span>
                <div className="fd-story-beats">
                  <b>{s.before}</b>
                  {s.after && (
                    <>
                      <em>→</em>
                      <b>{s.after}</b>
                    </>
                  )}
                </div>
                <p className="muted">{s.note}</p>
              </div>
            ))}
          </div>
          <p className="fp-note">{STORY_RULE}</p>

          <h2 className="h2">4 · The science of attention</h2>
          <div className="fd-chips fd-chips-lead">
            {SCIENCE_CONCEPTS.map((c) => (
              <span key={c}>{c}</span>
            ))}
          </div>

          <h3 className="fd-h3">Contrast</h3>
          <p className="fp-lead">Contrast is what makes the important element stand out. Four levers:</p>
          <div className="fd-levers">
            {CONTRAST_LEVERS.map((l) => (
              <div key={l.id} className="fd-lever">
                <b>{l.name}</b>
                <span className="muted">{l.recipe}</span>
              </div>
            ))}
          </div>
          <blockquote className="fd-quote">{CONTRAST_RULE}</blockquote>

          <h3 className="fd-h3">Visual hierarchy</h3>
          <p className="fp-lead">{HIERARCHY_RULE}</p>
          <ol className="fd-hierarchy">
            {HIERARCHY_STEPS.map((s) => (
              <li key={s.rank}>
                <b>{s.name}</b>
                <span className="muted">{s.question}</span>
              </li>
            ))}
          </ol>

          <h3 className="fd-h3">The YouTube environment</h3>
          <p className="fp-lead">Your thumbnail never appears alone. It competes with:</p>
          <div className="fd-chips">
            {YT_CONTEXT.map((c) => (
              <span key={c}>{c}</span>
            ))}
          </div>
          <div className="fd-callout">
            <p>{SMALL_SIZE_TEST.problem}</p>
            <b>{SMALL_SIZE_TEST.question}</b>
            <p className="muted">{SMALL_SIZE_TEST.answer}</p>
          </div>

          <h3 className="fd-h3">Design for the viewer, not the algorithm</h3>
          <div className="fd-myth">
            <div>
              <span className="cp-brief-title">The misconception</span>
              <b>{ALGORITHM_MYTH.myth}</b>
            </div>
            <p>{ALGORITHM_MYTH.reality}</p>
            <div className="fd-myth-ask">
              <span className="cp-brief-title">Ask instead</span>
              <b>{ALGORITHM_MYTH.betterQuestion}</b>
            </div>
          </div>

          <h2 className="h2">5 · The art of thumbnail designing</h2>
          <p className="fp-lead">{ART_VS_SCIENCE}</p>
          <div className="fd-chips">
            {ART_COMPONENTS.map((c) => (
              <span key={c}>{c}</span>
            ))}
          </div>

          <h3 className="fd-h3">Text + picture: the core combination</h3>
          <div className="fd-pairing">
            <div>
              <span className="cp-brief-title">Title</span>
              <b>{TITLE_PAIRING.title}</b>
              <span className="muted">{TITLE_PAIRING.titleRole}</span>
            </div>
            <div>
              <span className="cp-brief-title">Thumbnail</span>
              <b className="fd-shout">{TITLE_PAIRING.thumbnail}</b>
              <span className="muted">{TITLE_PAIRING.thumbnailRole}</span>
            </div>
          </div>
          <p className="fp-note">{TITLE_PAIRING.rule}</p>

          <h3 className="fd-h3">Thumbnail text should be short</h3>
          <div className="fd-length">
            <p className="fd-length-bad">{TEXT_LENGTH_EXAMPLE.tooLong}</p>
            <div className="fd-length-good">
              {TEXT_LENGTH_EXAMPLE.better.map((b) => (
                <b key={b}>{b}</b>
              ))}
            </div>
          </div>
          <p className="muted">{TEXT_LENGTH_EXAMPLE.note}</p>

          <h2 className="h2">Fonts and colour have their own pages</h2>
          <div className="fd-links">
            {CROSS_LINKS.map((link) => (
              <section key={link.id} className="cp-brief-card">
                <h3 className="fd-link-title">{link.title}</h3>
                <p className="muted">{link.body}</p>
                <button className="btn small" onClick={() => openGuide(link.id)}>
                  {link.cta} →
                </button>
              </section>
            ))}
          </div>

          <h2 className="h2">Your channel needs a visual identity</h2>
          <p className="fp-lead">{IDENTITY_GOAL}</p>
          <div className="fd-chips">
            {IDENTITY_SIGNALS.map((s) => (
              <span key={s}>{s}</span>
            ))}
          </div>
          <p className="fp-note">{IDENTITY_RULE}</p>

          <h2 className="h2">Don’t add elements just because you can</h2>
          <div className="fd-chips fd-chips-bad">
            {CLUTTER_TRAPS.map((t) => (
              <span key={t}>{t}</span>
            ))}
          </div>
          <blockquote className="fd-quote">{CLUTTER_TEST}</blockquote>

          <h2 className="h2">The 3-second test</h2>
          <p className="fp-lead">{THREE_SECOND_TEST.method}</p>
          <ul className="fd-questions">
            {THREE_SECOND_TEST.questions.map((q) => (
              <li key={q}>{q}</li>
            ))}
          </ul>
          <p className="fp-note">{THREE_SECOND_TEST.verdict}</p>

          <h2 className="h2">
            Pre-publish checklist{' '}
            <span className="muted">
              {done} / {CHECKLIST_COUNT}
            </span>
          </h2>
          <div className="fd-checklist">
            {CHECKLIST.map((group) => (
              <section key={group.id}>
                <span className="cp-brief-title">{group.title}</span>
                {group.items.map((item) => {
                  const key = `${group.id}:${item}`
                  return (
                    <label key={key} className={ticked[key] ? 'fd-checked' : undefined}>
                      <input type="checkbox" checked={!!ticked[key]} onChange={() => toggle(key)} />
                      <span>{item}</span>
                    </label>
                  )
                })}
              </section>
            ))}
          </div>

          <h2 className="h2">The complete formula</h2>
          <ol className="fp-formula">
            {FUNDAMENTALS_FORMULA.map((s) => (
              <li key={s.step}>
                <b>{s.step}</b>
                <span className="muted">{s.body}</span>
              </li>
            ))}
          </ol>

          <h2 className="h2">The most important questions</h2>
          <ol className="fd-final">
            {FINAL_QUESTIONS.map((q) => (
              <li key={q}>{q}</li>
            ))}
          </ol>
          <p className="fp-lead">{CLOSING_THOUGHT}</p>

          <h2 className="h2">Quick summary</h2>
          <div className="fd-summary">
            {QUICK_SUMMARY.map((s) => (
              <div key={s.title}>
                <i aria-hidden>{s.icon}</i>
                <b>{s.title}</b>
                <span className="muted">{s.body}</span>
              </div>
            ))}
          </div>

          <p className="fp-closing">{CLOSING_RULE}</p>
        </div>
      </div>
    </div>
  )
}
