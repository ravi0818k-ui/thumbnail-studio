// ---------------------------------------------------------------------------
// Thumbnail fundamentals — the beginner's course as data.
//
// Third of the reference pages, and built like the other two: the screen is a
// renderer with no design knowledge in it, so re-wording a lesson is a data
// edit. See colorPsychology.ts and fontPsychology.ts.
//
// The article this comes from also covers fonts and colour. Those two sections
// are *not* duplicated here — they are `CROSS_LINKS`, because the app already
// has a page for each with applicable swatches and font chips, and two copies
// of one table drift apart. The selftest pins that the links name real screens.
// ---------------------------------------------------------------------------

import type { Screen } from '../store/editorStore'

/** The lead: what a thumbnail is before it is a picture. */
export const FUNDAMENTALS_INTRO = [
  'A YouTube thumbnail is not just a picture placed beside your video. It is the first visual message your audience receives.',
  'Before someone reads your title, watches your video, or understands your topic, they usually see one thing first: the thumbnail.',
]

/** The question a thumbnail exists to answer. */
export const CORE_QUESTION = 'Why should I stop scrolling and look at this video?'

export const FUNDAMENTALS_PRINCIPLE =
  'The goal is not to make a beautiful thumbnail. The goal is to communicate one idea and create one emotion, quickly.'

export interface Pillar {
  id: string
  icon: string
  title: string
  /** What this pillar answers, in one line. */
  kicker: string
  items: string[]
  /** The column colour from the diagram this page is built on. */
  accent: string
}

/**
 * The three areas thumbnail design divides into. Order is the teaching order:
 * research before science before art, because craft applied to the wrong idea
 * still makes the wrong thumbnail.
 */
export const PILLARS: Pillar[] = [
  {
    id: 'research',
    icon: '🔍',
    title: 'Research',
    kicker: 'What is already working, and how can I say it better?',
    items: ['Raw footage', 'Analysing the topic', 'What others did', 'Colours & fonts'],
    accent: '#4C9A62',
  },
  {
    id: 'science',
    icon: '⚙️',
    title: 'Understanding the science',
    kicker: 'Why some images win attention and others are skipped.',
    items: ['Contrast', 'YouTube UI elements', 'How the platform sees the thumbnail'],
    accent: '#71767E',
  },
  {
    id: 'art',
    icon: '🎨',
    title: 'Understanding the art',
    kicker: 'How you use those principles in your own voice.',
    items: ['Logo / identity', 'Text & picture', 'Misc. elements', 'Viewstamps'],
    accent: '#8B5188',
  },
]

/** The element that runs through all three, and the reason the diagram holds. */
export const PILLAR_CONNECTOR = {
  icon: '❤️',
  title: 'Emotion',
  body: 'Research finds it, science delivers it, art shapes it. A thumbnail with no feeling in it gives the three nothing to carry.',
}

// ----------------------------------------------------------------- research

export const RESEARCH_TRAP = {
  wrong: 'What should I design?',
  right: 'What is already working, and how can I communicate my idea better?',
}

/** Everything worth looking at before opening a design tool. */
export const RESEARCH_INPUTS = [
  'Your raw video footage',
  'The main topic of the video',
  'What other creators are doing',
  'Colours used in your niche',
  'Fonts and typography',
  'Expressions and emotions',
  'Composition',
  'Text placement',
  'Visual elements',
  'Competitor thumbnails',
]

/** The moments in your own footage that are already thumbnail material. */
export const FOOTAGE_EMOTIONS = [
  'Surprise',
  'Happiness',
  'Shock',
  'Confusion',
  'Anger',
  'Curiosity',
  'Fear',
  'Excitement',
  'Achievement',
  'Failure',
]

export interface MomentRow {
  moment: string
  emotion: string
  idea: string
}

