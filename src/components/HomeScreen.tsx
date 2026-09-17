import { useCallback, useEffect, useState } from 'react'
import { useEditor } from '../store/editorStore'
import type { ProjectRecord } from '../types'
import { deleteProject, listProjects } from '../storage/db'
import { ensureAssets } from '../engine/assets'
import { assetIdsOf } from '../storage/projects'
import { FORMAT_LIST, formatConfig } from '../data/formats'

export default function HomeScreen() {
  const newProject = useEditor((s) => s.newProject)
  const loadProject = useEditor((s) => s.loadProject)
  const setScreen = useEditor((s) => s.setScreen)
  const openColorGuide = useEditor((s) => s.openColorGuide)
  const [projects, setProjects] = useState<ProjectRecord[]>([])
  const [loading, setLoading] = useState(true)

  const refresh = useCallback(() => {
    listProjects()
      .then(setProjects)
      .catch(() => setProjects([]))
      .finally(() => setLoading(false))
  }, [])

  useEffect(refresh, [refresh])

  const open = async (record: ProjectRecord) => {
    // Bitmaps must be decoded before the first frame, or the canvas is empty.
    await ensureAssets(assetIdsOf(record))
    loadProject(record)
  }

  return (
    <div className="app">
      <header className="topbar">
        <div className="brand">
          <span className="brand-mark">▶</span>
          <span>Thumbnail Studio</span>
        </div>
        <div className="spacer" />
        <span className="muted">Local-first · nothing is uploaded</span>
      </header>
      <div className="home">
        <div className="home-inner">
          <h1 className="hero-title">Create YouTube thumbnails faster.</h1>
          <p className="hero-sub">
            Upload, cut out the background, add big readable text and download — horizontal thumbnails and vertical
            Shorts covers, all in your browser.
          </p>
          <h2 className="h2" style={{ marginTop: 26 }}>
            Create new design
          </h2>
          <div className="format-cards">
            {FORMAT_LIST.map((format) => (
              <button key={format.id} className="format-card" onClick={() => newProject({ format: format.id })}>
                <span className="format-frame" data-format={format.id}>
                  <span />
                </span>
                <span>
                  <b>{format.label}</b>
                  <em>
                    {format.width} × {format.height}
                  </em>
                  <span className="muted">{format.description}</span>
                </span>
              </button>
            ))}
          </div>
          <div className="row" style={{ marginTop: 12, gap: 8 }}>
            <button className="btn" onClick={() => setScreen('templates')}>
              Start from a template
            </button>
            <button className="btn ghost" onClick={openColorGuide}>
              Colour psychology
            </button>
          </div>

          <h2 className="h2">Recent projects</h2>
          {loading && <p className="muted">Loading…</p>}
          {!loading && projects.length === 0 && (
            <p className="muted">No projects yet. Everything you make is saved on this device.</p>
          )}
          <div className="card-grid">
            {projects.map((p) => (
              <div key={p.id} className="project-card">
                <button style={{ display: 'block', width: '100%', padding: 0 }} onClick={() => open(p)}>
                  <img src={p.thumbnail} alt="" style={{ objectFit: p.height > p.width ? 'contain' : 'cover' }} />
                </button>
                <div className="meta">
                  <b title={p.name}>{p.name}</b>
                  <div className="row" style={{ justifyContent: 'space-between' }}>
                    <span className="muted">
                      {formatConfig(p.format ?? (p.height > p.width ? 'shorts' : 'thumbnail')).shortLabel} · {p.width} ×{' '}
                      {p.height}
                    </span>
                    <button
                      className="btn ghost small"
                      onClick={async () => {
                        await deleteProject(p.id)
                        refresh()
                      }}
                    >
                      Delete
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}
