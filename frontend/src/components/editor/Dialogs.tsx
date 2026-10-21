import { useEffect, useMemo, useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { CheckCircle, SpinnerGap } from '@phosphor-icons/react'
import { postsApi } from '../../api/client'
import CostedButton from '../cost/CostedButton'
import InstagramPreview from '../posts/InstagramPreview'
import { resizeDoc, setCaption } from './actions'
import { engine } from './engine'
import { downloadExport, renderBlob, renderPage, type ExportFormat } from './export'
import { MAX_SIZE, MIN_SIZE, SIZE_PRESETS, sizeLabel } from './model'
import { newDesign } from './persistence'
import { editorStore, useEditor } from './store'
import { Dialog, NumberField, Segmented, SectionTitle, Slider, TextButton, focusRing } from './ui'

// ---------------------------------------------------------------------------------------------
// resize / new design

export function ResizeDialog({ mode, onClose }: { mode: 'resize' | 'new'; onClose: () => void }) {
  const doc = useEditor((s) => s.doc)
  const [w, setW] = useState(mode === 'resize' ? doc.width : 1080)
  const [h, setH] = useState(mode === 'resize' ? doc.height : 1350)
  const [busy, setBusy] = useState(false)
  const valid = w >= MIN_SIZE && w <= MAX_SIZE && h >= MIN_SIZE && h <= MAX_SIZE
  const groups = ['Instagram', 'Social'] as const
  const go = async () => {
    if (!valid) return
    setBusy(true)
    try {
      if (mode === 'resize') resizeDoc(Math.round(w), Math.round(h))
      else await newDesign(Math.round(w), Math.round(h))
      onClose()
    } finally {
      setBusy(false)
    }
  }
  return (
    <Dialog
      title={mode === 'resize' ? 'Resize design' : 'New design'}
      onClose={onClose}
      width={540}
      footer={
        <>
          <TextButton onClick={onClose}>Cancel</TextButton>
          <TextButton primary disabled={!valid || busy} onClick={() => void go()}>
            {mode === 'resize' ? 'Resize' : 'Create design'}
          </TextButton>
        </>
      }
    >
      {mode === 'resize' && <p className="mb-3 text-xs text-muted">All pages are resized together. Photos re-fit the new shape; text and shapes scale with it. You can undo this.</p>}
      {groups.map((g) => (
        <div key={g} className="mb-4">
          <SectionTitle>{g === 'Instagram' ? 'Instagram and stories' : 'Other social sizes'}</SectionTitle>
          <div className="grid grid-cols-2 gap-2">
            {SIZE_PRESETS.filter((p) => p.group === g).map((p) => {
              const on = p.width === w && p.height === h
              return (
                <button
                  key={p.id}
                  type="button"
                  aria-pressed={on}
                  onClick={() => {
                    setW(p.width)
                    setH(p.height)
                  }}
                  className={`flex items-center gap-3 rounded-lg border px-3 py-2 text-left ${focusRing} ${on ? 'border-accent bg-accent/8' : 'border-line hover:bg-surface-2'}`}
                >
                  <span className="flex h-9 w-9 shrink-0 items-center justify-center">
                    <span className="block rounded-[2px] border-2 border-ink/50" style={{ width: p.width >= p.height ? 30 : (30 * p.width) / p.height, height: p.height >= p.width ? 30 : (30 * p.height) / p.width }} />
                  </span>
                  <span className="min-w-0">
                    <span className="block truncate text-[13px] font-medium text-ink">{p.label}</span>
                    <span className="block text-xs tabular-nums text-muted">
                      {p.width} x {p.height} px
                    </span>
                  </span>
                </button>
              )
            })}
          </div>
        </div>
      ))}
      <SectionTitle>Custom size</SectionTitle>
      <div className="flex items-end gap-2">
        <NumberField label="Width" value={w} min={MIN_SIZE} max={MAX_SIZE} onChange={setW} suffix="px" className="w-32" />
        <NumberField label="Height" value={h} min={MIN_SIZE} max={MAX_SIZE} onChange={setH} suffix="px" className="w-32" />
        <span className="pb-2 text-xs text-muted">{sizeLabel(Math.round(w), Math.round(h))}</span>
      </div>
      {!valid && <p className="mt-2 text-xs text-danger">Use sizes between {MIN_SIZE} and {MAX_SIZE} px.</p>}
    </Dialog>
  )
}

// ---------------------------------------------------------------------------------------------
// download

export function DownloadDialog({ onClose }: { onClose: () => void }) {
  const doc = useEditor((s) => s.doc)
  const activeId = useEditor((s) => s.activePageId)
  const [format, setFormat] = useState<ExportFormat>('png')
  const [quality, setQuality] = useState(92)
  const [scale, setScale] = useState<'1' | '2'>('1')
  const [scope, setScope] = useState<'current' | 'all' | 'pick'>('current')
  const [picked, setPicked] = useState<string[]>([activeId])
  const [progress, setProgress] = useState<string | null>(null)
  const [error, setError] = useState('')
  const [done, setDone] = useState('')

  const pageIds = useMemo(() => {
    if (scope === 'current') return [activeId]
    if (scope === 'all') return doc.pages.filter((p) => !p.hidden).map((p) => p.id)
    return doc.pages.filter((p) => picked.includes(p.id)).map((p) => p.id)
  }, [scope, doc.pages, activeId, picked])
  const W = Math.round(doc.width * Number(scale))
  const H = Math.round(doc.height * Number(scale))

  const run = async () => {
    setError('')
    setDone('')
    engine.finishEditing()
    setProgress('Preparing')
    try {
      const r = await downloadExport(editorStore.getState().doc, { format, quality: quality / 100, scale: Number(scale), pageIds }, (d, t) => setProgress(`Rendering ${d} of ${t}`))
      setDone(`Saved ${r.filename}`)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'The download failed')
    } finally {
      setProgress(null)
    }
  }

  return (
    <Dialog
      title="Download"
      onClose={onClose}
      width={500}
      footer={
        <>
          <TextButton onClick={onClose}>Close</TextButton>
          <TextButton primary disabled={!!progress || !pageIds.length} onClick={() => void run()}>
            {progress ? <><SpinnerGap size={14} className="animate-spin" /> {progress}</> : 'Download'}
          </TextButton>
        </>
      }
    >
      <div className="space-y-5">
        <div>
          <SectionTitle>File type</SectionTitle>
          <Segmented
            label="File type"
            value={format}
            onChange={setFormat}
            options={[
              { value: 'png', label: 'PNG' },
              { value: 'jpg', label: 'JPG' },
              { value: 'pdf', label: 'PDF' },
            ]}
          />
          <p className="mt-1.5 text-xs text-muted">
            {format === 'png' && 'Lossless, best for text and graphics.'}
            {format === 'jpg' && 'Smaller files; Instagram re-compresses anyway.'}
            {format === 'pdf' && 'One PDF with a page for each selected page.'}
          </p>
        </div>
        {format === 'jpg' && <Slider label="Quality" value={quality} min={40} max={100} onChange={setQuality} format={(v) => `${v}%`} />}
        <div>
          <SectionTitle>Size</SectionTitle>
          <Segmented label="Size" value={scale} onChange={setScale} options={[{ value: '1', label: '1x' }, { value: '2', label: '2x' }]} />
          <p className="mt-1.5 text-xs tabular-nums text-muted">
            {W} x {H} px
          </p>
        </div>
        <div>
          <SectionTitle>Pages</SectionTitle>
          <div className="space-y-1.5 text-[13px]">
            {(
              [
                ['current', 'Current page'],
                ['all', `All pages (${doc.pages.filter((p) => !p.hidden).length})${format === 'pdf' ? '' : ' as a ZIP'}`],
                ['pick', 'Choose pages'],
              ] as const
            ).map(([v, l]) => (
              <label key={v} className="flex cursor-pointer items-center gap-2 text-ink">
                <input type="radio" name="scope" checked={scope === v} onChange={() => setScope(v)} className="accent-[var(--accent-color)]" />
                {l}
              </label>
            ))}
            {scope === 'pick' && (
              <div className="ml-6 mt-1 flex flex-wrap gap-2">
                {doc.pages.map((p, i) => (
                  <label key={p.id} className="flex cursor-pointer items-center gap-1 rounded-md border border-line px-2 py-1 text-xs">
                    <input type="checkbox" checked={picked.includes(p.id)} onChange={(e) => setPicked(e.target.checked ? [...picked, p.id] : picked.filter((x) => x !== p.id))} className="accent-[var(--accent-color)]" />
                    Page {i + 1}
                  </label>
                ))}
              </div>
            )}
          </div>
        </div>
        {error && <p role="alert" className="text-xs text-danger">{error}</p>}
        {done && <p role="status" className="flex items-center gap-1.5 text-xs text-success"><CheckCircle size={14} weight="fill" /> {done}</p>}
      </div>
    </Dialog>
  )
}

