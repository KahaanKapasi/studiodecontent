import { useMemo, useState } from 'react'
import { useMutation, useQuery } from '@tanstack/react-query'
import { discoveryApi, videoApi } from '../api/client'
import TopicList from '../components/TopicList'
import Badge from '../components/Badge'
import type { Script, ScriptVariant, TopicCandidate, VideoTopic } from '../types'

function scoreLabel(score: number | null) {
  if (score === null || score === undefined) return '—'
  return `${Math.round(score * 100)}%`
}

export default function Video() {
  const [selectedTopic, setSelectedTopic] = useState<TopicCandidate | null>(null)
  const [videoTopics, setVideoTopics] = useState<VideoTopic[]>([])
  const [selectedVideoTopic, setSelectedVideoTopic] = useState<VideoTopic | null>(null)
  const [scripts, setScripts] = useState<Script[]>([])
  const [activeTab, setActiveTab] = useState<ScriptVariant>('long')

  const { data: topics = [] } = useQuery({
    queryKey: ['discovery', 'topics'],
    queryFn: () => discoveryApi.listTopics(),
  })

  const videoSuitable = useMemo(
    () => topics.filter((t) => t.suitable_for === 'video' || t.suitable_for === 'both'),
    [topics],
  )

  const sortedVideoTopics = useMemo(
    () =>
      [...videoTopics].sort((a, b) => (b.suggestion_score ?? 0) - (a.suggestion_score ?? 0)),
    [videoTopics],
  )

  const generateTitlesMutation = useMutation({
    mutationFn: (topicId: number) => videoApi.generateTitles(topicId),
    onSuccess: (created) => {
      setVideoTopics(created)
      setSelectedVideoTopic(null)
      setScripts([])
    },
  })

  const generateScriptsMutation = useMutation({
    mutationFn: (videoTopicId: number) => videoApi.generateScripts(videoTopicId),
    onSuccess: (created) => {
      setScripts(created)
      setActiveTab('long')
    },
  })

  const selectScriptMutation = useMutation({
    mutationFn: ({ id, selected }: { id: number; selected: boolean }) =>
      videoApi.updateScript(id, selected),
    onSuccess: (updated) => {
      setScripts((prev) =>
        prev.map((s) => (s.id === updated.id ? updated : { ...s, selected: false })),
      )
    },
  })

  function handleSelectTopic(topic: TopicCandidate) {
    setSelectedTopic(topic)
    setSelectedVideoTopic(null)
    setScripts([])
    setVideoTopics([])
    generateTitlesMutation.mutate(topic.id)
  }

  function handleSelectVideoTopic(vt: VideoTopic) {
    setSelectedVideoTopic(vt)
    setScripts([])
    generateScriptsMutation.mutate(vt.id)
  }

  const activeScript = scripts.find((s) => s.variant === activeTab)
  const selectedScript = scripts.find((s) => s.selected)

  return (
    <div className="flex h-full gap-6">
      <div className="w-80 shrink-0">
        <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-faint">
          Video Topics
        </h2>
        <div className="max-h-[calc(100vh-8rem)] overflow-y-auto pr-1">
          <TopicList
            topics={videoSuitable}
            selectedId={selectedTopic?.id}
            onSelect={handleSelectTopic}
            variant="compact"
          />
        </div>
      </div>

      <div className="flex-1 rounded-lg border border-line bg-surface p-6">
        {!selectedTopic && (
          <p className="text-sm text-faint">
            Select a topic on the left to generate candidate video titles.
          </p>
        )}

        {selectedTopic && generateTitlesMutation.isPending && (
          <p className="text-sm text-faint">Generating video titles…</p>
        )}

        {selectedTopic && generateTitlesMutation.isError && (
          <p className="text-sm text-danger">
            {generateTitlesMutation.error instanceof Error
              ? generateTitlesMutation.error.message
              : 'Could not generate video titles. Is /api/video/generate-titles running?'}
          </p>
        )}

        {selectedTopic && !generateTitlesMutation.isPending && videoTopics.length > 0 && (
          <div className="flex h-full flex-col gap-6 overflow-y-auto pr-1">
            <div>
              <h3 className="mb-3 text-sm font-semibold uppercase tracking-wide text-faint">
                Candidate Titles
              </h3>
              <ul className="grid gap-3 sm:grid-cols-2">
                {sortedVideoTopics.map((vt) => (
                  <li key={vt.id}>
                    <button
                      onClick={() => handleSelectVideoTopic(vt)}
                      className={`w-full rounded-lg border px-3 py-3 text-left transition-colors ${
                        selectedVideoTopic?.id === vt.id
                          ? 'border-accent/50 bg-accent/5'
                          : 'border-line bg-surface hover:border-line-strong'
                      }`}
                    >
                      <div className="text-sm font-medium text-ink">{vt.title}</div>
                      <div className="mt-2 flex items-center gap-2">
                        {vt.format && <Badge label={vt.format} />}
                        <span className="text-xs text-faint">
                          Suggestion score: {scoreLabel(vt.suggestion_score)}
                        </span>
                      </div>
                    </button>
                  </li>
                ))}
              </ul>
            </div>

            {selectedVideoTopic && generateScriptsMutation.isPending && (
              <p className="text-sm text-faint">Generating long-form and short-form scripts…</p>
            )}

            {selectedVideoTopic && generateScriptsMutation.isError && (
              <p className="text-sm text-danger">
                {generateScriptsMutation.error instanceof Error
                  ? generateScriptsMutation.error.message
                  : 'Could not generate scripts. Is /api/video/scripts/generate running?'}
              </p>
            )}

            {selectedVideoTopic && !generateScriptsMutation.isPending && scripts.length > 0 && (
              <div className="flex flex-1 flex-col border-t border-line pt-4">
                <div className="mb-3 flex gap-2">
                  {(['long', 'short'] as ScriptVariant[]).map((variant) => {
                    const script = scripts.find((s) => s.variant === variant)
                    return (
                      <button
                        key={variant}
                        onClick={() => setActiveTab(variant)}
                        className={`rounded-md px-3 py-1.5 text-sm font-medium capitalize transition-colors ${
                          activeTab === variant
                            ? 'bg-accent text-accent-fg'
                            : 'border border-line text-muted hover:bg-surface-2'
                        }`}
                      >
                        {variant}-form
                        {script?.selected && <span className="ml-1.5 text-xs">✓</span>}
                      </button>
                    )
                  })}
                </div>

                <textarea
                  key={activeTab}
                  value={activeScript?.body ?? ''}
                  readOnly
                  rows={12}
                  className="w-full flex-1 resize-y rounded-md border border-line bg-app px-3 py-2 text-sm text-ink"
                />

                <div className="mt-4 flex items-center gap-3 border-t border-line pt-4">
                  <button
                    onClick={() =>
                      activeScript && selectScriptMutation.mutate({ id: activeScript.id, selected: true })
                    }
                    disabled={!activeScript || activeScript.selected || selectScriptMutation.isPending}
                    className="rounded-md bg-accent px-4 py-2 text-sm font-medium text-accent-fg hover:bg-accent-hover disabled:opacity-50"
                  >
                    {activeScript?.selected ? 'Selected' : `Select ${activeTab}-form script`}
                  </button>
                  <button
                    onClick={() => selectedVideoTopic && generateScriptsMutation.mutate(selectedVideoTopic.id)}
                    disabled={generateScriptsMutation.isPending}
                    className="rounded-md border border-line-strong px-4 py-2 text-sm font-medium text-ink hover:bg-surface-2 disabled:opacity-50"
                  >
                    {generateScriptsMutation.isPending ? 'Regenerating…' : 'Regenerate scripts'}
                  </button>
                </div>

                {selectedScript && (
                  <div className="mt-4 rounded-md border border-line bg-surface-2 p-4">
                    <p className="text-sm font-medium text-ink">
                      "{selectedScript.variant}" script selected.
                    </p>
                    <p className="mt-1 text-sm text-muted">
                      Voice + avatar generation not available yet — pending AI avatar service
                      selection (see docs/03_Video_Pipeline.md).
                    </p>
                  </div>
                )}
              </div>
            )}
          </div>
        )}

        {selectedTopic &&
          !generateTitlesMutation.isPending &&
          !generateTitlesMutation.isError &&
          videoTopics.length === 0 &&
          generateTitlesMutation.isSuccess && (
            <p className="text-sm text-faint">
              No video titles were generated for this topic. Try a different topic.
            </p>
          )}
      </div>
    </div>
  )
}