/** Worked rows for the habit below: note the emotion while you record. */
export const MOMENT_TABLE: MomentRow[] = [
  { moment: 'You discover a new technique', emotion: 'Surprise', idea: '😲' },
  { moment: 'You solve a difficult problem', emotion: 'Achievement', idea: '💡' },
  { moment: 'You make a mistake', emotion: 'Frustration', idea: '😣' },
  { moment: 'You reveal a secret', emotion: 'Curiosity', idea: '🤔' },
  { moment: 'You achieve a result', emotion: 'Excitement', idea: '🔥' },
]

export const RECORDING_HABIT =
  'While recording, write down the emotion you are experiencing or communicating. It makes the thumbnail almost design itself later.'

// ------------------------------------------------------------------ emotion

export interface HookExample {
  id: string
  label: string
  text: string
  note: string
}

/** The same video, two hooks. B wins because it is the viewer's own problem. */
export const HOOK_COMPARISON: HookExample[] = [
  {
    id: 'a',
    label: 'Thumbnail A',
    text: 'How to Learn Faster',
    note: 'Describes the video. True, and easy to scroll past.',
  },
  {
    id: 'b',
    label: 'Thumbnail B',
    text: 'WHY CAN’T YOU REMEMBER?',
    note: 'Asks a question the viewer already has. “That’s exactly my problem.”',
  },
]

/** The chain a thumbnail sets off when the emotion lands. */
export const EMOTION_CHAIN = ['Emotion', 'Attention', 'Curiosity']

export const THUMBNAIL_EMOTIONS: Array<{ emoji: string; name: string }> = [
  { emoji: '😮', name: 'Surprise' },
  { emoji: '🤔', name: 'Curiosity' },
  { emoji: '😱', name: 'Fear' },
  { emoji: '😂', name: 'Humour' },
  { emoji: '😍', name: 'Desire' },
  { emoji: '😡', name: 'Frustration' },
  { emoji: '😌', name: 'Relief' },
  { emoji: '🏆', name: 'Achievement' },
  { emoji: '💡', name: 'Discovery' },
]

export const EMOTION_RULE =
  'You do not need an extreme emotion every time. The emotion has to match the story of the video — that is the whole requirement.'

// -------------------------------------------------------------------- story

export interface StoryPattern {
  id: string
  name: string
  before: string
  /** Null for a pattern that deliberately shows only half a story. */
  after: string | null
  note: string
}

/** A strong thumbnail carries a very small story. Three shapes cover most. */
export const STORY_PATTERNS: StoryPattern[] = [
  {
    id: 'problem-solution',
    name: 'Problem → Solution',
    before: '😫 I CAN’T REMEMBER',
    after: '🧠 NOW I CAN',
    note: 'The most reliable shape: name the pain, promise the turn.',
  },
  {
    id: 'before-after',
    name: 'Before → After',
    before: '❌ BAD THUMBNAIL',
    after: '✅ BETTER THUMBNAIL',
    note: 'Works when the change is something the viewer can see.',
  },
  {
    id: 'question',
    name: 'Question → Mystery',
    before: '🤔 WHAT HAPPENED?',
    after: null,
    note: 'Half a story on purpose. Only fair if the video answers it.',
  },
]

export const STORY_RULE =
  'The viewer should grasp the basic idea in a fraction of a second — not read it, recognise it.'

// ------------------------------------------------------------------ science

export const SCIENCE_CONCEPTS = [
  'Contrast',
  'Visual hierarchy',
  'Colour',
  'Typography',
  'Size',
  'Spacing',
  'Simplicity',
  'Human faces',
  'Direction',
  'Pattern interruption',
]

export interface ContrastLever {
  id: string
  name: string
  recipe: string
}

/** Four ways to make the important thing the loud thing. */
export const CONTRAST_LEVERS: ContrastLever[] = [
  { id: 'colour', name: 'Colour', recipe: 'Dark background + bright subject' },
  { id: 'size', name: 'Size', recipe: 'Large face + small supporting element' },
  { id: 'type', name: 'Typography', recipe: 'Large headline + smaller supporting text' },
  { id: 'brightness', name: 'Brightness', recipe: 'Bright subject + darker background' },
]

export const CONTRAST_RULE = 'If everything is loud, nothing is loud.'

