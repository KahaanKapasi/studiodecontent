import { useEffect, useRef, useState } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { genjutsuApi, type GenjutsuInfo, type GenjutsuModelInfo } from '../../api/genjutsu'
import CostedButton from '../cost/CostedButton'
import { useCostEstimate } from '../cost/useCostEstimate'
import Segmented from '../video/Segmented'
import { usd } from '../cost/format'

const fieldLabel = 'mb-1.5 block text-sm font-medium text-ink'
const helpText = 'mt-1.5 text-xs text-muted'
const dropBase =
  'flex min-h-28 cursor-pointer flex-col items-center justify-center gap-1 rounded-lg border border-dashed px-4 py-5 text-center text-sm transition-colors'

interface Photo {
  file: File
  url: string
}

function isTyping(target: EventTarget | null) {
  return target instanceof HTMLElement && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable)
}

const FALLBACK_RESOLUTIONS = [{ id: '480p', price_per_second_usd: 0.318 }, { id: '720p', price_per_second_usd: 0.681 }, { id: '1080p', price_per_second_usd: 1.632 }]
const FALLBACK_MODELS: GenjutsuModelInfo[] = [
  { id: 'genjutsu', label: 'Genjutsu', summary: 'Full quality. Up to 30 s of source video, billed per input second.', max_source_seconds: 30, resolutions: FALLBACK_RESOLUTIONS },
  {
    id: 'light', label: 'Genjutsu Light', summary: 'About 3x cheaper, lower fidelity. Only the first 15 s of the source is used.', max_source_seconds: 15,
    resolutions: [{ id: '480p', price_per_second_usd: 0.05 }, { id: '720p', price_per_second_usd: 0.1 }, { id: '1080p', price_per_second_usd: 0.2 }],
  },
]

