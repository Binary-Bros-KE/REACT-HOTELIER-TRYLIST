import { useState, type InputHTMLAttributes, type PointerEvent, type TextareaHTMLAttributes } from 'react'
import { LuDelete } from 'react-icons/lu'

export const POS_TOUCH_KEYBOARD_KEY = 'hotelier_pos_touch_keyboard'

export function readPosTouchKeyboardSetting() {
  try {
    return localStorage.getItem(POS_TOUCH_KEYBOARD_KEY) === 'true'
  } catch {
    return false
  }
}

type KeyboardMode = 'text' | 'number'

function TouchKeyboard({ value, onChange, onClose, mode = 'text' }: { value: string; onChange: (value: string) => void; onClose: () => void; mode?: KeyboardMode }) {
  const rows = mode === 'number' ? ['123', '456', '789', '.0'] : ['1234567890', 'qwertyuiop', 'asdfghjkl', 'zxcvbnm']
  const preventBlur = (event: PointerEvent<HTMLButtonElement>) => event.preventDefault()
  const press = (next: string) => onChange(`${value}${next}`)
  const keyClass = 'min-w-0 rounded-sm border bg-card px-1 py-2 text-sm font-bold uppercase shadow-sm active:scale-[0.98] hover:bg-muted'

  return (
    <div className="absolute left-0 top-[calc(100%+0.5rem)] z-[90] w-full min-w-[280px] max-w-[min(92vw,34rem)] rounded-sm border bg-background p-2 shadow-xl">
      <div className="space-y-1.5">
        {rows.map((row) => (
          <div key={row} className="grid gap-1.5" style={{ gridTemplateColumns: `repeat(${row.length}, minmax(0, 1fr))` }}>
            {row.split('').map((key) => (
              <button key={key} type="button" onPointerDown={preventBlur} onClick={() => press(key)} className={keyClass}>
                {key}
              </button>
            ))}
          </div>
        ))}
      </div>
      <div className="mt-2 grid grid-cols-[1fr_2fr_1fr_1fr] gap-1.5">
        <button type="button" onPointerDown={preventBlur} onClick={() => onChange(value.slice(0, -1))} className={keyClass} title="Backspace"><LuDelete className="mx-auto size-4" /></button>
        <button type="button" onPointerDown={preventBlur} onClick={() => press(' ')} className={keyClass} disabled={mode === 'number'}>Space</button>
        <button type="button" onPointerDown={preventBlur} onClick={() => onChange('')} className={keyClass}>Clear</button>
        <button type="button" onPointerDown={preventBlur} onClick={onClose} className="rounded-sm bg-primary px-3 py-2 text-sm font-bold uppercase text-primary-foreground shadow-sm active:scale-[0.98]">Done</button>
      </div>
    </div>
  )
}

type TouchInputProps = Omit<InputHTMLAttributes<HTMLInputElement>, 'value' | 'onChange'> & {
  value: string
  onValueChange: (value: string) => void
  keyboardMode?: KeyboardMode
  touchKeyboardEnabled?: boolean
}

export function TouchInput({ value, onValueChange, keyboardMode = 'text', touchKeyboardEnabled, onFocus, ...props }: TouchInputProps) {
  const [open, setOpen] = useState(false)
  const enabled = touchKeyboardEnabled ?? readPosTouchKeyboardSetting()
  return (
    <span className="relative block">
      <input
        {...props}
        value={value}
        inputMode={props.inputMode ?? (keyboardMode === 'number' ? 'decimal' : undefined)}
        onFocus={(event) => { onFocus?.(event); if (enabled) setOpen(true) }}
        onChange={(event) => onValueChange(event.target.value)}
      />
      {enabled && open && <TouchKeyboard value={value} onChange={onValueChange} onClose={() => setOpen(false)} mode={keyboardMode} />}
    </span>
  )
}

type TouchTextareaProps = Omit<TextareaHTMLAttributes<HTMLTextAreaElement>, 'value' | 'onChange'> & {
  value: string
  onValueChange: (value: string) => void
  keyboardMode?: KeyboardMode
  touchKeyboardEnabled?: boolean
}

export function TouchTextarea({ value, onValueChange, keyboardMode = 'text', touchKeyboardEnabled, onFocus, ...props }: TouchTextareaProps) {
  const [open, setOpen] = useState(false)
  const enabled = touchKeyboardEnabled ?? readPosTouchKeyboardSetting()
  return (
    <span className="relative block">
      <textarea
        {...props}
        value={value}
        onFocus={(event) => { onFocus?.(event); if (enabled) setOpen(true) }}
        onChange={(event) => onValueChange(event.target.value)}
      />
      {enabled && open && <TouchKeyboard value={value} onChange={onValueChange} onClose={() => setOpen(false)} mode={keyboardMode} />}
    </span>
  )
}
