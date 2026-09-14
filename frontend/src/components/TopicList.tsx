import { useMutation, useQueryClient } from '@tanstack/react-query'
import { discoveryApi } from '../api/client'
import type { TopicCandidate } from '../types'
import Badge from './Badge'

function truncate(text: string, max = 90) {
  return text.length > max ? `${text.slice(0, max)}…` : text
}

interface TopicListProps {
  topics: TopicCandidate[]
  selectedId?: number
  onSelect?: (topic: TopicCandidate) => void
  variant?: 'table' | 'compact'
}

export default function TopicList({ topics, selectedId, onSelect, variant = 'table' }: TopicListProps) {
  const queryClient = useQueryClient()

  const statusMutation = useMutation({
    mutationFn: ({ id, status }: { id: number; status: string }) =>
      discoveryApi.updateTopicStatus(id, status),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['discovery', 'topics'] }),
  })

  if (topics.length === 0) {
    return <p className="py-8 text-center text-sm text-neutral-500">No topics found.</p>
  }

  if (variant === 'compact') {
    return (
      <ul className="space-y-2">
        {topics.map((topic) => (
          <li key={topic.id}>
            <button
              onClick={() => onSelect?.(topic)}
              className={`w-full rounded-lg border px-3 py-2 text-left transition-colors ${
                selectedId === topic.id
                  ? 'border-amber-500/50 bg-amber-500/5'
                  : 'border-neutral-800 bg-neutral-900 hover:border-neutral-700'
              }`}
            >
              <div className="text-sm font-medium text-neutral-100">{topic.title}</div>
              <div className="mt-1 text-xs text-neutral-500">{truncate(topic.rationale, 70)}</div>
              <div className="mt-2 flex gap-1.5">
                <Badge label={topic.suitable_for} />
                <Badge label={topic.status} />
              </div>
            </button>
          </li>
        ))}
      </ul>
    )
  }

  return (
    <table className="w-full border-collapse text-sm">
      <thead>
        <tr className="border-b border-neutral-800 text-left text-xs uppercase tracking-wide text-neutral-500">
          <th className="py-2 pr-4 font-medium">Title</th>
          <th className="py-2 pr-4 font-medium">Rationale</th>
          <th className="py-2 pr-4 font-medium">Suitable for</th>
          <th className="py-2 pr-4 font-medium">Status</th>
          <th className="py-2 pr-4 font-medium">Actions</th>
        </tr>
      </thead>
      <tbody>
        {topics.map((topic) => (
          <tr
            key={topic.id}
            onClick={() => onSelect?.(topic)}
            className={`cursor-pointer border-b border-neutral-900 transition-colors ${
              selectedId === topic.id ? 'bg-amber-500/5' : 'hover:bg-neutral-900'
            }`}
          >
            <td className="py-3 pr-4 font-medium text-neutral-100">{topic.title}</td>
            <td className="py-3 pr-4 text-neutral-400">{truncate(topic.rationale)}</td>
            <td className="py-3 pr-4">
              <Badge label={topic.suitable_for} />
            </td>
            <td className="py-3 pr-4">
              <Badge label={topic.status} />
            </td>
            <td className="py-3 pr-4">
              <div className="flex gap-2" onClick={(e) => e.stopPropagation()}>
                <button
                  onClick={() => statusMutation.mutate({ id: topic.id, status: 'selected' })}
                  disabled={statusMutation.isPending || topic.status === 'selected'}
                  className="text-xs font-medium text-amber-500 hover:text-amber-400 disabled:opacity-40"
                >
                  Select
                </button>
                <button
                  onClick={() => statusMutation.mutate({ id: topic.id, status: 'discarded' })}
                  disabled={statusMutation.isPending || topic.status === 'discarded'}
                  className="text-xs font-medium text-neutral-500 hover:text-neutral-300 disabled:opacity-40"
                >
                  Discard
                </button>
              </div>
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  )
}