// ---------------------------------------------------------------------------------------------
// instagram preview

export function PreviewDialog({ onClose }: { onClose: () => void }) {
  const doc = useEditor((s) => s.doc)
  const [images, setImages] = useState<string[]>([])
  const [loading, setLoading] = useState(true)
  useEffect(() => {
    let live = true
    engine.finishEditing()
    const d = editorStore.getState().doc
    setLoading(true)
    ;(async () => {
      const out: string[] = []
      for (const p of d.pages.filter((x) => !x.hidden)) {
        const c = await renderPage(d, p, Math.min(1, 720 / d.width))
        out.push(c.toDataURL('image/jpeg', 0.85))
      }
      if (live) {
        setImages(out)
        setLoading(false)
      }
    })().catch(() => live && setLoading(false))
    return () => {
      live = false
    }
  }, [])
  return (
    <Dialog title="Instagram preview" onClose={onClose} width={420} footer={<TextButton onClick={onClose}>Close</TextButton>}>
      <div className="flex justify-center">
        <InstagramPreview images={images} caption={doc.caption} aspect={doc.width / doc.height} loading={loading} />
      </div>
      <p className="mt-3 text-center text-xs text-muted">
        {images.length > 1 ? `Carousel of ${images.length} slides.` : 'Single image post.'} Hidden pages are skipped.
      </p>
    </Dialog>
  )
}

