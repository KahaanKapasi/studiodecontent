import { useState } from 'react'
import type { GenerationStatus, VideoGeneration } from '../../types'
import {
  formatElapsed,
  formatUsd,
  formatWhen,
  isPending,
  isPendingStatus,
  parseServerDate,
  ratioValue,
  truncate,
} from './format'
import { useNow, useSeen } from './hooks'
import InstagramPublish from './InstagramPublish'
import { useVideoBlob } from './useVideoBlob'

const STATUS_STYLE: Record<GenerationStatus, string> = {
  queued: 'bg-accent/10 text-accent',
  running: 'bg-accent/10 text-accent',
  succeeded: 'bg-success/10 text-success',
  failed: 'bg-danger/10 text-danger',
}

const STATUS_LABEL: Record<GenerationStatus, string> = {
  queued: 'Queued',
  running: 'Generating',
  succeeded: 'Ready',
  failed: 'Failed',
}

function StatusPill({ status }: { status: GenerationStatus }) {
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-medium ${STATUS_STYLE[status]}`}
    >
      {isPendingStatus(status) && <span className="h-1.5 w-1.5 rounded-full bg-current video-pulse" />}
      {STATUS_LABEL[status]}
    </span>
  )
}

function Chip({ children }: { children: string }) {
  return (
    <span className="rounded-full bg-surface-2 px-2.5 py-0.5 text-xs font-medium text-muted">{children}</span>
  )
}

interface GenerationCardProps {
  gen: VideoGeneration
  onRetry: (id: number) => void
  onDelete: (id: number) => void
  retrying: boolean
  deleting: boolean
  actionError?: string
}

export default function GenerationCard({
  gen,
  onRetry,
  onDelete,
  retrying,
  deleting,
  actionError,
}: GenerationCardProps) {
  const pending = isPending(gen)
  const now = useNow(pending)
  const { ref, seen } = useSeen()
  const blob = useVideoBlob(gen, seen)
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [downloading, setDownloading] = useState(false)
  const [downloadError, setDownloadError] = useState<string | null>(null)

  const ratio = ratioValue(gen.aspect_ratio)
  const portrait = ratio < 1
  const boxStyle = { aspectRatio: String(ratio) }
  const boxClass = `relative mx-auto w-full overflow-hidden rounded-md bg-surface-2 ${
    portrait ? 'max-w-[240px]' : ''
  }`

  const created = parseServerDate(gen.created_at)
  const elapsed = pending
    ? formatElapsed(now - created)
    : gen.completed_at
      ? formatElapsed(parseServerDate(gen.completed_at) - created)
      : null

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
    <article ref={ref} className="space-y-3 rounded-lg border border-line bg-surface p-4">
      <header className="flex flex-wrap items-center gap-x-3 gap-y-1">
        <StatusPill status={gen.status} />
        {elapsed && (
          <span className="text-xs tabular-nums text-faint">
            {pending ? `${elapsed} elapsed` : gen.status === 'succeeded' ? `took ${elapsed}` : ''}
          </span>
        )}
        <span className="ml-auto text-xs text-faint">{formatWhen(gen.created_at)}</span>
      </header>

      {/* Media area */}
      {pending && (
        <div style={boxStyle} className={`${boxClass} flex items-center justify-center`}>
          <div className="px-6 text-center">
            <p className="text-sm font-medium text-ink">
              {gen.status === 'queued' ? 'Waiting in the queue…' : 'Rendering your video…'}
            </p>
            <p className="mt-1 text-xs text-faint">This usually takes a few minutes. You can leave this page.</p>
          </div>
          <div className="absolute inset-x-0 bottom-0 h-1 overflow-hidden bg-line" aria-hidden>
            <div className="video-indeterminate h-full w-1/3 rounded-full bg-accent" />
          </div>
        </div>
      )}

      {gen.status === 'succeeded' && (
        <div style={boxStyle} className={boxClass}>
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
                  <button
                    type="button"
                    onClick={blob.retryLoad}
                    className="min-h-9 rounded-md border border-line-strong px-3 py-1.5 font-medium text-ink hover:bg-surface"
                  >
                    Try again
                  </button>
                </span>
              ) : (
                'Loading video…'
              )}
            </div>
          )}
        </div>
      )}

      {gen.status === 'succeeded' && (
        <InstagramPublish
          kind="generation"
          id={gen.id}
          defaultCaption={gen.original_idea || truncate(gen.prompt, 180)}
          initial={gen}
        />
      )}

      {gen.status === 'failed' && (
        <div role="alert" className="rounded-md border border-danger/30 bg-danger/5 px-3 py-2 text-sm text-danger">
          {gen.error || 'The generation failed.'}
        </div>
      )}

      {/* Details */}
      <p className="text-sm leading-relaxed text-ink">{truncate(gen.prompt, 180)}</p>

      <div className="flex flex-wrap items-center gap-1.5">
        <Chip>{gen.provider === 'veo' ? 'Veo' : gen.provider === 'higgsfield' ? 'Higgsfield' : gen.provider}</Chip>
        <Chip>{gen.model}</Chip>
        <Chip>{gen.aspect_ratio}</Chip>
        <Chip>{`${gen.duration_seconds}s`}</Chip>
        <Chip>{gen.resolution}</Chip>
        {gen.estimated_cost_usd !== null && (
          <span className="ml-auto text-xs font-medium tabular-nums text-muted">
            ≈ {formatUsd(gen.estimated_cost_usd)}
          </span>
        )}
      </div>

      {/* Actions */}
      <div className="flex flex-wrap items-center gap-2 border-t border-line pt-3">
        {gen.status === 'succeeded' && (
          <button
            type="button"
            onClick={onDownload}
            disabled={downloading || blob.unavailable}
            className="min-h-10 rounded-md bg-accent px-4 py-2 text-sm font-medium text-accent-fg hover:bg-accent-hover disabled:opacity-50"
          >
            {downloading ? 'Preparing…' : 'Download'}
          </button>
        )}
        {gen.status === 'failed' && (
          <button
            type="button"
            onClick={() => onRetry(gen.id)}
            disabled={retrying}
            className="min-h-10 rounded-md bg-accent px-4 py-2 text-sm font-medium text-accent-fg hover:bg-accent-hover disabled:opacity-50"
          >
            {retrying ? 'Retrying…' : 'Retry'}
          </button>
        )}

        <div className="ml-auto flex items-center gap-2">
          {confirmDelete ? (
            <>
              <span className="text-xs text-muted">Delete this video?</span>
              <button
                type="button"
                onClick={() => onDelete(gen.id)}
                disabled={deleting}
                className="min-h-10 rounded-md border border-danger/40 px-3 py-2 text-sm font-medium text-danger hover:bg-danger/5 disabled:opacity-50"
              >
                {deleting ? 'Deleting…' : 'Yes, delete'}
              </button>
              <button
                type="button"
                onClick={() => setConfirmDelete(false)}
                disabled={deleting}
                className="min-h-10 rounded-md border border-line-strong px-3 py-2 text-sm font-medium text-ink hover:bg-surface-2"
              >
                Keep
              </button>
            </>
          ) : (
            <button
              type="button"
              onClick={() => setConfirmDelete(true)}
              className="min-h-10 rounded-md px-3 py-2 text-sm font-medium text-muted hover:bg-surface-2 hover:text-ink"
            >
              Delete
            </button>
          )}
        </div>
      </div>

      {(actionError || downloadError) && (
        <p role="alert" className="text-xs text-danger">
          {actionError || downloadError}
        </p>
      )}
    </article>
  )
}
