import { useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  ArrowCounterClockwise,
  CaretLeft,
  ChatsCircle,
  CloudCheck,
  CloudSlash,
  Copy,
  FolderSimple,
  Layout,
  Palette,
  Plus,
  Shapes,
  SpinnerGap,
  TextT,
  Trash,
  UploadSimple,
} from '@phosphor-icons/react'
import { postsApi } from '../../api/client'
import CostedButton from '../cost/CostedButton'
import type { PostDraft } from '../../types'
import {
  addFrame,
  addImageAsset,
  addImageFiles,
  addObjects,
  addRoundedRect,
  addShape,
  addText,
  addTextCombo,
  applyLayoutPreset,
  applyTemplate,
  LAYOUT_PRESETS,
  patch,
  resetImage,
  restoreOriginalImage,
  runCutout,
  selectedModels,
  setBackground,
  setCaption,
  TEXT_COMBOS,
  applyOpinion,
  type TextKind,
} from './actions'
import { docAssetIds, listGallery, onAssetsChanged, removeFromGallery, type AssetMeta } from './assets'
import { GRADIENTS, paintCss, useBrandColors } from './colors'
import { ADJUST_CONTROLS, FILTER_PRESETS, filterThumb } from './imageFx'
import { cssGradient } from './fabricBuild'
import { addCustomFont, FONT_ACCEPT, getCustomFonts, getSyncState, onFontsChanged, removeCustomFont, syncFonts } from './fonts'
import { isNeutralAdjustments, newText, type ImageObj, type ObjModel } from './model'
import { deleteDesign, duplicateDesign, listDesigns, openDesign, type DesignRecord } from './persistence'
import { editorStore, useEditor, type PanelId } from './store'
import { IconButton, Segmented, SectionTitle, Slider, TextButton, focusRing } from './ui'

// ---------------------------------------------------------------------------------------------
// rail

const RAIL: { id: Exclude<PanelId, null | 'editimage'>; label: string; icon: React.ReactNode }[] = [
  { id: 'design', label: 'Design', icon: <Layout size={22} /> },
  { id: 'elements', label: 'Elements', icon: <Shapes size={22} /> },
  { id: 'text', label: 'Text', icon: <TextT size={22} /> },
  { id: 'uploads', label: 'Uploads', icon: <UploadSimple size={22} /> },
  { id: 'brand', label: 'Brand', icon: <Palette size={22} /> },
  { id: 'projects', label: 'Projects', icon: <FolderSimple size={22} /> },
  { id: 'opinions', label: 'Opinions', icon: <ChatsCircle size={22} /> },
]

export function Rail() {
  const panel = useEditor((s) => s.panel)
  return (
    <nav aria-label="Editor panels" className="relative z-40 flex w-[72px] shrink-0 flex-col items-center gap-1 border-r border-line bg-surface py-2">
      {RAIL.map((r) => {
        const active = panel === r.id || (r.id === 'design' && false)
        return (
          <button
            key={r.id}
            type="button"
            aria-pressed={active}
            onClick={() => editorStore.set({ panel: active ? null : r.id })}
            className={`flex h-[58px] w-[60px] flex-col items-center justify-center gap-1 rounded-lg text-[11px] font-medium transition-colors ${focusRing} ${active ? 'bg-accent/12 text-accent' : 'text-muted hover:bg-surface-2 hover:text-ink'}`}
          >
            {r.icon}
            {r.label}
          </button>
        )
      })}
    </nav>
  )
}

function PanelShell({ title, children, onBack }: { title: string; children: React.ReactNode; onBack?: () => void }) {
  return (
    <section aria-label={title} className="relative z-40 flex w-[320px] shrink-0 flex-col border-r border-line bg-surface">
      <header className="flex h-11 shrink-0 items-center gap-1 border-b border-line px-3">
        {onBack && (
          <IconButton label="Back" onClick={onBack}>
            <CaretLeft size={16} />
          </IconButton>
        )}
        <h2 className="flex-1 text-sm font-semibold text-ink">{title}</h2>
        <IconButton label="Hide panel" onClick={() => editorStore.set({ panel: null })}>
          <CaretLeft size={16} />
        </IconButton>
      </header>
      <div className="editor-scroll min-h-0 flex-1 overflow-y-auto p-3">{children}</div>
    </section>
  )
}

export function SidePanel({ onDialog }: { onDialog: (d: 'new') => void }) {
  const panel = useEditor((s) => s.panel)
  if (!panel) return null
  switch (panel) {
    case 'design':
      return <DesignPanel />
    case 'elements':
      return <ElementsPanel />
    case 'text':
      return <TextPanel />
    case 'uploads':
      return <UploadsPanel />
    case 'brand':
      return <BrandPanel />
    case 'projects':
      return <ProjectsPanel onNew={() => onDialog('new')} />
    case 'opinions':
      return <OpinionsPanel />
    case 'editimage':
      return <EditImagePanel />
  }
}

