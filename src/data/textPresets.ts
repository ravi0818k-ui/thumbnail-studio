import type { Effects, TextObject } from '../types'
import { DEFAULT_EFFECTS } from '../types'

export interface TextPreset {
  id: string
  label: string
  /** Styling for the swatch shown in the panel. */
  preview: { color: string; stroke?: string; bg?: string; shadow?: string }
  apply: Partial<TextObject>
}

function fx(over: Partial<Effects>): Effects {
  return {
    shadow: { ...DEFAULT_EFFECTS.shadow, ...over.shadow },
    outline: { ...DEFAULT_EFFECTS.outline, ...over.outline },
    glow: { ...DEFAULT_EFFECTS.glow, ...over.glow },
    overlay: { ...DEFAULT_EFFECTS.overlay, ...over.overlay },
  }
}

export const TEXT_PRESETS: TextPreset[] = [
  {
    id: 'youtube-bold',
    label: 'YouTube Bold',
    preview: { color: '#ffffff', stroke: '#000000', shadow: '0 3px 6px rgba(0,0,0,.8)' },
    apply: {
      fontFamily: 'Anton',
      fontWeight: 400,
      color: '#ffffff',
      strokeColor: '#000000',
      strokeWidth: 10,
      uppercase: true,
      bgEnabled: false,
      effects: fx({ shadow: { enabled: true, color: '#000000', blur: 18, offsetX: 6, offsetY: 8, opacity: 80 } }),
    },
  },
  {
    id: 'impact',
    label: 'Impact',
    preview: { color: '#ffd400', stroke: '#000000' },
    apply: {
      fontFamily: 'Archivo Black',
      fontWeight: 400,
      color: '#ffd400',
      strokeColor: '#000000',
      strokeWidth: 12,
      uppercase: true,
      bgEnabled: false,
      effects: fx({}),
    },
  },
  {
    id: 'neon',
    label: 'Neon',
    preview: { color: '#67e8f9', shadow: '0 0 12px #22d3ee' },
    apply: {
      fontFamily: 'Bebas Neue',
      fontWeight: 400,
      color: '#a5f3fc',
      strokeColor: '#0891b2',
      strokeWidth: 2,
      uppercase: true,
      bgEnabled: false,
      effects: fx({ glow: { enabled: true, color: '#22d3ee', blur: 34, intensity: 3 } }),
    },
  },
  {
    id: 'outline',
    label: 'Outline',
    preview: { color: 'transparent', stroke: '#ffffff' },
    apply: {
      fontFamily: 'Anton',
      fontWeight: 400,
      color: 'transparent',
      strokeColor: '#ffffff',
      strokeWidth: 6,
      uppercase: true,
      bgEnabled: false,
      effects: fx({}),
    },
  },
  {
    id: '3d',
    label: '3D',
    preview: { color: '#ffffff', shadow: '5px 5px 0 #ff2d2d' },
    apply: {
      fontFamily: 'Archivo Black',
      fontWeight: 400,
      color: '#ffffff',
      strokeColor: '#000000',
      strokeWidth: 4,
      uppercase: true,
      bgEnabled: false,
      effects: fx({ shadow: { enabled: true, color: '#ff2d2d', blur: 0, offsetX: 10, offsetY: 10, opacity: 100 } }),
    },
  },
  {
    id: 'shadow',
    label: 'Shadow',
    preview: { color: '#ffffff', shadow: '0 6px 10px rgba(0,0,0,.9)' },
    apply: {
      fontFamily: 'Montserrat',
      fontWeight: 900,
      color: '#ffffff',
      strokeWidth: 0,
      uppercase: false,
      bgEnabled: false,
      effects: fx({ shadow: { enabled: true, color: '#000000', blur: 26, offsetX: 0, offsetY: 14, opacity: 85 } }),
    },
  },
  {
    id: 'glow',
    label: 'Glow',
    preview: { color: '#ffffff', shadow: '0 0 14px #ffd400' },
    apply: {
      fontFamily: 'Poppins',
      fontWeight: 900,
      color: '#ffffff',
      strokeWidth: 0,
      uppercase: true,
      bgEnabled: false,
      effects: fx({ glow: { enabled: true, color: '#ffd400', blur: 40, intensity: 3 } }),
    },
  },
  {
    id: 'comic',
    label: 'Comic',
    preview: { color: '#ffffff', stroke: '#111827' },
    apply: {
      fontFamily: 'Luckiest Guy',
      fontWeight: 400,
      color: '#ffffff',
      strokeColor: '#111827',
      strokeWidth: 9,
      uppercase: false,
      bgEnabled: false,
      effects: fx({ shadow: { enabled: true, color: '#111827', blur: 0, offsetX: 7, offsetY: 7, opacity: 100 } }),
    },
  },
  {
    id: 'minimal',
    label: 'Minimal',
    preview: { color: '#f8fafc' },
    apply: {
      fontFamily: 'Inter',
      fontWeight: 700,
      color: '#f8fafc',
      strokeWidth: 0,
      uppercase: false,
      letterSpacing: 1,
      bgEnabled: false,
      effects: fx({}),
    },
  },
  {
    id: 'warning',
    label: 'Warning',
    preview: { color: '#111111', bg: '#ffd400' },
    apply: {
      fontFamily: 'Oswald',
      fontWeight: 700,
      color: '#111111',
      strokeWidth: 0,
      uppercase: true,
      bgEnabled: true,
      bgColor: '#ffd400',
      bgPadding: 18,
      bgRadius: 8,
      effects: fx({}),
    },
  },
]
