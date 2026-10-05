const KEY = 'contentstudio.access'
export const UNAUTHORIZED_EVENT = 'contentstudio:unauthorized'

export function getAccessPassword(): string {
  try {
    return localStorage.getItem(KEY) ?? ''
  } catch {
    return ''
  }
}

export function setAccessPassword(value: string) {
  try {
    if (value) localStorage.setItem(KEY, value)
    else localStorage.removeItem(KEY)
  } catch {
    // storage unavailable (private mode) — gate will just re-prompt
  }
}

export function authHeaders(): Record<string, string> {
  const pw = getAccessPassword()
  return pw ? { 'X-Access-Password': pw } : {}
}
