import { useEffect, useRef, useState } from 'react'
import { useMutation, useQueries, useQuery, useQueryClient } from '@tanstack/react-query'
import { studioApi } from '../../api/client'
import type { StudioEngineInfo, StudioProject } from '../../types'
import { PROJECTS_KEY, projectKey } from './keys'
import ProjectCard, { type ProjectAction } from './ProjectCard'
import { isActiveStatus } from './status'

const POLL_MS = 4000

function errText(e: unknown, fallback: string) {
  return e instanceof Error ? e.message : fallback
}

export default function ProjectList({ engines }: { engines: StudioEngineInfo[] | undefined }) {
  const queryClient = useQueryClient()
  const [errors, setErrors] = useState<Record<number, string>>({})
  const [pending, setPending] = useState<Record<number, ProjectAction>>({})

  const listQuery = useQuery({
    queryKey: PROJECTS_KEY,
    queryFn: () => studioApi.listProjects(),
  })
  const items = listQuery.data

  // Poll only projects that are queued / planning / rendering. awaiting_approval and terminal
  // statuses drop out of `activeIds`, which unmounts their query (gcTime 0 -> no stale cache that
  // could overwrite a fresh status after approve/retry). react-query does not refetch intervals
  // while the tab is hidden (refetchIntervalInBackground: false).
  const activeIds = (items ?? []).filter((p) => isActiveStatus(p.status)).map((p) => p.id)
  const polls = useQueries({
    queries: activeIds.map((id) => ({
      queryKey: projectKey(id),
      queryFn: () => studioApi.getProject(id),
      refetchInterval: POLL_MS,
      refetchIntervalInBackground: false,
      staleTime: 0,
      gcTime: 0,
    })),
  })

  const merged = useRef('')
  useEffect(() => {
    const fresh = polls.map((p) => p.data).filter((d): d is StudioProject => !!d)
    const sig = fresh
      .map((p) => `${p.id}:${p.status}:${p.stage}:${p.progress}:${p.has_file}:${p.video_url ?? ''}:${p.error ?? ''}:${p.estimated_cost_usd ?? ''}`)
      .join('|')
    if (!sig || sig === merged.current) return
    merged.current = sig
    queryClient.setQueryData<StudioProject[]>(PROJECTS_KEY, (old) =>
      old?.map((p) => fresh.find((f) => f.id === p.id) ?? p),
    )
  }, [polls, queryClient])

  const setError = (id: number, msg: string | null) =>
    setErrors((prev) => {
      const next = { ...prev }
      if (msg) next[id] = msg
      else delete next[id]
      return next
    })

  function replaceInList(updated: StudioProject) {
    queryClient.removeQueries({ queryKey: projectKey(updated.id) })
    merged.current = ''
    queryClient.setQueryData<StudioProject[]>(PROJECTS_KEY, (old) =>
      old?.map((p) => (p.id === updated.id ? updated : p)),
    )
  }

  const mutation = useMutation({
    mutationFn: async ({ action, id }: { action: ProjectAction; id: number }) => {
      if (action === 'delete') {
        await studioApi.deleteProject(id)
        return null
      }
      return studioApi[action](id)
    },
    onMutate: ({ id, action }) => {
      setError(id, null)
      setPending((p) => ({ ...p, [id]: action }))
    },
    onSuccess: (result, { id }) => {
      if (result) replaceInList(result)
      else {
        queryClient.removeQueries({ queryKey: projectKey(id) })
        queryClient.setQueryData<StudioProject[]>(PROJECTS_KEY, (old) => old?.filter((p) => p.id !== id))
      }
    },
    onError: (e, { id, action }) => {
      setError(id, errText(e, `Could not ${action === 'replan' ? 're-plan' : action}.`))
      // A 409 means the state moved on — pick up the real status.
      queryClient.invalidateQueries({ queryKey: PROJECTS_KEY })
    },
    onSettled: (_r, _e, { id }) =>
      setPending((p) => {
        const next = { ...p }
        delete next[id]
        return next
      }),
  })

  return (
    <section aria-labelledby="studio-projects-heading" className="space-y-4">
      <div className="flex items-baseline justify-between gap-3">
        <h2 id="studio-projects-heading" className="text-sm font-semibold uppercase tracking-wide text-faint">
          Projects
        </h2>
        {items && items.length > 0 && (
          <span className="text-xs text-faint">
            {items.length} project{items.length === 1 ? '' : 's'}
          </span>
        )}
      </div>

      {listQuery.isLoading && (
        <div className="rounded-lg border border-line bg-surface p-6 text-sm text-faint">Loading your projects…</div>
      )}

      {listQuery.isError && (
        <div role="alert" className="space-y-3 rounded-lg border border-line bg-surface p-6 text-sm">
          <p className="text-danger">{errText(listQuery.error, 'Could not load your projects.')}</p>
          <button
            type="button"
            onClick={() => listQuery.refetch()}
            className="min-h-10 rounded-md border border-line-strong px-4 py-2 font-medium text-ink hover:bg-surface-2"
          >
            Try again
          </button>
        </div>
      )}

      {items && items.length === 0 && (
        <div className="rounded-lg border border-dashed border-line-strong bg-surface p-8 text-center">
          <p className="text-sm font-medium text-ink">No projects yet</p>
          <p className="mt-1 text-sm text-faint">Pick a recipe and start one — it will show up here with live progress.</p>
        </div>
      )}

      {items && items.length > 0 && (
        <ul className="space-y-4">
          {items.map((project) => (
            <li key={project.id}>
              <ProjectCard
                project={project}
                engines={engines}
                actions={{
                  pending: pending[project.id] ?? null,
                  error: errors[project.id],
                  run: (action, id) => mutation.mutate({ action, id }),
                }}
              />
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}
