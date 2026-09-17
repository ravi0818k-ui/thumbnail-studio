import { useEffect, useRef, useState } from 'react'
import { useEditor } from '../../store/editorStore'
import { DEFAULT_ADJUSTMENTS, type Adjustments, type ImageObject } from '../../types'
import { ColorInput, Field, Section, Segmented, Slider } from '../ui'
import { ArrangeSection, EffectsSection, FeatherSection, TransformSection } from './CommonSections'
import { FILTERS } from '../../data/filters'
import { getLoadedAsset } from '../../engine/assets'
import { forgetBrushCanvas, isModelWarm, removeBackground, type RemovalMode } from '../../engine/backgroundRemoval'
import { IconFlipH, IconFlipV } from '../icons'
import { coverCrop, trimToSubjectPatch } from '../../engine/crop'
import { PLACEMENTS, QUICK_ACTIONS, placementPatch, quickActionPatch } from '../../engine/quickActions'
import EnhanceSection from './EnhanceSection'
import { blurSigma, FOCUS_TARGETS, type FocusOptions, type FocusTarget } from '../../engine/objectMask'
import { iconLabel } from '../../engine/iconLibrary'
import { DEFAULT_ICON_COLOR } from '../../engine/factory'
import { runFocus } from '../../engine/runFocus'
import {
  DEFAULT_CLEAN,
  PYTHON_DOWNLOAD_MB,
  cleanMatte,
  onPythonStatus,
  pythonStatus,
} from '../../engine/pythonImage'

const ADJUSTMENTS: { key: keyof Adjustments; label: string; min: number; max: number }[] = [
  { key: 'brightness', label: 'Brightness', min: -100, max: 100 },
  { key: 'contrast', label: 'Contrast', min: -100, max: 100 },
  { key: 'saturation', label: 'Saturation', min: -100, max: 100 },
  { key: 'exposure', label: 'Exposure', min: -100, max: 100 },
  { key: 'highlights', label: 'Highlights', min: -100, max: 100 },
  { key: 'shadows', label: 'Shadows', min: -100, max: 100 },
  { key: 'temperature', label: 'Temperature', min: -100, max: 100 },
  { key: 'tint', label: 'Tint', min: -100, max: 100 },
  { key: 'sharpness', label: 'Sharpness', min: 0, max: 100 },
  { key: 'blur', label: 'Blur', min: 0, max: 100 },
]

export default function ImageProperties({ object }: { object: ImageObject }) {
  const updateObject = useEditor((s) => s.updateObject)
  const pushHistory = useEditor((s) => s.pushHistory)
  const set = (patch: Partial<ImageObject>) => updateObject<ImageObject>(object.id, patch)
  // An icon is a flat silhouette recoloured by the overlay, so the photographic
  // controls below would every one of them do nothing visible. Hiding them is
  // more honest than offering sliders that cannot move anything.
  const isIcon = !!object.icon

  if (isIcon) {
    return (
      <>
        <IconSection object={object} />
        <EffectsSection object={object} />
        <FeatherSection object={object} />
        <TransformSection object={object} />
        <ArrangeSection object={object} />
      </>
    )
  }

  return (
    <>
      <Section title="Quick actions">
        <div className="grid-2">
          {QUICK_ACTIONS.map((action) => (
            <button
              key={action.id}
              className="btn small"
              title={action.hint}
              onClick={() => {
                pushHistory()
                set(quickActionPatch(action.id, object))
              }}
            >
              {action.label}
            </button>
          ))}
        </div>
      </Section>

      <Section title="Place subject">
        <div className="grid-3">
          {PLACEMENTS.map((placement) => (
            <button
              key={placement.id}
              className="btn small"
              onClick={() => {
                pushHistory()
                set(placementPatch(placement.id, object, useEditor.getState().project))
              }}
            >
              {placement.label}
            </button>
          ))}
        </div>
        <p className="muted" style={{ marginTop: 8 }}>
          Re-sizes the subject for this canvas and anchors it, so a cut-out lands in the composition in one click.
        </p>
      </Section>

      <Section title="Image">
        <Field label="Source">
          <span className="muted" style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis' }}>
            {object.assetId ? object.name : 'Empty photo slot — upload an image'}
          </span>
        </Field>
        <div className="row" style={{ marginBottom: 10 }}>
          <button
            className={`btn small${object.flipH ? ' active' : ''}`}
            title="Flip horizontally"
            onClick={() => {
              pushHistory()
              set({ flipH: !object.flipH })
            }}
          >
            <IconFlipH />
          </button>
          <button
            className={`btn small${object.flipV ? ' active' : ''}`}
            title="Flip vertically"
            onClick={() => {
              pushHistory()
              set({ flipV: !object.flipV })
            }}
          >
            <IconFlipV />
          </button>
        </div>
        {object.assetId && (
          <button
            className="btn small block"
            style={{ marginBottom: 10 }}
            onClick={() => useEditor.getState().setAsBackground(object.id)}
            title="Use this image as the canvas backdrop and remove the layer"
          >
            Set as canvas background
          </button>
        )}
        <Slider
          label="Corner radius"
          value={object.cornerRadius}
          min={0}
          max={Math.round(Math.min(object.width, object.height) / 2)}
          historyTag={`radius:${object.id}`}
          onChange={(cornerRadius) => set({ cornerRadius })}
        />
      </Section>

      <CropSection object={object} />
      <BackgroundRemovalSection object={object} />
      <ObjectBlurSection object={object} />
      <EnhanceSection object={object} />

      <Section title="Adjust">
        {ADJUSTMENTS.map((a) => (
          <Slider
            key={a.key}
            label={a.label}
            value={object.adjustments[a.key]}
            min={a.min}
            max={a.max}
            historyTag={`${a.key}:${object.id}`}
            onChange={(value) => set({ adjustments: { ...object.adjustments, [a.key]: value } })}
          />
        ))}
        <button
          className="btn small block"
          onClick={() => {
            pushHistory()
            set({ adjustments: { ...DEFAULT_ADJUSTMENTS } })
          }}
        >
          Reset adjustments
        </button>
      </Section>

      <FiltersSection object={object} />
      <EffectsSection object={object} />
      <FeatherSection object={object} />
      <TransformSection object={object} />
      <ArrangeSection object={object} />
    </>
  )
}

