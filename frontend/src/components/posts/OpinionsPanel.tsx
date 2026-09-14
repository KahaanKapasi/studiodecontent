import { useState } from 'react'
import type { PostDraft } from '../../types'

interface OpinionsPanelProps {
  suggestions: PostDraft[]
  isLoading: boolean
  isError: boolean
  onPickSuggestion: (draft: PostDraft) => void
  manualText: string
  onManualTextChange: (text: string) => void
  onImageSelected: (file: File) => void
  onSuggestOpinions: (team: string) => void
  isSuggesting: boolean
}

export default function OpinionsPanel({
  suggestions,
  isLoading,
  isError,
  onPickSuggestion,
  manualText,
  onManualTextChange,
  onImageSelected,
  onSuggestOpinions,
  isSuggesting,
}: OpinionsPanelProps) {
  const [team, setTeam] = useState('Real Madrid')

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (file) onImageSelected(file)
  }

  return (
    <div className="flex h-full w-72 shrink-0 flex-col gap-4">
      <div>
        <div className="mb-2 flex items-center justify-between">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-neutral-500">
            Suggested Opinions
          </h2>
        </div>
        <div className="mb-2 flex gap-2">
          <input
            value={team}
            onChange={(e) => setTeam(e.target.value)}
            placeholder="Team"
            className="w-0 flex-1 rounded-md border border-neutral-800 bg-neutral-900 px-2 py-1 text-xs text-neutral-200"
          />
          <button
            onClick={() => onSuggestOpinions(team)}
            disabled={isSuggesting || !team.trim()}
            className="shrink-0 rounded-md border border-neutral-700 px-2 py-1 text-xs font-medium text-neutral-200 hover:bg-neutral-800 disabled:opacity-50"
          >
            {isSuggesting ? 'Scraping…' : 'Suggest'}
          </button>
        </div>
        <div className="max-h-64 space-y-2 overflow-y-auto pr-1">
          {isLoading && <p className="text-xs text-neutral-500">Loading suggestions…</p>}
          {isError && (
            <p className="text-xs text-neutral-500">Backend not reachable for suggestions yet.</p>
          )}
          {!isLoading && !isError && suggestions.length === 0 && (
            <p className="text-xs text-neutral-500">
              No suggestions yet — click Suggest to scan match-day reactions.
            </p>
          )}
          {suggestions.map((s) => (
            <button
              key={s.id}
              onClick={() => onPickSuggestion(s)}
              className="w-full rounded-md border border-neutral-800 bg-neutral-900 p-2.5 text-left text-xs text-neutral-300 hover:border-neutral-700"
            >
              {s.suggested_opinion_text}
            </button>
          ))}
        </div>
      </div>

      <div>
        <h2 className="mb-2 text-sm font-semibold uppercase tracking-wide text-neutral-500">
          Write your own
        </h2>
        <textarea
          value={manualText}
          onChange={(e) => onManualTextChange(e.target.value)}
          rows={4}
          placeholder="Enter opinion text (3-5 lines)…"
          className="w-full resize-y rounded-md border border-neutral-800 bg-neutral-900 px-3 py-2 text-sm text-neutral-100"
        />
      </div>

      <div>
        <h2 className="mb-2 text-sm font-semibold uppercase tracking-wide text-neutral-500">
          Image
        </h2>
        <input
          type="file"
          accept="image/*"
          onChange={handleFileChange}
          className="block w-full text-xs text-neutral-400 file:mr-3 file:rounded-md file:border-0 file:bg-neutral-800 file:px-3 file:py-1.5 file:text-xs file:text-neutral-200"
        />
        <p className="mt-1 text-xs text-neutral-600">
          Getty's site blocks automated search (bot-detection) — download manually from
          gettyimages.com and upload here, or use any other image.
        </p>
      </div>
    </div>
  )
}
