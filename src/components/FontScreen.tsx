import { useMemo, useState } from 'react'
import { useEditor } from '../store/editorStore'
import type { TextObject } from '../types'
import { ensureFontLoaded, fontStack } from '../data/fonts'
import {
  CLOSING_RULE,
  DECISION_BRANCHES,
  DECISION_DEFAULT,
  FONT_CATEGORY_MEANINGS,
  FONT_PRINCIPLE,
  FONT_SIGNALS,
  FONT_SYSTEM,
  FONT_SYSTEM_RULE,
  FORMULA_STEPS,
  fontsInCategory,
  nearestWeight,
  PAIRING_EXAMPLE,
  PAIRING_GROUND,
  PERCEPTION_INPUTS,
  SAME_MESSAGE_TREATMENTS,
  searchFontCategories,
  searchTopics,
  SPECIMEN_NOTE,
  SPECIMEN_TEXT,
  TOPIC_DIRECTIONS,
  WEIGHT_FEELINGS,
  type FontCategory,
} from '../data/fontPsychology'

/**
 * The typography reference, and the sibling of `ColorScreen` in every respect:
 * a page because it is read rather than operated, opened from home or from the
 * editor, and every family it names can be applied to the selection in place so
 * the advice does not require leaving and coming back.
 */
export default function FontScreen() {
  const closeFontGuide = useEditor((s) => s.closeFontGuide)
  const returnTo = useEditor((s) => s.fontsReturnTo)
  const [query, setQuery] = useState('')

  const categories = useMemo(() => searchFontCategories(query), [query])
  const topics = useMemo(() => searchTopics(query), [query])

  // Only text carries a typeface. A shape or a photo has nothing to apply to.
  const textLayers = useEditor((s) =>
    s.project.objects.filter((o): o is TextObject => o.type === 'text' && s.selection.includes(o.id) && !o.locked),
  )
  const canApply = returnTo === 'editor' && textLayers.length > 0

  const applyFamily = async (family: string) => {
    const state = useEditor.getState()
    // The face has to be in the document before the raster is redrawn, or the
    // first frame measures a fallback and the layout jumps.
    await Promise.all(
      textLayers.map((t) => ensureFontLoaded(family, nearestWeight(family, t.fontWeight), t.fontSize)),
    )
    state.pushHistory()
    for (const layer of textLayers) {
      state.updateObject<TextObject>(layer.id, {
        fontFamily: family,
        fontWeight: nearestWeight(family, layer.fontWeight),
      })
    }
    state.closeFontGuide()
  }

  return (
    <div className="app">
      <header className="topbar">
        <div className="brand">
          <span className="brand-mark">▶</span>
          <span>Thumbnail Studio</span>
        </div>
        <button className="btn ghost" onClick={closeFontGuide}>
          ← {returnTo === 'editor' ? 'Back to editor' : 'Home'}
        </button>
        <div className="spacer" />
        <span className="muted">
          {canApply
            ? `${textLayers.length} text layer${textLayers.length === 1 ? '' : 's'} selected — pick a font to apply it`
            : 'Select a text layer in the editor to apply a font from here'}
        </span>
      </header>

      <div className="home">
        <div className="home-inner">
          <h1 className="hero-title" style={{ fontSize: 30 }}>
            Choosing the right font
          </h1>
          <p className="hero-sub">
            A thumbnail is not only about what you write — it is about how the words feel. The right font matches three
            things: <b>topic, emotion and audience</b>.
          </p>

          <p className="fp-principle">{FONT_PRINCIPLE}</p>

          <div className="cp-brief">
            <section className="cp-brief-card">
              <h2 className="cp-brief-title">The same words can feel</h2>
              <ul className="fp-signals">
                {FONT_SIGNALS.map(([a, b]) => (
                  <li key={a}>
                    <span>{a}</span>
                    <em>or</em>
                    <span>{b}</span>
                  </li>
                ))}
              </ul>
            </section>
            <section className="cp-brief-card">
              <h2 className="cp-brief-title">Start with the topic</h2>
              <p className="fp-lead">What is this video trying to make the viewer feel?</p>
              <div className="fp-topics">
                {topics.map((t) => (
                  <div key={t.topic}>
                    <b>{t.topic}</b>
                    <span className="muted">{t.feeling}</span>
                    <em>{t.direction}</em>
                  </div>
                ))}
                {topics.length === 0 && <p className="muted">No topic listed for “{query}”.</p>}
              </div>
            </section>
          </div>

          <div className="row" style={{ margin: '22px 0 14px' }}>
            <input
              className="input"
              type="search"
              style={{ maxWidth: 420 }}
              placeholder="Search by feeling, use or face — luxury, gaming, education…"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
            />
            <span className="muted" style={{ marginLeft: 12 }}>
              {categories.length} of {FONT_CATEGORY_MEANINGS.length} categories · {topics.length} of{' '}
              {TOPIC_DIRECTIONS.length} topics
            </span>
          </div>

          {categories.length === 0 && (
            <p className="muted">
              No category is listed for “{query}”. Try a feeling (elegant, energetic), a use (education, sport) or a
              face (Georgia, Anton).
            </p>
          )}

          <div className="cp-list">
            {categories.map((c) => (
              <CategoryRow key={c.id} category={c} onApply={canApply ? applyFamily : null} />
            ))}
          </div>

          <h2 className="h2">Weight is half the message</h2>
          <p className="fp-lead">
            One family, seven feelings. This is why an extra-bold sans starts behaving visually like a display face —
            the category is only part of the effect.
          </p>
          <div className="fp-weights">
            {WEIGHT_FEELINGS.map((w) => (
              <div key={w.weight} className="fp-weight">
                <span className="fp-weight-sample" style={{ fontFamily: fontStack('Inter'), fontWeight: w.weight }}>
                  Aa
                </span>
                <b>
                  {w.name} <span className="muted">{w.weight}</span>
                </b>
                <span className="muted">{w.feeling}</span>
              </div>
            ))}
          </div>

          <h2 className="h2">One message, four settings</h2>
          <div className="fp-treatments">
            {SAME_MESSAGE_TREATMENTS.map((t) => (
              <div key={t.id} className="fp-treatment">
                <span style={{ fontFamily: t.specimen, fontWeight: t.weight }}>{SPECIMEN_TEXT}</span>
                <b>{t.label}</b>
                <span className="muted">{t.feeling}</span>
              </div>
            ))}
          </div>
          <p className="muted" style={{ marginTop: 10 }}>
            For a serious educational video, an extra-bold sans serif usually communicates the message more effectively
            than a decorative font.
          </p>

          <h2 className="h2">Build a system, not a collection</h2>
          <p className="fp-lead">
            The common mistake is “I found a good font, so I’ll use it everywhere.” Instead pair one expressive face
            with one neutral one, and let hierarchy do the work.
          </p>
          <div className="fp-system">
            {FONT_SYSTEM.map((role) => (
              <div key={role.role} className="fp-role">
                <span className="cp-brief-title">{role.role}</span>
                <span className="fp-role-sample" style={{ fontFamily: fontStack(role.family) }}>
                  {role.sample}
                </span>
                <b>{role.family}</b>
                <ul>
                  {role.why.map((w) => (
                    <li key={w}>{w}</li>
                  ))}
                </ul>
                {canApply && (
                  <button className="btn small block" onClick={() => applyFamily(role.family)}>
                    Apply {role.family}
                  </button>
                )}
              </div>
            ))}
          </div>
          <p className="fp-note">{FONT_SYSTEM_RULE}</p>

          <h2 className="h2">Type and colour are one decision</h2>
          <div className="fp-pairing" style={{ background: PAIRING_GROUND }}>
            {PAIRING_EXAMPLE.map((part) => (
              <div key={part.text}>
                <span style={{ fontFamily: fontStack('Anton'), color: part.hex }}>{part.text}</span>
                <em style={{ color: part.hex }}>
                  {part.role} · {part.weightName} · {part.hex}
                </em>
              </div>
            ))}
          </div>

          <h2 className="h2">When you are unsure</h2>
          <div className="fp-tree">
            {DECISION_BRANCHES.map((b) => (
              <div key={b.feeling}>
                <b>{b.feeling}</b>
                <span>→</span>
                <em>{b.category}</em>
              </div>
            ))}
          </div>
          <p className="fp-note">{DECISION_DEFAULT}</p>

          <h2 className="h2">The formula</h2>
          <ol className="fp-formula">
            {FORMULA_STEPS.map((s) => (
              <li key={s.step}>
                <b>{s.step}</b>
                <span className="muted">{s.example}</span>
              </li>
            ))}
          </ol>

          <h2 className="h2">Emotion is never the typeface alone</h2>
          <p className="fp-lead">
            This is the antidote to “serif = serious”. Perceived feeling is the sum of all of these, which is why Inter
            Regular and Inter Black read as different voices.
          </p>
          <div className="fp-inputs">
            {PERCEPTION_INPUTS.map((input) => (
              <span key={input}>{input}</span>
            ))}
          </div>

          <p className="fp-closing">{CLOSING_RULE}</p>
        </div>
      </div>
    </div>
  )
}

