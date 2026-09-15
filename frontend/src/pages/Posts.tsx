import { useRef, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { postsApi } from '../api/client'
import CarouselCanvas, { type CarouselCanvasHandle } from '../components/posts/CarouselCanvas'
import TemplateStrip from '../components/posts/TemplateStrip'
import OpinionsPanel from '../components/posts/OpinionsPanel'
import InstagramPreview from '../components/posts/InstagramPreview'
import LightroomPanel from '../components/posts/LightroomPanel'
import { DEFAULT_ADJUSTMENTS, type Adjustments } from '../components/posts/adjustments'
import { ASPECT_RATIOS, computePreviewSize, DEFAULT_ASPECT_RATIO, getAspectRatio } from '../components/posts/templates'
import type { PostDraft } from '../types'

function dataUrlToBlob(dataUrl: string): Blob {
  const [header, base64] = dataUrl.split(',')
  const mime = header.match(/:(.*?);/)?.[1] ?? 'image/jpeg'
  const binary = atob(base64)
  const bytes = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i)
  return new Blob([bytes], { type: mime })
}

function defaultTextPosition(aspectRatio: string) {
  const { width, height } = getAspectRatio(aspectRatio)
  const preview = computePreviewSize(width, height)
  return { x: Math.round(preview.width / 2), y: Math.round(preview.height * 0.55) }
}

