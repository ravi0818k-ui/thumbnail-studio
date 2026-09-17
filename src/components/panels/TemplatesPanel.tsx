import { useMemo, useState } from 'react'
import { useEditor } from '../../store/editorStore'
import { TEMPLATE_CATEGORIES, templatesForFormat, type TemplateCategory, type TemplateDef } from '../../data/templates'
import TemplatePreview from '../TemplatePreview'
import { formatConfig } from '../../data/formats'

export default function TemplatesPanel() {
  const applyTemplate = useEditor((s) => s.applyTemplate)
  const format = useEditor((s) => s.project.format)
  const size = { width: useEditor((s) => s.project.width), height: useEditor((s) => s.project.height) }
  const [category, setCategory] = useState<TemplateCategory>('All')
  const [query, setQuery] = useState('')

  const templates = useMemo(() => {
    const q = query.trim().toLowerCase()
    // Only layouts built for the canvas you are on.
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
    <div>
      <h2 className="panel-title">Templates</h2>
      <p className="muted" style={{ marginTop: -6, marginBottom: 10 }}>
        {formatConfig(format).label} · {size.width} × {size.height}
      </p>
      <input
        className="input"
        placeholder="Search templates…"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        style={{ marginBottom: 12 }}
      />
      <div className="chips">
        {categories.map((c) => (
          <button key={c} className={`chip${c === category ? ' active' : ''}`} onClick={() => setCategory(c)}>
            {c}
          </button>
        ))}
      </div>
      <div className="tiles">
        {templates.map((t) => (
          <TemplateTile key={t.id} template={t} portrait={format === 'shorts'} onPick={() => applyTemplate(t)} />
        ))}
      </div>
      {templates.length === 0 && <p className="muted">No templates match that search.</p>}
    </div>
  )
}

function TemplateTile({ template, portrait, onPick }: { template: TemplateDef; portrait?: boolean; onPick: () => void }) {
  return (
    <button className={`tile${portrait ? ' portrait' : ''}`} onClick={onPick} title={`${template.name} · ${template.category}`}>
      <TemplatePreview template={template} width={260} />
      <span className="tile-label">{template.name}</span>
    </button>
  )
}
