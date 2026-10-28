import { useEditor } from '../store/editorStore'
import { FORMATS } from '../data/formats'
import { templatesForFormat } from '../data/templates'
import TemplatePreview from './TemplatePreview'

const KIT = [
  { title: 'Coloured words', text: 'Click any word in a sentence to turn it green, yellow or red — it stays coloured as the line wraps.' },
  { title: 'Text collection', text: 'Kicker, label plate, top banner, footer line, tweet card, quote and meme caption, one click each.' },
  { title: 'Shadows', text: 'Fade a photo to black under the headline, or lift the words with a soft or halo shadow.' },
  { title: 'Preview in the feed', text: 'See the post under your name and caption, on desktop and on a phone, in light and dark.' },
]

/**
 * The LinkedIn post maker's front door: pick a size or a layout, land in the
 * editor on the `linkedin` format. Everything after that is the same editor
 * the thumbnails use — this page only chooses where to start.
 */
export default function LinkedInScreen() {
  const close = useEditor((s) => s.closeLinkedIn)
  const newProject = useEditor((s) => s.newProject)
  const applyTemplate = useEditor((s) => s.applyTemplate)
  const config = FORMATS.linkedin
  const templates = templatesForFormat('linkedin')

  return (
    <div className="tg-screen">
      <header className="rm-top">
        <button className="btn ghost" onClick={close} title="Back to Thumbnail Studio">
          ← Back
        </button>
        <h1 className="rm-title">LinkedIn post maker</h1>
      </header>

      <div className="tg-body">
        <section className="tg-hero">
          <h2>Design a minimal LinkedIn post</h2>
          <p>
            News cards, quote cards and memes: a photo, a fade, one coloured phrase. Free, in your browser, nothing
            uploaded.
          </p>
        </section>

        <h3 className="li-h3">Start blank</h3>
        <div className="li-sizes">
          {config.presets.map((preset) => (
            <button
              key={preset.label}
              className="li-size"
              onClick={() => newProject({ format: 'linkedin', width: preset.width, height: preset.height })}
            >
              <span className="li-frame" aria-hidden>
                <span
                  style={{
                    width: `${Math.min(1, preset.width / preset.height) * 100}%`,
                    height: `${Math.min(1, preset.height / preset.width) * 100}%`,
                  }}
                />
              </span>
              <b className="li-size-name">{preset.label.split(' · ')[1] ?? preset.label}</b>
              <em>
                {preset.width} × {preset.height}
              </em>
              {preset.recommended && <span className="badge">best in the feed</span>}
            </button>
          ))}
        </div>

        <h3 className="li-h3">Or start from a layout</h3>
        <div className="li-templates">
          {templates.map((t) => (
            <button
              key={t.id}
              className="project-card"
              onClick={() => {
                newProject({ format: 'linkedin' })
                applyTemplate(t)
              }}
            >
              <TemplatePreview template={t} width={360} />
              <div className="meta">
                <b>{t.name}</b>
                <span className="muted">{t.category}</span>
              </div>
            </button>
          ))}
        </div>

        <h3 className="li-h3">What you get</h3>
        <ul className="tg-steps li-kit">
          {KIT.map((item) => (
            <li key={item.title}>
              <b>{item.title}</b>
              <em>{item.text}</em>
            </li>
          ))}
        </ul>
      </div>
    </div>
  )
}
