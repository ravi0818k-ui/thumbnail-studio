import type { SVGProps } from 'react'

const svg = (props: SVGProps<SVGSVGElement>) => ({
  viewBox: '0 0 24 24',
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: 1.7,
  strokeLinecap: 'round' as const,
  strokeLinejoin: 'round' as const,
  ...props,
})

export const IconTemplates = (p: SVGProps<SVGSVGElement>) => (
  <svg {...svg(p)}>
    <rect x="3" y="3" width="8" height="8" rx="1.5" />
    <rect x="13" y="3" width="8" height="5" rx="1.5" />
    <rect x="3" y="13" width="8" height="8" rx="1.5" />
    <rect x="13" y="10" width="8" height="11" rx="1.5" />
  </svg>
)

export const IconBrand = (p: SVGProps<SVGSVGElement>) => (
  <svg {...svg(p)}>
    <path d="M5 4h11a3 3 0 0 1 3 3v13l-6-3.4L7 20V7" />
    <path d="M5 4v16" />
    <path d="M10 9h5" />
  </svg>
)

export const IconUpload = (p: SVGProps<SVGSVGElement>) => (
  <svg {...svg(p)}>
    <path d="M12 16V4" />
    <path d="m7 9 5-5 5 5" />
    <path d="M4 17v2a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-2" />
  </svg>
)

export const IconText = (p: SVGProps<SVGSVGElement>) => (
  <svg {...svg(p)}>
    <path d="M4 6V4h16v2" />
    <path d="M12 4v16" />
    <path d="M9 20h6" />
  </svg>
)

export const IconElements = (p: SVGProps<SVGSVGElement>) => (
  <svg {...svg(p)}>
    <circle cx="7" cy="7" r="4" />
    <rect x="13" y="3" width="8" height="8" rx="1.5" />
    <path d="m7 13 5 8H2z" />
    <path d="M14 17h7" />
    <path d="m18 14 3 3-3 3" />
  </svg>
)

export const IconIcons = (p: SVGProps<SVGSVGElement>) => (
  <svg {...svg(p)}>
    <path d="M12 3.5 14 9l5.5 2-5.5 2-2 5.5-2-5.5L4.5 11 10 9z" />
    <path d="M18.5 3.5v3" />
    <path d="M20 5h-3" />
  </svg>
)

export const IconBackground = (p: SVGProps<SVGSVGElement>) => (
  <svg {...svg(p)}>
    <rect x="3" y="3" width="18" height="18" rx="2" />
    <path d="m3 16 5-5 4 4 3-3 6 6" />
    <circle cx="9" cy="8" r="1.4" />
  </svg>
)

export const IconLayers = (p: SVGProps<SVGSVGElement>) => (
  <svg {...svg(p)}>
    <path d="m12 3 9 5-9 5-9-5 9-5Z" />
    <path d="m3 14 9 5 9-5" />
  </svg>
)

export const IconUndo = (p: SVGProps<SVGSVGElement>) => (
  <svg {...svg(p)}>
    <path d="M3 8h11a5 5 0 0 1 0 10H8" />
    <path d="m7 4-4 4 4 4" />
  </svg>
)

export const IconRedo = (p: SVGProps<SVGSVGElement>) => (
  <svg {...svg(p)}>
    <path d="M21 8H10a5 5 0 0 0 0 10h6" />
    <path d="m17 4 4 4-4 4" />
  </svg>
)

export const IconDownload = (p: SVGProps<SVGSVGElement>) => (
  <svg {...svg(p)}>
    <path d="M12 4v11" />
    <path d="m7 10 5 5 5-5" />
    <path d="M4 19h16" />
  </svg>
)

export const IconEye = (p: SVGProps<SVGSVGElement>) => (
  <svg {...svg(p)}>
    <path d="M2 12s3.6-6 10-6 10 6 10 6-3.6 6-10 6-10-6-10-6Z" />
    <circle cx="12" cy="12" r="2.6" />
  </svg>
)

export const IconEyeOff = (p: SVGProps<SVGSVGElement>) => (
  <svg {...svg(p)}>
    <path d="M3 3l18 18" />
    <path d="M10.6 6.2A9.9 9.9 0 0 1 12 6c6.4 0 10 6 10 6a17 17 0 0 1-3.2 3.7" />
    <path d="M6.3 8.3A16.6 16.6 0 0 0 2 12s3.6 6 10 6a9.9 9.9 0 0 0 3.6-.7" />
  </svg>
)

export const IconLock = (p: SVGProps<SVGSVGElement>) => (
  <svg {...svg(p)}>
    <rect x="4" y="10" width="16" height="11" rx="2" />
    <path d="M8 10V7a4 4 0 0 1 8 0v3" />
  </svg>
)

export const IconUnlock = (p: SVGProps<SVGSVGElement>) => (
  <svg {...svg(p)}>
    <rect x="4" y="10" width="16" height="11" rx="2" />
    <path d="M8 10V7a4 4 0 0 1 7.5-2" />
  </svg>
)

export const IconTrash = (p: SVGProps<SVGSVGElement>) => (
  <svg {...svg(p)}>
    <path d="M4 7h16" />
    <path d="M9 7V5h6v2" />
    <path d="M6 7l1 13h10l1-13" />
  </svg>
)

export const IconCopy = (p: SVGProps<SVGSVGElement>) => (
  <svg {...svg(p)}>
    <rect x="8" y="8" width="12" height="12" rx="2" />
    <path d="M16 8V6a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2v8a2 2 0 0 0 2 2h2" />
  </svg>
)

export const IconPlus = (p: SVGProps<SVGSVGElement>) => (
  <svg {...svg(p)}>
    <path d="M12 5v14M5 12h14" />
  </svg>
)

export const IconMinus = (p: SVGProps<SVGSVGElement>) => (
  <svg {...svg(p)}>
    <path d="M5 12h14" />
  </svg>
)

export const IconCrop = (p: SVGProps<SVGSVGElement>) => (
  <svg {...svg(p)}>
    <path d="M6 2v16h16" />
    <path d="M2 6h16v16" />
  </svg>
)

export const IconMagic = (p: SVGProps<SVGSVGElement>) => (
  <svg {...svg(p)}>
    <path d="m5 19 10-10" />
    <path d="m14 4 1.5 3L19 8.5 15.5 10 14 13l-1.5-3L9 8.5 12.5 7 14 4Z" />
  </svg>
)

export const IconFlipH = (p: SVGProps<SVGSVGElement>) => (
  <svg {...svg(p)}>
    <path d="M12 3v18" />
    <path d="M9 7 3 12l6 5V7Z" />
    <path d="M15 7l6 5-6 5V7Z" />
  </svg>
)

export const IconFlipV = (p: SVGProps<SVGSVGElement>) => (
  <svg {...svg(p)}>
    <path d="M3 12h18" />
    <path d="M7 9 12 3l5 6H7Z" />
    <path d="M7 15l5 6 5-6H7Z" />
  </svg>
)
