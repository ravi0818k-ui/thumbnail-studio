import { TUTORIAL_DURATION, TUTORIAL_VIDEO_ID } from './links'

/**
 * The channel's lessons, in watching order. `TutorialsScreen` is a renderer
 * over this array, so a new video is a new row here.
 *
 * Every lesson teaches one feature the editor has, and `action` is the button
 * under the player that opens that feature — watch it, then do it. The first
 * row is the home screen's walkthrough, read from `links.ts` so the card and
 * the list can never name different videos.
 */

/** What "Try it now" opens. `TutorialsScreen.tryIt` has a case for each. */
export type TutorialAction = 'templates' | 'preview' | 'icons' | 'watched-bar'

export interface Tutorial {
  /** The YouTube video id. */
  id: string
  title: string
  /** As YouTube prints it on the card. */
  duration: string
  summary: string
  learn: { title: string; text: string }[]
  action: TutorialAction
  cta: string
  /** The line under the button: what will happen when it is pressed. */
  ctaNote: string
}

/** The template "Try it now" opens a lesson on, when it needs a design to show. */
export const TRY_TEMPLATE_ID = 'big-text-person'

export const TUTORIALS: Tutorial[] = [
  {
    id: TUTORIAL_VIDEO_ID,
    title: 'Your first thumbnail in 7 minutes',
    duration: TUTORIAL_DURATION,
    summary: 'Watch one design go from a plain photo to a finished, click-ready thumbnail.',
    learn: [
      { title: 'Cut yourself out', text: 'One click removes the photo background.' },
      { title: 'Make it pop', text: 'Big text, outline and glow that read on a phone.' },
      { title: 'Preview like YouTube', text: 'See it in the feed before you upload.' },
    ],
    action: 'templates',
    cta: 'Start from a template',
    ctaNote: 'Opens the template gallery.',
  },
  {
    id: 'orR6_EoT-Nc',
    title: 'Preview Your YouTube Thumbnail: Score, Dark Mode, Light Mode & Mobile',
    duration: '2:03',
    summary: 'See your thumbnail where viewers will see it, before you upload.',
    learn: [
      { title: 'Dark and light mode', text: "Check it on both of YouTube's backgrounds." },
      { title: 'On a phone', text: 'The small card most viewers actually see.' },
      { title: 'The thumbnail score', text: 'What reads well and what to fix.' },
    ],
    action: 'preview',
    cta: 'Open the preview',
    ctaNote: 'Opens a sample design with the preview showing.',
  },
  {
    id: 'jvYgCIF5mIc',
    title: 'How to Add Icons to Your YouTube Thumbnail (Free, No Design Skills)',
    duration: '1:15',
    summary: 'Find a free icon, drop it on the design and make it stand out.',
    learn: [
      { title: 'Browse by topic', text: 'A free icon library sorted by what your video is about.' },
      { title: 'Recolour in one click', text: 'Match your brand colours.' },
      { title: 'Outline, glow and shadow', text: 'So a small icon still reads on a phone.' },
    ],
    action: 'icons',
    cta: 'Open the Icons panel',
    ctaNote: 'Opens a sample design with the icon library open.',
  },
  {
    id: 'aUdW5O2Cjfw',
    title: 'How to Add a Watched Bar or Progress Bar to a YouTube Thumbnail',
    duration: '1:16',
    summary: 'Paint the red resume bar so the video looks part-watched.',
    learn: [
      { title: 'Switch it on', text: 'One toggle in the canvas settings.' },
      { title: 'Set how far it reaches', text: 'Drag to choose how much looks watched.' },
      { title: 'It is in the export', text: 'The bar is painted into the image you upload.' },
    ],
    action: 'watched-bar',
    cta: 'Try the watched bar',
    ctaNote: 'Opens a sample design with the bar switched on.',
  },
]

export function tutorialById(id: string | null | undefined): Tutorial | null {
  return TUTORIALS.find((t) => t.id === id) ?? null
}

export function tutorialUrl(id: string): string {
  return `https://youtu.be/${id}`
}

export function tutorialStill(id: string, size: 'maxresdefault' | 'hqdefault' | 'mqdefault'): string {
  return `https://i.ytimg.com/vi/${id}/${size}.jpg`
}

/** The page's own link to one lesson, for sharing it in a description or a comment. */
export function lessonPath(id: string): string {
  return `/tutorials?v=${encodeURIComponent(id)}`
}

/** Watched ids, remembered on this device only. */
const WATCHED_KEY = 'tutorials-watched'

export function readWatched(): string[] {
  try {
    const parsed: unknown = JSON.parse(localStorage.getItem(WATCHED_KEY) ?? '[]')
    return Array.isArray(parsed) ? parsed.filter((id): id is string => typeof id === 'string') : []
  } catch {
    return []
  }
}

export function writeWatched(ids: string[]): void {
  try {
    localStorage.setItem(WATCHED_KEY, JSON.stringify(ids))
  } catch {
    // Private windows and blocked storage: the ticks just last the visit.
  }
}