// ---------------------------------------------------------------------------------------------
// design: templates + layouts

const TEMPLATE_CARDS = [
  { id: 1, name: 'Darkened background', desc: 'Photo darkened and desaturated, headline, corner watermark', bg: 'linear-gradient(160deg,#3a3f4b,#14161b)', op: 1 },
  { id: 2, name: 'Transparency overlay', desc: 'Photo at 45% over black, centred headline', bg: 'linear-gradient(160deg,#56606f,#1d2027)', op: 0.55 },
  { id: 3, name: 'Background removed', desc: 'Subject cut out on black, headline below', bg: 'radial-gradient(circle at 50% 38%,#8a93a3 0,#8a93a3 22%,#000 23%)', op: 1 },
]

function DesignPanel() {
  const page = useEditor((s) => s.doc.pages.find((p) => p.id === s.activePageId) ?? s.doc.pages[0])
  const doc = useEditor((s) => s.doc)
  return (
    <PanelShell title="Design">
      <SectionTitle>Templates for this page</SectionTitle>
      <div className="space-y-2">
        {TEMPLATE_CARDS.map((t) => (
          <button
            key={t.id}
            type="button"
            onClick={() => applyTemplate(t.id)}
            className={`flex w-full gap-3 rounded-lg border p-2 text-left transition-colors ${focusRing} ${page.templateId === t.id ? 'border-accent bg-accent/8' : 'border-line hover:bg-surface-2'}`}
          >
            <span className="relative h-16 w-16 shrink-0 overflow-hidden rounded-md bg-black">
              <span className="absolute inset-0" style={{ background: t.bg, opacity: t.op }} />
              <span className="absolute inset-x-2 bottom-3 space-y-1">
                <span className="block h-1 rounded bg-white/90" />
                <span className="block h-1 w-2/3 rounded bg-white/70" />
              </span>
            </span>
            <span className="min-w-0">
              <span className="block text-[13px] font-semibold text-ink">{t.name}</span>
              <span className="mt-0.5 block text-xs leading-snug text-muted">{t.desc}</span>
            </span>
          </button>
        ))}
      </div>
      <p className="mt-2 text-xs text-faint">Add a photo from Uploads and it takes the look of the page template.</p>

      <div className="mt-5">
        <SectionTitle>Layouts</SectionTitle>
        <div className="grid grid-cols-2 gap-2">
          {LAYOUT_PRESETS.map((p) => {
            const objs = p.make(doc.width, doc.height)
            return (
              <button key={p.id} type="button" onClick={() => applyLayoutPreset(p)} className={`rounded-lg border border-line p-1.5 text-left hover:bg-surface-2 ${focusRing}`}>
                <LayoutMini objs={objs} w={doc.width} h={doc.height} />
                <span className="mt-1.5 block px-0.5 text-xs font-medium text-ink">{p.label}</span>
              </button>
            )
          })}
        </div>
      </div>
    </PanelShell>
  )
}

function LayoutMini({ objs, w, h }: { objs: ObjModel[]; w: number; h: number }) {
  return (
    <span className="relative block overflow-hidden rounded bg-[#15171c]" style={{ aspectRatio: `${w}/${h}` }}>
      {objs.map((o) => {
        if (o.type === 'text') {
          const bh = Math.max(2, (o.fontSize / h) * 100 * 0.7)
          return <span key={o.id} className="absolute rounded-[1px] bg-white/80" style={{ left: `${((o.x - Math.min(o.width, w * 0.8) / 2) / w) * 100}%`, width: `${(Math.min(o.width, w * 0.8) / w) * 100}%`, top: `${(o.y / h) * 100 - bh / 2}%`, height: `${bh}%`, opacity: o.opacity }} />
        }
        return (
          <span
            key={o.id}
            className={`absolute ${o.type === 'image' ? 'border border-dashed border-white/60 bg-white/15' : ''}`}
            style={{
              left: `${((o.x - o.width / 2) / w) * 100}%`,
              top: `${((o.y - o.height / 2) / h) * 100}%`,
              width: `${(o.width / w) * 100}%`,
              height: `${(o.height / h) * 100}%`,
              background: o.type === 'shape' ? paintCss(o.fill) : undefined,
              borderRadius: o.type === 'image' && o.frame === 'arch' ? '999px 999px 0 0' : undefined,
            }}
          />
        )
      })}
    </span>
  )
}

// ---------------------------------------------------------------------------------------------
// elements

