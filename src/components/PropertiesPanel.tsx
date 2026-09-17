import { useEditor } from '../store/editorStore'
import CanvasProperties from './properties/CanvasProperties'
import ImageProperties from './properties/ImageProperties'
import ShapeProperties from './properties/ShapeProperties'
import TextProperties from './properties/TextProperties'
import { Section } from './ui'

export default function PropertiesPanel() {
  const objects = useEditor((s) => s.project.objects)
  const selection = useEditor((s) => s.selection)
  const alignSelected = useEditor((s) => s.alignSelected)
  const groupSelected = useEditor((s) => s.groupSelected)
  const ungroupSelected = useEditor((s) => s.ungroupSelected)
  const duplicateSelected = useEditor((s) => s.duplicateSelected)
  const removeSelected = useEditor((s) => s.removeSelected)

  const selected = objects.filter((o) => selection.includes(o.id))

  if (selected.length === 0) {
    return (
      <aside className="properties">
        <CanvasProperties />
      </aside>
    )
  }

  if (selected.length > 1) {
    return (
      <aside className="properties">
        <Section title={`${selected.length} layers selected`}>
          <div className="grid-3" style={{ marginBottom: 10 }}>
            <button className="btn small" onClick={() => alignSelected('left')}>
              ⇤
            </button>
            <button className="btn small" onClick={() => alignSelected('center-h')}>
              ⇔
            </button>
            <button className="btn small" onClick={() => alignSelected('right')}>
              ⇥
            </button>
            <button className="btn small" onClick={() => alignSelected('top')}>
              ⇡
            </button>
            <button className="btn small" onClick={() => alignSelected('center-v')}>
              ⇕
            </button>
            <button className="btn small" onClick={() => alignSelected('bottom')}>
              ⇣
            </button>
          </div>
          <div className="grid-2">
            <button className="btn small" onClick={groupSelected}>
              Group
            </button>
            <button className="btn small" onClick={ungroupSelected}>
              Ungroup
            </button>
            <button className="btn small" onClick={duplicateSelected}>
              Duplicate
            </button>
            <button className="btn small" onClick={removeSelected}>
              Delete
            </button>
          </div>
        </Section>
      </aside>
    )
  }

  const object = selected[0]
  return (
    <aside className="properties">
      {object.type === 'text' && <TextProperties object={object} />}
      {object.type === 'image' && <ImageProperties object={object} />}
      {object.type === 'shape' && <ShapeProperties object={object} />}
    </aside>
  )
}
