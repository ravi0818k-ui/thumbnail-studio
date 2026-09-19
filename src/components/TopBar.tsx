import { useEffect, useRef, useState, type ReactNode } from 'react'
import { useEditor } from '../store/editorStore'
import { IconDownload, IconEye, IconRedo, IconUndo } from './icons'
import { formatConfig } from '../data/formats'

export default function TopBar({ onSave, onExport }: { onSave: () => void; onExport: () => void }) {
  const project = useEditor((s) => s.project)
  const renameProject = useEditor((s) => s.renameProject)
  const undo = useEditor((s) => s.undo)
  const redo = useEditor((s) => s.redo)
  const canUndo = useEditor((s) => s.past.length > 0)
  const canRedo = useEditor((s) => s.future.length > 0)
  const dirty = useEditor((s) => s.dirty)
  const lastSavedAt = useEditor((s) => s.lastSavedAt)
  const setScreen = useEditor((s) => s.setScreen)
  const setPreviewOpen = useEditor((s) => s.setPreviewOpen)
  const setTestOpen = useEditor((s) => s.setTestOpen)
  const newProject = useEditor((s) => s.newProject)
  const selection = useEditor((s) => s.selection)

  return (
    <header className="topbar">
      <div className="brand">
        <img className="brand-mark" src="/logo.png" alt="" width={26} height={26} />
        <span>Thumbnail Studio</span>
      </div>

      <Menu label="File">
        {(close) => (
          <>
            <MenuItem
              onClick={() => {
                close()
                newProject()
              }}
            >
              New thumbnail
            </MenuItem>
            <MenuItem
              onClick={() => {
                close()
                setScreen('home')
              }}
            >
              My projects
            </MenuItem>
            <MenuItem
              shortcut="Ctrl S"
              onClick={() => {
                close()
                onSave()
              }}
            >
              Save
            </MenuItem>
            <MenuItem
              shortcut="Ctrl E"
              onClick={() => {
                close()
                onExport()
              }}
            >
              Export…
            </MenuItem>
          </>
        )}
      </Menu>

      <Menu label="Edit">
        {(close) => {
          const state = useEditor.getState()
          return (
            <>
              <MenuItem
                shortcut="Ctrl Z"
                disabled={!canUndo}
                onClick={() => {
                  close()
                  undo()
                }}
              >
                Undo
              </MenuItem>
              <MenuItem
                shortcut="Ctrl ⇧ Z"
                disabled={!canRedo}
                onClick={() => {
                  close()
                  redo()
                }}
              >
                Redo
              </MenuItem>
              <MenuItem
                shortcut="Ctrl D"
                disabled={selection.length === 0}
                onClick={() => {
                  close()
                  state.duplicateSelected()
                }}
              >
                Duplicate
              </MenuItem>
              <MenuItem
                shortcut="Del"
                disabled={selection.length === 0}
                onClick={() => {
                  close()
                  state.removeSelected()
                }}
              >
                Delete
              </MenuItem>
              <MenuItem
                shortcut="Ctrl A"
                onClick={() => {
                  close()
                  state.selectAll()
                }}
              >
                Select all
              </MenuItem>
              <MenuItem
                shortcut="Ctrl G"
                disabled={selection.length < 2}
                onClick={() => {
                  close()
                  state.groupSelected()
                }}
              >
                Group
              </MenuItem>
              <MenuItem
                shortcut="Ctrl ⇧ G"
                disabled={selection.length === 0}
                onClick={() => {
                  close()
                  state.ungroupSelected()
                }}
              >
                Ungroup
              </MenuItem>
            </>
          )
        }}
      </Menu>

      <Menu label="View">
        {(close) => {
          const state = useEditor.getState()
          return (
            <>
              <MenuItem
                shortcut="Ctrl 0"
                onClick={() => {
                  close()
                  state.setZoom(state.fitZoom)
                }}
              >
                Fit to screen
              </MenuItem>
              <MenuItem
                onClick={() => {
                  close()
                  state.setZoom(1)
                }}
              >
                Zoom to 100%
              </MenuItem>
              <MenuItem
                onClick={() => {
                  close()
                  state.toggleSafeZone()
                }}
              >
                {state.showSafeZone ? 'Hide' : 'Show'} safe zone
              </MenuItem>
              <MenuItem
                onClick={() => {
                  close()
                  state.setGridMode(state.gridMode === 'none' ? 'thirds' : state.gridMode === 'thirds' ? 'grid' : 'none')
                }}
              >
                Grid: {state.gridMode === 'none' ? 'off' : state.gridMode}
              </MenuItem>
              <MenuItem
                onClick={() => {
                  close()
                  state.toggleGuides()
                }}
              >
                {state.showGuides ? 'Hide' : 'Show'} smart guides
              </MenuItem>
              <MenuItem
                onClick={() => {
                  close()
                  state.toggleSnapping()
                }}
              >
                {state.snapping ? 'Disable' : 'Enable'} snapping
              </MenuItem>
              <MenuItem
                onClick={() => {
                  close()
                  state.openFundamentals()
                }}
              >
                Design fundamentals…
              </MenuItem>
              <MenuItem
                onClick={() => {
                  close()
                  state.openColorGuide()
                }}
              >
                Colour psychology…
              </MenuItem>
              <MenuItem
                onClick={() => {
                  close()
                  state.openFontGuide()
                }}
              >
                Choosing a font…
              </MenuItem>
            </>
          )
        }}
      </Menu>

      <input
        className="project-name"
        value={project.name}
        onChange={(e) => renameProject(e.target.value)}
        aria-label="Project name"
      />

      <button className="icon-btn" title="Undo (Ctrl+Z)" disabled={!canUndo} onClick={undo}>
        <IconUndo />
      </button>
      <button className="icon-btn" title="Redo (Ctrl+Shift+Z)" disabled={!canRedo} onClick={redo}>
        <IconRedo />
      </button>

      <div className="spacer" />

      <span className="save-state">
        {dirty ? 'Saving…' : lastSavedAt ? `Saved ${timeAgo(lastSavedAt)}` : 'Not saved yet'}
      </span>
      <button
        className="btn ghost"
        onClick={() => setTestOpen(true)}
        title="Score this design: faces, contrast, background, colour and text"
      >
        Run a test
      </button>
      <button className="btn ghost" onClick={() => setPreviewOpen(true)} title="Preview as a YouTube card">
        <IconEye /> Preview
      </button>
      <button className="btn primary" onClick={onExport} title={formatConfig(project.format).exportLabel}>
        <IconDownload /> Download
      </button>
    </header>
  )
}

