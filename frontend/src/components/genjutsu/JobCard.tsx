import { useState } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { genjutsuApi, isActiveJob, type GenjutsuJob, type GenjutsuStatus } from '../../api/genjutsu'
import CostedButton from '../cost/CostedButton'
import { formatElapsed, formatUsd, formatWhen, parseServerDate } from '../video/format'
import { useNow, useSeen } from '../video/hooks'
import { useVideoBlob } from '../video/useVideoBlob'

const STATUS: Record<GenjutsuStatus, { label: string; style: string }> = {
  queued: { label: 'Queued', style: 'bg-accent/10 text-accent' },
  running: { label: 'Generating', style: 'bg-accent/10 text-accent' },
  succeeded: { label: 'Ready', style: 'bg-success/10 text-success' },
  failed: { label: 'Failed', style: 'bg-danger/10 text-danger' },
  moderated: { label: 'Blocked', style: 'bg-danger/10 text-danger' },
  canceled: { label: 'Canceled', style: 'bg-surface-2 text-muted' },
}

const primaryBtn = 'min-h-10 rounded-md bg-accent px-4 py-2 text-sm font-medium text-accent-fg hover:bg-accent-hover disabled:opacity-50'
const secondaryBtn = 'min-h-10 rounded-md border border-line-strong px-4 py-2 text-sm font-medium text-ink hover:bg-surface-2 disabled:opacity-50'

function Chip({ children }: { children: string }) {
  return <span className="rounded-full bg-surface-2 px-2.5 py-0.5 text-xs font-medium text-muted">{children}</span>
}

function Player({ job, seen }: { job: GenjutsuJob; seen: boolean }) {
  const blob = useVideoBlob(job, seen, { fetchBlob: genjutsuApi.fileBlob, filename: `genjutsu-${job.id}.mp4` })
  const [downloadError, setDownloadError] = useState<string | null>(null)
  return (
    <>
      <div className="overflow-hidden rounded-md bg-black">
        {blob.src ? (
          <video src={blob.src} controls playsInline preload="metadata" onError={blob.onDirectError} className="mx-auto max-h-[70vh] w-full object-contain" />
        ) : (
          <div className="flex min-h-40 items-center justify-center px-4 text-center text-xs text-faint">
            {blob.unavailable ? (
              'The video file is no longer available.'
            ) : blob.error ? (
              <span className="space-y-2">
                <span className="block text-danger">{blob.error}</span>
                <button type="button" onClick={blob.retryLoad} className={secondaryBtn}>
                  Try again
                </button>
              </span>
            ) : (
              'Loading video…'
            )}
          </div>
        )}
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          disabled={blob.unavailable}
          onClick={() => blob.download().catch((e: unknown) => setDownloadError(e instanceof Error ? e.message : 'Download failed'))}
          className={primaryBtn}
        >
          Download
        </button>
        {downloadError && (
          <p role="alert" className="text-xs text-danger">
            {downloadError}
          </p>
        )}
      </div>
    </>
  )
}

export default function JobCard({ job }: { job: GenjutsuJob }) {
  const queryClient = useQueryClient()
  const active = isActiveJob(job)
  const now = useNow(active)
  const { ref, seen } = useSeen<HTMLElement>()
  const [confirmDelete, setConfirmDelete] = useState(false)
  const refresh = () => void queryClient.invalidateQueries({ queryKey: ['genjutsu'] })
  const cancel = useMutation({ mutationFn: () => genjutsuApi.cancel(job.id), onSuccess: refresh })
  const retry = useMutation({ mutationFn: () => genjutsuApi.retry(job.id, job.est_cost_usd ?? 0), onSuccess: refresh })
  const remove = useMutation({ mutationFn: () => genjutsuApi.remove(job.id), onSuccess: refresh })
  const status = STATUS[job.status]
  const error = cancel.error?.message ?? retry.error?.message ?? remove.error?.message

  return (
    <article ref={ref} className="space-y-3 rounded-lg border border-line bg-surface p-4">
      <div className="flex flex-wrap items-center gap-2">
        <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-medium ${status.style}`}>
          {active && <span className="video-pulse h-1.5 w-1.5 rounded-full bg-current" />}
          {status.label}
        </span>
        <Chip>{job.resolution}</Chip>
        {job.billed_seconds != null && <Chip>{`${job.billed_seconds} s`}</Chip>}
        {job.est_cost_usd != null && <Chip>{formatUsd(job.est_cost_usd)}</Chip>}
        <span className="ml-auto text-xs text-faint">{formatWhen(job.created_at)}</span>
      </div>
      <p className="truncate text-sm text-ink" title={job.video_name ?? undefined}>
        {job.video_name ?? 'Video'} <span className="text-muted">+ {job.image_count} photo{job.image_count === 1 ? '' : 's'}</span>
      </p>
      {job.prompt && <p className="line-clamp-2 text-xs text-muted">{job.prompt}</p>}

      {active && (
        <div className="space-y-2">
          <div role="progressbar" aria-label="Generating" className="relative h-1.5 w-full overflow-hidden rounded-full bg-line">
            <div className="video-indeterminate h-full w-1/3 rounded-full bg-accent" />
          </div>
          <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-muted">
            <span>Higgsfield is working on it · {formatElapsed(now - parseServerDate(job.created_at))} · usually a few minutes</span>
            <button type="button" className={`${secondaryBtn} min-h-9 px-3 py-1.5`} disabled={cancel.isPending} onClick={() => cancel.mutate()}>
              Cancel
            </button>
          </div>
        </div>
      )}

      {job.status === 'succeeded' && <Player job={job} seen={seen} />}

      {(job.status === 'failed' || job.status === 'moderated' || job.status === 'canceled') && job.error && (
        <p role="alert" className="text-sm text-danger">
          {job.error}
        </p>
      )}
      {job.status === 'moderated' && <p className="text-xs text-muted">Start a new job with different photos or a different source video.</p>}
      {(job.status === 'failed' || job.status === 'canceled') && (
        <CostedButton
          action="genjutsu.motion_transfer"
          params={{ duration_seconds: job.input_seconds ?? undefined, resolution: job.resolution }}
          onClick={() => retry.mutate()}
          disabled={retry.isPending}
          className={primaryBtn}
        >
          {retry.isPending ? 'Retrying…' : 'Retry with the same files'}
        </CostedButton>
      )}

      {error && (
        <p role="alert" className="text-xs text-danger">
          {error}
        </p>
      )}

      {!active && (
        <div className="flex justify-end">
          {confirmDelete ? (
            <span className="flex items-center gap-2 text-xs">
              <span className="text-muted">Delete this job and its files?</span>
              <button type="button" className="rounded-md bg-danger px-3 py-1.5 text-white" onClick={() => remove.mutate()}>
                Delete
              </button>
              <button type="button" className="rounded-md border border-line-strong px-3 py-1.5 text-ink" onClick={() => setConfirmDelete(false)}>
                Keep
              </button>
            </span>
          ) : (
            <button type="button" className="text-xs text-muted hover:text-danger" onClick={() => setConfirmDelete(true)}>
              Delete
            </button>
          )}
        </div>
      )}
    </article>
  )
}
