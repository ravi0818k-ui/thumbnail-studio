import { useEffect, useRef } from 'react'
import { useEditor } from '../store/editorStore'
import TopBar from './TopBar'
import LeftToolbar from './LeftToolbar'
import CanvasStage from './CanvasStage'
import CropBar from './CropBar'
import BrushBar from './BrushBar'
import PropertiesPanel from './PropertiesPanel'
import ZoomBar from './ZoomBar'
import BrandPanel from './panels/BrandPanel'
import TemplatesPanel from './panels/TemplatesPanel'
import UploadsPanel from './panels/UploadsPanel'
import TextPanel from './panels/TextPanel'
import ElementsPanel from './panels/ElementsPanel'
import IconsPanel from './panels/IconsPanel'
import BackgroundPanel from './panels/BackgroundPanel'
import LayersPanel from './panels/LayersPanel'
import ExportDialog from './ExportDialog'
import PreviewDialog from './PreviewDialog'
import TestDialog from './TestDialog'
import { useAutosave, useKeyboardShortcuts } from '../hooks'
import { saveProject } from '../storage/projects'

export default function Editor() {
  const panel = useEditor((s) => s.panel)
  const exportOpen = useEditor((s) => s.exportOpen)
  const previewOpen = useEditor((s) => s.previewOpen)
  const testOpen = useEditor((s) => s.testOpen)
  const projectWidth = useEditor((s) => s.project.width)
  const projectHeight = useEditor((s) => s.project.height)
  const setZoom = useEditor((s) => s.setZoom)
  const setFitZoom = useEditor((s) => s.setFitZoom)
  const stageRef = useRef<HTMLDivElement>(null)
  const lastSize = useRef('')

  useAutosave(true)
  useKeyboardShortcuts(
    () => useEditor.getState().setExportOpen(true),
    async () => {
      await saveProject(useEditor.getState().project)
      useEditor.getState().markSaved()
    },
  )

  // Keep a "fit" zoom in sync with the available space.
  useEffect(() => {
    const host = stageRef.current
    if (!host) return
    const update = () => {
      const { width, height } = host.getBoundingClientRect()
      const fit = Math.min((width - 90) / projectWidth, (height - 90) / projectHeight)
      const clamped = Math.max(0.05, Math.min(2, fit))
      setFitZoom(clamped)
      // Re-fit whenever the canvas itself changes — switching to a 9:16 Shorts
      // canvas at the old zoom would drop the user into a corner of it.
      const size = `${projectWidth}x${projectHeight}`
      if (lastSize.current !== size) {
        lastSize.current = size
        setZoom(clamped)
      }
    }
    update()
    const observer = new ResizeObserver(update)
    observer.observe(host)
    return () => observer.disconnect()
  }, [projectWidth, projectHeight, setFitZoom, setZoom])

  return (
    <div className="app">
      <TopBar
        onSave={async () => {
          await saveProject(useEditor.getState().project)
          useEditor.getState().markSaved()
        }}
        onExport={() => useEditor.getState().setExportOpen(true)}
      />
      <div className={`editor${panel ? ' with-panel' : ''}`}>
        <LeftToolbar />
        {panel && (
          <div className="side-panel">
            {panel === 'brand' && <BrandPanel />}
            {panel === 'templates' && <TemplatesPanel />}
            {panel === 'uploads' && <UploadsPanel />}
            {panel === 'text' && <TextPanel />}
            {panel === 'elements' && <ElementsPanel />}
            {panel === 'icons' && <IconsPanel />}
            {panel === 'background' && <BackgroundPanel />}
            {panel === 'layers' && <LayersPanel />}
          </div>
        )}
        <div className="stage-wrap" ref={stageRef}>
          <CanvasStage />
          <CropBar />
          <BrushBar />
          <ZoomBar />
        </div>
        <PropertiesPanel />
      </div>
      {exportOpen && <ExportDialog />}
      {previewOpen && <PreviewDialog />}
      {testOpen && <TestDialog />}
    </div>
  )
}
