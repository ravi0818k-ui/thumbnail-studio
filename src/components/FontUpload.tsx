import { useRef, useState } from 'react'
import { FONT_ACCEPT } from '../engine/fontFile'
import { removeCustomFamily, uploadFonts, useCustomFonts, type UploadResult } from '../engine/customFonts'

/**
 * The upload button and what came of the last upload. `compact` is the inline
 * version under the Family menu; the Text panel shows the full list.
 */
export default function FontUpload({ compact = false, onAdded }: { compact?: boolean; onAdded?: (family: string) => void }) {
  const input = useRef<HTMLInputElement>(null)
  const fonts = useCustomFonts()
  const [busy, setBusy] = useState(false)
  const [result, setResult] = useState<UploadResult | null>(null)

  const pick = async (list: FileList | null) => {
    if (!list || list.length === 0) return
    setBusy(true)
    try {
      const outcome = await uploadFonts([...list])
      setResult(outcome)
      if (outcome.added.length > 0) onAdded?.(outcome.added[0])
    } finally {
      setBusy(false)
      if (input.current) input.current.value = ''
    }
  }

  return (
    <div className="font-upload">
      <input ref={input} type="file" accept={FONT_ACCEPT} multiple hidden onChange={(e) => pick(e.target.files)} />
      <button className={`btn ${compact ? 'small' : ''} block`} disabled={busy} onClick={() => input.current?.click()}>
        {busy ? 'Checking fonts…' : '⤒ Upload font'}
      </button>

      {result && result.added.length > 0 && (
        <p className="font-upload-ok">
          Added {result.added.join(', ')} — pick {result.added.length > 1 ? 'them' : 'it'} under Family.
        </p>
      )}
      {result && result.problems.length > 0 && (
        <ul className="font-upload-errors">
          {result.problems.map((p) => (
            <li key={p}>{p}</li>
          ))}
        </ul>
      )}

      {!compact && fonts.length > 0 && (
        <div className="font-upload-list">
          {fonts.map((f) => (
            <div key={f.family} className="font-upload-row">
              <span style={{ fontFamily: `"${f.family}", sans-serif`, fontWeight: f.weights.includes(700) ? 700 : f.weights[0] }}>
                {f.family}
              </span>
              <em>{f.weights.join(' · ')}</em>
              <button className="icon-btn" title={`Remove ${f.family}`} onClick={() => removeCustomFamily(f.family)}>
                ✕
              </button>
            </div>
          ))}
        </div>
      )}

      {!compact && (
        <p className="muted" style={{ marginTop: 8, marginBottom: 0 }}>
          .ttf, .otf, .woff, .woff2, or the whole .zip from Google Fonts. Fonts stay until you close the tab and are never
          uploaded anywhere — re-add one to keep editing a design that uses it.
        </p>
      )}
    </div>
  )
}
