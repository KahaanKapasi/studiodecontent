import CostedButton from '../cost/CostedButton'
import { usdRange } from '../cost/format'
import { useState } from 'react'
import { studioApi } from '../../api/client'
import type { StudioEngineInfo, StudioProject } from '../../types'
import { formatElapsed, formatUsd, formatWhen, parseServerDate, ratioValue } from '../video/format'
import { useNow, useSeen } from '../video/hooks'
import { useVideoBlob } from '../video/useVideoBlob'
import ReviewPanel from './ReviewPanel'
import { isActiveStatus } from './status'
import { StatusPill } from './StatusPill'

export type ProjectAction = 'approve' | 'replan' | 'retry' | 'delete'

export interface ProjectActions {
  run: (action: ProjectAction, id: number) => void
  /** Which action is currently running for this project, if any. */
  pending: ProjectAction | null
  error?: string
}

function Chip({ children }: { children: string }) {
  return <span className="rounded-full bg-surface-2 px-2.5 py-0.5 text-xs font-medium text-muted">{children}</span>
}

const primaryBtn =
  'min-h-10 rounded-md bg-accent px-4 py-2 text-sm font-medium text-accent-fg hover:bg-accent-hover disabled:opacity-50'
const secondaryBtn =
  'min-h-10 rounded-md border border-line-strong px-4 py-2 text-sm font-medium text-ink hover:bg-surface-2 disabled:opacity-50'

function ProgressBar({ progress }: { progress: number }) {
  const determinate = progress > 0
  return (
    <div
      role="progressbar"
      aria-label="Progress"
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={determinate ? Math.round(progress) : undefined}
      className="relative h-1.5 w-full overflow-hidden rounded-full bg-line"
    >
      {determinate ? (
        <div
          className="h-full rounded-full bg-accent transition-[width] duration-700 ease-out motion-reduce:transition-none"
          style={{ width: `${Math.min(100, Math.max(2, progress))}%` }}
        />
      ) : (
        <div className="video-indeterminate h-full w-1/3 rounded-full bg-accent" />
      )}
    </div>
  )
}

