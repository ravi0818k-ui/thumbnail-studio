import { useCallback, useEffect, useState } from 'react'
import { useEditor } from '../store/editorStore'
import type { ProjectRecord } from '../types'
import { deleteProject, listProjects } from '../storage/db'
import { ensureAssets } from '../engine/assets'
import { assetIdsOf } from '../storage/projects'
import { FORMAT_LIST, formatConfig } from '../data/formats'
import { AUTHOR_LINKEDIN_URL, AUTHOR_NAME, FEEDBACK_FORM_URL } from '../data/links'

export default function HomeScreen() {
  const newProject = useEditor((s) => s.newProject)
  const loadProject = useEditor((s) => s.loadProject)
  const setScreen = useEditor((s) => s.setScreen)
  const openColorGuide = useEditor((s) => s.openColorGuide)
  const openFontGuide = useEditor((s) => s.openFontGuide)
  const openFundamentals = useEditor((s) => s.openFundamentals)
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
          <img className="brand-mark" src="/logo.png" alt="" width={26} height={26} />
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
            <button className="btn ghost" onClick={openFundamentals}>
              Fundamentals
            </button>
            <button className="btn ghost" onClick={openColorGuide}>
              Colour psychology
            </button>
            <button className="btn ghost" onClick={openFontGuide}>
              Choosing a font
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

          <h2 className="h2">About us</h2>
          <div className="about">
            <h3 style={{ marginTop: 0 }}>Who made this</h3>
            <p>
              YouTubeThumbnail.org is a free and open-source project created by {AUTHOR_NAME}, a YouTuber and software
              engineer (India).
            </p>
            <p>
              From the start of his journey, Abhishek wanted a free tool that could do exactly what paid software does.
              So he built YouTubeThumbnail.org, bringing together everything he learned from WebVeda and the Ankur team
              into one tool.
            </p>
            <p>
              Learn more about Abhishek on his{' '}
              <a href={AUTHOR_LINKEDIN_URL} target="_blank" rel="noopener noreferrer">
                LinkedIn profile
              </a>
              .
            </p>

            <h3>What it does</h3>
            <p>
              Thumbnail Studio is a free thumbnail designer for YouTube — horizontal thumbnails at 1280 × 720 and
              vertical Shorts covers at 1080 × 1920. Cutting out a background, enhancing a photo, checking a design
              against a brand's rules and exporting the finished file all run as code inside this page. There is no
              server doing the work, and no account to create.
            </p>

            <h3>Your designs stay on your device</h3>
            <ul>
              <li>
                <b>Nothing is uploaded.</b> A photo you add is decoded in the browser and used from memory. It is never
                sent anywhere.
              </li>
              <li>
                <b>Projects are saved locally</b> in this browser's own storage, on this device only. Nobody else can
                read them, and clearing your site data deletes them for good — so keep exports of work you want to
                keep.
              </li>
              <li>
                <b>Exports are made here too.</b> The PNG or JPEG is drawn in the page and handed straight to your
                downloads.
              </li>
            </ul>

            <h3>What is measured</h3>
            <p>
              Anonymous usage statistics, through Google Analytics: which pages get opened, roughly which country, what
              kind of device. That is the whole list. Your images, your text, your designs and your project names are
              never part of it, because they never leave the browser in the first place.
            </p>

            <h3>What gets downloaded</h3>
            <p>
              Fonts come from Google Fonts. Two optional features fetch what they need from a public CDN the first time
              you use them: the AI background-removal model, and the Python image engine behind the stronger enhance
              tools. Those are ordinary downloads <em>to</em> your browser — no part of your design is sent with the
              request. Once they are cached, the editor keeps working offline.
            </p>

            <h3>Questions, ideas and bugs</h3>
            <p>
              There is no support inbox behind this — it is one person's side project. Anything you want to report or
              ask for goes through the{' '}
              <a href={FEEDBACK_FORM_URL} target="_blank" rel="noopener noreferrer">
                feedback form
              </a>
              , which is also the <b>Help</b> button at the foot of the editor's left rail.
            </p>
          </div>
        </div>
      </div>
    </div>
  )
}