/**
 * An icon's own controls. Colour is the overlay effect rather than a property
 * of the pixels, so it changes instantly and needs no network — see
 * `engine/iconLibrary.ts` for why icons arrive black.
 */
function IconSection({ object }: { object: ImageObject }) {
  const updateObject = useEditor((s) => s.updateObject)
  const pushHistory = useEditor((s) => s.pushHistory)
  const overlay = object.effects.overlay
  const set = (patch: Partial<ImageObject>) => updateObject<ImageObject>(object.id, patch)

  const recolor = (color: string) =>
    set({ effects: { ...object.effects, overlay: { ...overlay, enabled: true, opacity: 100, color } } })

  return (
    <Section title="Icon">
      <Field label="Colour">
        <ColorInput value={overlay.enabled ? overlay.color : DEFAULT_ICON_COLOR} historyTag={`icon:${object.id}`} onChange={recolor} />
      </Field>
      <div className="grid-2">
        {(['outline', 'shadow'] as const).map((action) => (
          <button
            key={action}
            className="btn small"
            onClick={() => {
              pushHistory()
              set(quickActionPatch(action, object))
            }}
          >
            {action === 'outline' ? 'Add outline' : 'Add shadow'}
          </button>
        ))}
      </div>
      <p className="muted" style={{ marginTop: 8 }}>
        {iconLabel(object.icon ?? '')} · from the open-source Iconify library. Outline, glow and shadow are under
        Effects; size, rotation and opacity under Transform.
      </p>
    </Section>
  )
}

