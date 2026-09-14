import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { discoveryApi } from '../api/client'
import TopicList from '../components/TopicList'
import type { SuitableFor, TopicCandidate, TopicStatus } from '../types'

export default function Discovery() {
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const [statusFilter, setStatusFilter] = useState<TopicStatus | 'all'>('all')
  const [suitableFilter, setSuitableFilter] = useState<SuitableFor | 'all'>('all')

  const { data: topics = [], isLoading, isError } = useQuery({
    queryKey: ['discovery', 'topics'],
    queryFn: () => discoveryApi.listTopics(),
  })

  const scrapeMutation = useMutation({
    mutationFn: discoveryApi.triggerScrape,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['discovery', 'topics'] }),
  })

  const filtered = useMemo(() => {
    return topics.filter((topic) => {
      if (statusFilter !== 'all' && topic.status !== statusFilter) return false
      if (suitableFilter !== 'all' && topic.suitable_for !== suitableFilter) return false
      return true
    })
  }, [topics, statusFilter, suitableFilter])

  function handleSelect(topic: TopicCandidate) {
    // TODO: cross-navigation param shape (e.g. /articles?topicId= vs /articles/:topicId)
    // depends on how the Articles screen ends up keying off topic_id once the backend
    // generation endpoint is finalized. For now just route toward the right pipeline.
    if (topic.suitable_for === 'article' || topic.suitable_for === 'both') {
      navigate('/articles', { state: { topicId: topic.id } })
    } else {
      navigate('/video', { state: { topicId: topic.id } })
    }
  }

  return (
    <div>
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold text-neutral-100">Discovery</h1>
          <p className="mt-1 text-sm text-neutral-500">Topic candidates surfaced from scraping.</p>
        </div>
        <button
          onClick={() => scrapeMutation.mutate()}
          disabled={scrapeMutation.isPending}
          className="rounded-md bg-amber-500 px-4 py-2 text-sm font-medium text-neutral-950 transition-colors hover:bg-amber-400 disabled:opacity-50"
        >
          {scrapeMutation.isPending ? 'Triggering…' : 'Trigger scrape now'}
        </button>
      </div>

      <div className="mb-4 flex gap-3">
        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value as TopicStatus | 'all')}
          className="rounded-md border border-neutral-800 bg-neutral-900 px-3 py-1.5 text-sm text-neutral-200"
        >
          <option value="all">All statuses</option>
          <option value="new">New</option>
          <option value="selected">Selected</option>
          <option value="discarded">Discarded</option>
        </select>
        <select
          value={suitableFilter}
          onChange={(e) => setSuitableFilter(e.target.value as SuitableFor | 'all')}
          className="rounded-md border border-neutral-800 bg-neutral-900 px-3 py-1.5 text-sm text-neutral-200"
        >
          <option value="all">All types</option>
          <option value="article">Article</option>
          <option value="video">Video</option>
          <option value="both">Both</option>
        </select>
      </div>

      <div className="rounded-lg border border-neutral-800 bg-neutral-900/40 p-4">
        {isLoading && <p className="py-8 text-center text-sm text-neutral-500">Loading topics…</p>}
        {isError && (
          <p className="py-8 text-center text-sm text-neutral-500">
            Could not reach backend at /api/discovery/topics. Is it running?
          </p>
        )}
        {!isLoading && !isError && <TopicList topics={filtered} onSelect={handleSelect} />}
      </div>
    </div>
  )
}
