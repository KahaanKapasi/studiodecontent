import type { StudioStatus } from '../../types'

export const ACTIVE_STATUSES: readonly StudioStatus[] = ['queued', 'planning', 'rendering']
export const isActiveStatus = (s: StudioStatus) => ACTIVE_STATUSES.includes(s)

export const STATUS_STYLE: Record<StudioStatus, string> = {
  queued: 'bg-accent/10 text-accent',
  planning: 'bg-accent/10 text-accent',
  rendering: 'bg-accent/10 text-accent',
  awaiting_approval: 'bg-accent text-accent-fg',
  succeeded: 'bg-success/10 text-success',
  failed: 'bg-danger/10 text-danger',
}

export const STATUS_LABEL: Record<StudioStatus, string> = {
  queued: 'Queued',
  planning: 'Planning',
  rendering: 'Rendering',
  awaiting_approval: 'Needs review',
  succeeded: 'Ready',
  failed: 'Failed',
}