function CropSection({ object }: { object: ImageObject }) {
  const updateObject = useEditor((s) => s.updateObject)
  const pushHistory = useEditor((s) => s.pushHistory)
  const asset = getLoadedAsset(object.useCutout && object.cutoutAssetId ? object.cutoutAssetId : object.assetId)
  const crop = object.crop

  const setCrop = (patch: Partial<ImageObject['crop']>) =>
    updateObject<ImageObject>(object.id, { crop: { ...crop, ...patch } })

  return (
    <Section title="Crop" defaultOpen={false}>
      <button
        className="btn block"
        style={{ marginBottom: 8 }}
        disabled={!asset}
        onClick={() => useEditor.getState().startCrop(object.id)}
      >
        Crop on canvas
      </button>
      <p className="muted" style={{ marginTop: 0, marginBottom: 10 }}>
        Or double-click the photo. Drag the edges, drag inside to pan, Enter to apply.
      </p>
      <CropToSubjectButton object={object} />
      <div className="grid-2" style={{ marginBottom: 10 }}>
        <button
          className="btn small"
          disabled={!asset}
          onClick={() => {
            if (!asset) return
            pushHistory()
            updateObject<ImageObject>(object.id, {
              crop: coverCrop(asset.width / asset.height, object.width / object.height),
            })
          }}
        >
          Fill frame
        </button>
        <button
          className="btn small"
          disabled={!asset}
          onClick={() => {
            if (!asset) return
            pushHistory()
            // Fit keeps the whole image: the frame takes the asset's aspect.
            const height = Math.round(object.width * (asset.height / asset.width))
            updateObject<ImageObject>(object.id, { crop: { x: 0, y: 0, width: 1, height: 1 }, height })
          }}
        >
          Fit image
        </button>
      </div>
      <Slider
        label="Left"
        value={Math.round(crop.x * 100)}
        min={0}
        max={90}
        suffix="%"
        historyTag={`crop-x:${object.id}`}
        onChange={(v) => setCrop({ x: v / 100, width: Math.min(crop.width, 1 - v / 100) })}
      />
      <Slider
        label="Top"
        value={Math.round(crop.y * 100)}
        min={0}
        max={90}
        suffix="%"
        historyTag={`crop-y:${object.id}`}
        onChange={(v) => setCrop({ y: v / 100, height: Math.min(crop.height, 1 - v / 100) })}
      />
      <Slider
        label="Width"
        value={Math.round(crop.width * 100)}
        min={10}
        max={100}
        suffix="%"
        historyTag={`crop-w:${object.id}`}
        onChange={(v) => setCrop({ width: Math.min(v / 100, 1 - crop.x) })}
      />
      <Slider
        label="Height"
        value={Math.round(crop.height * 100)}
        min={10}
        max={100}
        suffix="%"
        historyTag={`crop-h:${object.id}`}
        onChange={(v) => setCrop({ height: Math.min(v / 100, 1 - crop.y) })}
      />
      <button
        className="btn small block"
        onClick={() => {
          pushHistory()
          updateObject<ImageObject>(object.id, { crop: { x: 0, y: 0, width: 1, height: 1 } })
        }}
      >
        Reset crop
      </button>
    </Section>
  )
}

/**
 * After a background removal the layer box is still the whole original photo,
 * mostly transparent. Trimming to the subject is what makes the outline hug it
 * and the placement actions behave.
 */
function CropToSubjectButton({ object, primary }: { object: ImageObject; primary?: boolean }) {
  const updateObject = useEditor((s) => s.updateObject)
  const pushHistory = useEditor((s) => s.pushHistory)
  const [note, setNote] = useState<string | null>(null)
  const cutout = object.cutoutAssetId && object.useCutout ? getLoadedAsset(object.cutoutAssetId) : null

  if (!cutout) return null

  return (
    <>
      <button
        className={`btn block${primary ? '' : ' small'}`}
        style={{ marginBottom: 8 }}
        onClick={() => {
          const patch = trimToSubjectPatch(object, cutout)
          if (!patch) {
            setNote('The subject already fills the frame.')
            return
          }
          pushHistory()
          updateObject<ImageObject>(object.id, patch)
          setNote('Trimmed the empty space around the subject.')
        }}
      >
        Crop to subject
      </button>
      {note && (
        <p className="muted" style={{ marginTop: -2, marginBottom: 8 }}>
          {note}
        </p>
      )}
    </>
  )
}

