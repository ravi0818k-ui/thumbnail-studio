import { useMemo, useState } from 'react'
import { useEditor } from '../store/editorStore'
import { TEMPLATE_CATEGORIES, templatesForFormat, type TemplateCategory } from '../data/templates'
import TemplatePreview from './TemplatePreview'
import { FORMAT_LIST } from '../data/formats'
import type { CanvasFormat } from '../types'

export default function TemplateScreen() {
  const applyTemplate = useEditor((s) => s.applyTemplate)
  const newProject = useEditor((s) => s.newProject)
  const setScreen = useEditor((s) => s.setScreen)
  const [category, setCategory] = useState<TemplateCategory>('All')
  const [query, setQuery] = useState('')
  const [format, setFormat] = useState<CanvasFormat>('thumbnail')

  const templates = useMemo(() => {
    const q = query.trim().toLowerCase()
    return templatesForFormat(format).filter(
      (t) =>
        (category === 'All' || t.category === category) &&
        (!q || t.name.toLowerCase().includes(q) || t.category.toLowerCase().includes(q)),
    )
  }, [category, query, format])

  const categories = useMemo(() => {
    const available = new Set(templatesForFormat(format).map((t) => t.category))
    return TEMPLATE_CATEGORIES.filter((c) => c === 'All' || available.has(c as never))
  }, [format])

  return (
    <div className="app">
      <header className="topbar">
        <div className="brand">
          <span className="brand-mark">▶</span>
          <span>Thumbnail Studio</span>
        </div>
        <button className="btn ghost" onClick={() => setScreen('home')}>
          ← Home
        </button>
        <div className="spacer" />
        <button className="btn" onClick={() => newProject({ format })}>
          Start blank
        </button>
      </header>
      <div className="home">
        <div className="home-inner">
          <h1 className="hero-title" style={{ fontSize: 30 }}>
            Choose a thumbnail
          </h1>
          <div className="row" style={{ marginBottom: 16, gap: 12 }}>
            <input
              className="input"
              style={{ maxWidth: 380 }}
              placeholder="Search templates…"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
            />
            <div className="seg" style={{ maxWidth: 280 }}>
              {FORMAT_LIST.map((f) => (
                <button
                  key={f.id}
                  className={format === f.id ? 'active' : ''}
                  onClick={() => {
                    setFormat(f.id)
                    setCategory('All')
                  }}
                >
                  {f.glyph} {f.shortLabel}
                </button>
              ))}
            </div>
          </div>
          <div className="chips">
            {categories.map((c) => (
              <button key={c} className={`chip${c === category ? ' active' : ''}`} onClick={() => setCategory(c)}>
                {c}
              </button>
            ))}
          </div>
          <div className="card-grid">
            {templates.map((t) => (
              <button
                key={t.id}
                className="project-card"
                onClick={() => {
                  newProject({ format })
                  applyTemplate(t)
                }}
              >
                <TemplatePreview template={t} width={420} />
                <div className="meta">
                  <b>{t.name}</b>
                  <span className="muted">{t.category}</span>
                </div>
              </button>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}