// ---------------------------------------------------------------------------------------------
// publish

export function PublishDialog({ onClose }: { onClose: () => void }) {
  const qc = useQueryClient()
  const doc = useEditor((s) => s.doc)
  const pages = doc.pages.filter((p) => !p.hidden)
  const [step, setStep] = useState<string | null>(null)
  const [error, setError] = useState('')
  const [mediaId, setMediaId] = useState<string | null>(null)
  const [savedNote, setSavedNote] = useState('')
  const tooMany = pages.length > 10
  const imageCount = pages.some((p) => p.objects.some((o) => o.type === 'image' && o.assetId))

  const ensureDraft = async (): Promise<number> => {
    const d = editorStore.getState().doc
    const payload = { final_text: d.caption, template_id: d.pages[0]?.templateId ?? null }
    if (d.draftId) {
      try {
        await postsApi.updateDraft(d.draftId, payload)
        return d.draftId
      } catch {
        // the draft row was deleted on the server: fall through and create a new one
      }
    }
    const created = await postsApi.createDraft({ source: 'manual', ...payload, image_source_url: d.title })
    editorStore.commit((x) => ({ ...x, draftId: created.id }))
    return created.id
  }

  const saveDraft = async () => {
    setError('')
    setStep('Saving draft')
    try {
      await ensureDraft()
      await qc.invalidateQueries({ queryKey: ['posts', 'drafts'] })
      setSavedNote('Draft saved')
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not save the draft')
    } finally {
      setStep(null)
    }
  }

  const publish = async () => {
    setError('')
    setMediaId(null)
    engine.finishEditing()
    try {
      const d = editorStore.getState().doc
      const list = d.pages.filter((p) => !p.hidden)
      if (!list.length) throw new Error('There is no visible page to publish.')
      if (list.length > 10) throw new Error('Instagram carousels hold at most 10 slides.')
      const urls: string[] = []
      for (let i = 0; i < list.length; i++) {
        setStep(`Rendering slide ${i + 1} of ${list.length}`)
        const blob = await renderBlob(d, list[i], 'jpg', 0.92, 1)
        setStep(`Uploading slide ${i + 1} of ${list.length}`)
        urls.push((await postsApi.uploadToHost(blob)).url)
      }
      setStep('Publishing to Instagram')
      const id = await ensureDraft()
      await postsApi.updateDraft(id, { final_image_config: { hosted_image_urls: urls } })
      const res = await postsApi.publish(id)
      setMediaId(res.media_id)
      await qc.invalidateQueries({ queryKey: ['posts', 'drafts'] })
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Publishing failed')
    } finally {
      setStep(null)
    }
  }

  return (
    <Dialog
      title="Publish to Instagram"
      onClose={onClose}
      width={500}
      footer={
        <>
          <TextButton onClick={onClose}>Close</TextButton>
          <TextButton disabled={!!step} onClick={() => void saveDraft()}>Save draft</TextButton>
          <CostedButton
            action="posts.publish"
            onClick={() => void publish()}
            disabled={!!step || tooMany || !pages.length || !imageCount}
            className="inline-flex h-8 items-center gap-1.5 rounded-md bg-accent px-3 text-[13px] font-medium text-accent-fg hover:bg-accent-hover disabled:opacity-40"
            title={!imageCount ? 'Add a photo first' : undefined}
          >
            {step ? <><SpinnerGap size={14} className="animate-spin" /> Working</> : pages.length > 1 ? `Publish carousel (${pages.length})` : 'Publish'}
          </CostedButton>
        </>
      }
    >
      <div className="space-y-4">
        <p className="text-[13px] text-muted">
          {pages.length > 1 ? `${pages.length} visible pages will be posted as a carousel.` : 'The visible page will be posted as a single image.'} Each slide is rendered at {doc.width} x {doc.height} px and hosted on Cloudinary so Instagram can fetch it.
        </p>
        <label className="block">
          <span className="mb-1 block text-xs font-semibold text-muted">Caption</span>
          <textarea value={doc.caption} onChange={(e) => setCaption(e.target.value)} rows={5} className="w-full resize-y rounded-md border border-line bg-app px-3 py-2 text-[13px] text-ink outline-none focus:border-accent" placeholder="Write the Instagram caption" />
        </label>
        {tooMany && <p className="text-xs text-danger">Instagram carousels hold at most 10 slides. Hide or delete some pages.</p>}
        {!imageCount && <p className="text-xs text-muted">Add a photo to the design before publishing.</p>}
        {step && <p role="status" className="flex items-center gap-2 text-xs text-muted"><SpinnerGap size={14} className="animate-spin" /> {step}</p>}
        {savedNote && !step && !mediaId && !error && <p role="status" className="text-xs text-success">{savedNote}</p>}
        {mediaId && <p role="status" className="flex items-center gap-1.5 text-xs text-success"><CheckCircle size={14} weight="fill" /> Published. Media id {mediaId}</p>}
        {error && <p role="alert" className="text-xs text-danger">{error}</p>}
      </div>
    </Dialog>
  )
}

