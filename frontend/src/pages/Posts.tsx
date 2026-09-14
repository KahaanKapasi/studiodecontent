import { useRef, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { postsApi } from '../api/client'
import CarouselCanvas, { type CarouselCanvasHandle } from '../components/posts/CarouselCanvas'
import TemplateStrip from '../components/posts/TemplateStrip'
import OpinionsPanel from '../components/posts/OpinionsPanel'
import InstagramPreview from '../components/posts/InstagramPreview'
import { CANVAS_SIZE } from '../components/posts/templates'
import type { PostDraft } from '../types'

function dataUrlToBlob(dataUrl: string): Blob {
  const [header, base64] = dataUrl.split(',')
  const mime = header.match(/:(.*?);/)?.[1] ?? 'image/jpeg'
  const binary = atob(base64)
  const bytes = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i)
  return new Blob([bytes], { type: mime })
}

export default function Posts() {
  const queryClient = useQueryClient()
  const canvasRef = useRef<CarouselCanvasHandle>(null)

  const [draftId, setDraftId] = useState<number | null>(null)
  const [manualText, setManualText] = useState('')
  const [imageFile, setImageFile] = useState<File | null>(null)
  const [templateId, setTemplateId] = useState(1)
  const [fontSize, setFontSize] = useState(48)
  const [textX, setTextX] = useState(240)
  const [textY, setTextY] = useState(400)
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

  return (
    <div>
      <h1 className="mb-1 text-xl font-semibold text-neutral-100">Posts / Carousel Studio</h1>
      <p className="mb-6 text-sm text-neutral-500">
        Native canvas size {CANVAS_SIZE}×{CANVAS_SIZE} (IG square), shown scaled down below.
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
          <TemplateStrip selectedId={templateId} onSelect={setTemplateId} />

          <div className="flex justify-center rounded-lg border border-neutral-800 bg-neutral-900/40 p-4">
            <CarouselCanvas
              ref={canvasRef}
              templateId={templateId}
              imageFile={imageFile}
              text={manualText}
              fontSize={fontSize}
              textX={textX}
              textY={textY}
              onRender={setCanvasDataUrl}
            />
          </div>

          <div className="grid grid-cols-3 gap-3 rounded-lg border border-neutral-800 bg-neutral-900/40 p-4 text-sm">
            <label className="flex flex-col gap-1 text-xs text-neutral-500">
              Text size
              <input
                type="number"
                value={fontSize}
                onChange={(e) => setFontSize(Number(e.target.value))}
                className="rounded-md border border-neutral-800 bg-neutral-950 px-2 py-1 text-neutral-100"
              />
            </label>
            <label className="flex flex-col gap-1 text-xs text-neutral-500">
              Text X
              <input
                type="number"
                value={textX}
                onChange={(e) => setTextX(Number(e.target.value))}
                className="rounded-md border border-neutral-800 bg-neutral-950 px-2 py-1 text-neutral-100"
              />
            </label>
            <label className="flex flex-col gap-1 text-xs text-neutral-500">
              Text Y
              <input
                type="number"
                value={textY}
                onChange={(e) => setTextY(Number(e.target.value))}
                className="rounded-md border border-neutral-800 bg-neutral-950 px-2 py-1 text-neutral-100"
              />
            </label>
          </div>

          <div className="flex items-center gap-3 rounded-lg border border-neutral-800 bg-neutral-900/40 p-4">
            <button
              onClick={() => saveMutation.mutate()}
              disabled={saveMutation.isPending}
              className="rounded-md border border-neutral-700 px-4 py-2 text-sm font-medium text-neutral-200 hover:bg-neutral-800 disabled:opacity-50"
            >
              {saveMutation.isPending ? 'Saving…' : draftId ? 'Update Draft' : 'Save Draft'}
            </button>
            <button
              onClick={() => publishMutation.mutate()}
              disabled={publishMutation.isPending || !imageFile}
              className="rounded-md bg-amber-500 px-4 py-2 text-sm font-medium text-neutral-950 hover:bg-amber-400 disabled:opacity-50"
              title={!imageFile ? 'Add an image first' : undefined}
            >
              {publishMutation.isPending ? 'Publishing…' : 'Publish to Instagram'}
            </button>
            {publishedMediaId && (
              <span className="text-xs text-emerald-400">Published — media id {publishedMediaId}</span>
            )}
            {publishError && <span className="text-xs text-red-400">{publishError}</span>}
          </div>
          <p className="text-xs text-neutral-600">
            Image crop/position is a placeholder for now — drag the image directly on the canvas;
            a dedicated crop tool is a follow-up.
          </p>
        </div>

        <InstagramPreview canvasDataUrl={canvasDataUrl} caption={manualText} />
      </div>
    </div>
  )
}
