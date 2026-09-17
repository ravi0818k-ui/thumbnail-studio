import { useState, type ReactNode } from 'react'
import { useEditor } from '../store/editorStore'

export function Section({
  title,
  children,
  defaultOpen = true,
  action,
}: {
  title: string
  children: ReactNode
  defaultOpen?: boolean
  action?: ReactNode
}) {
  const [open, setOpen] = useState(defaultOpen)
  return (
    <div className="section">
      <div className="section-head" style={{ marginBottom: open ? 10 : 0 }}>
        <button
          onClick={() => setOpen((o) => !o)}
          style={{ flex: 1, display: 'flex', justifyContent: 'space-between', color: 'inherit', font: 'inherit' }}
        >
          <span>{title}</span>
          <span style={{ transform: open ? 'rotate(90deg)' : 'none', transition: 'transform .15s' }}>›</span>
        </button>
        {action}
      </div>
      {open && children}
    </div>
  )
}

export function Field({ label, children, stack }: { label: string; children: ReactNode; stack?: boolean }) {
  return (
    <div className={stack ? 'field stack' : 'field'}>
      <label>{label}</label>
      {children}
    </div>
  )
}

export function Slider({
  label,
  value,
  min,
  max,
  step = 1,
  suffix = '',
  display,
  historyTag,
  onChange,
  onCommit,
}: {
  label: string
  value: number
  min: number
  max: number
  step?: number
  suffix?: string
  /** Readout override, for a control whose number is not its stored value. */
  display?: (value: number) => string
  historyTag?: string
  onChange: (value: number) => void
  /** Fired on release, for a control whose effect is too costly to run live. */
  onCommit?: () => void
}) {
  return (
    <label className="slider">
      <span className="slider-head">
        <span>{label}</span>
        <b>
          {display ? display(value) : Math.round(value * 100) / 100}
          {display ? '' : suffix}
        </b>
      </span>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        // A drag is one history entry: the snapshot is taken as the drag starts.
        onPointerDown={() => historyTag && useEditor.getState().pushHistory(historyTag)}
        onKeyDown={() => historyTag && useEditor.getState().pushHistory(historyTag)}
        onChange={(e) => onChange(Number(e.target.value))}
        onPointerUp={onCommit}
        onKeyUp={onCommit}
      />
    </label>
  )
}

export function NumberInput({
  value,
  onChange,
  min,
  max,
  step = 1,
  historyTag,
  width,
}: {
  value: number
  onChange: (value: number) => void
  min?: number
  max?: number
  step?: number
  historyTag?: string
  width?: number
}) {
  return (
    <input
      className="input number"
      style={width ? { width } : undefined}
      type="number"
      value={Math.round(value * 100) / 100}
      min={min}
      max={max}
      step={step}
      onFocus={() => historyTag && useEditor.getState().pushHistory(historyTag)}
      onChange={(e) => {
        const n = Number(e.target.value)
        if (!Number.isNaN(n)) onChange(n)
      }}
    />
  )
}

export function ColorInput({
  value,
  onChange,
  historyTag,
  showValue = true,
}: {
  value: string
  onChange: (value: string) => void
  historyTag?: string
  showValue?: boolean
}) {
  return (
    <div className="color-input">
      <span className="color-swatch" style={{ background: value === 'transparent' ? '#0000' : value }}>
        <input
          type="color"
          value={value === 'transparent' ? '#000000' : value}
          onFocus={() => historyTag && useEditor.getState().pushHistory(historyTag)}
          onChange={(e) => onChange(e.target.value)}
        />
      </span>
      {showValue && (
        <input
          className="input"
          value={value}
          onFocus={() => historyTag && useEditor.getState().pushHistory(historyTag)}
          onChange={(e) => onChange(e.target.value)}
        />
      )}
    </div>
  )
}

export function Segmented<T extends string>({
  value,
  options,
  onChange,
}: {
  value: T
  options: { value: T; label: ReactNode; title?: string }[]
  onChange: (value: T) => void
}) {
  return (
    <div className="seg">
      {options.map((o) => (
        <button
          key={o.value}
          className={o.value === value ? 'active' : ''}
          title={o.title}
          onClick={() => onChange(o.value)}
        >
          {o.label}
        </button>
      ))}
    </div>
  )
}

export function Toggle({
  label,
  checked,
  onChange,
}: {
  label: string
  checked: boolean
  onChange: (checked: boolean) => void
}) {
  return (
    <label className="toggle">
      <input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} />
      <span>{label}</span>
    </label>
  )
}

export function Modal({
  title,
  onClose,
  children,
  footer,
  width,
}: {
  title: string
  onClose: () => void
  children: ReactNode
  footer?: ReactNode
  width?: number
}) {
  return (
    <div className="modal-backdrop" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      {/* A requested width is a maximum: a narrow window must still fit. */}
      <div className="modal" style={width ? { width: `min(${width}px, 100%)` } : undefined}>
        <div className="modal-head">
          <h3>{title}</h3>
          <button className="icon-btn" onClick={onClose} title="Close">
            ✕
          </button>
        </div>
        <div className="modal-body">{children}</div>
        {footer && <div className="modal-foot">{footer}</div>}
      </div>
    </div>
  )
}