function BackgroundRemovalSection({ object }: { object: ImageObject }) {
  const updateObject = useEditor((s) => s.updateObject)
  const pushHistory = useEditor((s) => s.pushHistory)
  const eraseMode = useEditor((s) => s.eraseMode)
  const setEraseMode = useEditor((s) => s.setEraseMode)
  const brushSize = useEditor((s) => s.brushSize)
  const setBrushSize = useEditor((s) => s.setBrushSize)
  const [busy, setBusy] = useState(false)
  const [progress, setProgress] = useState(0)
  const [stage, setStage] = useState('')
  const [mode, setMode] = useState<RemovalMode>('ai')
  const [tolerance, setTolerance] = useState(18)
  const [feather, setFeather] = useState(2)
  const [error, setError] = useState<string | null>(null)

  // Leaving the layer should not leave the canvas in brush mode.
  useEffect(() => () => setEraseMode('off'), [object.id, setEraseMode])

  const run = async (requested: RemovalMode = mode) => {
    const asset = getLoadedAsset(object.assetId)
    if (!asset) return
    setBusy(true)
    setProgress(0)
    setStage(requested === 'ai' && !isModelWarm() ? 'Loading the model…' : 'Starting…')
    setError(null)
    try {
      const cutout = await removeBackground(asset, {
        mode: requested,
        tolerance,
        feather,
        onProgress: (p, label) => {
          setProgress(p)
          setStage(label)
        },
      })
      if (object.cutoutAssetId) forgetBrushCanvas(object.cutoutAssetId)
      pushHistory()
      updateObject<ImageObject>(object.id, { cutoutAssetId: cutout.id, useCutout: true })
    } catch (err) {
      // The model needs one download; without it, the offline engine still works.
      setError(
        requested === 'ai'
          ? 'The AI model could not be loaded (it needs a connection the first time). Try the Fast engine.'
          : 'Background removal failed on this image.',
      )
      if (requested === 'ai') setMode('fast')
      console.warn('Background removal failed', err)
    } finally {
      setBusy(false)
    }
  }

  return (
    <Section title="Remove background">
      {!object.assetId && <p className="muted">Add an image to this slot first.</p>}
      {object.assetId && (
        <>
          <Field label="Engine" stack>
            <Segmented
              value={mode}
              onChange={(v: RemovalMode) => setMode(v)}
              options={[
                { value: 'ai', label: 'AI', title: 'ISNet segmentation model — best for photos, hair and busy backgrounds' },
                { value: 'fast', label: 'Fast', title: 'Instant flood fill — best for flat or graded backdrops, works offline' },
              ]}
            />
          </Field>
          <button className="btn primary block" disabled={busy} onClick={() => run()}>
            {busy ? 'Processing…' : object.cutoutAssetId ? 'Run again' : 'Remove background'}
          </button>
          {busy && (
            <>
              <div className="progress">
                <span style={{ width: `${Math.round(progress * 100)}%` }} />
              </div>
              <p className="muted" style={{ marginTop: 6 }}>
                {stage} {progress > 0 && `· ${Math.round(progress * 100)}%`}
              </p>
            </>
          )}
          {error && (
            <p className="muted" style={{ color: 'var(--accent)' }}>
              {error}
            </p>
          )}

          <div style={{ marginTop: 12 }}>
            {mode === 'ai' ? (
              <p className="muted">
                Runs the ISNet model on this device with ONNX Runtime. The first run downloads the model
                {isModelWarm() ? '' : ' (about 40 MB)'}; after that it is cached by the browser and works offline.
                Nothing is uploaded.
              </p>
            ) : (
              <>
                <Slider label="Tolerance" value={tolerance} min={2} max={70} onChange={setTolerance} />
                <Slider label="Refine edge" value={feather} min={0} max={10} suffix="px" onChange={setFeather} />
                <p className="muted">
                  Traces the background inward from the frame in a Web Worker. Higher tolerance removes more of a busy
                  background; refine edge softens the cut-out outline.
                </p>
              </>
            )}
          </div>

          {object.cutoutAssetId && (
            <>
              <div style={{ marginTop: 12 }}>
                <CropToSubjectButton object={object} primary />
                <button
                  className="btn small block"
                  style={{ marginBottom: 8 }}
                  onClick={() => useEditor.getState().startCrop(object.id)}
                >
                  Crop on canvas
                </button>
              </div>
              <Field label="Show" stack>
                <Segmented
                  value={object.useCutout ? 'cutout' : 'original'}
                  onChange={(v) => {
                    pushHistory()
                    updateObject<ImageObject>(object.id, { useCutout: v === 'cutout' })
                  }}
                  options={[
                    { value: 'cutout', label: 'Cut-out' },
                    { value: 'original', label: 'Original' },
                  ]}
                />
              </Field>
              <CutoutCleanup object={object} />
              <Field label="Brush" stack>
                <Segmented
                  value={eraseMode === 'blur' ? 'off' : eraseMode}
                  onChange={setEraseMode}
                  options={[
                    { value: 'off', label: 'Off' },
                    { value: 'erase', label: 'Erase' },
                    { value: 'restore', label: 'Restore' },
                    {
                      value: 'clean',
                      label: 'Clean',
                      title: 'Drag over leftover specks — they are removed by shape, not by rubbing pixels out',
                    },
                  ]}
                />
              </Field>
              {eraseMode !== 'off' && (
                <Slider label="Brush size" value={brushSize} min={4} max={200} onChange={setBrushSize} />
              )}
            </>
          )}
        </>
      )}
    </Section>
  )
}