export interface HierarchyStep {
  rank: number
  name: string
  question: string
}

/** The order the eye should travel in, and the question that sets each rank. */
export const HIERARCHY_STEPS: HierarchyStep[] = [
  { rank: 1, name: 'Face / main subject', question: 'What should the viewer see first?' },
  { rank: 2, name: 'Main text', question: 'What should they see second?' },
  { rank: 3, name: 'Supporting element', question: 'What should they understand third?' },
]

export const HIERARCHY_RULE =
  'When someone sees your thumbnail their eyes should not have to decide where to look. Decide for them.'

/** Your thumbnail is never alone on the screen. */
export const YT_CONTEXT = [
  'Video title',
  'Channel name',
  'Duration',
  'Other thumbnails',
  'Search results',
  'Recommended videos',
]

export const SMALL_SIZE_TEST = {
  problem: 'A design that looks beautiful on your laptop can fall apart as a small thumbnail on a phone.',
  question: 'Can I understand the main idea when the thumbnail is small?',
  answer: 'If not, simplify it — nothing else fixes it.',
}

/** The misconception worth killing early. */
export const ALGORITHM_MYTH = {
  myth: 'I need to make a thumbnail the YouTube algorithm likes.',
  reality:
    'The algorithm is not a person judging whether your thumbnail is beautiful. What it can measure is viewer behaviour — whether the right people chose to watch, and stayed.',
  betterQuestion: 'Will my target viewer understand this thumbnail and feel interested in the video?',
}

// ---------------------------------------------------------------------- art

export const ART_VS_SCIENCE =
  'Science tells you why a principle works. Art is how you use it — that is where your design personality lives.'

export const ART_COMPONENTS = [
  'Logo / identity',
  'Text',
  'Pictures',
  'Characters',
  'Icons',
  'Arrows',
  'Shapes',
  'Background',
  'Visual effects',
  'Viewstamps',
  'Supporting elements',
]

/** Title and thumbnail have different jobs; the mistake is giving them one. */
export const TITLE_PAIRING = {
  title: 'How I Improved My Memory in 30 Days',
  titleRole: 'The title explains the video.',
  thumbnail: 'I REMEMBERED EVERYTHING!',
  thumbnailRole: 'The thumbnail creates the visual hook.',
  rule: 'Do not repeat your title on the thumbnail. Let the two work together.',
}

export const TEXT_LENGTH_EXAMPLE = {
  tooLong: 'Here Are 7 Scientifically Proven Techniques That Will Help You Improve Your Memory',
  better: ['REMEMBER EVERYTHING', 'BOOST YOUR MEMORY', 'WHY YOU FORGET'],
  note: 'A thumbnail is not a blog post. Short text is easier to process at a glance.',
}

export interface CrossLink {
  id: string
  screen: Screen
  title: string
  body: string
  cta: string
}

/**
 * Typography and colour are fundamentals too, but each already has a page of
 * its own where every hue and family can be applied to the selection. Linking
 * beats restating: a second copy of the colour table is a second thing to keep
 * true.
 */
export const CROSS_LINKS: CrossLink[] = [
  {
    id: 'fonts',
    screen: 'fonts',
    title: 'Choosing the right font',
    body: 'Typography is not decoration — a category carries a personality before a word is read. Serif, sans serif, script and display each say something different, and weight says half of it.',
    cta: 'Open the font guide',
  },
  {
    id: 'colors',
    screen: 'colors',
    title: 'Colour psychology',
    body: 'Colour influences how a design feels, but the associations are general, not rules. A red thumbnail is not automatically urgent — colour, image, type, message and context make the feeling together.',
    cta: 'Open the colour guide',
  },
]

// ----------------------------------------------------------------- identity

export const IDENTITY_GOAL =
  'Someone should be able to recognise one of your thumbnails without reading your channel name.'

export const IDENTITY_SIGNALS = [
  'Font family',
  'Colour palette',
  'Text treatment',
  'Face positioning',
  'Background style',
  'Graphic elements',
  'Layout',
  'Logo placement',
]