function Menu({ label, children }: { label: string; children: (close: () => void) => ReactNode }) {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (!open) return
    const onDown = (e: MouseEvent) => {
      if (!ref.current?.contains(e.target as Node)) setOpen(false)
    }
    window.addEventListener('mousedown', onDown)
    return () => window.removeEventListener('mousedown', onDown)
  }, [open])
  return (
    <div className="menu" ref={ref}>
      <button className="btn ghost" onClick={() => setOpen((o) => !o)}>
        {label}
      </button>
      {open && <div className="menu-items">{children(() => setOpen(false))}</div>}
    </div>
  )
}

function MenuItem({
  children,
  shortcut,
  disabled,
  onClick,
}: {
  children: ReactNode
  shortcut?: string
  disabled?: boolean
  onClick: () => void
}) {
  return (
    <button className="menu-item" disabled={disabled} onClick={onClick}>
      <span>{children}</span>
      {shortcut && <span className="kbd">{shortcut}</span>}
    </button>
  )
}

function timeAgo(timestamp: number): string {
  const seconds = Math.round((Date.now() - timestamp) / 1000)
  if (seconds < 60) return 'just now'
  const minutes = Math.round(seconds / 60)
  if (minutes < 60) return `${minutes}m ago`
  return `${Math.round(minutes / 60)}h ago`
}
