import { useState, type InputHTMLAttributes, type PointerEvent, type TextareaHTMLAttributes } from 'react'
import { LuDelete, LuKeyboard } from 'react-icons/lu'
import { cn } from '@/lib/utils'

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

/** Shown only once the client has switched touch keyboards on for this
 * device — tapping it is what opens the on-screen keyboard. Focusing the
 * field never opens it on its own, so a device with a real keyboard never
 * sees a popup just from clicking in. */
function KeyboardToggleButton({ open, onToggle, align = 'middle' }: { open: boolean; onToggle: () => void; align?: 'middle' | 'top' }) {
  return (
    <button
      type="button"
      onPointerDown={(event) => event.preventDefault()}
      onClick={onToggle}
      title="Show on-screen keyboard"
      className={cn(
        'absolute right-1.5 rounded-sm p-1 text-muted-foreground hover:bg-muted',
        align === 'middle' ? 'top-1/2 -translate-y-1/2' : 'top-1.5',
        open && 'bg-muted text-foreground',
      )}
    >
      <LuKeyboard className="size-4" />
    </button>
  )
}

type TouchInputProps = Omit<InputHTMLAttributes<HTMLInputElement>, 'value' | 'onChange'> & {
  value: string
  onValueChange: (value: string) => void
  keyboardMode?: KeyboardMode
  touchKeyboardEnabled?: boolean
}

export function TouchInput({ value, onValueChange, keyboardMode = 'text', touchKeyboardEnabled, className, ...props }: TouchInputProps) {
  const [open, setOpen] = useState(false)
  const enabled = touchKeyboardEnabled ?? readPosTouchKeyboardSetting()
  return (
    <span className="relative block">
      <input
        {...props}
        value={value}
        inputMode={props.inputMode ?? (keyboardMode === 'number' ? 'decimal' : undefined)}
        onChange={(event) => onValueChange(event.target.value)}
        className={cn(className, enabled && 'pr-9')}
      />
      {enabled && <KeyboardToggleButton open={open} onToggle={() => setOpen((o) => !o)} align="middle" />}
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

export function TouchTextarea({ value, onValueChange, keyboardMode = 'text', touchKeyboardEnabled, className, ...props }: TouchTextareaProps) {
  const [open, setOpen] = useState(false)
  const enabled = touchKeyboardEnabled ?? readPosTouchKeyboardSetting()
  return (
    <span className="relative block">
      <textarea
        {...props}
        value={value}
        onChange={(event) => onValueChange(event.target.value)}
        className={cn(className, enabled && 'pr-9')}
      />
      {enabled && <KeyboardToggleButton open={open} onToggle={() => setOpen((o) => !o)} align="top" />}
      {enabled && open && <TouchKeyboard value={value} onChange={onValueChange} onClose={() => setOpen(false)} mode={keyboardMode} />}
    </span>
  )
}