export const IDENTITY_RULE = 'Keep the identity consistent while changing the story.'

// ------------------------------------------------------------------ clutter

/** The beginner's instinct: add everything. Each element earns its place. */
export const CLUTTER_TRAPS = [
  'Arrows',
  'Circles',
  'Emojis',
  'Five different fonts',
  'Multiple faces',
  'Ten colours',
  'Shadows everywhere',
  'Random icons',
]

export const CLUTTER_TEST = 'Does this element help communicate the idea? If not, remove it.'

// --------------------------------------------------------------- the tests

export const THREE_SECOND_TEST = {
  method: 'Look at the thumbnail for two or three seconds. Then hide it.',
  questions: [
    'Can I remember the main subject?',
    'Can I remember the main message?',
    'Can I remember the emotion?',
    'Can I explain what the video is probably about?',
  ],
  verdict: 'Any “no” is a request to simplify, not to add.',
}

export interface ChecklistGroup {
  id: string
  title: string
  items: string[]
}

/** The pre-publish pass. Rendered as real checkboxes, because it is a pass. */
export const CHECKLIST: ChecklistGroup[] = [
  {
    id: 'research',
    title: 'Research',
    items: ['I understood the video topic', 'I looked at similar thumbnails'],
  },
  {
    id: 'emotion',
    title: 'Emotion',
    items: ['I can name the emotion this communicates', 'The emotion matches the video'],
  },
  {
    id: 'typography',
    title: 'Typography',
    items: ['The text is short', 'The font is easy to read'],
  },
  {
    id: 'design',
    title: 'Visual design',
    items: ['There is enough contrast', 'The main subject is obvious', 'There is no unnecessary clutter'],
  },
  { id: 'mobile', title: 'Mobile', items: ['It works at small size'] },
  { id: 'brand', title: 'Brand', items: ['It feels consistent with my channel'] },
]

/** Counted, not written, so the heading cannot drift from the list. */
export const CHECKLIST_COUNT = CHECKLIST.reduce((n, g) => n + g.items.length, 0)

export interface FormulaStep {
  step: string
  body: string
}

/** RESEARCH → EMOTION → MESSAGE → DESIGN → TEST. */
export const FUNDAMENTALS_FORMULA: FormulaStep[] = [
  { step: 'Research', body: 'Understand the topic and your audience.' },
  { step: 'Emotion', body: 'Decide what you want the viewer to feel.' },
  { step: 'Message', body: 'Create one clear visual idea.' },
  { step: 'Design', body: 'Use typography, colour, images, contrast and composition.' },
  { step: 'Test', body: 'Check it at small size, and beside other thumbnails.' },
]

/** Ask these three, in this order, before designing anything. */
export const FINAL_QUESTIONS = [
  'What do I want the viewer to feel?',
  'What do I want the viewer to understand?',
  'What is the simplest set of elements that communicates both?',
]

export const CLOSING_THOUGHT =
  'A thumbnail is not a collection of colours, fonts, pictures and effects. It is a visual story — and the best ones are understood before the viewer reads a single word of the description.'

export interface SummaryRow {
  icon: string
  title: string
  body: string
}

export const QUICK_SUMMARY: SummaryRow[] = [
  { icon: '🔍', title: 'Research', body: 'Understand the topic, the audience and the competition.' },
  { icon: '❤️', title: 'Emotion', body: 'Decide what feeling you want to create.' },
  { icon: '🧠', title: 'Science', body: 'Use contrast, hierarchy, colour, typography and simplicity.' },
  { icon: '🎨', title: 'Art', body: 'Combine text, images, identity and elements in your own voice.' },
  { icon: '📱', title: 'Mobile test', body: 'Make sure the idea survives at small size.' },
  { icon: '🎯', title: 'Clarity', body: 'One thumbnail communicates one strong idea.' },
]

export const CLOSING_RULE =
  'Do not design a thumbnail just to make it beautiful. Design it to make the viewer stop, understand, feel and become curious.'