// ---------------------------------------------------------------------------------------------
// shortcuts

const SHORTCUTS: [string, string][] = [
  ['T', 'Add text'],
  ['R', 'Add rectangle'],
  ['C', 'Add circle'],
  ['L', 'Add line'],
  ['Cmd/Ctrl + Z', 'Undo'],
  ['Cmd/Ctrl + Shift + Z or Y', 'Redo'],
  ['Cmd/Ctrl + C / X / V', 'Copy, cut, paste (images too)'],
  ['Cmd/Ctrl + D', 'Duplicate'],
  ['Cmd/Ctrl + G', 'Group'],
  ['Cmd/Ctrl + Shift + G', 'Ungroup'],
  ['Cmd/Ctrl + A', 'Select all on the page'],
  ['Delete / Backspace', 'Delete'],
  ['Arrow keys', 'Nudge 1 px (hold Shift for 10 px)'],
  ['Cmd/Ctrl + ] / [', 'Bring forward / send backward'],
  ['Enter', 'Edit selected text, or apply a crop'],
  ['Esc', 'Deselect, or cancel a crop'],
  ['Cmd/Ctrl + + / - / 0', 'Zoom in, out, fit'],
  ['Cmd/Ctrl + wheel', 'Zoom'],
  ['Alt while dragging', 'Turn off snapping'],
  ['Cmd/Ctrl + S', 'Save now'],
]
export function ShortcutsDialog({ onClose }: { onClose: () => void }) {
  return (
    <Dialog title="Keyboard shortcuts" onClose={onClose} width={480}>
      <dl className="grid grid-cols-[auto_1fr] gap-x-6 gap-y-2 text-[13px]">
        {SHORTCUTS.map(([k, v]) => (
          <div key={k} className="contents">
            <dt className="whitespace-nowrap font-medium tabular-nums text-ink">{k}</dt>
            <dd className="text-muted">{v}</dd>
          </div>
        ))}
      </dl>
    </Dialog>
  )
}
