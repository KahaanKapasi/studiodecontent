import { studioApi } from '../../api/client'
import type { StudioPreview, StudioProject } from '../../types'
import { formatUsd } from '../video/format'
import { useAuthedBlobUrl } from './useAuthedBlobUrl'

function PreviewItem({ projectId, preview }: { projectId: number; preview: StudioPreview }) {
  const blob = useAuthedBlobUrl(() => studioApi.assetBlob(projectId, preview.name), [projectId, preview.name])
  return (
    <figure className={preview.kind === 'image' ? '' : 'col-span-full'}>
      {blob.url ? (
        preview.kind === 'image' ? (
          <img src={blob.url} alt={preview.label} className="aspect-square w-full rounded-md border border-line object-cover" />
        ) : preview.kind === 'audio' ? (
          <audio src={blob.url} controls preload="metadata" className="w-full" />
        ) : (
          <video src={blob.url} controls playsInline preload="metadata" className="max-h-64 w-full rounded-md bg-black" />
        )
      ) : (
        <div
          className={`flex items-center justify-center rounded-md bg-surface-2 px-2 text-center text-xs text-faint ${
            preview.kind === 'image' ? 'aspect-square' : 'h-12'
          }`}
        >
          {blob.error ? (
            <button type="button" onClick={blob.retry} className="underline-offset-2 hover:underline">
              Couldn't load · retry
            </button>
          ) : (
            'Loading…'
          )}
        </div>
      )}
      <figcaption className="mt-1 truncate text-xs text-faint">{preview.label}</figcaption>
    </figure>
  )
}

/** Plan review for a project that stopped at `awaiting_approval`. Read-only — no editing. */
export default function ReviewPanel({ project }: { project: StudioProject }) {
  const plan = project.plan

  if (!plan) {
    return <p className="text-sm text-muted">The plan isn't available. Re-plan to generate it again.</p>
  }

  return (
    <div className="space-y-4 rounded-lg border border-accent/40 bg-accent/5 p-3.5">
      <div>
        <p className="text-xs font-semibold uppercase tracking-wide text-faint">Review plan</p>
        <p className="mt-1 whitespace-pre-wrap text-sm leading-relaxed text-ink">{plan.summary}</p>
      </div>

      {plan.script && (
        <details className="rounded-md border border-line bg-surface px-3"
        >
          <summary className="min-h-10 cursor-pointer py-2.5 text-sm font-medium text-ink">Script</summary>
          <p className="whitespace-pre-wrap pb-3 text-sm leading-relaxed text-muted">{plan.script}</p>
        </details>
      )}

      {plan.scenes && plan.scenes.length > 0 && (
        <div>
          <p className="mb-2 text-sm font-medium text-ink">
            Scenes <span className="font-normal text-faint">({plan.scenes.length})</span>
          </p>
          <ol className="space-y-2">
            {plan.scenes.map((s) => (
              <li key={s.index} className="flex gap-3 rounded-md border border-line bg-surface p-3">
                <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-surface-2 text-xs font-semibold tabular-nums text-muted">
                  {s.index}
                </span>
                <div className="min-w-0 flex-1 space-y-1">
                  <p className="text-sm text-ink">{s.text}</p>
                  {s.visual && <p className="text-xs leading-relaxed text-muted">{s.visual}</p>}
                </div>
                <span className="shrink-0 text-xs tabular-nums text-faint">{s.duration_s}s</span>
              </li>
            ))}
          </ol>
        </div>
      )}

      {plan.notes && (
        <div>
          <p className="text-sm font-medium text-ink">Notes</p>
          <p className="mt-1 whitespace-pre-wrap text-sm leading-relaxed text-muted">{plan.notes}</p>
        </div>
      )}

      {project.previews.length > 0 && (
        <div>
          <p className="mb-2 text-sm font-medium text-ink">Previews</p>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
            {project.previews.map((p) => (
              <PreviewItem key={p.name} projectId={project.id} preview={p} />
            ))}
          </div>
        </div>
      )}

      <p className="text-sm text-muted">
        Estimated cost{' '}
        <span className="font-semibold tabular-nums text-ink">
          {project.estimated_cost_usd !== null ? `≈ ${formatUsd(project.estimated_cost_usd)}` : 'unknown'}
        </span>
        . Nothing expensive runs until you approve.
      </p>
    </div>
  )
}
