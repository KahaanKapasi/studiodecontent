import type { StudioStatus } from '../../types'
import { isActiveStatus, STATUS_LABEL, STATUS_STYLE } from './status'

export function StatusPill({ status }: { status: StudioStatus }) {
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-medium ${STATUS_STYLE[status]}`}
    >
      {isActiveStatus(status) && <span className="video-pulse h-1.5 w-1.5 rounded-full bg-current" />}
      {STATUS_LABEL[status]}
    </span>
  )
}
