import { useSyncExternalStore } from 'react'

/** Discovery workspaces: which sources and focus a scrape uses (see backend scraping/workspaces.py). */
export type WorkspaceId = 'madridonomy' | 'footonomy' | 'general'

export const WORKSPACES: { id: WorkspaceId; label: string; hint: string }[] = [
  { id: 'madridonomy', label: 'Madridonomy', hint: 'Real Madrid only' },
  { id: 'footonomy', label: 'Footonomy', hint: 'Football-wide' },
  { id: 'general', label: 'General', hint: 'Everything, ungated' },
]

const KEY = 'contentstudio.workspace'

function read(): WorkspaceId {
  try {
    const saved = localStorage.getItem(KEY)
    if (WORKSPACES.some((w) => w.id === saved)) return saved as WorkspaceId
  } catch {
    // storage can be blocked (private window); fall through to the default
  }
  return 'footonomy'
}

let current: WorkspaceId = read()
const listeners = new Set<() => void>()

export const getWorkspace = () => current

export function setWorkspace(id: WorkspaceId) {
  if (id === current) return
  current = id
  try {
    localStorage.setItem(KEY, id)
  } catch {
    // not persisted; still applies for this session
  }
  listeners.forEach((l) => l())
}

/** The active workspace. Every page that starts from a Discovery topic follows it. */
export function useWorkspace(): [WorkspaceId, (id: WorkspaceId) => void] {
  const ws = useSyncExternalStore(
    (cb) => {
      listeners.add(cb)
      return () => listeners.delete(cb)
    },
    getWorkspace,
  )
  return [ws, setWorkspace]
}
