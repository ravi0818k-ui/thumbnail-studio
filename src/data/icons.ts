// ---------------------------------------------------------------------------
// The icon library's browse tree.
//
// Each leaf is a *query*, not a list of icons: the set comes from the Iconify
// API at the moment you open it, so the library grows without this file
// changing. The queries are written to the API's vocabulary rather than to the
// creator's — "Habit" finds nothing, `calendar-check` finds the right drawing —
// which is exactly why the label and the query are separate fields.
// ---------------------------------------------------------------------------

export interface IconLeaf {
  id: string
  label: string
  /** Sent to the Iconify search endpoint. */
  query: string
}

export interface IconGroup {
  id: string
  label: string
  leaves: IconLeaf[]
}

const leaf = (label: string, query: string): IconLeaf => ({
  id: label.toLowerCase().replace(/\s+/g, '-'),
  label,
  query,
})

export const ICON_GROUPS: IconGroup[] = [
  {
    id: 'education',
    label: 'Education',
    leaves: [
      leaf('Book', 'book'),
      leaf('Open Book', 'book-open'),
      leaf('Notebook', 'notebook'),
      leaf('Pencil', 'pencil'),
      leaf('Pen', 'pen'),
      leaf('Graduation', 'graduation-cap'),
      leaf('School', 'school'),
    ],
  },
  {
    id: 'study',
    label: 'Study',
    leaves: [
      leaf('Brain', 'brain'),
      leaf('Focus', 'crosshair'),
      leaf('Target', 'target'),
      leaf('Lightbulb', 'lightbulb'),
      leaf('Notes', 'notes'),
      leaf('Reading', 'read'),
      leaf('Learning', 'certificate'),
    ],
  },
  {
    id: 'time',
    label: 'Time',
    leaves: [
      leaf('Clock', 'clock'),
      leaf('Timer', 'timer'),
      leaf('Hourglass', 'hourglass'),
      leaf('Calendar', 'calendar'),
      leaf('Stopwatch', 'stopwatch'),
    ],
  },
  {
    id: 'productivity',
    label: 'Productivity',
    leaves: [
      leaf('Checklist', 'list-check'),
      leaf('Task', 'clipboard-list'),
      leaf('Goal', 'trophy'),
      leaf('Progress', 'trending-up'),
      leaf('Habit', 'calendar-check'),
    ],
  },
]

export function iconLeaf(groupId: string, leafId: string): IconLeaf | null {
  return ICON_GROUPS.find((g) => g.id === groupId)?.leaves.find((l) => l.id === leafId) ?? null
}
