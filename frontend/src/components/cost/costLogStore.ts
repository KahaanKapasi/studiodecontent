/** Tiny event bridge so any component (e.g. the Dashboard SpendCard) can open the global cost log drawer. */
const OPEN_EVENT = 'costlog:open'

export function openCostLog(): void {
  window.dispatchEvent(new Event(OPEN_EVENT))
}

export function onOpenCostLog(handler: () => void): () => void {
  window.addEventListener(OPEN_EVENT, handler)
  return () => window.removeEventListener(OPEN_EVENT, handler)
}