function ElementsPanel() {
  const shapeBtn = 'flex h-16 items-center justify-center rounded-lg border border-line hover:bg-surface-2 ' + focusRing
  return (
    <PanelShell title="Elements">
      <SectionTitle>Shapes</SectionTitle>
      <div className="grid grid-cols-4 gap-2">
        <button type="button" aria-label="Rectangle" title="Rectangle (R)" className={shapeBtn} onClick={() => addShape('rect')}>
          <span className="h-8 w-8 bg-ink/80" />
        </button>
        <button type="button" aria-label="Rounded rectangle" title="Rounded rectangle" className={shapeBtn} onClick={addRoundedRect}>
          <span className="h-8 w-8 rounded-lg bg-ink/80" />
        </button>
        <button type="button" aria-label="Circle" title="Circle (C)" className={shapeBtn} onClick={() => addShape('circle')}>
          <span className="h-8 w-8 rounded-full bg-ink/80" />
        </button>
        <button type="button" aria-label="Triangle" title="Triangle" className={shapeBtn} onClick={() => addShape('triangle')}>
          <span className="h-8 w-8 bg-ink/80" style={{ clipPath: 'polygon(50% 5%, 100% 95%, 0 95%)' }} />
        </button>
        <button type="button" aria-label="Star" title="Star" className={shapeBtn} onClick={() => addShape('star')}>
          <span className="h-9 w-9 bg-ink/80" style={{ clipPath: 'polygon(50% 0,61% 35%,98% 35%,68% 57%,79% 91%,50% 70%,21% 91%,32% 57%,2% 35%,39% 35%)' }} />
        </button>
        <button type="button" aria-label="Line" title="Line (L)" className={shapeBtn} onClick={() => addShape('line')}>
          <span className="h-0.5 w-9 rounded bg-ink/80" />
        </button>
        <button type="button" aria-label="Arrow" title="Arrow" className={shapeBtn} onClick={() => addShape('arrow')}>
          <svg width="36" height="16" viewBox="0 0 36 16" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" className="text-ink/80">
            <path d="M2 8h30M25 2l7 6-7 6" />
          </svg>
        </button>
      </div>

      <div className="mt-5">
        <SectionTitle>Frames</SectionTitle>
        <p className="mb-2 text-xs text-faint">Select a photo first to mask it, or add an empty frame and drop a photo in.</p>
        <div className="grid grid-cols-3 gap-2">
          <button type="button" aria-label="Circle frame" className={shapeBtn} onClick={() => addFrame('circle')}>
            <span className="h-10 w-10 rounded-full border-2 border-dashed border-ink/50 bg-ink/10" />
          </button>
          <button type="button" aria-label="Rounded frame" className={shapeBtn} onClick={() => addFrame('rounded')}>
            <span className="h-10 w-10 rounded-xl border-2 border-dashed border-ink/50 bg-ink/10" />
          </button>
          <button type="button" aria-label="Arch frame" className={shapeBtn} onClick={() => addFrame('arch')}>
            <span className="h-12 w-9 rounded-t-full border-2 border-dashed border-ink/50 bg-ink/10" />
          </button>
        </div>
      </div>

      <div className="mt-5">
        <SectionTitle>Gradient backgrounds</SectionTitle>
        <div className="grid grid-cols-4 gap-2">
          {GRADIENTS.map((g, i) => (
            <button key={i} type="button" aria-label={`Use gradient ${i + 1} as page background`} onClick={() => setBackground(g)} className={`h-12 rounded-lg border border-black/15 ${focusRing}`} style={{ background: cssGradient(g) }} />
          ))}
        </div>
      </div>
    </PanelShell>
  )
}

// ---------------------------------------------------------------------------------------------
// text