export default function Composer({ info }: { info: GenjutsuInfo | undefined }) {
  const queryClient = useQueryClient()
  const limits = info?.limits ?? { min_video_seconds: 4, max_billed_seconds: 30, max_images: 8 }
  const [video, setVideo] = useState<{ file: File; url: string } | null>(null)
  const [duration, setDuration] = useState<number | null>(null)
  const [photos, setPhotos] = useState<Photo[]>([])
  const [prompt, setPrompt] = useState('')
  const [resolution, setResolution] = useState('720p')
  const [modelId, setModelId] = useState('genjutsu')
  const [dragOver, setDragOver] = useState<'video' | 'photos' | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const videoInput = useRef<HTMLInputElement>(null)
  const photoInput = useRef<HTMLInputElement>(null)

  // Object URLs are revoked when replaced/removed (below) and on unmount.
  const urls = useRef<string[]>([])
  useEffect(() => () => urls.current.forEach((u) => URL.revokeObjectURL(u)), [])
  const makeUrl = (file: File) => {
    const url = URL.createObjectURL(file)
    urls.current.push(url)
    return url
  }
  const dropUrl = (url: string) => {
    URL.revokeObjectURL(url)
    urls.current = urls.current.filter((u) => u !== url)
  }

  function pickVideo(file: File | undefined) {
    if (!file) return
    if (!file.type.startsWith('video/')) {
      setNotice(`"${file.name}" is not a video file.`)
      return
    }
    if (video) dropUrl(video.url)
    setNotice(null)
    setDuration(null)
    setVideo({ file, url: makeUrl(file) })
  }

  function addPhotos(files: File[]) {
    const images = files.filter((f) => f.type.startsWith('image/'))
    if (!images.length) {
      if (files.length) setNotice('Only image files can be used as reference photos.')
      return
    }
    setNotice(null)
    setPhotos((prev) => {
      const known = new Set(prev.map((p) => `${p.file.name}:${p.file.size}`))
      const fresh = images.filter((f) => !known.has(`${f.name}:${f.size}`)).map((file) => ({ file, url: makeUrl(file) }))
      const room = Math.max(0, limits.max_images - prev.length)
      if (fresh.length > room) setNotice(`Genjutsu takes at most ${limits.max_images} reference photos.`)
      fresh.slice(room).forEach((p) => dropUrl(p.url))
      return [...prev, ...fresh.slice(0, room)]
    })
  }

  function removePhoto(url: string) {
    dropUrl(url)
    setPhotos((prev) => prev.filter((p) => p.url !== url))
  }

  // Paste a copied image (or video) straight in from the clipboard, like the Posts editor.
  const pasteRef = useRef({ pickVideo, addPhotos })
  useEffect(() => {
    pasteRef.current = { pickVideo, addPhotos }
  })
  useEffect(() => {
    function onPaste(e: ClipboardEvent) {
      if (isTyping(e.target)) return
      const files = Array.from(e.clipboardData?.files ?? [])
      if (!files.length) return
      e.preventDefault()
      const vid = files.find((f) => f.type.startsWith('video/'))
      if (vid) pasteRef.current.pickVideo(vid)
      pasteRef.current.addPhotos(files)
    }
    document.addEventListener('paste', onPaste)
    return () => document.removeEventListener('paste', onPaste)
  }, [])

  const tooShort = duration !== null && duration < limits.min_video_seconds
  const models = info?.models ?? FALLBACK_MODELS
  const model = models.find((m) => m.id === modelId) ?? models[0]
  const isLight = model.id === 'light'
  // Mirrors the backend: Genjutsu bills the input seconds; Light bills output (max 15 s) plus input seconds.
  const whole = duration !== null ? Math.max(1, Math.ceil(duration - 1e-9)) : null
  const billed = whole === null ? null : isLight ? Math.min(model.max_source_seconds, whole) + Math.min(limits.max_billed_seconds, whole) : Math.min(limits.max_billed_seconds, whole)
  const perSecond = model.resolutions.find((r) => r.id === resolution)?.price_per_second_usd
  const costParams = { duration_seconds: duration ?? undefined, resolution, model: model.id }
  const { estimate } = useCostEstimate('genjutsu.motion_transfer', costParams)

  const create = useMutation({
    mutationFn: (form: FormData) => genjutsuApi.create(form),
    onSuccess: () => {
      if (video) dropUrl(video.url)
      photos.forEach((p) => dropUrl(p.url))
      setVideo(null)
      setDuration(null)
      setPhotos([])
      setNotice(null)
      void queryClient.invalidateQueries({ queryKey: ['genjutsu'] })
    },
  })

  const notConfigured = info && !info.configured
  const ready = !!video && duration !== null && !tooShort && photos.length > 0 && !!estimate && !notConfigured
  const blockedReason = notConfigured
    ? 'Add your Higgsfield key (HF_KEY) to .env first.'
    : !video
      ? 'Choose the video whose motion you want to copy.'
      : duration === null
        ? 'Reading the video…'
        : tooShort
          ? `The video must be at least ${limits.min_video_seconds} s long.`
          : photos.length === 0
            ? 'Add at least one reference photo.'
            : null

  function submit() {
    if (!ready || !video || !estimate) return
    const form = new FormData()
    form.append('video', video.file)
    photos.forEach((p) => form.append('images', p.file))
    form.append('prompt', prompt)
    form.append('resolution', resolution)
    form.append('model', model.id)
    form.append('confirm_cost_usd', String(estimate.high_usd))
    create.mutate(form)
  }

  const dropClass = (kind: 'video' | 'photos') =>
    `${dropBase} ${dragOver === kind ? 'border-accent bg-accent/5' : 'border-line-strong bg-surface-2 hover:border-accent'}`

  return (
    <section className="space-y-5 rounded-lg border border-line bg-surface p-4 sm:p-5" aria-label="New Genjutsu job">
      {notConfigured && (
        <p role="status" className="rounded-md bg-danger/10 px-3 py-2 text-sm text-danger">
          Higgsfield is not connected. Add <code>HF_KEY=&lt;key-id&gt;:&lt;key-secret&gt;</code> to the backend <code>.env</code> and restart.
        </p>
      )}

      <div>
        <span className={fieldLabel}>1. Source video (the motion to copy)</span>
        {video ? (
          <div className="space-y-2">
            <video
              src={video.url}
              controls
              playsInline
              preload="metadata"
              onLoadedMetadata={(e) => setDuration(e.currentTarget.duration)}
              onError={() => setNotice('This browser cannot read that video. Try an MP4 or MOV.')}
              className="max-h-72 w-full rounded-md bg-black object-contain"
            />
            <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-muted">
              <span className="min-w-0 truncate">
                {video.file.name} · {(video.file.size / 1048576).toFixed(1)} MB
                {duration !== null && ` · ${duration.toFixed(1)} s`}
              </span>
              <button
                type="button"
                className="rounded-md border border-line-strong px-3 py-1.5 text-ink hover:bg-surface-2"
                onClick={() => {
                  dropUrl(video.url)
                  setVideo(null)
                  setDuration(null)
                }}
              >
                Remove
              </button>
            </div>
            {tooShort && (
              <p role="alert" className="text-xs text-danger">
                Genjutsu needs a source video of at least {limits.min_video_seconds} s (this one is {duration?.toFixed(1)} s).
              </p>
            )}
            {duration !== null && duration > limits.max_billed_seconds && (
              <p className="text-xs text-muted">Only the first {limits.max_billed_seconds} s is used (and billed).</p>
            )}
          </div>
        ) : (
          <div
            role="button"
            tabIndex={0}
            className={dropClass('video')}
            onClick={() => videoInput.current?.click()}
            onKeyDown={(e) => (e.key === 'Enter' || e.key === ' ') && videoInput.current?.click()}
            onDragOver={(e) => {
              e.preventDefault()
              setDragOver('video')
            }}
            onDragLeave={() => setDragOver(null)}
            onDrop={(e) => {
              e.preventDefault()
              setDragOver(null)
              pickVideo(e.dataTransfer.files[0])
            }}
          >
            <span className="font-medium text-ink">Drop a video here or tap to choose</span>
            <span className="text-xs text-muted">MP4 or MOV, {limits.min_video_seconds}–{limits.max_billed_seconds} s works best</span>
          </div>
        )}
        <input
          ref={videoInput}
          type="file"
          accept="video/*"
          className="sr-only"
          onChange={(e) => {
            pickVideo(e.target.files?.[0])
            e.target.value = ''
          }}
        />
      </div>

      <div>
        <span className={fieldLabel}>
          2. Reference photos ({photos.length}/{limits.max_images})
        </span>
        <div
          role="button"
          tabIndex={0}
          className={dropClass('photos')}
          onClick={() => photoInput.current?.click()}
          onKeyDown={(e) => (e.key === 'Enter' || e.key === ' ') && photoInput.current?.click()}
          onDragOver={(e) => {
            e.preventDefault()
            setDragOver('photos')
          }}
          onDragLeave={() => setDragOver(null)}
          onDrop={(e) => {
            e.preventDefault()
            setDragOver(null)
            addPhotos(Array.from(e.dataTransfer.files))
          }}
        >
          <span className="font-medium text-ink">Drop photos, paste (⌘V) or tap to choose</span>
          <span className="text-xs text-muted">The people (or characters) who should replace the ones in the video</span>
        </div>
        <input
          ref={photoInput}
          type="file"
          accept="image/*"
          multiple
          className="sr-only"
          onChange={(e) => {
            addPhotos(Array.from(e.target.files ?? []))
            e.target.value = ''
          }}
        />
        {photos.length > 0 && (
          <ul className="mt-3 grid grid-cols-4 gap-2 sm:grid-cols-5">
            {photos.map((p) => (
              <li key={p.url} className="group relative aspect-square overflow-hidden rounded-md bg-surface-2">
                <img src={p.url} alt={p.file.name} className="h-full w-full object-cover" />
                <button
                  type="button"
                  aria-label={`Remove ${p.file.name}`}
                  onClick={() => removePhoto(p.url)}
                  className="absolute right-1 top-1 flex h-7 w-7 items-center justify-center rounded-full bg-black/70 text-sm text-white"
                >
                  ×
                </button>
              </li>
            ))}
          </ul>
        )}
        <p className={helpText}>Clear, well-lit photos of the face work best. Add several angles per person for a closer likeness.</p>
      </div>

      <div>
        <label htmlFor="genjutsu-prompt" className={fieldLabel}>
          3. Instructions <span className="font-normal text-muted">(optional)</span>
        </label>
        <textarea
          id="genjutsu-prompt"
          rows={3}
          value={prompt}
          onChange={(e) => setPrompt(e.target.value)}
          maxLength={10000}
          placeholder="e.g. Replace the man on the left with the first photo and the woman with the second. Keep the cafeteria."
          className="w-full rounded-md border border-line-strong bg-surface-2 px-3 py-2 text-sm text-ink placeholder:text-faint focus:border-accent focus:outline-none"
        />
      </div>

      <div>
        <span className={fieldLabel}>4. Model</span>
        <Segmented
          ariaLabel="Genjutsu model"
          value={model.id}
          onChange={setModelId}
          layout="chips"
          options={models.map((m) => ({ value: m.id, label: m.label }))}
        />
        <p className={helpText}>{model.summary}</p>
        {isLight && duration !== null && duration > model.max_source_seconds && (
          <p className={helpText}>
            Your video is {Math.round(duration)} s; Light only uses the first {model.max_source_seconds} s of it. Switch to Genjutsu for the whole clip.
          </p>
        )}
      </div>

      <div>
        <span className={fieldLabel}>5. Output quality</span>
        <Segmented
          ariaLabel="Output resolution"
          value={resolution}
          onChange={setResolution}
          layout="chips"
          options={model.resolutions.map((r) => ({
            value: r.id,
            label: `${r.id} · $${r.price_per_second_usd.toFixed(3)}/s`,
          }))}
        />
        <p className={helpText}>
          {billed !== null && perSecond !== undefined && estimate
            ? `Your video is billed as ${billed} s × $${perSecond.toFixed(3)} = ${usd(estimate.high_usd)}. `
            : isLight
              ? 'Billed per second of output plus source video. '
              : 'Billed per second of your source video, rounded up. '}
          {isLight ? 'Light’s price is unconfirmed; check your first receipt. ' : ''}
          Cheaper tiers are fine for a first try.
        </p>
      </div>

      {notice && (
        <p role="alert" className="text-sm text-danger">
          {notice}
        </p>
      )}
      {create.error && (
        <p role="alert" className="text-sm text-danger">
          {create.error.message}
        </p>
      )}

      <div className="space-y-2 border-t border-line pt-4">
        <CostedButton
          action="genjutsu.motion_transfer"
          params={costParams}
          onClick={submit}
          disabled={!ready || create.isPending}
          className="min-h-11 rounded-md bg-accent px-5 py-2.5 text-sm font-semibold text-accent-fg hover:bg-accent-hover disabled:opacity-50"
        >
          {create.isPending ? 'Uploading…' : 'Generate'}
        </CostedButton>
        {blockedReason && <p className={helpText}>{blockedReason}</p>}
      </div>
    </section>
  )
}
