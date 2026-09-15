export type ThemeMode = 'light' | 'dark'
export type AccentName = 'blue' | 'graphite' | 'green' | 'purple' | 'orange' | 'pink'

export const ACCENTS: { name: AccentName; label: string; swatch: string }[] = [
  { name: 'blue', label: 'Blue', swatch: '#0071e3' },
  { name: 'graphite', label: 'Graphite', swatch: '#1d1d1f' },
  { name: 'green', label: 'Green', swatch: '#34c759' },
  { name: 'purple', label: 'Purple', swatch: '#af52de' },
  { name: 'orange', label: 'Orange', swatch: '#ff9500' },
  { name: 'pink', label: 'Pink', swatch: '#ff375f' },
]

const THEME_KEY = 'contentstudio.theme'
const ACCENT_KEY = 'contentstudio.accent'

function systemPrefersDark(): boolean {
  return window.matchMedia('(prefers-color-scheme: dark)').matches
}

export function getStoredTheme(): ThemeMode {
  const stored = localStorage.getItem(THEME_KEY)
  if (stored === 'light' || stored === 'dark') return stored
  return systemPrefersDark() ? 'dark' : 'light'
}

export function getStoredAccent(): AccentName {
  const stored = localStorage.getItem(ACCENT_KEY)
  if (ACCENTS.some((a) => a.name === stored)) return stored as AccentName
  return 'blue'
}

export function applyTheme(theme: ThemeMode) {
  document.documentElement.dataset.theme = theme
  localStorage.setItem(THEME_KEY, theme)
}

export function applyAccent(accent: AccentName) {
  document.documentElement.dataset.accent = accent
  localStorage.setItem(ACCENT_KEY, accent)
}

/** Call once at app startup, before React renders, to avoid a flash of the wrong theme. */
export function initTheme() {
  applyTheme(getStoredTheme())
  applyAccent(getStoredAccent())
}