export default function Posts() {
  const queryClient = useQueryClient()
  const canvasRef = useRef<CarouselCanvasHandle>(null)

  const [draftId, setDraftId] = useState<number | null>(null)
  const [manualText, setManualText] = useState('')
  const [imageFile, setImageFile] = useState<File | null>(null)
  const [templateId, setTemplateId] = useState(1)
  const [aspectRatio, setAspectRatio] = useState(DEFAULT_ASPECT_RATIO)
  const [fontSize, setFontSize] = useState(48)
  const initialPos = defaultTextPosition(DEFAULT_ASPECT_RATIO)
  const [textX, setTextX] = useState(initialPos.x)
  const [textY, setTextY] = useState(initialPos.y)
  const [adjustments, setAdjustments] = useState<Adjustments>(DEFAULT_ADJUSTMENTS)
  const [canvasDataUrl, setCanvasDataUrl] = useState<string | null>(null)
  const [publishError, setPublishError] = useState('')
  const [publishedMediaId, setPublishedMediaId] = useState<string | null>(null)

  const {
    data: drafts = [],
    isLoading,
    isError,
  } = useQuery({ queryKey: ['posts', 'drafts'], queryFn: postsApi.listDrafts })
  const suggestions = drafts.filter((d) => d.source === 'match_scrape')

  const suggestMutation = useMutation({
    mutationFn: (team: string) => postsApi.matchScrape(team),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['posts', 'drafts'] }),
  })

  const saveMutation = useMutation({
    mutationFn: async () => {
      if (draftId) {
        return postsApi.updateDraft(draftId, { final_text: manualText, template_id: templateId })
      }
      const created = await postsApi.createDraft({
        source: 'manual',
        final_text: manualText,
        template_id: templateId,
        image_source_url: imageFile ? imageFile.name : undefined,
      })
      setDraftId(created.id)
      return created
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['posts', 'drafts'] }),
  })

  const publishMutation = useMutation({
    mutationFn: async () => {
      setPublishError('')
      const exported = canvasRef.current?.exportFullResolution()
      if (!exported) throw new Error('Canvas not ready to export')

      const id = draftId ?? (await saveMutation.mutateAsync()).id
      const blob = dataUrlToBlob(exported)
      const { url } = await postsApi.uploadToHost(blob)
      await postsApi.updateDraft(id, { final_image_config: { hosted_image_urls: [url] } })
      return postsApi.publish(id)
    },
    onSuccess: (result) => {
      setPublishedMediaId(result.media_id)
      queryClient.invalidateQueries({ queryKey: ['posts', 'drafts'] })
    },
    onError: (err: Error) => setPublishError(err.message),
  })

  function handlePickSuggestion(draft: PostDraft) {
    setDraftId(draft.id)
    setManualText(draft.suggested_opinion_text ?? '')
  }

  function handleAspectRatioChange(id: string) {
    setAspectRatio(id)
    const pos = defaultTextPosition(id)
    setTextX(pos.x)
    setTextY(pos.y)
  }

  return (
    <div>
      <h1 className="mb-1 text-xl font-semibold text-ink">Posts / Carousel Studio</h1>
      <p className="mb-6 text-sm text-faint">
        {getAspectRatio(aspectRatio).width}×{getAspectRatio(aspectRatio).height} ({aspectRatio}),
        shown scaled down below.
      </p>

      <div className="flex items-start gap-6">
        <OpinionsPanel
          suggestions={suggestions}
          isLoading={isLoading}
          isError={isError}
          onPickSuggestion={handlePickSuggestion}
          manualText={manualText}
          onManualTextChange={setManualText}
          onImageSelected={setImageFile}
          onSuggestOpinions={(team) => suggestMutation.mutate(team)}
          isSuggesting={suggestMutation.isPending}
        />

        <div className="flex-1 space-y-4">
          <div className="flex items-start justify-between gap-4">
            <TemplateStrip selectedId={templateId} onSelect={setTemplateId} />
            <div className="flex shrink-0 gap-1 rounded-lg border border-line bg-surface p-1">
              {ASPECT_RATIOS.map((ar) => (
                <button
                  key={ar.id}
                  onClick={() => handleAspectRatioChange(ar.id)}
                  className={`rounded-md px-2.5 py-1.5 text-xs font-medium transition-colors ${
                    aspectRatio === ar.id
                      ? 'bg-accent text-accent-fg'
                      : 'text-muted hover:bg-surface-2 hover:text-ink'
                  }`}
                >
                  {ar.label}
                </button>
              ))}
            </div>
          </div>

          <div className="flex justify-center rounded-lg border border-line bg-surface p-4">
            <CarouselCanvas
              ref={canvasRef}
              templateId={templateId}
              aspectRatio={aspectRatio}
              imageFile={imageFile}
              text={manualText}
              fontSize={fontSize}
              textX={textX}
              textY={textY}
              adjustments={adjustments}
              onRender={setCanvasDataUrl}
            />
          </div>

          <LightroomPanel value={adjustments} onChange={setAdjustments} />

          <div className="grid grid-cols-3 gap-3 rounded-lg border border-line bg-surface p-4 text-sm">
            <label className="flex flex-col gap-1 text-xs text-faint">
              Text size
              <input
                type="number"
                value={fontSize}
                onChange={(e) => setFontSize(Number(e.target.value))}
                className="rounded-md border border-line bg-app px-2 py-1 text-ink"
              />
            </label>
            <label className="flex flex-col gap-1 text-xs text-faint">
              Text X
              <input
                type="number"
                value={textX}
                onChange={(e) => setTextX(Number(e.target.value))}
                className="rounded-md border border-line bg-app px-2 py-1 text-ink"
              />
            </label>
            <label className="flex flex-col gap-1 text-xs text-faint">
              Text Y
              <input
                type="number"
                value={textY}
                onChange={(e) => setTextY(Number(e.target.value))}
                className="rounded-md border border-line bg-app px-2 py-1 text-ink"
              />
            </label>
          </div>

          <div className="flex items-center gap-3 rounded-lg border border-line bg-surface p-4">
            <button
              onClick={() => saveMutation.mutate()}
              disabled={saveMutation.isPending}
              className="rounded-md border border-line-strong px-4 py-2 text-sm font-medium text-ink hover:bg-surface-2 disabled:opacity-50"
            >
              {saveMutation.isPending ? 'Saving…' : draftId ? 'Update Draft' : 'Save Draft'}
            </button>
            <button
              onClick={() => publishMutation.mutate()}
              disabled={publishMutation.isPending || !imageFile}
              className="rounded-md bg-accent px-4 py-2 text-sm font-medium text-accent-fg hover:bg-accent-hover disabled:opacity-50"
              title={!imageFile ? 'Add an image first' : undefined}
            >
              {publishMutation.isPending ? 'Publishing…' : 'Publish to Instagram'}
            </button>
            {publishedMediaId && (
              <span className="text-xs text-success">Published — media id {publishedMediaId}</span>
            )}
            {publishError && <span className="text-xs text-danger">{publishError}</span>}
          </div>
          <p className="text-xs text-faint">
            Image crop/position is a placeholder for now — drag the image directly on the canvas;
            a dedicated crop tool is a follow-up.
          </p>
        </div>

        <InstagramPreview canvasDataUrl={canvasDataUrl} caption={manualText} />
      </div>
    </div>
  )
}