function TextPanel() {
  const kinds: { k: TextKind; label: string; cls: string }[] = [
    { k: 'heading', label: 'Add a heading', cls: 'text-2xl font-bold' },
    { k: 'subheading', label: 'Add a subheading', cls: 'text-lg font-semibold' },
    { k: 'body', label: 'Add a little bit of body text', cls: 'text-sm' },
  ]
  return (
    <PanelShell title="Text">
      <div className="space-y-2">
        {kinds.map((t) => (
          <button key={t.k} type="button" onClick={() => addText(t.k)} className={`flex h-14 w-full items-center rounded-lg border border-line px-4 text-left text-ink hover:bg-surface-2 ${t.cls} ${focusRing}`}>
            {t.label}
          </button>
        ))}
      </div>
      <div className="mt-5">
        <SectionTitle>Font combinations</SectionTitle>
        <div className="grid grid-cols-2 gap-2">
          {TEXT_COMBOS.map((c) => (
            <button key={c.id} type="button" onClick={() => addTextCombo(c)} className={`flex h-24 flex-col items-center justify-center overflow-hidden rounded-lg border border-line bg-[#15171c] px-2 text-center text-white hover:border-accent ${focusRing}`}>
              {c.make(1080, 1080, '#ffffff').map((t) => (
                <span key={t.id} className="block max-w-full truncate leading-tight" style={{ fontFamily: `"${t.fontFamily}"`, fontSize: Math.max(8, Math.min(22, t.fontSize / 7)), fontWeight: t.bold ? 700 : 400, fontStyle: t.italic ? 'italic' : 'normal', textTransform: t.caseMode === 'upper' ? 'uppercase' : undefined, letterSpacing: t.letterSpacing / 1000 + 'em', WebkitTextStroke: t.hollow ? '0.6px #fff' : undefined, color: t.hollow ? 'transparent' : undefined }}>
                  {t.text}
                </span>
              ))}
              <span className="sr-only">{c.label}</span>
            </button>
          ))}
        </div>
      </div>
    </PanelShell>
  )
}

// ---------------------------------------------------------------------------------------------
// uploads

function useGallery() {
  const [items, setItems] = useState<AssetMeta[]>([])
  const [loading, setLoading] = useState(true)
  useEffect(() => {
    let live = true
    const load = () =>
      listGallery()
        .then((l) => live && setItems(l))
        .finally(() => live && setLoading(false))
    void load()
    const off = onAssetsChanged(() => void load())
    return () => {
      live = false
      off()
    }
  }, [])
  return { items, loading }
}

function UploadsPanel() {
  const { items, loading } = useGallery()
  const input = useRef<HTMLInputElement>(null)
  const [over, setOver] = useState(false)
  const [confirm, setConfirm] = useState<string | null>(null)

  const remove = async (id: string) => {
    const doc = editorStore.getState().doc
    let used = docAssetIds(doc).includes(id)
    if (!used) {
      const all = await listDesigns().catch(() => [])
      used = all.some((d) => docAssetIds(d.doc).includes(id))
    }
    await removeFromGallery(id, used)
    setConfirm(null)
  }

  return (
    <PanelShell title="Uploads">
      <TextButton primary className="w-full !h-9" onClick={() => input.current?.click()}>
        <UploadSimple size={15} /> Upload images
      </TextButton>
      <input ref={input} type="file" accept="image/*" multiple hidden onChange={(e) => { void addImageFiles([...(e.target.files ?? [])], { asLayer: false }); e.target.value = '' }} />
      <div
        onDragOver={(e) => { e.preventDefault(); setOver(true) }}
        onDragLeave={() => setOver(false)}
        onDrop={(e) => { e.preventDefault(); setOver(false); void addImageFiles([...e.dataTransfer.files]) }}
        className={`mt-2 rounded-lg border border-dashed px-3 py-4 text-center text-xs ${over ? 'border-accent bg-accent/8 text-accent' : 'border-line-strong text-muted'}`}
      >
        Drop photos here, or paste with Cmd+V. Each stays on this device and goes to Cloudinary only when you publish.
      </div>
      <p className="mt-2 text-xs text-faint">Getty blocks automated search: download manually from gettyimages.com, then upload here.</p>

      <div className="mt-4">
        <SectionTitle>Your uploads</SectionTitle>
        {loading ? (
          <div className="grid grid-cols-2 gap-2">{[0, 1, 2, 3].map((i) => <div key={i} className="aspect-square animate-pulse rounded-lg bg-surface-2" />)}</div>
        ) : items.length === 0 ? (
          <p className="rounded-lg bg-surface-2 px-3 py-4 text-center text-xs text-muted">No uploads yet. Photos you add appear here for reuse in any design.</p>
        ) : (
          <ul className="grid grid-cols-2 gap-2">
            {items.map((a) => (
              <li key={a.id} className="group relative">
                <button
                  type="button"
                  draggable
                  onDragStart={(e) => e.dataTransfer.setData('application/x-cs-asset', a.id)}
                  onClick={() => void addImageAsset(a.id)}
                  title={a.name}
                  className={`block aspect-square w-full overflow-hidden rounded-lg border border-line bg-surface-2 ${focusRing}`}
                >
                  <img src={a.thumb} alt={a.name} className="h-full w-full object-cover" draggable={false} />
                </button>
                {confirm === a.id ? (
                  <span className="absolute inset-x-1 bottom-1 flex gap-1">
                    <button type="button" className="h-6 flex-1 rounded bg-danger text-[11px] font-medium text-white" onClick={() => void remove(a.id)}>Remove</button>
                    <button type="button" className="h-6 flex-1 rounded bg-surface text-[11px] font-medium text-ink" onClick={() => setConfirm(null)}>Keep</button>
                  </span>
                ) : (
                  <button type="button" aria-label={`Remove ${a.name}`} onClick={() => setConfirm(a.id)} className={`absolute right-1 top-1 hidden h-6 w-6 items-center justify-center rounded-full bg-black/65 text-white group-focus-within:flex group-hover:flex ${focusRing}`}>
                    <Trash size={12} />
                  </button>
                )}
              </li>
            ))}
          </ul>
        )}
      </div>
    </PanelShell>
  )
}

