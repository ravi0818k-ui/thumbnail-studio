import { useState } from 'react'
import { useEditor } from '../../store/editorStore'
import { ELEMENTS, ELEMENT_CATEGORIES, EMOJI, type ElementDef } from '../../data/elements'
import { createElement, createText } from '../../engine/factory'

export default function ElementsPanel() {
  const project = useEditor((s) => s.project)
  const addObject = useEditor((s) => s.addObject)
  const [category, setCategory] = useState<(typeof ELEMENT_CATEGORIES)[number] | 'All'>('All')

  const items = ELEMENTS.filter((e) => category === 'All' || e.category === category)

  return (
    <div>
      <h2 className="panel-title">Elements</h2>
      <div className="chips">
        {(['All', ...ELEMENT_CATEGORIES] as const).map((c) => (
          <button key={c} className={`chip${c === category ? ' active' : ''}`} onClick={() => setCategory(c)}>
            {c}
          </button>
        ))}
      </div>
      <div className="grid-4">
        {items.map((def) => (
          <button
            key={def.id}
            className="element-btn"
            title={def.label}
            onClick={() => addObject(createElement(def, project.width, project.height))}
          >
            <ElementPreview def={def} />
          </button>
        ))}
      </div>

      <div className="section-head" style={{ marginTop: 20 }}>
        Emoji
      </div>
      <div className="grid-4">
        {EMOJI.map((glyph) => (
          <button
            key={glyph}
            className="element-btn"
            style={{ fontSize: 24 }}
            onClick={() =>
              addObject(
                createText({
                  name: glyph,
                  text: glyph,
                  fontFamily: 'Inter',
                  fontSize: Math.round(project.height * 0.3),
                  uppercase: false,
                  strokeWidth: 0,
                  align: 'center',
                  width: Math.round(project.height * 0.34),
                  height: Math.round(project.height * 0.34),
                  x: Math.round(project.width / 2 - project.height * 0.17),
                  y: Math.round(project.height / 2 - project.height * 0.17),
                  autoHeight: false,
                }),
              )
            }
          >
            {glyph}
          </button>
        ))}
      </div>
    </div>
  )
}

function ElementPreview({ def }: { def: ElementDef }) {
  const fill = def.strokeOnly ? 'none' : (def.defaultFill ?? '#fff')
  const stroke = def.strokeOnly ? (def.defaultFill ?? '#fff') : 'none'
  if (def.shape === 'path' && def.path) {
    return (
      <svg viewBox="0 0 100 100">
        <path d={def.path} fill={fill} />
      </svg>
    )
  }
  return (
    <svg viewBox="0 0 100 100">
      {def.shape === 'ellipse' && <circle cx="50" cy="50" r="42" fill={fill} stroke={stroke} strokeWidth="10" />}
      {def.shape === 'rect' && <rect x="10" y="18" width="80" height="64" fill={fill} />}
      {def.shape === 'roundRect' && <rect x="8" y="22" width="84" height="56" rx="14" fill={fill} />}
      {def.shape === 'triangle' && <polygon points="50,12 92,88 8,88" fill={fill} />}
      {def.shape === 'line' && <rect x="6" y="46" width="88" height="8" rx="4" fill={fill} />}
      {(def.shape === 'polygon' || def.shape === 'star') && (
        <polygon points={polygonPoints(def.points ?? 5, def.shape === 'star' ? (def.innerRatio ?? 0.45) : 1)} fill={fill} />
      )}
    </svg>
  )
}

function polygonPoints(points: number, innerRatio: number): string {
  const steps = innerRatio < 1 ? points * 2 : points
  const out: string[] = []
  for (let i = 0; i < steps; i++) {
    const a = (i / steps) * Math.PI * 2 - Math.PI / 2
    const r = innerRatio < 1 && i % 2 === 1 ? 44 * innerRatio : 44
    out.push(`${50 + Math.cos(a) * r},${50 + Math.sin(a) * r}`)
  }
  return out.join(' ')
}
