import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { useEditor } from '../store/editorStore'
import { fitToCanvasPatch } from '../engine/quickActions'
import { getLoadedAsset } from '../engine/assets'
import type { ImageObject } from '../types'

export interface ContextMenuState {
  x: number
  y: number
  objectId: string | null
}

/** Right-click menu for the canvas: layer order plus the common layer actions. */
export default function ContextMenu({ state, onClose }: { state: ContextMenuState; onClose: () => void }) {
  const ref = useRef<HTMLDivElement>(null)
  const [position, setPosition] = useState({ x: state.x, y: state.y })
  const objects = useEditor((s) => s.project.objects)
  const selection = useEditor((s) => s.selection)
  const background = useEditor((s) => s.project.background)

  const object = objects.find((o) => o.id === state.objectId) ?? null
  const index = object ? objects.findIndex((o) => o.id === object.id) : -1
  const isImage = object?.type === 'image' && !!object.assetId

  // Keep the menu inside the window.
  useLayoutEffect(() => {
    const el = ref.current
    if (!el) return
    const rect = el.getBoundingClientRect()
    setPosition({
      x: Math.min(state.x, window.innerWidth - rect.width - 8),
      y: Math.min(state.y, window.innerHeight - rect.height - 8),
    })
  }, [state.x, state.y])

  useEffect(() => {
    const close = () => onClose()
    window.addEventListener('mousedown', close)
    window.addEventListener('blur', close)
    window.addEventListener('resize', close)
    return () => {
      window.removeEventListener('mousedown', close)
      window.removeEventListener('blur', close)
      window.removeEventListener('resize', close)
    }
  }, [onClose])

  const run = (fn: () => void) => () => {
    fn()
    onClose()
  }

  const store = useEditor.getState()

  /** Cover the frame with this layer, cropping rather than stretching. */
  const fitToCanvas = (id: string) => {
    const state = useEditor.getState()
    const target = state.project.objects.find((o) => o.id === id)
    if (!target) return
    const asset =
      target.type === 'image'
        ? getLoadedAsset(target.useCutout && target.cutoutAssetId ? target.cutoutAssetId : target.assetId)
        : null
    state.pushHistory()
    state.updateObject<ImageObject>(id, fitToCanvasPatch(target, state.project, asset ? asset.width / asset.height : undefined))
  }

  return (
    <div
      ref={ref}
      className="menu-items context-menu"
      style={{ position: 'fixed', left: position.x, top: position.y }}
      onMouseDown={(e) => e.stopPropagation()}
      onContextMenu={(e) => e.preventDefault()}
    >
      {object ? (
        <>
          <div className="context-title">{object.name}</div>
          <button
            className="menu-item"
            disabled={index === objects.length - 1}
            onClick={run(() => store.moveLayer(object.id, 'front'))}
          >
            <span>Bring to front</span>
            <span className="kbd">]</span>
          </button>
          <button
            className="menu-item"
            disabled={index === objects.length - 1}
            onClick={run(() => store.moveLayer(object.id, 'forward'))}
          >
            <span>Bring forward</span>
          </button>
          <button className="menu-item" disabled={index === 0} onClick={run(() => store.moveLayer(object.id, 'backward'))}>
            <span>Send backward</span>
          </button>
          <button className="menu-item" disabled={index === 0} onClick={run(() => store.moveLayer(object.id, 'back'))}>
            <span>Send to back</span>
            <span className="kbd">[</span>
          </button>
          <div className="context-sep" />
          <button className="menu-item" disabled={object.locked} onClick={run(() => fitToCanvas(object.id))}>
            <span>Fit to canvas</span>
          </button>
          <div className="context-sep" />
          {isImage && (
            <>
              <button className="menu-item" onClick={run(() => store.setAsBackground(object.id))}>
                <span>Set as canvas background</span>
              </button>
              <button className="menu-item" onClick={run(() => store.setAsBackground(object.id, { keepLayer: true }))}>
                <span>Set as background, keep layer</span>
              </button>
              <div className="context-sep" />
            </>
          )}
          <button className="menu-item" onClick={run(() => store.duplicateSelected())}>
            <span>Duplicate</span>
            <span className="kbd">Ctrl D</span>
          </button>
          <button
            className="menu-item"
            disabled={selection.length < 2}
            onClick={run(() => store.groupSelected())}
          >
            <span>Group</span>
            <span className="kbd">Ctrl G</span>
          </button>
          <button className="menu-item" onClick={run(() => store.updateObject(object.id, { locked: !object.locked }))}>
            <span>{object.locked ? 'Unlock' : 'Lock'}</span>
          </button>
          <button className="menu-item" onClick={run(() => store.updateObject(object.id, { hidden: !object.hidden }))}>
            <span>{object.hidden ? 'Show' : 'Hide'}</span>
          </button>
          <button className="menu-item" onClick={run(() => store.removeSelected())}>
            <span>Delete</span>
            <span className="kbd">Del</span>
          </button>
        </>
      ) : (
        <>
          <div className="context-title">Canvas</div>
          <button
            className="menu-item"
            disabled={background.kind !== 'image' || !background.assetId}
            onClick={run(() => store.backgroundToLayer())}
          >
            <span>Move background to a layer</span>
          </button>
          <button className="menu-item" onClick={run(() => store.setPanel('background'))}>
            <span>Edit background…</span>
          </button>
          <button className="menu-item" onClick={run(() => store.paste())}>
            <span>Paste</span>
            <span className="kbd">Ctrl V</span>
          </button>
          <button className="menu-item" onClick={run(() => store.selectAll())}>
            <span>Select all</span>
            <span className="kbd">Ctrl A</span>
          </button>
        </>
      )}
    </div>
  )
}
