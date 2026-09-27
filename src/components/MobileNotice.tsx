import { useEffect, useState } from 'react'
import { Modal } from './ui'

// A phone in landscape is still well under a laptop's width, so the check is on
// the device's short side rather than the current viewport alone.
const SMALL = '(max-width: 900px), (pointer: coarse) and (max-height: 600px)'
const PORTRAIT = '(orientation: portrait)'
const DISMISSED = 'mobile-notice-dismissed'

function read(): { small: boolean; portrait: boolean } {
  return { small: matchMedia(SMALL).matches, portrait: matchMedia(PORTRAIT).matches }
}

function wasDismissed(): boolean {
  try {
    return sessionStorage.getItem(DISMISSED) === '1'
  } catch {
    return false
  }
}

/**
 * The editor is laid out for a desktop: a toolbar, a canvas and a properties
 * panel side by side. On a phone it asks for landscape and says so plainly.
 * Dismissal lasts the tab's session, so a reload does not nag again.
 */
export default function MobileNotice() {
  const [view, setView] = useState(read)
  const [dismissed, setDismissed] = useState(wasDismissed)

  useEffect(() => {
    const queries = [matchMedia(SMALL), matchMedia(PORTRAIT)]
    const update = () => setView(read())
    queries.forEach((q) => q.addEventListener('change', update))
    return () => queries.forEach((q) => q.removeEventListener('change', update))
  }, [])

  if (!view.small || dismissed) return null

  const close = () => {
    setDismissed(true)
    try {
      sessionStorage.setItem(DISMISSED, '1')
    } catch {
      // Storage blocked: the notice just returns on the next load.
    }
  }

  return (
    <Modal
      title={view.portrait ? 'Please rotate your screen' : 'Desktop view only'}
      onClose={close}
      width={420}
      footer={
        <button className="btn" onClick={close}>
          Continue anyway
        </button>
      }
    >
      <div className="mobile-notice">
        <div className={`mobile-notice-icon${view.portrait ? ' rotate' : ''}`} aria-hidden>
          📱
        </div>
        <p>
          <b>This website only works in desktop view.</b>
        </p>
        <p>
          {view.portrait
            ? 'Turn your device sideways to landscape, or open Thumbnail Studio on a computer for the full editor.'
            : 'The screen is too small for the editor. Open Thumbnail Studio on a computer for the full experience.'}
        </p>
      </div>
    </Modal>
  )
}