// ---------------------------------------------------------------------------------------------
// brand

function useFontList() {
  return useSyncExternalStore(onFontsChanged, getCustomFonts)
}

function BrandPanel() {
  const { colors, add, remove } = useBrandColors()
  const fonts = useFontList()
  const sync = useSyncExternalStore(onFontsChanged, getSyncState)
  const file = useRef<HTMLInputElement>(null)
  const [busy, setBusy] = useState(false)
  const [over, setOver] = useState(false)
  const [pick, setPick] = useState('#febe10')

  const applyColor = (c: string) => {
    const sel = selectedModels()
    if (!sel.length) {
      setBackground(c)
      return
    }
    for (const m of sel) {
      if (m.type === 'text') patch([m.id], { fill: c }, 'brandfill')
      else if (m.type === 'shape') patch([m.id], m.kind === 'line' || m.kind === 'arrow' ? { stroke: c } : { fill: c }, 'brandfill')
    }
  }
  const applyFont = (family: string) => {
    const sel = selectedModels().filter((m) => m.type === 'text')
    if (sel.length) patch(sel.map((m) => m.id), { fontFamily: family }, 'font')
    else {
      const d = editorStore.getState().doc
      addObjects([newText({ x: d.width / 2, y: d.height / 2, text: 'Your text', width: Math.min(900, d.width - 120), fontFamily: family, fontSize: 110, bold: false })])
    }
  }
  const upload = async (files: File[]) => {
    setBusy(true)
    for (const f of files) {
      try {
        await addCustomFont(f)
      } catch (e) {
        editorStore.notify(e instanceof Error ? e.message : 'Could not add that font', 'error')
      }
    }
    setBusy(false)
  }

  return (
    <PanelShell title="Brand">
      <SectionTitle>Brand colours</SectionTitle>
      <div className="flex flex-wrap items-center gap-2">
        {colors.map((c) => (
          <span key={c} className="group relative">
            <button type="button" aria-label={`Apply ${c}`} title={`Apply ${c}`} onClick={() => applyColor(c)} className={`h-9 w-9 rounded-lg border border-black/15 ${focusRing}`} style={{ background: c }} />
            <button type="button" aria-label={`Remove ${c}`} onClick={() => remove(c)} className="absolute -right-1 -top-1 hidden h-4 w-4 items-center justify-center rounded-full bg-ink text-[10px] leading-none text-surface group-focus-within:flex group-hover:flex">x</button>
          </span>
        ))}
      </div>
      <div className="mt-2 flex items-center gap-2">
        <input type="color" aria-label="New brand colour" value={pick} onChange={(e) => setPick(e.target.value)} className="h-8 w-10 cursor-pointer rounded border border-line bg-transparent" />
        <TextButton onClick={() => add(pick)}><Plus size={13} /> Add colour</TextButton>
      </div>
      <p className="mt-1.5 text-xs text-faint">Click a colour to apply it to the selection (or the page background).</p>

      <div className="mt-6">
        <div className="mb-2 flex items-center justify-between">
          <SectionTitle>Brand fonts</SectionTitle>
          <span className={`mb-2 inline-flex items-center gap-1 text-xs ${sync === 'synced' ? 'text-success' : 'text-faint'}`} title={sync === 'synced' ? 'Fonts are stored on the server too' : 'Fonts are stored on this device only'}>
            {sync === 'synced' ? <CloudCheck size={14} /> : <CloudSlash size={14} />}
            {sync === 'synced' ? 'Synced' : sync === 'syncing' ? 'Syncing' : 'This device'}
          </span>
        </div>
        <div
          onDragOver={(e) => { e.preventDefault(); setOver(true) }}
          onDragLeave={() => setOver(false)}
          onDrop={(e) => { e.preventDefault(); setOver(false); void upload([...e.dataTransfer.files]) }}
          className={`rounded-lg border border-dashed p-3 text-center ${over ? 'border-accent bg-accent/8' : 'border-line-strong'}`}
        >
          <TextButton primary className="!h-9" disabled={busy} onClick={() => file.current?.click()}>
            {busy ? <SpinnerGap size={14} className="animate-spin" /> : <UploadSimple size={15} />} Upload fonts
          </TextButton>
          <p className="mt-2 text-xs text-muted">TTF, OTF, WOFF or WOFF2. Drop files here or browse.</p>
          <input ref={file} type="file" accept={FONT_ACCEPT} multiple hidden onChange={(e) => { void upload([...(e.target.files ?? [])]); e.target.value = '' }} />
        </div>
        {fonts.length === 0 ? (
          <p className="mt-3 text-xs text-faint">No uploaded fonts yet. They appear in every font menu.</p>
        ) : (
          <ul className="mt-3 space-y-1.5">
            {fonts.map((f) => (
              <li key={f.id} className="flex items-center gap-2 rounded-lg border border-line px-3 py-2">
                <button type="button" onClick={() => applyFont(f.family)} className={`min-w-0 flex-1 text-left ${focusRing}`}>
                  <span className="block truncate text-lg leading-tight text-ink" style={{ fontFamily: `"${f.family}"` }}>{f.family}</span>
                  <span className="block text-xs text-faint">{f.format.toUpperCase()} - {Math.max(1, Math.round(f.size / 1024))} KB</span>
                </button>
                <IconButton label={`Remove ${f.family}`} onClick={() => void removeCustomFont(f.id)}><Trash size={15} /></IconButton>
              </li>
            ))}
          </ul>
        )}
        <button type="button" className={`mt-2 text-xs font-medium text-accent hover:text-accent-hover ${focusRing}`} onClick={() => void syncFonts()}>Sync fonts now</button>
      </div>
    </PanelShell>
  )
}