/**
 * The clean-up pass for a fresh cut-out. Segmentation reliably leaves two kinds
 * of debris — stray specks in the empty area, and edge pixels still carrying the
 * old background's colour — and neither can be fixed by rubbing with an eraser
 * without eating the subject. Both are handled in Python (numpy) on this device.
 */
function CutoutCleanup({ object }: { object: ImageObject }) {
  const updateObject = useEditor((s) => s.updateObject)
  const pushHistory = useEditor((s) => s.pushHistory)
  const [engine, setEngine] = useState(pythonStatus())
  const [busy, setBusy] = useState(false)
  const [note, setNote] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [edge, setEdge] = useState(Math.round(DEFAULT_CLEAN.strength * 100))
  const [tighten, setTighten] = useState(0)

  useEffect(() => onPythonStatus(() => setEngine(pythonStatus())), [])

  const run = async () => {
    const asset = getLoadedAsset(object.cutoutAssetId!)
    if (!asset) return
    setBusy(true)
    setError(null)
    setNote(null)
    try {
      const cleaned = await cleanMatte(asset, {
        ...DEFAULT_CLEAN,
        strength: edge / 100,
        shrink: tighten / 100,
      })
      forgetBrushCanvas(object.cutoutAssetId!)
      pushHistory()
      updateObject<ImageObject>(object.id, { cutoutAssetId: cleaned.id, useCutout: true })
      setNote('Cleaned. Undo (Ctrl+Z) puts the previous cut-out back.')
    } catch (err) {
      console.warn('Matte cleanup failed', err)
      setError('The Python engine could not run. It needs a connection the first time it is used.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div style={{ marginTop: 12 }}>
      <button className="btn block" disabled={busy} onClick={() => void run()}>
        {busy ? 'Cleaning…' : 'Clean up cut-out'}
      </button>
      {busy && (
        <div className="progress" style={{ marginTop: 8 }}>
          <span style={{ width: engine.status === 'ready' ? '75%' : '35%' }} />
        </div>
      )}
      <Slider label="Edge clean" value={edge} min={0} max={100} onChange={setEdge} />
      <Slider label="Tighten edge" value={tighten} min={0} max={40} onChange={setTighten} />
      <p className="muted">
        Drops the stray specks left in the empty area and takes the old background's colour out of the edge, which is
        what causes a white halo around hair. Tighten shaves the faintest rim pixels.
        {engine.status === 'idle' && ` Runs CPython + numpy here in the browser; the first run downloads about ${PYTHON_DOWNLOAD_MB} MB.`}
      </p>
      {note && <p className="muted">{note}</p>}
      {error && (
        <p className="muted" style={{ color: 'var(--accent)' }}>
          {error}
        </p>
      )}
    </div>
  )
}

/**
 * Premiere Pro's object mask, done here: scribble on a thing and its shape is
 * grown out from the stroke, then either it or everything around it is blurred.
 * It works on any photo — a cut-out is not needed, because the mask is a
 * selection rather than a cut.
 */
function ObjectBlurSection({ object }: { object: ImageObject }) {
  const eraseMode = useEditor((s) => s.eraseMode)
  const setEraseMode = useEditor((s) => s.setEraseMode)
  const focus = useEditor((s) => s.focus)
  const setFocus = useEditor((s) => s.setFocus)
  const focusSelection = useEditor((s) => s.focusSelection)
  const [engine, setEngine] = useState(pythonStatus())
  const [busy, setBusy] = useState(false)
  // A ref, not the state: two releases in quick succession would both read the
  // render's stale `busy` and run two passes over the same source.
  const runningRef = useRef(false)
  const active = eraseMode === 'blur'
  // The remembered mask belongs to one layer's pixels, so selecting another
  // layer has to end the session rather than carry it across.
  useEffect(() => () => setEraseMode('off'), [object.id, setEraseMode])

  /**
   * Re-blurs the remembered stroke at the new settings. It starts from the
   * asset as it was *before* the first blur, so changing the strength replaces
   * that blur rather than stacking a second one on it — and zero puts the
   * original pixels back.
   */
  const reapply = async (next: FocusOptions) => {
    const selection = useEditor.getState().focusSelection
    if (!selection || runningRef.current) return
    runningRef.current = true
    setBusy(true)
    try {
      const blurred = await runFocus(selection, next)
      const state = useEditor.getState()
      if (blurred) {
        // Tagged, so a run of small adjustments collapses into one undo step.
        state.pushHistory(`focus:${selection.objectId}`)
        state.updateObject<ImageObject>(
          selection.objectId,
          selection.slot === 'cutout' ? { cutoutAssetId: blurred.id } : { assetId: blurred.id },
        )
      }
    } catch (err) {
      console.warn('Focus blur failed', err)
    } finally {
      runningRef.current = false
      setBusy(false)
    }
  }

  useEffect(() => onPythonStatus(() => setEngine(pythonStatus())), [])

  const blurAsset = getLoadedAsset(object.useCutout && object.cutoutAssetId ? object.cutoutAssetId : object.assetId)
  const blurEdge = blurAsset ? Math.max(blurAsset.width, blurAsset.height) : object.width
  const hint = FOCUS_TARGETS.find((t) => t.value === focus.target)!.hint

  return (
    <Section title="Object mask &amp; blur" defaultOpen={false}>
      <Field label="Blur" stack>
        <Segmented
          value={focus.target}
          onChange={(value) => {
            const target = value as FocusTarget
            setFocus({ target })
            void reapply({ ...focus, target })
          }}
          options={FOCUS_TARGETS.map((t) => ({ value: t.value, label: t.label, title: t.hint }))}
        />
      </Field>
      <Slider
        label="Strength"
        value={focus.strength}
        min={0}
        max={100}
        // In pixels of the source, because "5" tells you nothing about whether
        // you are about to see anything at all.
        display={(value) => `${Math.round(blurSigma(value, blurEdge))} px`}
        onChange={(strength) => setFocus({ strength })}
        // Python runs on release, not on every pixel of the drag.
        onCommit={() => void reapply(useEditor.getState().focus)}
      />
      {focusSelection && (
        <p className="muted" style={{ marginTop: 0 }}>
          {busy ? 'Blurring…' : 'Move Strength to change it — the stroke is remembered.'}
        </p>
      )}
      <button className={`btn block${active ? '' : ' primary'}`} onClick={() => setEraseMode(active ? 'off' : 'blur')}>
        {active ? 'Done' : 'Scribble on the object'}
      </button>
      <p className="muted">
        {hint}. The selection stops at the object's edges, so you do not have to be neat — and the strength can be
        changed afterwards without drawing it again.
        {engine.status === 'idle' &&
          ` Runs CPython + numpy here in the browser; the first run downloads about ${PYTHON_DOWNLOAD_MB} MB.`}
      </p>
    </Section>
  )
}

function FiltersSection({ object }: { object: ImageObject }) {
  const updateObject = useEditor((s) => s.updateObject)
  const pushHistory = useEditor((s) => s.pushHistory)
  const asset = getLoadedAsset(object.useCutout && object.cutoutAssetId ? object.cutoutAssetId : object.assetId)
  const [url, setUrl] = useState('')

  useEffect(() => {
    if (!asset) {
      setUrl('')
      return
    }
    const objectUrl = URL.createObjectURL(asset.blob)
    setUrl(objectUrl)
    return () => URL.revokeObjectURL(objectUrl)
  }, [asset])

  return (
    <Section title="Filters">
      <div className="grid-3">
        {FILTERS.map((f) => (
          <button
            key={f.id}
            className={`tile${object.filter === f.id ? '' : ''}`}
            title={f.label}
            style={{
              aspectRatio: '1',
              borderColor: object.filter === f.id ? 'var(--accent)' : undefined,
            }}
            onClick={() => {
              pushHistory()
              updateObject<ImageObject>(object.id, { filter: f.id, filterStrength: 100 })
            }}
          >
            {url ? (
              <img src={url} alt={f.label} style={{ filter: f.css || undefined }} />
            ) : (
              <span className="muted">{f.label}</span>
            )}
            <span className="tile-label">{f.label}</span>
          </button>
        ))}
      </div>
      {object.filter !== 'normal' && (
        <div style={{ marginTop: 10 }}>
          <Slider
            label="Strength"
            value={object.filterStrength}
            min={0}
            max={100}
            suffix="%"
            historyTag={`filter:${object.id}`}
            onChange={(filterStrength) => updateObject<ImageObject>(object.id, { filterStrength })}
          />
        </div>
      )}
    </Section>
  )
}
