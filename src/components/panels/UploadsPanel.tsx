import { useEffect, useRef, useState } from 'react'
import { useEditor } from '../../store/editorStore'
import { registerBlob, type LoadedAsset } from '../../engine/assets'
import { createImage } from '../../engine/factory'
import type { ImageObject } from '../../types'
import { coverCrop } from '../../engine/crop'

const ACCEPT = 'image/png,image/jpeg,image/jpg,image/webp,image/svg+xml,image/gif'

export default function UploadsPanel() {
  const project = useEditor((s) => s.project)
  const addObject = useEditor((s) => s.addObject)
  const selection = useEditor((s) => s.selection)
  const updateObject = useEditor((s) => s.updateObject)
  const setBackground = useEditor((s) => s.setBackground)
  const [uploads, setUploads] = useState<LoadedAsset[]>([])
  const [over, setOver] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  const handleFiles = async (files: FileList | File[]) => {
    setError(null)
    const list = Array.from(files).filter((f) => f.type.startsWith('image/'))
    if (list.length === 0) {
      setError('Only image files (PNG, JPG, WEBP, SVG) can be uploaded.')
      return
    }
    for (const file of list) {
      try {
        const asset = await registerBlob(file, file.name)
        setUploads((u) => [asset, ...u])
        place(asset)
      } catch {
        setError(`Could not read ${file.name}.`)
      }
    }
  }

  /** A selected empty photo slot is filled; otherwise a new image is added. */
  const place = (asset: LoadedAsset) => {
    const selected = project.objects.find((o) => o.id === selection[0])
    if (selected && selected.type === 'image' && !selected.assetId) {
      updateObject<ImageObject>(selected.id, {
        assetId: asset.id,
        name: asset.name,
        crop: coverCrop(asset.width / asset.height, selected.width / selected.height),
      })
      return
    }
    addObject(createImage(asset.id, asset.width, asset.height, project.width, project.height, { name: asset.name }))
  }

  // Paste an image straight from the clipboard.
  useEffect(() => {
    const onPaste = (e: ClipboardEvent) => {
      const files = Array.from(e.clipboardData?.files ?? [])
      if (files.length > 0) void handleFiles(files)
    }
    window.addEventListener('paste', onPaste)
    return () => window.removeEventListener('paste', onPaste)
  })

  return (
    <div>
      <h2 className="panel-title">Uploads</h2>
      <div
        className={`dropzone${over ? ' over' : ''}`}
        onDragOver={(e) => {
          e.preventDefault()
          setOver(true)
        }}
        onDragLeave={() => setOver(false)}
        onDrop={(e) => {
          e.preventDefault()
          setOver(false)
          void handleFiles(e.dataTransfer.files)
        }}
        onClick={() => inputRef.current?.click()}
        role="button"
      >
        <div style={{ fontSize: 22, marginBottom: 6 }}>↑</div>
        <b>Drag images here</b>
        <div className="muted" style={{ marginTop: 4 }}>
          or click to upload · PNG, JPG, WEBP, SVG
        </div>
      </div>
      <input
        ref={inputRef}
        type="file"
        accept={ACCEPT}
        multiple
        hidden
        onChange={(e) => e.target.files && handleFiles(e.target.files)}
      />
      <p className="muted" style={{ marginTop: 10 }}>
        Images never leave your browser — editing and background removal run locally.
      </p>
      {error && (
        <p className="muted" style={{ color: 'var(--accent)' }}>
          {error}
        </p>
      )}

      {uploads.length > 0 && (
        <>
          <div className="section-head" style={{ marginTop: 18 }}>
            This session
          </div>
          <div className="tiles">
            {uploads.map((asset) => (
              <button key={asset.id} className="tile" onClick={() => place(asset)} title={asset.name}>
                <AssetThumb asset={asset} />
              </button>
            ))}
          </div>
          <button
            className="btn block small"
            style={{ marginTop: 10 }}
            disabled={uploads.length === 0}
            onClick={() => setBackground({ kind: 'image', assetId: uploads[0].id })}
          >
            Use latest as background
          </button>
        </>
      )}
    </div>
  )
}

function AssetThumb({ asset }: { asset: LoadedAsset }) {
  const [url, setUrl] = useState('')
  useEffect(() => {
    const objectUrl = URL.createObjectURL(asset.blob)
    setUrl(objectUrl)
    return () => URL.revokeObjectURL(objectUrl)
  }, [asset])
  return <img src={url} alt={asset.name} />
}
