import { useMemo, useState } from 'react'
import { useEditor } from '../store/editorStore'
import type { ImageObject, ShapeObject, TextObject } from '../types'
import {
  COLOR_INFLUENCE,
  COLOR_MEANINGS,
  COLOR_PROPERTIES,
  contrastRatio,
  DARK_GROUND,
  LIGHT_GROUND,
  readsOnDark,
  readsOnLight,
  searchColorMeanings,
  shadeOf,
  tintOf,
  type ColorMeaning,
} from '../data/colorPsychology'

/**
 * The colour reference. It is a page rather than a panel because it is read,
 * not operated — but it is opened from the editor as often as from home, so
 * every hue can be applied to the selection without leaving and coming back.
 */
export default function ColorScreen() {
  const closeColorGuide = useEditor((s) => s.closeColorGuide)
  const returnTo = useEditor((s) => s.colorsReturnTo)
  const [query, setQuery] = useState('')
  const [copied, setCopied] = useState<string | null>(null)

  const meanings = useMemo(() => searchColorMeanings(query), [query])

  // A colour can only be applied to something that has one. An image that is
  // not an icon is a photograph — recolouring it would be a filter, not a fill.
  const colourable = useEditor((s) =>
    s.project.objects.filter(
      (o) => s.selection.includes(o.id) && !o.locked && (o.type !== 'image' || o.icon !== null),
    ),
  )
  const canApply = returnTo === 'editor' && colourable.length > 0

  const copy = async (hex: string) => {
    try {
      await navigator.clipboard.writeText(hex)
      setCopied(hex)
      window.setTimeout(() => setCopied((c) => (c === hex ? null : c)), 1200)
    } catch {
      // Clipboard access can be refused; the hex is on screen either way.
      setCopied(null)
    }
  }

  const applyToSelection = (hex: string) => {
    const state = useEditor.getState()
    state.pushHistory()
    for (const obj of colourable) {
      if (obj.type === 'text') state.updateObject<TextObject>(obj.id, { color: hex })
      else if (obj.type === 'shape') state.updateObject<ShapeObject>(obj.id, { fill: hex, fillEnabled: true })
      else {
        // An icon is a black raster tinted by its colour overlay.
        state.updateObject<ImageObject>(obj.id, {
          effects: { ...obj.effects, overlay: { ...obj.effects.overlay, enabled: true, color: hex, opacity: 100 } },
        })
      }
    }
    state.closeColorGuide()
  }

  return (
    <div className="app">
      <header className="topbar">
        <div className="brand">
          <span className="brand-mark">▶</span>
          <span>Thumbnail Studio</span>
        </div>
        <button className="btn ghost" onClick={closeColorGuide}>
          ← {returnTo === 'editor' ? 'Back to editor' : 'Home'}
        </button>
        <div className="spacer" />
        <span className="muted">
          {canApply
            ? `${colourable.length} layer${colourable.length === 1 ? '' : 's'} selected — pick a colour to apply it`
            : 'Click any swatch to copy its hex'}
        </span>
      </header>

      <div className="home">
        <div className="home-inner">
          <h1 className="hero-title" style={{ fontSize: 30 }}>
            Colour psychology
          </h1>
          <p className="hero-sub">
            What each hue communicates, where it is conventionally used, and whether it can carry a headline on a
            thumbnail. Reference, not rules — but the contrast badges are maths, and those are worth obeying.
          </p>

          <div className="cp-brief">
            <section className="cp-brief-card">
              <h2 className="cp-brief-title">Influence</h2>
              <ul className="cp-facts">
                {COLOR_INFLUENCE.map((fact) => (
                  <li key={fact}>{fact}</li>
                ))}
              </ul>
            </section>
            <section className="cp-brief-card">
              <h2 className="cp-brief-title">Properties</h2>
              <dl className="cp-props">
                {COLOR_PROPERTIES.map((p) => (
                  <div key={p.name}>
                    <dt>{p.name}</dt>
                    <dd>{p.description}</dd>
                  </div>
                ))}
              </dl>
            </section>
          </div>

          <div className="row" style={{ margin: '22px 0 14px' }}>
            <input
              className="input"
              type="search"
              style={{ maxWidth: 420 }}
              placeholder="Search by feeling, industry or intent — finance, urgency, growth…"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
            />
            <span className="muted" style={{ marginLeft: 12 }}>
              {meanings.length} of {COLOR_MEANINGS.length}
            </span>
          </div>

          {meanings.length === 0 && (
            <p className="muted">
              No hue is listed for “{query}”. Try a feeling (trust, urgency), an industry (finance, food) or an intent
              (relax, warn).
            </p>
          )}

          <div className="cp-list">
            {meanings.map((m) => (
              <ColorRow
                key={m.id}
                meaning={m}
                copied={copied === m.hex}
                onCopy={() => copy(m.hex)}
                onApply={canApply ? () => applyToSelection(m.hex) : null}
              />
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}

function ColorRow({
  meaning,
  copied,
  onCopy,
  onApply,
}: {
  meaning: ColorMeaning
  copied: boolean
  onCopy: () => void
  onApply: (() => void) | null
}) {
  const onDark = readsOnDark(meaning.hex)
  const onLight = readsOnLight(meaning.hex)
  // The hex sits on top of the hue, so it takes whichever of white or black
  // the hue itself contrasts with — the opposite question to the badges below.
  const label =
    contrastRatio(meaning.hex, LIGHT_GROUND) >= contrastRatio(meaning.hex, DARK_GROUND) ? LIGHT_GROUND : DARK_GROUND
  return (
    <article className="cp-row" style={{ borderLeftColor: meaning.hex }}>
      <div className="cp-ident">
        <button
          className="cp-swatch"
          style={{ background: meaning.hex }}
          title={`Copy ${meaning.hex}`}
          onClick={onCopy}
        >
          <span style={{ color: label }}>{copied ? 'Copied' : meaning.hex}</span>
        </button>
        <div className="cp-ramp">
          <span style={{ background: tintOf(meaning.hex) }} title={`Tint ${tintOf(meaning.hex)}`} />
          <span style={{ background: meaning.hex }} title={meaning.hex} />
          <span style={{ background: shadeOf(meaning.hex) }} title={`Shade ${shadeOf(meaning.hex)}`} />
        </div>
        <h3 className="cp-name">{meaning.name}</h3>
        {meaning.wavelength && (
          <span className="muted cp-wave">
            {meaning.wavelength.from}–{meaning.wavelength.to} nm
          </span>
        )}
        <div className="cp-badges">
          <span className={`cp-badge${onDark ? ' ok' : ''}`}>{onDark ? 'Reads on dark' : 'Not on dark'}</span>
          <span className={`cp-badge${onLight ? ' ok' : ''}`}>{onLight ? 'Reads on light' : 'Not on light'}</span>
        </div>
        {onApply && (
          <button className="btn small block" style={{ marginTop: 10 }} onClick={onApply}>
            Apply to selection
          </button>
        )}
      </div>

      <div className="cp-cols">
        <Column title="Emotion" items={meaning.emotions} />
        <Column title="Industry" items={meaning.industries} />
        <Column title="Used to" items={meaning.usedTo} />
      </div>

      {meaning.caution && <p className="cp-caution">{meaning.caution}</p>}
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
