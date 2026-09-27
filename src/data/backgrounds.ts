import type { Background, GradientDirection } from '../types'
import { DEFAULT_BACKGROUND } from '../types'

export interface BackgroundPreset {
  id: string
  label: string
  value: Background
}

function gradient(
  id: string,
  label: string,
  from: string,
  to: string,
  direction: GradientDirection = 'to-bottom-right',
): BackgroundPreset {
  return {
    id,
    label,
    value: { ...DEFAULT_BACKGROUND, kind: 'gradient', color: from, gradient: { from, to, direction } },
  }
}

function pattern(
  id: string,
  label: string,
  kind: Background['pattern']['kind'],
  color: string,
  background: string,
  scale: number,
): BackgroundPreset {
  return {
    id,
    label,
    value: { ...DEFAULT_BACKGROUND, kind: 'pattern', color: background, pattern: { kind, color, background, scale } },
  }
}

function solid(id: string, label: string, color: string): BackgroundPreset {
  return { id, label, value: { ...DEFAULT_BACKGROUND, kind: 'solid', color } }
}

export const BACKGROUND_PRESETS: BackgroundPreset[] = [
  gradient('dark', 'Dark Gradient', '#2b3240', '#07090d'),
  gradient('blue-glow', 'Blue Glow', '#1d4ed8', '#050914', 'radial'),
  gradient('red-energy', 'Red Energy', '#ef1c1c', '#3b0708'),
  gradient('purple-neon', 'Purple Neon', '#7c3aed', '#10061f', 'radial'),
  gradient('studio', 'Studio', '#4b5563', '#111827', 'radial'),
  gradient('finance', 'Finance', '#065f46', '#04120e'),
  gradient('education', 'Education', '#0ea5e9', '#082f49'),
  gradient('motivation', 'Sunset', '#f97316', '#7c2d12'),
  pattern('tech-grid', 'Technology Grid', 'grid', '#1f3a5f', '#070b12', 48),
  pattern('minimal-dots', 'Minimal Dots', 'dots', '#cbd5e1', '#f8fafc', 28),
  pattern('gaming-rays', 'Gaming Rays', 'rays', '#a21caf', '#12031a', 24),
  pattern('abstract', 'Abstract Stripes', 'diagonal', '#1f2937', '#0b1120', 36),
  solid('solid-black', 'Solid Black', '#000000'),
  solid('solid-white', 'Solid White', '#ffffff'),
  // Flat grounds picked off YouTube thumbnails.
  solid('solid-deep-teal', 'Deep Teal', '#0D524E'),
  solid('solid-pine', 'Pine Green', '#035047'),
  solid('solid-indigo', 'Indigo', '#262187'),
  solid('solid-royal-indigo', 'Royal Indigo', '#29228A'),
  solid('solid-violet', 'Deep Violet', '#34278D'),
  solid('solid-wine', 'Wine', '#7D1B32'),
  solid('solid-crimson', 'Crimson', '#D0121E'),
  solid('solid-amber', 'Amber', '#F8A646'),
]

export const SWATCHES = [
  '#ffffff', '#000000', '#ef4444', '#f97316', '#ffd400', '#22c55e',
  '#06b6d4', '#3b82f6', '#8b5cf6', '#ec4899', '#64748b', '#0f172a',
]