function Player({ project, seen }: { project: StudioProject; seen: boolean }) {
  const aspect = typeof project.params.aspect === 'string' ? project.params.aspect : '9:16'
  const ratio = ratioValue(aspect)
  const blob = useVideoBlob(project, seen, {
    fetchBlob: studioApi.fileBlob,
    filename: `madridonomy-${project.engine}-${project.id}.mp4`,
  })
  const [downloading, setDownloading] = useState(false)
  const [downloadError, setDownloadError] = useState<string | null>(null)

  async function onDownload() {
    setDownloading(true)
    setDownloadError(null)
    try {
      await blob.download()
    } catch (e) {
      setDownloadError(e instanceof Error ? e.message : 'Download failed')
    } finally {
      setDownloading(false)
    }
  }

  return (
    <>
      <div
        style={{ aspectRatio: String(ratio) }}
        className={`relative mx-auto w-full overflow-hidden rounded-md bg-surface-2 ${ratio < 1 ? 'max-w-[260px]' : ''}`}
      >
        {blob.src ? (
          <video
            src={blob.src}
            controls
            playsInline
            preload="metadata"
            onError={blob.onDirectError}
            className="h-full w-full bg-black object-contain"
          />
        ) : (
          <div className="flex h-full items-center justify-center px-4 text-center text-xs text-faint">
            {blob.unavailable ? (
              'The video file is no longer available.'
            ) : blob.error ? (
              <span className="space-y-2">
                <span className="block text-danger">{blob.error}</span>
                <button type="button" onClick={blob.retryLoad} className={`${secondaryBtn} px-3 py-1.5`}>
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
        <button type="button" onClick={onDownload} disabled={downloading || blob.unavailable} className={primaryBtn}>
          {downloading ? 'Preparing…' : 'Download'}
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

export default function ProjectCard({
  project,
  engines,
  actions,
}: {
  project: StudioProject
  engines: StudioEngineInfo[] | undefined
  actions: ProjectActions
}) {
  const active = isActiveStatus(project.status)
  const now = useNow(active)
  const { ref, seen } = useSeen<HTMLElement>()
  const [confirmDelete, setConfirmDelete] = useState(false)

  const engine = engines?.find((e) => e.id === project.engine)
  const recipe = engine?.recipes.find((r) => r.id === project.recipe)
  const chip =
    engine && recipe && engine.recipes.length > 1
      ? `${engine.label} · ${recipe.label}`
      : (engine?.label ?? [project.engine, project.recipe].filter(Boolean).join(' · '))

  const created = parseServerDate(project.created_at)
  let elapsed: string | null = null
  if (active) elapsed = `${formatElapsed(now - created)} elapsed`
  else if (project.status === 'succeeded' && project.completed_at)
    elapsed = `took ${formatElapsed(parseServerDate(project.completed_at) - created)}`

  const { pending, run } = actions
  const busy = pending !== null
  const review = project.status === 'awaiting_approval'

  return (
    <article
      ref={ref}
      className={`space-y-3 rounded-lg border bg-surface p-4 ${review ? 'border-accent/40' : 'border-line'}`}
    >
      <header className="flex flex-wrap items-center gap-x-3 gap-y-1.5">
        <StatusPill status={project.status} />
        <Chip>{chip}</Chip>
        {elapsed && <span className="text-xs tabular-nums text-faint">{elapsed}</span>}
        <span className="ml-auto text-xs text-faint">{formatWhen(project.created_at)}</span>
      </header>

      <h3 className="break-words text-sm font-semibold leading-snug text-ink">{project.title}</h3>

      {active && (
        <div className="space-y-1.5">
          <div className="flex items-baseline justify-between gap-3 text-xs">
            <span className="min-w-0 truncate text-muted first-letter:uppercase">
              {project.stage || (project.status === 'queued' ? 'Waiting in the queue…' : 'Working…')}
            </span>
            {project.progress > 0 && (
              <span className="tabular-nums text-faint">{Math.round(project.progress)}%</span>
            )}
          </div>
          <ProgressBar progress={project.progress} />
        </div>
      )}

      {review && <ReviewPanel project={project} />}

      {project.status === 'succeeded' && <Player project={project} seen={seen} />}

      {project.status === 'failed' && (
        <div role="alert" className="rounded-md border border-danger/30 bg-danger/5 px-3 py-2 text-sm text-danger">
          {project.error || 'The project failed.'}
          {project.stage && <span className="mt-0.5 block text-xs opacity-80">At stage: {project.stage}</span>}
        </div>
      )}

      <div className="flex flex-wrap items-center gap-2 border-t border-line pt-3">
        {review && (
          <>
            <CostedButton
              action="studio.project"
              params={{
                engine: project.engine,
                recipe: project.recipe,
                params: project.params,
                estimated_usd: project.estimated_cost_usd,
              }}
              onClick={() => run('approve', project.id)}
              disabled={busy}
              className={primaryBtn}
            >
              {pending === 'approve' ? 'Approving…' : 'Approve'}
            </CostedButton>
            <button type="button" onClick={() => run('replan', project.id)} disabled={busy} className={secondaryBtn}>
              {pending === 'replan' ? 'Re-planning…' : 'Re-plan'}
            </button>
          </>
        )}
        {project.status === 'failed' && (
          <button type="button" onClick={() => run('retry', project.id)} disabled={busy} className={primaryBtn}>
            {pending === 'retry' ? 'Retrying…' : 'Retry'}
          </button>
        )}

        {project.estimated_cost_usd !== null && !review && (
          <span className="text-xs font-medium tabular-nums text-muted">
            ≈{' '}
            {project.estimated_cost_low_usd != null && project.estimated_cost_high_usd != null
              ? usdRange(project.estimated_cost_low_usd, project.estimated_cost_high_usd)
              : formatUsd(project.estimated_cost_usd)}
          </span>
        )}

        <div className="ml-auto flex items-center gap-2">
          {confirmDelete ? (
            <>
              <span className="text-xs text-muted">Delete this project?</span>
              <button
                type="button"
                onClick={() => run('delete', project.id)}
                disabled={busy}
                className="min-h-10 rounded-md border border-danger/40 px-3 py-2 text-sm font-medium text-danger hover:bg-danger/5 disabled:opacity-50"
              >
                {pending === 'delete' ? 'Deleting…' : 'Yes, delete'}
              </button>
              <button type="button" onClick={() => setConfirmDelete(false)} disabled={busy} className={`${secondaryBtn} px-3`}>
                Keep
              </button>
            </>
          ) : (
            <button
              type="button"
              onClick={() => setConfirmDelete(true)}
              disabled={busy}
              className="min-h-10 rounded-md px-3 py-2 text-sm font-medium text-muted hover:bg-surface-2 hover:text-ink disabled:opacity-50"
            >
              Delete
            </button>
          )}
        </div>
      </div>

      {actions.error && (
        <p role="alert" className="text-xs text-danger">
          {actions.error}
        </p>
      )}
    </article>
  )
}
