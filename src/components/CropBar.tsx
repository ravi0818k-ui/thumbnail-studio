import { useEditor } from '../store/editorStore'
import type { ImageObject } from '../types'
import { getLoadedAsset } from '../engine/assets'
import { applyCropRect, trimToSubjectPatch } from '../engine/crop'

/** Floating controls while cropping, so leaving crop mode is never ambiguous. */
export default function CropBar() {
  const croppingId = useEditor((s) => s.croppingId)
  const object = useEditor((s) => s.project.objects.find((o) => o.id === s.croppingId)) as ImageObject | undefined
  const endCrop = useEditor((s) => s.endCrop)
  const updateObject = useEditor((s) => s.updateObject)
  const pushHistory = useEditor((s) => s.pushHistory)

  if (!croppingId || !object) return null

  const asset = getLoadedAsset(object.useCutout && object.cutoutAssetId ? object.cutoutAssetId : object.assetId)
  const pixels = asset
    ? `${Math.round(object.crop.width * asset.width)} × ${Math.round(object.crop.height * asset.height)} px`
    : ''
  const cutout = object.useCutout && object.cutoutAssetId ? getLoadedAsset(object.cutoutAssetId) : null

  return (
    <div className="crop-bar">
      <span className="crop-bar-label">
        Cropping · <b>{pixels}</b>
      </span>
      <span className="kbd">drag edges · drag inside to pan · Enter to apply</span>
      {cutout && (
        <button
          className="btn small"
          title="Trim the transparent space around the cut-out subject"
          onClick={() => {
            const patch = trimToSubjectPatch(object, cutout)
            if (patch) updateObject<ImageObject>(object.id, patch)
          }}
        >
          To subject
        </button>
      )}
      <button
        className="btn small"
        onClick={() => {
          pushHistory(`crop-reset:${object.id}`)
          updateObject<ImageObject>(object.id, applyCropRect(object, { x: 0, y: 0, width: 1, height: 1 }))
        }}
      >
        Reset
      </button>
      <button className="btn small" onClick={() => endCrop(false)}>
        Cancel
      </button>
      <button className="btn small primary" onClick={() => endCrop(true)}>
        Apply
      </button>
    </div>
  )
}
