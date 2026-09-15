import { useEffect, useRef, useState } from 'react'
import { ACCENTS, applyAccent, applyTheme, getStoredAccent, getStoredTheme, type ThemeMode } from '../theme'

function SunIcon() {
  return (
    <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="1.8">
      <circle cx="12" cy="12" r="4" />
      <path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" />
    </svg>
  )
}

function MoonIcon() {
  return (
    <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="1.8">
      <path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8Z" />
    </svg>
  )
}

export default function ThemeSwitcher() {
  const [theme, setTheme] = useState<ThemeMode>(getStoredTheme)
  const [accent, setAccent] = useState(getStoredAccent)
  const [open, setOpen] = useState(false)
  const popoverRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (popoverRef.current && !popoverRef.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  function toggleTheme() {
    const next = theme === 'dark' ? 'light' : 'dark'
    setTheme(next)
    applyTheme(next)
  }

  function pickAccent(name: typeof accent) {
    setAccent(name)
    applyAccent(name)
  }

  return (
    <div className="relative" ref={popoverRef}>
      {open && (
        <div className="absolute bottom-full left-0 mb-2 w-48 rounded-lg border border-line bg-surface p-3 shadow-lg">
          <div className="mb-2 text-xs font-medium text-muted">Accent</div>
          <div className="flex flex-wrap gap-2">
            {ACCENTS.map((a) => (
              <button
                key={a.name}
                onClick={() => pickAccent(a.name)}
                title={a.label}
                className={`h-6 w-6 rounded-full border border-line-strong ring-offset-2 ring-offset-surface transition-shadow ${
                  accent === a.name ? 'ring-2 ring-ink' : ''
                }`}
                style={{ backgroundColor: a.swatch }}
              />
            ))}
          </div>
        </div>
      )}
      <div className="flex items-center gap-1 rounded-lg border border-line bg-surface p-1">
        <button
          onClick={toggleTheme}
          className="flex flex-1 items-center justify-center gap-1.5 rounded-md px-2 py-1.5 text-xs text-muted transition-colors hover:bg-surface-2 hover:text-ink"
        >
          {theme === 'dark' ? <MoonIcon /> : <SunIcon />}
          {theme === 'dark' ? 'Dark' : 'Light'}
        </button>
        <button
          onClick={() => setOpen((v) => !v)}
          title="Accent color"
          className="h-6 w-6 shrink-0 rounded-full border border-line-strong"
          style={{ backgroundColor: ACCENTS.find((a) => a.name === accent)?.swatch }}
        />
      </div>
    </div>
  )
}
