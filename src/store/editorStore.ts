import { create } from 'zustand'
import type {
  Background,
  CanvasFormat,
  ImageObject,
  Project,
  ProjectRecord,
  SafeZone,
  SceneObject,
  ShapeObject,
  TextObject,
} from '../types'
import { DEFAULT_BACKGROUND } from '../types'
import { defaultSafeZone, formatConfig, formatForSize } from '../data/formats'
import { DEFAULT_BRAND_ID } from '../data/brands'
import { normalizeProject } from '../engine/normalize'
import { getLoadedAsset, newId } from '../engine/assets'
import { invalidateRaster } from '../engine/renderer'
import { cloneObject, createImage } from '../engine/factory'
import { coverCrop } from '../engine/crop'
import { boundingRect } from '../engine/geometry'
import { DEFAULT_EXPORT, type ExportSettings } from '../engine/export'
import { DEFAULT_FOCUS, type FocusOptions, type FocusSelection } from '../engine/objectMask'
import type { TemplateDef } from '../data/templates'

export type Screen = 'home' | 'templates' | 'editor' | 'colors' | 'fonts'
export type GridMode = 'none' | 'grid' | 'thirds' | 'center'
/**
 * 'clean' hands the stroke to the Python matte pass instead of erasing, and
 * 'blur' grows it into an object mask and blurs one side of it.
 */
export type EraseMode = 'off' | 'erase' | 'restore' | 'clean' | 'blur'
export type PanelId = 'brand' | 'templates' | 'uploads' | 'text' | 'elements' | 'icons' | 'background' | 'layers'

interface Snapshot {
  project: Project
  selection: string[]
}

export interface EditorState {
  screen: Screen
  /** Where the colour guide returns to, so it can be opened from either side. */
  colorsReturnTo: Screen
  fontsReturnTo: Screen
  project: Project
  selection: string[]
  past: Snapshot[]
  future: Snapshot[]
  zoom: number
  fitZoom: number
  panel: PanelId | null
  editingTextId: string | null
  showGuides: boolean
  showGrid: boolean
  gridMode: GridMode
  showSafeZone: boolean
  snapping: boolean
  exportSettings: ExportSettings
  exportOpen: boolean
  previewOpen: boolean
  eraseMode: EraseMode
  brushSize: number
  /** What the clean brush is doing, shown on the canvas while it runs. */
  brushStatus: string | null
  focus: FocusOptions
  /**
   * The last object mask, kept so the blur can be re-run at another strength
   * from the original pixels instead of the creator scribbling again.
   */
  focusSelection: FocusSelection | null
  /** Image layer currently being cropped on the canvas, if any. */
  croppingId: string | null
  dirty: boolean
  lastSavedAt: number | null

  // navigation ------------------------------------------------------------
  setScreen: (screen: Screen) => void
  openColorGuide: () => void
  closeColorGuide: () => void
  openFontGuide: () => void
  closeFontGuide: () => void
  setPanel: (panel: PanelId | null) => void
  newProject: (options?: NewProjectOptions) => void
  setFormat: (format: CanvasFormat) => void
  setSafeZone: (patch: Partial<SafeZone>) => void
  setBrand: (brandId: string) => void
  resetSafeZone: () => void
  applyTemplate: (template: TemplateDef) => void
  loadProject: (record: ProjectRecord) => void
  renameProject: (name: string) => void
  setCanvasSize: (width: number, height: number) => void
  markSaved: () => void

  // selection -------------------------------------------------------------
  select: (ids: string[]) => void
  toggleSelect: (id: string) => void
  selectAll: () => void
  setEditingText: (id: string | null) => void

  // objects ---------------------------------------------------------------
  addObject: (obj: SceneObject, opts?: { select?: boolean }) => void
  addObjects: (objs: SceneObject[]) => void
  updateObject: <T extends SceneObject>(id: string, patch: Partial<T>) => void
  updateSelected: (patch: Partial<TextObject> | Partial<ImageObject> | Partial<ShapeObject>) => void
  removeSelected: () => void
  duplicateSelected: () => void
  copySelected: () => void
  paste: () => void
  nudgeSelected: (dx: number, dy: number) => void
  reorderObject: (id: string, toIndex: number) => void
  moveLayer: (id: string, direction: 'front' | 'back' | 'forward' | 'backward') => void
  setAsBackground: (id: string, opts?: { keepLayer?: boolean }) => void
  backgroundToLayer: () => void
  groupSelected: () => void
  ungroupSelected: () => void
  alignSelected: (mode: 'left' | 'center-h' | 'right' | 'top' | 'center-v' | 'bottom') => void

