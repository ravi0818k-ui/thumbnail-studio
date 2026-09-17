import { useState } from 'react'
import { useEditor } from '../../store/editorStore'
import type { SceneObject } from '../../types'
import { IconCopy, IconEye, IconEyeOff, IconLock, IconTrash, IconUnlock } from '../icons'

export default function LayersPanel() {
  const objects = useEditor((s) => s.project.objects)
  const selection = useEditor((s) => s.selection)
  const select = useEditor((s) => s.select)
  const updateObject = useEditor((s) => s.updateObject)
  const reorderObject = useEditor((s) => s.reorderObject)
  const duplicateSelected = useEditor((s) => s.duplicateSelected)
  const removeSelected = useEditor((s) => s.removeSelected)
  const groupSelected = useEditor((s) => s.groupSelected)
  const ungroupSelected = useEditor((s) => s.ungroupSelected)
  const moveLayer = useEditor((s) => s.moveLayer)
  const setAsBackground = useEditor((s) => s.setAsBackground)
  const backgroundToLayer = useEditor((s) => s.backgroundToLayer)
  const background = useEditor((s) => s.project.background)
  const pushHistory = useEditor((s) => s.pushHistory)
  const [dragId, setDragId] = useState<string | null>(null)
  const [overId, setOverId] = useState<string | null>(null)

  // The panel lists top-most layers first; the model stores bottom-up.
  const ordered = [...objects].reverse()
  const single = selection.length === 1 ? (objects.find((o) => o.id === selection[0]) ?? null) : null
  const backgroundIsImage = background.kind === 'image' && !!background.assetId

  return (
    <div>
      <h2 className="panel-title">Layers</h2>
      <div className="grid-4" style={{ marginBottom: 8 }}>
        <button className="btn small" disabled={!single} onClick={() => single && moveLayer(single.id, 'front')} title="Bring to front (])">
          ⤒
        </button>
        <button className="btn small" disabled={!single} onClick={() => single && moveLayer(single.id, 'forward')} title="Bring forward">
          ↑
        </button>
        <button className="btn small" disabled={!single} onClick={() => single && moveLayer(single.id, 'backward')} title="Send backward">
          ↓
        </button>
        <button className="btn small" disabled={!single} onClick={() => single && moveLayer(single.id, 'back')} title="Send to back ([)">
          ⤓
        </button>
      </div>
      {single?.type === 'image' && single.assetId && (
        <button className="btn small block" style={{ marginBottom: 8 }} onClick={() => setAsBackground(single.id)}>
          Set as canvas background
        </button>
      )}
      {backgroundIsImage && (
        <button className="btn small block" style={{ marginBottom: 8 }} onClick={backgroundToLayer}>
          Move background to a layer
        </button>
      )}
      <div className="row" style={{ marginBottom: 10 }}>
        <button className="btn small" disabled={selection.length < 2} onClick={groupSelected}>
          Group
        </button>
        <button className="btn small" disabled={selection.length === 0} onClick={ungroupSelected}>
          Ungroup
        </button>
        <button className="btn small" disabled={selection.length === 0} onClick={duplicateSelected} title="Duplicate">
          <IconCopy />
        </button>
        <button className="btn small" disabled={selection.length === 0} onClick={removeSelected} title="Delete">
          <IconTrash />
        </button>
      </div>

      {ordered.length === 0 && <p className="muted">Nothing on the canvas yet. Add text, an image or an element.</p>}

      <div>
        {ordered.map((obj) => (
          <div
            key={obj.id}
            className={`layer${selection.includes(obj.id) ? ' selected' : ''}${overId === obj.id ? ' drag-over' : ''}`}
            draggable
            onDragStart={() => setDragId(obj.id)}
            onDragOver={(e) => {
              e.preventDefault()
              setOverId(obj.id)
            }}
            onDragLeave={() => setOverId((id) => (id === obj.id ? null : id))}
            onDrop={() => {
              if (dragId && dragId !== obj.id) {
                const targetIndex = objects.findIndex((o) => o.id === obj.id)
                reorderObject(dragId, targetIndex)
              }
              setDragId(null)
              setOverId(null)
            }}
            onDragEnd={() => {
              setDragId(null)
              setOverId(null)
            }}
            onClick={(e) => {
              if (e.shiftKey) useEditor.getState().toggleSelect(obj.id)
              else select([obj.id])
            }}
          >
            <span className="layer-thumb">{glyphFor(obj)}</span>
            <span className="layer-name" title={obj.name}>
              {obj.name}
              {obj.groupId && <span className="badge" style={{ marginLeft: 6 }}>grp</span>}
            </span>
            <button
              className="icon-btn"
              style={{ width: 24, height: 24 }}
              title={obj.hidden ? 'Show' : 'Hide'}
              onClick={(e) => {
                e.stopPropagation()
                pushHistory()
                updateObject(obj.id, { hidden: !obj.hidden })
              }}
            >
              {obj.hidden ? <IconEyeOff /> : <IconEye />}
            </button>
            <button
              className="icon-btn"
              style={{ width: 24, height: 24 }}
              title={obj.locked ? 'Unlock' : 'Lock'}
              onClick={(e) => {
                e.stopPropagation()
                pushHistory()
                updateObject(obj.id, { locked: !obj.locked })
              }}
            >
              {obj.locked ? <IconLock /> : <IconUnlock />}
            </button>
          </div>
        ))}
      </div>
    </div>
  )
}

function glyphFor(obj: SceneObject): string {
  if (obj.type === 'text') return 'T'
  if (obj.type === 'image') return '🖼'
  return '◆'
}