function CategoryRow({
  category,
  onApply,
}: {
  category: FontCategory
  onApply: ((family: string) => void) | null
}) {
  const families = fontsInCategory(category)
  return (
    <article className="cp-row fp-row">
      <div className="cp-ident">
        <div className="fp-specimen" style={{ fontFamily: category.specimen }}>
          {SPECIMEN_TEXT}
        </div>
        <h3 className="cp-name">{category.name}</h3>
        <span className="fp-tagline">{category.tagline}</span>
        <p className="muted">{category.characteristic}</p>
        {families.length > 0 ? (
          <div className="fp-families">
            {families.map((f) =>
              onApply ? (
                <button key={f.family} className="fp-chip" title={`Apply ${f.label}`} onClick={() => onApply(f.family)}>
                  {f.label}
                </button>
              ) : (
                <span key={f.family} className="fp-chip">
                  {f.label}
                </span>
              ),
            )}
          </div>
        ) : (
          <p className="fp-unavailable">{SPECIMEN_NOTE}</p>
        )}
      </div>

      <div className="cp-cols">
        <Column title="Says first" items={category.primary} />
        <Column title="Also says" items={category.secondary} />
        <Column title="Used for" items={category.uses} />
        <Column title="Faces" items={category.examples} />
      </div>

      {category.caution && <p className="cp-caution">{category.caution}</p>}
    </article>
  )
}

function Column({ title, items }: { title: string; items: string[] }) {
  return (
    <div className="cp-col">
      <h4>{title}</h4>
      <ul>
        {items.map((item) => (
          <li key={item}>{item}</li>
        ))}
      </ul>
    </div>
  )
}
