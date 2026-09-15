import { useEffect, useMemo, useState } from 'react'
import { useLocation } from 'react-router-dom'
import { useMutation, useQuery } from '@tanstack/react-query'
import { articlesApi, discoveryApi } from '../api/client'
import TopicList from '../components/TopicList'
import Badge from '../components/Badge'
import type { Article, TopicCandidate } from '../types'

export default function Articles() {
  const location = useLocation()
  const preselectedTopicId = (location.state as { topicId?: number } | null)?.topicId

  const [selectedTopic, setSelectedTopic] = useState<TopicCandidate | null>(null)
  const [draft, setDraft] = useState<Article | null>(null)

  const { data: topics = [] } = useQuery({
    queryKey: ['discovery', 'topics'],
    queryFn: () => discoveryApi.listTopics(),
  })

  const articleSuitable = useMemo(
    () => topics.filter((t) => t.suitable_for === 'article' || t.suitable_for === 'both'),
    [topics],
  )

  const generateMutation = useMutation({
    mutationFn: (topicId: number) => articlesApi.generate(topicId),
    onSuccess: (article) => setDraft(article),
  })

  const publishMutation = useMutation({
    mutationFn: (id: number) => articlesApi.publish(id),
    onSuccess: (article) => setDraft(article),
  })

  const regenerateMutation = useMutation({
    mutationFn: (id: number) => articlesApi.regenerate(id),
    onSuccess: (article) => setDraft(article),
  })

  function handleSelectTopic(topic: TopicCandidate) {
    setSelectedTopic(topic)
    generateMutation.mutate(topic.id)
  }

  function handleCopyToClipboard() {
    if (!draft) return
    navigator.clipboard.writeText(draft.body)
  }

  function updateDraft<K extends keyof Article>(key: K, value: Article[K]) {
    setDraft((prev) => (prev ? { ...prev, [key]: value } : prev))
  }

  const preselected = preselectedTopicId
    ? articleSuitable.find((t) => t.id === preselectedTopicId)
    : undefined

  useEffect(() => {
    if (preselected && selectedTopic === null && draft === null && !generateMutation.isPending) {
      handleSelectTopic(preselected)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [preselected])

  return (
    <div className="flex h-full gap-6">
      <div className="w-80 shrink-0">
        <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-faint">
          Article Topics
        </h2>
        <div className="max-h-[calc(100vh-8rem)] overflow-y-auto pr-1">
          <TopicList
            topics={articleSuitable}
            selectedId={selectedTopic?.id}
            onSelect={handleSelectTopic}
            variant="compact"
          />
        </div>
      </div>

      <div className="flex-1 rounded-lg border border-line bg-surface p-6">
        {!selectedTopic && (
          <p className="text-sm text-faint">Select a topic on the left to generate a draft.</p>
        )}
        {selectedTopic && generateMutation.isPending && (
          <p className="text-sm text-faint">Generating draft…</p>
        )}
        {selectedTopic && generateMutation.isError && (
          <p className="text-sm text-faint">
            Could not reach backend to generate a draft. Is /api/articles/generate running?
          </p>
        )}
        {draft && (
          <div className="flex h-full flex-col">
            <div className="flex-1 space-y-4 overflow-y-auto pr-1">
              <div>
                <label className="mb-1 block text-xs font-medium uppercase tracking-wide text-faint">
                  Title
                </label>
                <input
                  value={draft.title}
                  onChange={(e) => updateDraft('title', e.target.value)}
                  className="w-full rounded-md border border-line bg-app px-3 py-2 text-sm text-ink"
                />
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium uppercase tracking-wide text-faint">
                  Body
                </label>
                <textarea
                  value={draft.body}
                  onChange={(e) => updateDraft('body', e.target.value)}
                  rows={14}
                  className="w-full resize-y rounded-md border border-line bg-app px-3 py-2 text-sm text-ink"
                />
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium uppercase tracking-wide text-faint">
                  Meta Description
                </label>
                <textarea
                  value={draft.meta_description}
                  onChange={(e) => updateDraft('meta_description', e.target.value)}
                  rows={2}
                  className="w-full resize-y rounded-md border border-line bg-app px-3 py-2 text-sm text-ink"
                />
              </div>
              <div className="flex gap-4">
                <div className="flex-1">
                  <label className="mb-1 block text-xs font-medium uppercase tracking-wide text-faint">
                    Slug
                  </label>
                  <input
                    value={draft.slug}
                    onChange={(e) => updateDraft('slug', e.target.value)}
                    className="w-full rounded-md border border-line bg-app px-3 py-2 text-sm text-ink"
                  />
                </div>
                <div className="flex-1">
                  <label className="mb-1 block text-xs font-medium uppercase tracking-wide text-faint">
                    Tags
                  </label>
                  <input
                    value={draft.tags.join(', ')}
                    onChange={(e) =>
                      updateDraft(
                        'tags',
                        e.target.value.split(',').map((t) => t.trim()).filter(Boolean),
                      )
                    }
                    className="w-full rounded-md border border-line bg-app px-3 py-2 text-sm text-ink"
                  />
                </div>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-xs uppercase tracking-wide text-faint">Status</span>
                <Badge label={draft.status} />
              </div>
            </div>

            <div className="mt-4 flex gap-3 border-t border-line pt-4">
              <button
                onClick={() => publishMutation.mutate(draft.id)}
                disabled={publishMutation.isPending}
                className="rounded-md bg-accent px-4 py-2 text-sm font-medium text-accent-fg hover:bg-accent-hover disabled:opacity-50"
              >
                Publish
              </button>
              <button
                onClick={handleCopyToClipboard}
                className="rounded-md border border-line-strong px-4 py-2 text-sm font-medium text-ink hover:bg-surface-2"
              >
                Copy to Clipboard
              </button>
              <button
                onClick={() => regenerateMutation.mutate(draft.id)}
                disabled={regenerateMutation.isPending}
                className="rounded-md border border-line-strong px-4 py-2 text-sm font-medium text-ink hover:bg-surface-2 disabled:opacity-50"
              >
                {regenerateMutation.isPending ? 'Regenerating…' : 'Regenerate'}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