  // background ------------------------------------------------------------
  setBackground: (patch: Partial<Background>) => void

  // history ---------------------------------------------------------------
  pushHistory: (tag?: string) => void
  undo: () => void
  redo: () => void

  // view ------------------------------------------------------------------
  setZoom: (zoom: number) => void
  setFitZoom: (zoom: number) => void
  toggleGuides: () => void
  toggleGrid: () => void
  setGridMode: (mode: GridMode) => void
  toggleSafeZone: () => void
  toggleSnapping: () => void
  setExportSettings: (patch: Partial<ExportSettings>) => void
  setExportOpen: (open: boolean) => void
  setPreviewOpen: (open: boolean) => void
  setEraseMode: (mode: EraseMode) => void
  setBrushStatus: (status: string | null) => void
  setBrushSize: (size: number) => void
  setFocus: (patch: Partial<FocusOptions>) => void
  setFocusSelection: (selection: FocusSelection | null) => void
  startCrop: (id: string) => void
  endCrop: (apply: boolean) => void
}

const HISTORY_LIMIT = 80
const COALESCE_MS = 500

export interface NewProjectOptions {
  format?: CanvasFormat
  brandId?: string
  width?: number
  height?: number
  name?: string
}

function emptyProject(options: NewProjectOptions = {}): Project {
  const format = options.format ?? 'thumbnail'
  const config = formatConfig(format)
  return {
    id: newId('p'),
    name: options.name ?? (format === 'shorts' ? 'Untitled Shorts cover' : 'Untitled thumbnail'),
    format,
    brandId: options.brandId ?? DEFAULT_BRAND_ID,
    width: options.width ?? config.width,
    height: options.height ?? config.height,
    safeZone: defaultSafeZone(format),
    background: JSON.parse(JSON.stringify(DEFAULT_BACKGROUND)),
    objects: [],
    createdAt: Date.now(),
    updatedAt: Date.now(),
  }
}

function snapshot(state: EditorState): Snapshot {
  return {
    project: JSON.parse(JSON.stringify(state.project)),
    selection: [...state.selection],
  }
}

let lastTag: string | null = null
let lastTagAt = 0

let clipboard: SceneObject[] = []

