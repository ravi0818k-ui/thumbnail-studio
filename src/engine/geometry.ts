import type { SceneObject } from '../types'

export interface Point {
  x: number
  y: number
}

export interface Rect {
  x: number
  y: number
  width: number
  height: number
}

export function toRadians(deg: number): number {
  return (deg * Math.PI) / 180
}

export function objectCenter(obj: SceneObject): Point {
  return { x: obj.x + obj.width / 2, y: obj.y + obj.height / 2 }
}

/** Rotates a point around a centre. */
export function rotatePoint(p: Point, center: Point, deg: number): Point {
  if (!deg) return p
  const r = toRadians(deg)
  const cos = Math.cos(r)
  const sin = Math.sin(r)
  const dx = p.x - center.x
  const dy = p.y - center.y
  return { x: center.x + dx * cos - dy * sin, y: center.y + dx * sin + dy * cos }
}

/** Converts a scene point into an object's unrotated local space. */
export function toLocal(p: Point, obj: SceneObject): Point {
  const c = objectCenter(obj)
  const un = rotatePoint(p, c, -obj.rotation)
  return { x: un.x - obj.x, y: un.y - obj.y }
}

export function objectCorners(obj: SceneObject): Point[] {
  const c = objectCenter(obj)
  const pts: Point[] = [
    { x: obj.x, y: obj.y },
    { x: obj.x + obj.width, y: obj.y },
    { x: obj.x + obj.width, y: obj.y + obj.height },
    { x: obj.x, y: obj.y + obj.height },
  ]
  return pts.map((p) => rotatePoint(p, c, obj.rotation))
}

export function hitTest(p: Point, obj: SceneObject): boolean {
  if (obj.hidden || obj.locked) return false
  const local = toLocal(p, obj)
  return local.x >= 0 && local.y >= 0 && local.x <= obj.width && local.y <= obj.height
}

export function boundingRect(objects: SceneObject[]): Rect | null {
  if (objects.length === 0) return null
  let minX = Infinity
  let minY = Infinity
  let maxX = -Infinity
  let maxY = -Infinity
  for (const obj of objects) {
    for (const c of objectCorners(obj)) {
      minX = Math.min(minX, c.x)
      minY = Math.min(minY, c.y)
      maxX = Math.max(maxX, c.x)
      maxY = Math.max(maxY, c.y)
    }
  }
  return { x: minX, y: minY, width: maxX - minX, height: maxY - minY }
}

export function rectsIntersect(a: Rect, b: Rect): boolean {
  return !(a.x + a.width < b.x || b.x + b.width < a.x || a.y + a.height < b.y || b.y + b.height < a.y)
}

export type HandleId = 'nw' | 'n' | 'ne' | 'e' | 'se' | 's' | 'sw' | 'w' | 'rotate'

export const CORNER_HANDLES: HandleId[] = ['nw', 'ne', 'se', 'sw']
export const EDGE_HANDLES: HandleId[] = ['n', 'e', 's', 'w']

/** Handle anchor points in scene space (rotation applied). */
export function handlePoints(obj: SceneObject, rotateOffset = 28): Record<HandleId, Point> {
  const c = objectCenter(obj)
  const raw: Record<HandleId, Point> = {
    nw: { x: obj.x, y: obj.y },
    n: { x: obj.x + obj.width / 2, y: obj.y },
    ne: { x: obj.x + obj.width, y: obj.y },
    e: { x: obj.x + obj.width, y: obj.y + obj.height / 2 },
    se: { x: obj.x + obj.width, y: obj.y + obj.height },
    s: { x: obj.x + obj.width / 2, y: obj.y + obj.height },
    sw: { x: obj.x, y: obj.y + obj.height },
    w: { x: obj.x, y: obj.y + obj.height / 2 },
    rotate: { x: obj.x + obj.width / 2, y: obj.y - rotateOffset },
  }
  const out = {} as Record<HandleId, Point>
  for (const key of Object.keys(raw) as HandleId[]) out[key] = rotatePoint(raw[key], c, obj.rotation)
  return out
}

export function cursorForHandle(handle: HandleId, rotation: number): string {
  if (handle === 'rotate') return 'grab'
  const base: Record<Exclude<HandleId, 'rotate'>, number> = { n: 0, ne: 45, e: 90, se: 135, s: 180, sw: 225, w: 270, nw: 315 }
  const angle = (base[handle] + rotation + 360) % 360
  const cursors = ['ns-resize', 'nesw-resize', 'ew-resize', 'nwse-resize']
  return cursors[Math.round(angle / 45) % 4]
}