// ---------------------------------------------------------------------------------------------
// projects

function relTime(ts: number) {
  const s = Math.max(1, Math.round((Date.now() - ts) / 1000))
  if (s < 60) return 'just now'
  if (s < 3600) return `${Math.round(s / 60)} min ago`
  if (s < 86400) return `${Math.round(s / 3600)} h ago`
  return new Date(ts).toLocaleDateString()
}

function ProjectsPanel({ onNew }: { onNew: () => void }) {
  const [list, setList] = useState<DesignRecord[] | null>(null)
  const currentId = useEditor((s) => s.doc.id)
  const status = useEditor((s) => s.saveStatus)
  const [confirm, setConfirm] = useState<string | null>(null)
  const refresh = () => listDesigns().then(setList).catch(() => setList([]))
  useEffect(() => {
    void refresh()
    const t = setInterval(() => void refresh(), 4000)
    return () => clearInterval(t)
  }, [status])
  return (
    <PanelShell title="Projects">
      <TextButton primary className="w-full !h-9" onClick={onNew}><Plus size={14} /> New design</TextButton>
      <div className="mt-4">
        {list === null ? (
          <div className="space-y-2">{[0, 1, 2].map((i) => <div key={i} className="h-16 animate-pulse rounded-lg bg-surface-2" />)}</div>
        ) : list.length === 0 ? (
          <p className="rounded-lg bg-surface-2 px-3 py-4 text-center text-xs text-muted">Designs you create are saved here automatically.</p>
        ) : (
          <ul className="space-y-2">
            {list.map((d) => (
              <li key={d.id} className={`flex gap-3 rounded-lg border p-2 ${d.id === currentId ? 'border-accent bg-accent/8' : 'border-line'}`}>
                <button type="button" onClick={() => d.id !== currentId && void openDesign(d.id).then(refresh)} className={`flex min-w-0 flex-1 gap-3 text-left ${focusRing}`}>
                  <span className="flex h-14 w-14 shrink-0 items-center justify-center overflow-hidden rounded-md bg-surface-2">
                    {d.thumb ? <img src={d.thumb} alt="" className="h-full w-full object-contain" /> : null}
                  </span>
                  <span className="min-w-0">
                    <span className="block truncate text-[13px] font-semibold text-ink">{d.title || 'Untitled design'}</span>
                    <span className="block text-xs text-muted">{d.width} x {d.height} - {d.pageCount} {d.pageCount === 1 ? 'page' : 'pages'}</span>
                    <span className="block text-xs text-faint">{d.id === currentId ? 'Open now' : relTime(d.updatedAt)}</span>
                  </span>
                </button>
                <span className="flex flex-col justify-center">
                  {confirm === d.id ? (
                    <>
                      <button type="button" className="h-6 rounded bg-danger px-2 text-[11px] font-medium text-white" onClick={() => { void deleteDesign(d.id).then(refresh); setConfirm(null) }}>Delete</button>
                      <button type="button" className="mt-1 h-6 rounded px-2 text-[11px] text-muted hover:bg-surface-2" onClick={() => setConfirm(null)}>Keep</button>
                    </>
                  ) : (
                    <>
                      <IconButton label="Duplicate design" className="!h-7" onClick={() => void duplicateDesign(d.id).then(refresh)}><Copy size={14} /></IconButton>
                      <IconButton label="Delete design" className="!h-7" disabled={d.id === currentId} onClick={() => setConfirm(d.id)}><Trash size={14} /></IconButton>
                    </>
                  )}
                </span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </PanelShell>
  )
}

// ---------------------------------------------------------------------------------------------
// opinions (match-day suggestions + manual text)

function OpinionsPanel() {
  const qc = useQueryClient()
  const [team, setTeam] = useState('Real Madrid')
  const [own, setOwn] = useState('')
  const caption = useEditor((s) => s.doc.caption)
  const { data: drafts = [], isLoading, isError } = useQuery({ queryKey: ['posts', 'drafts'], queryFn: postsApi.listDrafts })
  const suggestions = drafts.filter((d) => d.source === 'match_scrape')
  const suggest = useMutation({
    mutationFn: (t: string) => postsApi.matchScrape(t),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['posts', 'drafts'] }),
  })
  const use = (d: PostDraft) => {
    const text = d.suggested_opinion_text ?? ''
    applyOpinion(text)
    setCaption(text)
  }
  return (
    <PanelShell title="Opinions">
      <SectionTitle>Suggested from match-day reactions</SectionTitle>
      <div className="mb-2 flex gap-2">
        <input value={team} onChange={(e) => setTeam(e.target.value)} placeholder="Team" aria-label="Team" className="h-8 min-w-0 flex-1 rounded-md border border-line bg-app px-2 text-[13px] text-ink outline-none focus:border-accent" />
        <CostedButton
          action="posts.match_scrape"
          onClick={() => suggest.mutate(team)}
          disabled={suggest.isPending || !team.trim()}
          wrapperClassName="flex shrink-0 flex-col items-end"
          className="h-8 rounded-md border border-line-strong px-3 text-[13px] font-medium text-ink hover:bg-surface-2 disabled:opacity-50"
        >
          {suggest.isPending ? 'Scraping...' : 'Suggest'}
        </CostedButton>
      </div>
      {suggest.isError && <p className="mb-2 text-xs text-danger">{(suggest.error as Error).message}</p>}
      <div className="max-h-72 space-y-2 overflow-y-auto pr-1">
        {isLoading && <p className="text-xs text-faint">Loading suggestions...</p>}
        {isError && <p className="text-xs text-faint">The backend is not reachable for suggestions yet.</p>}
        {!isLoading && !isError && suggestions.length === 0 && <p className="text-xs text-faint">No suggestions yet. Press Suggest to scan match-day reactions.</p>}
        {suggestions.map((s) => (
          <button key={s.id} type="button" onClick={() => use(s)} className={`w-full rounded-lg border border-line p-2.5 text-left text-xs leading-snug text-muted hover:border-accent hover:text-ink ${focusRing}`}>
            {s.suggested_opinion_text}
          </button>
        ))}
      </div>
      <div className="mt-5">
        <SectionTitle>Write your own</SectionTitle>
        <textarea value={own} onChange={(e) => setOwn(e.target.value)} rows={4} placeholder="Enter opinion text (3 to 5 lines)" aria-label="Opinion text" className="w-full resize-y rounded-md border border-line bg-app px-3 py-2 text-[13px] text-ink outline-none focus:border-accent" />
        <div className="mt-2 flex gap-2">
          <TextButton primary disabled={!own.trim()} onClick={() => { applyOpinion(own.trim()); setCaption(own.trim()) }}>Use as headline and caption</TextButton>
        </div>
      </div>
      <div className="mt-5">
        <SectionTitle>Instagram caption</SectionTitle>
        <textarea value={caption} onChange={(e) => setCaption(e.target.value)} rows={4} placeholder="Caption for the post" aria-label="Instagram caption" className="w-full resize-y rounded-md border border-line bg-app px-3 py-2 text-[13px] text-ink outline-none focus:border-accent" />
      </div>
    </PanelShell>
  )
}

// ---------------------------------------------------------------------------------------------
// edit image

function EditImagePanel() {
  const doc = useEditor((s) => s.doc)
  const sel = useEditor((s) => s.selection)
  const busy = useEditor((s) => s.busy)
  const [tab, setTab] = useState<'adjust' | 'filters' | 'background'>('adjust')
  const m = useMemo<ImageObj | null>(() => {
    if (sel.ids.length !== 1) return null
    for (const p of doc.pages) {
      const o = p.objects.find((x) => x.id === sel.ids[0])
      if (o && o.type === 'image') return o
    }
    return null
  }, [doc, sel])
  const back = () => editorStore.set({ panel: 'design' })
  if (!m || !m.assetId) {
    return (
      <PanelShell title="Edit image" onBack={back}>
        <p className="rounded-lg bg-surface-2 px-3 py-4 text-center text-xs text-muted">Select a photo on the canvas to adjust it.</p>
      </PanelShell>
    )
  }
  const ids = [m.id]
  const working = !!busy[`cutout:${m.id}`]
  return (
    <PanelShell title="Edit image" onBack={back}>
      <Segmented
        label="Edit image sections"
        value={tab}
        onChange={setTab}
        options={[
          { value: 'adjust', label: 'Adjust' },
          { value: 'filters', label: 'Filters' },
          { value: 'background', label: 'Background' },
        ]}
      />
      {tab === 'adjust' && (
        <div className="mt-4 space-y-3.5">
          {ADJUST_CONTROLS.map((c) => (
            <Slider
              key={c.key}
              label={c.label}
              value={m.adj[c.key]}
              min={c.min}
              max={100}
              center={c.min < 0}
              onChange={(v) => patch(ids, { adj: { ...m.adj, [c.key]: v } }, 'adj')}
            />
          ))}
          <TextButton className="w-full" disabled={isNeutralAdjustments(m.adj) && !m.filter} onClick={() => resetImage(m.id)}>
            <ArrowCounterClockwise size={14} /> Reset adjustments
          </TextButton>
          {m.treatment && (
            <div className="border-t border-line pt-3">
              <SectionTitle>Template look</SectionTitle>
              <Segmented
                label="Template look"
                value={m.treatment}
                onChange={(v) => patch(ids, v === 'transparency' ? { treatment: v, opacity: 0.45 } : { treatment: v, opacity: 1 }, 'treat')}
                options={[
                  { value: 'darkened', label: 'Darkened' },
                  { value: 'transparency', label: 'Transparent' },
                ]}
              />
              <button type="button" className={`mt-2 block text-xs font-medium text-accent hover:text-accent-hover ${focusRing}`} onClick={() => patch(ids, { treatment: null, opacity: 1 }, 'treat')}>
                Remove template look
              </button>
            </div>
          )}
        </div>
      )}
      {tab === 'filters' && (
        <div className="mt-4">
          <div className="grid grid-cols-3 gap-2">
            {[{ id: null as string | null, label: 'None' }, ...FILTER_PRESETS].map((p) => {
              const thumb = m.assetId ? filterThumb(m.assetId, p.id) : null
              const active = (m.filter?.id ?? null) === p.id
              return (
                <button key={p.id ?? 'none'} type="button" onClick={() => patch(ids, { filter: p.id ? { id: p.id, intensity: m.filter?.intensity ?? 100 } : null }, 'filter')} className={`text-left ${focusRing}`}>
                  <span className={`block aspect-square overflow-hidden rounded-lg border-2 bg-surface-2 ${active ? 'border-accent' : 'border-transparent'}`}>
                    {thumb && <img src={thumb} alt="" className="h-full w-full object-cover" />}
                  </span>
                  <span className={`mt-1 block truncate text-center text-[11px] ${active ? 'font-semibold text-accent' : 'text-muted'}`}>{p.label}</span>
                </button>
              )
            })}
          </div>
          {m.filter && (
            <div className="mt-4">
              <Slider label="Intensity" value={m.filter.intensity} min={0} max={100} onChange={(v) => patch(ids, { filter: { ...m.filter!, intensity: v } }, 'fint')} />
            </div>
          )}
        </div>
      )}
      {tab === 'background' && (
        <div className="mt-4 space-y-3">
          <p className="text-xs leading-snug text-muted">Cuts the subject out using the Content Studio server. The first cut-out of a photo can take up to a minute; later ones are instant.</p>
          {!m.cutoutId ? (
            <TextButton primary className="w-full !h-9" disabled={working} onClick={() => void runCutout(m.id)}>
              {working ? <SpinnerGap size={14} className="animate-spin" /> : null} {working ? 'Removing background' : 'Remove background'}
            </TextButton>
          ) : (
            <>
              <Segmented
                label="Which version to show"
                value={m.useCutout ? 'cut' : 'orig'}
                onChange={(v) => (v === 'cut' ? patch(ids, { useCutout: true }, 'cut') : restoreOriginalImage(m.id))}
                options={[
                  { value: 'cut', label: 'Background removed' },
                  { value: 'orig', label: 'Original' },
                ]}
              />
            </>
          )}
        </div>
      )}
    </PanelShell>
  )
}