export const useEditor = create<EditorState>((set, get) => {
  /** Applies a mutation to the project and marks it dirty. */
  const mutate = (fn: (project: Project) => Project | void) => {
    set((state) => {
      const draft = { ...state.project, objects: [...state.project.objects] }
      const result = fn(draft) ?? draft
      result.updatedAt = Date.now()
      return { project: result, dirty: true }
    })
  }

  return {
    screen: 'home',
    colorsReturnTo: 'home',
    fontsReturnTo: 'home',
    project: emptyProject(),
    selection: [],
    past: [],
    future: [],
    zoom: 1,
    fitZoom: 1,
    panel: 'templates',
    editingTextId: null,
    showGuides: true,
    showGrid: false,
    gridMode: 'none',
    showSafeZone: false,
    snapping: true,
    exportSettings: { ...DEFAULT_EXPORT },
    exportOpen: false,
    previewOpen: false,
    eraseMode: 'off',
    brushSize: 40,
    brushStatus: null,
    focus: { ...DEFAULT_FOCUS },
    focusSelection: null,
    croppingId: null,
    dirty: false,
    lastSavedAt: null,

    setScreen: (screen) => set({ screen }),

    // The guide is reference, not a mode: it remembers where it was opened from
    // so leaving it never costs the creator their place in the editor.
    openColorGuide: () =>
      set((s) => (s.screen === 'colors' ? {} : { screen: 'colors', colorsReturnTo: s.screen })),
    closeColorGuide: () => set((s) => ({ screen: s.colorsReturnTo })),
    openFontGuide: () => set((s) => (s.screen === 'fonts' ? {} : { screen: 'fonts', fontsReturnTo: s.screen })),
    closeFontGuide: () => set((s) => ({ screen: s.fontsReturnTo })),
    setPanel: (panel) => set((s) => ({ panel: s.panel === panel ? null : panel })),

    newProject: (options = {}) => {
      invalidateRaster()
      const project = emptyProject(options)
      set({
        project,
        selection: [],
        past: [],
        future: [],
        screen: 'editor',
        panel: 'templates',
        editingTextId: null,
        dirty: false,
        // Shorts is the format where the host UI actually eats the design.
        showSafeZone: project.format === 'shorts',
        lastSavedAt: null,
      })
    },

    setFormat: (format) => {
      const config = formatConfig(format)
      get().pushHistory()
      invalidateRaster()
      mutate((p) => {
        p.format = format
        p.width = config.width
        p.height = config.height
        p.safeZone = defaultSafeZone(format)
      })
      set({ showSafeZone: format === 'shorts' })
    },

    setBrand: (brandId) => {
      get().pushHistory()
      mutate((p) => {
        p.brandId = brandId
      })
    },

    setSafeZone: (patch) => {
      mutate((p) => {
        p.safeZone = { ...p.safeZone, ...patch }
      })
    },

    resetSafeZone: () => {
      get().pushHistory()
      mutate((p) => {
        p.safeZone = defaultSafeZone(p.format)
      })
    },

    applyTemplate: (template) => {
      const state = get()
      // A template carries its own format; applying one switches the canvas so
      // its coordinates always land where the layout intended.
      const format = template.format ?? 'thumbnail'
      const config = formatConfig(format)
      const sameFormat = state.project.format === format
      const width = sameFormat ? state.project.width : config.width
      const height = sameFormat ? state.project.height : config.height
      const built = template.build(width, height)
      invalidateRaster()
      set({
        past: [...state.past, snapshot(state)].slice(-HISTORY_LIMIT),
        future: [],
        project: {
          ...state.project,
          name: state.project.name.startsWith('Untitled') ? template.name : state.project.name,
          format,
          brandId: template.brand ?? state.project.brandId,
          width,
          height,
          safeZone: sameFormat ? state.project.safeZone : defaultSafeZone(format),
          background: built.background,
          objects: built.objects,
          updatedAt: Date.now(),
        },
        selection: [],
        screen: 'editor',
        showSafeZone: sameFormat ? state.showSafeZone : format === 'shorts',
        dirty: true,
      })
    },

    loadProject: (record) => {
      invalidateRaster()
      const { thumbnail: _thumbnail, ...stored } = record
      const project = normalizeProject(JSON.parse(JSON.stringify(stored)))
      set({
        project,
        selection: [],
        past: [],
        future: [],
        screen: 'editor',
        editingTextId: null,
        dirty: false,
        showSafeZone: project.format === 'shorts',
        lastSavedAt: record.updatedAt,
      })
    },

    renameProject: (name) => mutate((p) => void (p.name = name)),

    setCanvasSize: (width, height) => {
      get().pushHistory()
      invalidateRaster()
      const format = formatForSize(width, height)
      const formatChanged = format !== get().project.format
      mutate((p) => {
        p.width = width
        p.height = height
        // Turning the canvas portrait makes it a Shorts cover, and vice versa.
        if (formatChanged) {
          p.format = format
          p.safeZone = defaultSafeZone(format)
        }
      })
      if (formatChanged) set({ showSafeZone: format === 'shorts' })
    },

    markSaved: () => set({ dirty: false, lastSavedAt: Date.now() }),

    // Selecting anything else leaves crop mode; the edits made so far stand.
    select: (ids) =>
      set((state) => ({
        selection: ids,
        editingTextId: null,
        croppingId: state.croppingId && ids.length === 1 && ids[0] === state.croppingId ? state.croppingId : null,
      })),

    toggleSelect: (id) =>
      set((state) => ({
        selection: state.selection.includes(id) ? state.selection.filter((s) => s !== id) : [...state.selection, id],
      })),

    selectAll: () => set((state) => ({ selection: state.project.objects.filter((o) => !o.locked).map((o) => o.id) })),

    setEditingText: (id) => set({ editingTextId: id }),

    addObject: (obj, opts) => {
      get().pushHistory()
      mutate((p) => void p.objects.push(obj))
      if (opts?.select !== false) set({ selection: [obj.id] })
    },

    addObjects: (objs) => {
      if (objs.length === 0) return
      get().pushHistory()
      mutate((p) => void p.objects.push(...objs))
      set({ selection: objs.map((o) => o.id) })
    },

    updateObject: (id, patch) => {
      invalidateRaster(id)
      mutate((p) => {
        p.objects = p.objects.map((o) => (o.id === id ? ({ ...o, ...patch } as SceneObject) : o))
      })
    },

    updateSelected: (patch) => {
      const { selection } = get()
      selection.forEach((id) => invalidateRaster(id))
      mutate((p) => {
        p.objects = p.objects.map((o) => (selection.includes(o.id) ? ({ ...o, ...patch } as SceneObject) : o))
      })
    },

    removeSelected: () => {
      const { selection } = get()
      if (selection.length === 0) return
      get().pushHistory()
      selection.forEach((id) => invalidateRaster(id))
      mutate((p) => {
        p.objects = p.objects.filter((o) => !selection.includes(o.id))
      })
      set({ selection: [], editingTextId: null })
    },

    duplicateSelected: () => {
      const { selection, project } = get()
      const copies = project.objects.filter((o) => selection.includes(o.id)).map((o) => cloneObject(o))
      if (copies.length === 0) return
      get().pushHistory()
      mutate((p) => void p.objects.push(...copies))
      set({ selection: copies.map((o) => o.id) })
    },

    copySelected: () => {
      const { selection, project } = get()
      clipboard = JSON.parse(JSON.stringify(project.objects.filter((o) => selection.includes(o.id))))
    },

    paste: () => {
      if (clipboard.length === 0) return
      const copies = clipboard.map((o) => cloneObject(o, 32))
      get().pushHistory()
      mutate((p) => void p.objects.push(...copies))
      set({ selection: copies.map((o) => o.id) })
    },

    nudgeSelected: (dx, dy) => {
      const { selection } = get()
      if (selection.length === 0) return
      get().pushHistory('nudge')
      mutate((p) => {
        p.objects = p.objects.map((o) =>
          selection.includes(o.id) && !o.locked ? { ...o, x: o.x + dx, y: o.y + dy } : o,
        )
      })
    },

    reorderObject: (id, toIndex) => {
      get().pushHistory()
      mutate((p) => {
        const from = p.objects.findIndex((o) => o.id === id)
        if (from < 0) return
        const [obj] = p.objects.splice(from, 1)
        p.objects.splice(Math.max(0, Math.min(toIndex, p.objects.length)), 0, obj)
      })
    },

    moveLayer: (id, direction) => {
      get().pushHistory()
      mutate((p) => {
        const from = p.objects.findIndex((o) => o.id === id)
        if (from < 0) return
        const [obj] = p.objects.splice(from, 1)
        const to =
          direction === 'front'
            ? p.objects.length
            : direction === 'back'
              ? 0
              : direction === 'forward'
                ? Math.min(from + 1, p.objects.length)
                : Math.max(from - 1, 0)
        p.objects.splice(to, 0, obj)
      })
    },

    setAsBackground: (id, opts) => {
      const state = get()
      const obj = state.project.objects.find((o) => o.id === id)
      if (!obj || obj.type !== 'image') return
      // Whatever the layer currently shows is what becomes the backdrop.
      const assetId = obj.useCutout && obj.cutoutAssetId ? obj.cutoutAssetId : obj.assetId
      if (!assetId) return
      state.pushHistory()
      invalidateRaster(id)
      mutate((p) => {
        p.background = { ...p.background, kind: 'image', assetId, imageBlur: 0, imageDim: 0 }
        if (!opts?.keepLayer) p.objects = p.objects.filter((o) => o.id !== id)
      })
      if (!opts?.keepLayer) set({ selection: [], editingTextId: null })
    },

    backgroundToLayer: () => {
      const state = get()
      const { background, width, height } = state.project
      if (background.kind !== 'image' || !background.assetId) return
      const asset = getLoadedAsset(background.assetId)
      const layer = createImage(background.assetId, asset?.width ?? width, asset?.height ?? height, width, height, {
        name: 'Background image',
        x: 0,
        y: 0,
        width,
        height,
        crop: asset ? coverCrop(asset.width / asset.height, width / height) : { x: 0, y: 0, width: 1, height: 1 },
      })
      state.pushHistory()
      mutate((p) => {
        p.background = { ...p.background, kind: 'solid', assetId: null }
        p.objects.unshift(layer)
      })
      set({ selection: [layer.id] })
    },

    groupSelected: () => {
      const { selection } = get()
      if (selection.length < 2) return
      const groupId = newId('g')
      get().pushHistory()
      mutate((p) => {
        p.objects = p.objects.map((o) => (selection.includes(o.id) ? { ...o, groupId } : o))
      })
    },

    ungroupSelected: () => {
      const { selection, project } = get()
      const groupIds = new Set(
        project.objects.filter((o) => selection.includes(o.id) && o.groupId).map((o) => o.groupId as string),
      )
      if (groupIds.size === 0) return
      get().pushHistory()
      mutate((p) => {
        p.objects = p.objects.map((o) => (o.groupId && groupIds.has(o.groupId) ? { ...o, groupId: null } : o))
      })
    },

    alignSelected: (mode) => {
      const { selection, project } = get()
      const targets = project.objects.filter((o) => selection.includes(o.id) && !o.locked)
      if (targets.length === 0) return
      // One object aligns to the canvas; several align to their shared bounds.
      const bounds =
        targets.length > 1
          ? boundingRect(targets)!
          : { x: 0, y: 0, width: project.width, height: project.height }
      get().pushHistory()
      selection.forEach((id) => invalidateRaster(id))
      mutate((p) => {
        p.objects = p.objects.map((o) => {
          if (!selection.includes(o.id) || o.locked) return o
          switch (mode) {
            case 'left':
              return { ...o, x: bounds.x }
            case 'right':
              return { ...o, x: bounds.x + bounds.width - o.width }
            case 'center-h':
              return { ...o, x: bounds.x + (bounds.width - o.width) / 2 }
            case 'top':
              return { ...o, y: bounds.y }
            case 'bottom':
              return { ...o, y: bounds.y + bounds.height - o.height }
            case 'center-v':
              return { ...o, y: bounds.y + (bounds.height - o.height) / 2 }
            default:
              return o
          }
        })
      })
    },

    setBackground: (patch) => {
      mutate((p) => {
        p.background = { ...p.background, ...patch }
      })
    },

    pushHistory: (tag) => {
      const now = Date.now()
      if (tag && lastTag === tag && now - lastTagAt < COALESCE_MS) {
        lastTagAt = now
        return
      }
      lastTag = tag ?? null
      lastTagAt = now
      set((state) => ({
        past: [...state.past, snapshot(state)].slice(-HISTORY_LIMIT),
        future: [],
      }))
    },

    undo: () => {
      const state = get()
      const previous = state.past[state.past.length - 1]
      if (!previous) return
      lastTag = null
      invalidateRaster()
      set({
        past: state.past.slice(0, -1),
        future: [snapshot(state), ...state.future].slice(0, HISTORY_LIMIT),
        project: previous.project,
        selection: previous.selection,
        editingTextId: null,
        dirty: true,
      })
    },

    redo: () => {
      const state = get()
      const next = state.future[0]
      if (!next) return
      lastTag = null
      invalidateRaster()
      set({
        past: [...state.past, snapshot(state)].slice(-HISTORY_LIMIT),
        future: state.future.slice(1),
        project: next.project,
        selection: next.selection,
        editingTextId: null,
        dirty: true,
      })
    },

    setZoom: (zoom) => set({ zoom: Math.max(0.05, Math.min(5, zoom)) }),
    setFitZoom: (fitZoom) => set({ fitZoom }),
    toggleGuides: () => set((s) => ({ showGuides: !s.showGuides })),
    toggleGrid: () => set((s) => ({ showGrid: !s.showGrid, gridMode: s.showGrid ? 'none' : 'grid' })),
    setGridMode: (gridMode) => set({ gridMode, showGrid: gridMode !== 'none' }),
    toggleSafeZone: () => set((s) => ({ showSafeZone: !s.showSafeZone })),
    toggleSnapping: () => set((s) => ({ snapping: !s.snapping })),
    setExportSettings: (patch) => set((s) => ({ exportSettings: { ...s.exportSettings, ...patch } })),
    setExportOpen: (exportOpen) => set({ exportOpen }),
    setPreviewOpen: (previewOpen) => set({ previewOpen }),
    setEraseMode: (eraseMode) =>
      set((state) => ({
        eraseMode,
        brushStatus: null,
        // The remembered mask points at one layer's asset, so it leaves with
        // the bar it belongs to.
        focusSelection: eraseMode === 'blur' ? state.focusSelection : null,
      })),
    setBrushStatus: (brushStatus) => set({ brushStatus }),
    setBrushSize: (brushSize) => set({ brushSize }),
    setFocus: (patch) => set((state) => ({ focus: { ...state.focus, ...patch } })),
    setFocusSelection: (focusSelection) => set({ focusSelection }),

    startCrop: (id) => {
      const obj = get().project.objects.find((o) => o.id === id)
      if (!obj || obj.type !== 'image' || obj.locked) return
      // One snapshot for the whole session, so Cancel is simply an undo.
      get().pushHistory()
      set({ croppingId: id, selection: [id], editingTextId: null, eraseMode: 'off' })
    },

    endCrop: (apply) => {
      const { croppingId } = get()
      if (!croppingId) return
      set({ croppingId: null })
      if (!apply) get().undo()
    },
  }
})

// Convenience selectors ------------------------------------------------------

export function selectedObjects(state: EditorState): SceneObject[] {
  return state.project.objects.filter((o) => state.selection.includes(o.id))
}

export function singleSelected(state: EditorState): SceneObject | null {
  const objs = selectedObjects(state)
  return objs.length === 1 ? objs[0] : null
}

export function useSelectedObjects(): SceneObject[] {
  return useEditor((s) => s.project.objects.filter((o) => s.selection.includes(o.id)))
}
