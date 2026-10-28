import { useState, type RefObject } from 'react'
import { useEditor } from '../../store/editorStore'
import type { TextAccent, TextObject } from '../../types'
import { ColorInput, Section } from '../ui'
import { ACCENT_SWATCHES, accentAt, cleanAccents, paintAccent, toggleWord, wordsOf } from '../../engine/textAccents'

/**
 * Coloured words: pick a colour, click words. The words are chips rather than
 * a selection in the textarea because a click is the whole gesture — but a
 * selection in the Text box above works too, for part of a word.
 */
export default function AccentSection({
  object,
  textarea,
}: {
  object: TextObject
  textarea: RefObject<HTMLTextAreaElement | null>
}) {
  const [paint, setPaint] = useState(object.accents[0]?.color ?? ACCENT_SWATCHES[0])
  const words = wordsOf(object.text)
  const inUse = [...new Set(object.accents.map((a) => a.color))]

  const commit = (accents: TextAccent[]) => {
    const state = useEditor.getState()
    state.pushHistory()
    state.updateObject<TextObject>(object.id, { accents })
  }

  const colourSelection = () => {
    const el = textarea.current
    if (!el || el.selectionEnd <= el.selectionStart) return
    commit(paintAccent(object.accents, object.text, el.selectionStart, el.selectionEnd, paint))
  }

  const recolour = (from: string, to: string) => {
    useEditor.getState().pushHistory(`accent:${object.id}`)
    const accents = object.accents.map((a) => (a.color === from ? { ...a, color: to } : a))
    useEditor.getState().updateObject<TextObject>(object.id, { accents: cleanAccents(accents, object.text) })
    if (paint === from) setPaint(to)
  }

  return (
    <Section title="Coloured words">
      <div className="accent-swatches" role="radiogroup" aria-label="Word colour">
        {ACCENT_SWATCHES.map((c) => (
          <button
            key={c}
            role="radio"
            aria-checked={paint === c}
            className={`accent-swatch${paint === c ? ' on' : ''}`}
            style={{ background: c }}
            title={c}
            onClick={() => setPaint(c)}
          />
        ))}
        <ColorInput value={paint} onChange={setPaint} showValue={false} />
      </div>

      {words.length > 0 ? (
        <div className="accent-words">
          {words.map((w) => {
            const color = accentAt(object.accents, w.start)
            return (
              <button
                key={w.start}
                className={`accent-word${color ? ' on' : ''}`}
                style={color ? { color, borderColor: color } : undefined}
                onClick={() => commit(toggleWord(object.accents, object.text, w, paint))}
                title={color ? 'Click again to clear, or pick another colour first' : 'Colour this word'}
              >
                {object.uppercase ? w.word.toUpperCase() : w.word}
              </button>
            )
          })}
        </div>
      ) : (
        <p className="muted">Type some text first.</p>
      )}

      <div className="row" style={{ gap: 6, marginTop: 8 }}>
        <button className="btn small" onClick={colourSelection} title="Colour the characters selected in the Text box">
          Colour selected text
        </button>
        {object.accents.length > 0 && (
          <button className="btn small ghost" onClick={() => commit([])}>
            Clear all
          </button>
        )}
      </div>

      {inUse.length > 0 && (
        <div className="accent-inuse">
          <span className="muted">In use — change to recolour every word wearing it:</span>
          {/* Keyed by position: keyed by colour, the picker would remount mid-drag. */}
          {inUse.map((c, i) => (
            <ColorInput key={i} value={c} onChange={(next) => recolour(c, next)} />
          ))}
        </div>
      )}
    </Section>
  )
}
