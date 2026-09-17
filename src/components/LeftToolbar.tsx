import { useEditor, type PanelId } from '../store/editorStore'
import {
  IconBackground,
  IconBrand,
  IconElements,
  IconIcons,
  IconLayers,
  IconTemplates,
  IconText,
  IconUpload,
} from './icons'
import { formatConfig } from '../data/formats'

const TOOLS: Record<PanelId, { label: string; Icon: typeof IconTemplates }> = {
  brand: { label: 'Brand', Icon: IconBrand },
  templates: { label: 'Templates', Icon: IconTemplates },
  uploads: { label: 'Uploads', Icon: IconUpload },
  text: { label: 'Text', Icon: IconText },
  elements: { label: 'Elements', Icon: IconElements },
  icons: { label: 'Icons', Icon: IconIcons },
  background: { label: 'Background', Icon: IconBackground },
  layers: { label: 'Layers', Icon: IconLayers },
}

export default function LeftToolbar() {
  const panel = useEditor((s) => s.panel)
  const setPanel = useEditor((s) => s.setPanel)
  const format = useEditor((s) => s.project.format)
  // Shorts leads with the actions creators reach for first (spec §38).
  const order = formatConfig(format).toolbar

  return (
    <nav className="toolbar">
      {order.map((id) => {
        const { label, Icon } = TOOLS[id]
        return (
          <button
            key={id}
            className={`tool${panel === id ? ' active' : ''}`}
            onClick={() => setPanel(id)}
            title={label}
          >
            <Icon />
            <span>{label}</span>
          </button>
        )
      })}
    </nav>
  )
}
