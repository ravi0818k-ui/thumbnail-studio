import { useEffect, useRef, useState } from 'react'
import { useEditor } from '../../store/editorStore'
import { ICON_GROUPS, type IconLeaf } from '../../data/icons'
import { iconLabel, loadIconAsset, loadIcons, searchIcons, type IconData } from '../../engine/iconLibrary'
import { createIcon, DEFAULT_ICON_COLOR } from '../../engine/factory'

/** Colour the previews are drawn in — the panel is dark, icons default to black. */
const PREVIEW_COLOR = '#D7DBE3'

/**
 * The icon library. The tree is local (data/icons.ts) but every icon in it
 * comes from the Iconify API when you open a category, so the library is not
 * limited to a list someone remembered to type out.
 */
export default function IconsPanel() {
  const project = useEditor((s) => s.project)
  const addObject = useEditor((s) => s.addObject)
  const [leaf, setLeaf] = useState<IconLeaf>(ICON_GROUPS[0].leaves[0])
  const [term, setTerm] = useState('')
  const [icons, setIcons] = useState<[string, IconData][]>([])
  const [status, setStatus] = useState<'loading' | 'ready' | 'failed'>('loading')
  const [adding, setAdding] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [attempt, setAttempt] = useState(0)
  // Results can come back out of order; only the newest query may paint.
  const queryRef = useRef(0)

  const query = term.trim() || leaf.query

  useEffect(() => {
    const ticket = ++queryRef.current
    setStatus('loading')
    // Two requests for a whole category: the search, then one bulk fetch per
    // icon set. Asking for each icon separately is what the API answers with
    // 429, and a rate-limited grid looks exactly like a broken one.
    searchIcons(query)
      .then((ids) => loadIcons(ids).then((found) => ids.map((id) => [id, found.get(id)] as const)))
      .then((pairs) => {
        if (queryRef.current !== ticket) return
        setIcons(pairs.filter((pair): pair is [string, IconData] => pair[1] !== undefined))
        setStatus('ready')
      })
      .catch(() => {
        if (queryRef.current !== ticket) return
        setStatus('failed')
      })
  }, [query, attempt])

  const add = async (id: string) => {
    setAdding(id)
    setError(null)
    try {
      const asset = await loadIconAsset(id)
      addObject(
        createIcon(id, asset.id, asset.width, asset.height, project.width, project.height, DEFAULT_ICON_COLOR),
      )
    } catch (err) {
      console.warn('Icon insert failed', err)
      setError('That icon could not be downloaded. Check your connection and try again.')
    } finally {
      setAdding(null)
    }
  }

  return (
    <div>
      <h2 className="panel-title">Icons</h2>
      <input
        className="input"
        type="search"
        placeholder="Search every icon…"
        value={term}
        onChange={(e) => setTerm(e.target.value)}
      />

      {ICON_GROUPS.map((group) => (
        <div key={group.id} style={{ marginTop: 12 }}>
          <div className="section-head">{group.label}</div>
          <div className="chips">
            {group.leaves.map((item) => (
              <button
                key={item.id}
                className={`chip${!term.trim() && item.id === leaf.id ? ' active' : ''}`}
                onClick={() => {
                  setTerm('')
                  setLeaf(item)
                }}
              >
                {item.label}
              </button>
            ))}
          </div>
        </div>
      ))}

      <div className="section-head" style={{ marginTop: 16 }}>
        {term.trim() ? `Results for “${term.trim()}”` : leaf.label}
      </div>

      {status === 'loading' && <p className="muted">Searching the icon library…</p>}
      {status === 'failed' && (
        <p className="muted">
          The icon library could not be reached — no connection, or it is busy. Icons you have already placed keep
          working offline.{' '}
          <button className="btn small" onClick={() => setAttempt((n) => n + 1)}>
            Try again
          </button>
        </p>
      )}
      {status === 'ready' && icons.length === 0 && <p className="muted">Nothing matched. Try a plainer word.</p>}

      <div className="grid-4">
        {icons.map(([id, icon]) => (
          <button
            key={id}
            className={`element-btn${adding === id ? ' busy' : ''}`}
            title={iconLabel(id)}
            disabled={adding !== null}
            onClick={() => void add(id)}
          >
            {/* Drawn from the data already fetched — the preview needs no
                request of its own. The body is sanitised in the library. */}
            <svg
              viewBox={`0 0 ${icon.width} ${icon.height}`}
              width={28}
              height={28}
              style={{ color: PREVIEW_COLOR }}
              dangerouslySetInnerHTML={{ __html: icon.body }}
            />
          </button>
        ))}
      </div>

      {error && (
        <p className="muted" style={{ color: 'var(--accent)' }}>
          {error}
        </p>
      )}
      <p className="muted" style={{ marginTop: 12 }}>
        Icons come from the open-source Iconify API — Material Design Icons, Tabler, Phosphor and Lucide. They drop in
        as an ordinary layer, so colour, outline, shadow and size are all yours to change.
      </p>
    </div>
  )
}
