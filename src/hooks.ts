import { useEffect, useRef } from 'react'
import { useEditor } from './store/editorStore'
import { saveProject } from './storage/projects'

/** Debounced autosave into IndexedDB — projects survive a refresh. */
export function useAutosave(enabled: boolean) {
  const project = useEditor((s) => s.project)
  const dirty = useEditor((s) => s.dirty)
  const timer = useRef<number | null>(null)

  useEffect(() => {
    if (!enabled || !dirty) return
    if (timer.current) window.clearTimeout(timer.current)
    timer.current = window.setTimeout(async () => {
      await saveProject(useEditor.getState().project)
      useEditor.getState().markSaved()
    }, 1500)
    return () => {
      if (timer.current) window.clearTimeout(timer.current)
    }
  }, [enabled, dirty, project])
}

function isTypingTarget(target: EventTarget | null): boolean {
  const el = target as HTMLElement | null
  if (!el) return false
  return el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.isContentEditable
}

export function useKeyboardShortcuts(onExport: () => void, onSave: () => void) {
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      const state = useEditor.getState()
      if (state.screen !== 'editor') return
      const mod = e.ctrlKey || e.metaKey
      if (isTypingTarget(e.target)) return

      // Crop mode owns Enter and Escape while it is open.
      if (state.croppingId) {
        if (e.key === 'Enter') {
          e.preventDefault()
          state.endCrop(true)
          return
        }
        if (e.key === 'Escape') {
          e.preventDefault()
          state.endCrop(false)
          return
        }
      }
      if (e.key.toLowerCase() === 'c' && !mod && state.selection.length === 1) {
        const selected = state.project.objects.find((o) => o.id === state.selection[0])
        if (selected?.type === 'image' && selected.assetId) {
          e.preventDefault()
          state.startCrop(selected.id)
          return
        }
      }

      if (mod && e.key.toLowerCase() === 'z') {
        e.preventDefault()
        if (e.shiftKey) state.redo()
        else state.undo()
        return
      }
      if (mod && e.key.toLowerCase() === 'y') {
        e.preventDefault()
        state.redo()
        return
      }
      if (mod && e.key.toLowerCase() === 'c') {
        state.copySelected()
        return
      }
      if (mod && e.key.toLowerCase() === 'v') {
        state.paste()
        return
      }
      if (mod && e.key.toLowerCase() === 'd') {
        e.preventDefault()
        state.duplicateSelected()
        return
      }
      if (mod && e.key.toLowerCase() === 'a') {
        e.preventDefault()
        state.selectAll()
        return
      }
      if (mod && e.key.toLowerCase() === 'g') {
        e.preventDefault()
        if (e.shiftKey) state.ungroupSelected()
        else state.groupSelected()
        return
      }
      if (mod && e.key.toLowerCase() === 's') {
        e.preventDefault()
        onSave()
        return
      }
      if (mod && e.key.toLowerCase() === 'e') {
        e.preventDefault()
        onExport()
        return
      }
      if (mod && (e.key === '+' || e.key === '=')) {
        e.preventDefault()
        state.setZoom(state.zoom * 1.1)
        return
      }
      if (mod && e.key === '-') {
        e.preventDefault()
        state.setZoom(state.zoom / 1.1)
        return
      }
      if (mod && e.key === '0') {
        e.preventDefault()
        state.setZoom(state.fitZoom)
        return
      }
      if (e.key === 'Delete' || e.key === 'Backspace') {
        if (state.selection.length > 0) {
          e.preventDefault()
          state.removeSelected()
        }
        return
      }
      if ((e.key === '[' || e.key === ']') && state.selection.length === 1) {
        e.preventDefault()
        // Shift jumps all the way; plain moves one step.
        state.moveLayer(state.selection[0], e.key === ']' ? (e.shiftKey ? 'forward' : 'front') : e.shiftKey ? 'backward' : 'back')
        return
      }
      if (e.key === 'Escape') {
        state.setEditingText(null)
        state.select([])
        return
      }
      if (e.key.startsWith('Arrow')) {
        if (state.selection.length === 0) return
        e.preventDefault()
        const step = e.shiftKey ? 10 : 1
        const dx = e.key === 'ArrowRight' ? step : e.key === 'ArrowLeft' ? -step : 0
        const dy = e.key === 'ArrowDown' ? step : e.key === 'ArrowUp' ? -step : 0
        state.nudgeSelected(dx, dy)
      }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [onExport, onSave])
}
