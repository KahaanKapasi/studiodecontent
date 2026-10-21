import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import {
  ArrowDown,
  ArrowUp,
  Copy,
  Eye,
  EyeSlash,
  Minus,
  Plus,
  Rows,
  SpinnerGap,
  SquaresFour,
  Trash,
  Question,
  CornersOut,
  X,
} from '@phosphor-icons/react'
import {
  addImageAsset,
  addImageFiles,
  addPage,
  arrange,
  copySelection,
  cutSelection,
  deletePage,
  deleteSelection,
  duplicatePage,
  duplicateSelection,
  fillPlaceholder,
  groupSelection,
  movePage,
  pasteClipboard,
  reorderPages,
  selectAll,
  selectObject,
  setLocked,
  togglePageHidden,
  ungroupSelection,
  zoomTo,
} from './actions'
import CropOverlay from './CropOverlay'
import { engine } from './engine'
import { getPageThumb } from './export'
import { clamp, type Page } from './model'
import { editorStore, findObj, hasClipboard, useEditor } from './store'
import { IconButton, MenuDivider, MenuItem, Popover, focusRing } from './ui'

// ---------------------------------------------------------------------------------------------
// context menu

interface MenuState {
  x: number
  y: number
  pageId: string
  targetId: string | null
}

function ContextMenu({ state, onClose }: { state: MenuState; onClose: () => void }) {
  const ref = useRef<HTMLDivElement>(null)
  const sel = useEditor((s) => s.selection)
  const doc = useEditor((s) => s.doc)
  const [pos, setPos] = useState({ left: state.x, top: state.y })
  useLayoutEffect(() => {
    const r = ref.current?.getBoundingClientRect()
    if (!r) return
    setPos({ left: Math.min(state.x, window.innerWidth - r.width - 8), top: Math.min(state.y, window.innerHeight - r.height - 8) })
  }, [state])
  useEffect(() => {
    const down = (e: PointerEvent) => {
      if (!ref.current?.contains(e.target as Node)) onClose()
    }
    const key = (e: KeyboardEvent) => e.key === 'Escape' && onClose()
    document.addEventListener('pointerdown', down, true)
    document.addEventListener('keydown', key, true)
    window.addEventListener('blur', onClose)
    return () => {
      document.removeEventListener('pointerdown', down, true)
      document.removeEventListener('keydown', key, true)
      window.removeEventListener('blur', onClose)
    }
  }, [onClose])
  const run = (fn: () => void) => () => {
    fn()
    onClose()
  }
  const target = state.targetId ? findObj(doc, state.targetId)?.obj : undefined
  const hasSel = sel.ids.length > 0
  const grouped = hasSel && new Set(sel.ids.map((id) => findObj(doc, id)?.obj.groupId)).size === 1 && !!findObj(doc, sel.ids[0])?.obj.groupId
  return (
    <div ref={ref} role="menu" data-popover style={{ position: 'fixed', ...pos, zIndex: 80, width: 224 }} className="rounded-lg border border-line bg-surface p-1 shadow-[0_8px_30px_rgba(0,0,0,0.2)]">
      {hasSel ? (
        <>
          <MenuItem shortcut="Cmd+C" onSelect={run(copySelection)}>Copy</MenuItem>
          <MenuItem shortcut="Cmd+X" onSelect={run(cutSelection)}>Cut</MenuItem>
          <MenuItem shortcut="Cmd+V" disabled={!hasClipboard()} onSelect={run(pasteClipboard)}>Paste</MenuItem>
          <MenuItem shortcut="Cmd+D" onSelect={run(duplicateSelection)}>Duplicate</MenuItem>
          <MenuItem shortcut="Del" danger onSelect={run(deleteSelection)}>Delete</MenuItem>
          <MenuDivider />
          {sel.ids.length > 1 && !grouped && <MenuItem shortcut="Cmd+G" onSelect={run(groupSelection)}>Group</MenuItem>}
          {grouped && <MenuItem shortcut="Cmd+Shift+G" onSelect={run(ungroupSelection)}>Ungroup</MenuItem>}
          <MenuItem onSelect={run(() => arrange('front'))}>Bring to front</MenuItem>
          <MenuItem onSelect={run(() => arrange('forward'))}>Bring forward</MenuItem>
          <MenuItem onSelect={run(() => arrange('backward'))}>Send backward</MenuItem>
          <MenuItem onSelect={run(() => arrange('back'))}>Send to back</MenuItem>
          <MenuDivider />
          {target?.type === 'image' && target.assetId && <MenuItem onSelect={run(() => editorStore.set({ cropId: target.id }))}>Crop</MenuItem>}
          {target?.type === 'image' && target.assetId && <MenuItem onSelect={run(() => editorStore.set({ panel: 'editimage' }))}>Edit image</MenuItem>}
          <MenuItem onSelect={run(() => setLocked(sel.ids, !target?.locked))}>{target?.locked ? 'Unlock' : 'Lock'}</MenuItem>
        </>
      ) : (
        <>
          <MenuItem shortcut="Cmd+V" disabled={!hasClipboard()} onSelect={run(pasteClipboard)}>Paste</MenuItem>
          <MenuItem shortcut="Cmd+A" onSelect={run(selectAll)}>Select all</MenuItem>
          <MenuDivider />
          <MenuItem onSelect={run(() => addPage(state.pageId))}>Add page after</MenuItem>
          <MenuItem onSelect={run(() => duplicatePage(state.pageId))}>Duplicate page</MenuItem>
        </>
      )}
    </div>
  )
}

// ---------------------------------------------------------------------------------------------
// a single page

function PageBlock({ page, index, onMenu }: { page: Page; index: number; onMenu: (m: MenuState) => void }) {
  const doc = useEditor((s) => s.doc)
  const zoom = useEditor((s) => s.zoom)
  const active = useEditor((s) => s.activePageId === page.id)
  const cropId = useEditor((s) => s.cropId)
  const count = doc.pages.length
  const host = useRef<HTMLDivElement>(null)
  const wrap = useRef<HTMLDivElement>(null)
  const [near, setNear] = useState(index < 3)
  const [dragOver, setDragOver] = useState(false)

  useEffect(() => {
    const el = wrap.current
    if (!el || typeof IntersectionObserver === 'undefined') return
    const io = new IntersectionObserver((e) => setNear(e[0].isIntersecting), { rootMargin: '900px 0px' })
    io.observe(el)
    return () => io.disconnect()
  }, [])

  useEffect(() => {
    const h = host.current
    if (!near || !h) return
    engine.attach(page.id, h)
    return () => engine.detach(page.id)
  }, [near, page.id])

  const w = Math.round(doc.width * zoom)
  const h = Math.round(doc.height * zoom)
  const cropHere = cropId && page.objects.some((o) => o.id === cropId)

  const onDrop = (e: React.DragEvent) => {
    e.preventDefault()
    setDragOver(false)
    const pos = engine.toDesign(page.id, e.clientX, e.clientY) ?? undefined
    const assetId = e.dataTransfer.getData('application/x-cs-asset')
    if (assetId) {
      const t = engine.targetAt(page.id, e.nativeEvent)
      const f = t ? findObj(editorStore.getState().doc, t) : null
      if (f && f.obj.type === 'image' && !f.obj.assetId) void fillPlaceholder(f.obj.id, assetId)
      else void addImageAsset(assetId, { pageId: page.id, pos, asLayer: !!f })
      return
    }
    const files = [...e.dataTransfer.files]
    if (files.length) void addImageFiles(files, { pageId: page.id, pos })
  }

  return (
    <section id={`page-${page.id}`} aria-label={`Page ${index + 1}`} className="mx-auto mb-6 w-fit" style={{ minWidth: w }}>
      <div className="mb-1.5 flex items-center justify-between gap-2 text-xs text-muted" style={{ width: w }}>
        <button type="button" onClick={() => editorStore.setActivePage(page.id)} className={`rounded px-1 font-medium ${focusRing} ${active ? 'text-accent' : ''}`}>
          Page {index + 1}
          {page.hidden ? ' (hidden)' : ''}
        </button>
        <div className="flex items-center">
          <IconButton label="Move page up" disabled={index === 0} onClick={() => movePage(page.id, -1)} className="!h-6 !min-w-6">
            <ArrowUp size={14} />
          </IconButton>
          <IconButton label="Move page down" disabled={index === count - 1} onClick={() => movePage(page.id, 1)} className="!h-6 !min-w-6">
            <ArrowDown size={14} />
          </IconButton>
          <IconButton label={page.hidden ? 'Show page' : 'Hide page from export'} onClick={() => togglePageHidden(page.id)} className="!h-6 !min-w-6">
            {page.hidden ? <EyeSlash size={14} /> : <Eye size={14} />}
          </IconButton>
          <IconButton label="Duplicate page" onClick={() => duplicatePage(page.id)} className="!h-6 !min-w-6">
            <Copy size={14} />
          </IconButton>
          <IconButton label="Delete page" disabled={count <= 1} onClick={() => deletePage(page.id)} className="!h-6 !min-w-6">
            <Trash size={14} />
          </IconButton>
          <IconButton label="Add page" onClick={() => addPage(page.id)} className="!h-6 !min-w-6">
            <Plus size={14} />
          </IconButton>
        </div>
      </div>
      <div
        ref={wrap}
        className={`relative bg-white shadow-[0_2px_14px_rgba(0,0,0,0.18)] ${active && count > 1 ? 'outline outline-2 outline-accent/70' : ''} ${dragOver ? 'outline outline-2 outline-accent' : ''} ${page.hidden ? 'opacity-45' : ''}`}
        style={{ width: w, height: h }}
        onPointerDown={() => editorStore.setActivePage(page.id)}
        onContextMenu={(e) => {
          e.preventDefault()
          const t = engine.targetAt(page.id, e.nativeEvent)
          const sel = editorStore.getState().selection
          if (t && !(sel.pageId === page.id && sel.ids.includes(t))) selectObject(page.id, t)
          if (!t) editorStore.setSelection(null, [])
          onMenu({ x: e.clientX, y: e.clientY, pageId: page.id, targetId: t })
        }}
        onDragOver={(e) => {
          if (e.dataTransfer.types.includes('Files') || e.dataTransfer.types.includes('application/x-cs-asset')) {
            e.preventDefault()
            setDragOver(true)
          }
        }}
        onDragLeave={() => setDragOver(false)}
        onDrop={onDrop}
      >
        <div ref={host} className="absolute inset-0" />
        {!near && <div className="absolute inset-0 flex items-center justify-center text-xs text-faint" style={{ background: typeof page.background === 'string' ? page.background : '#888' }}>Page {index + 1}</div>}
        {cropHere && cropId && <CropOverlay imageId={cropId} />}
      </div>
    </section>
  )
}

// ---------------------------------------------------------------------------------------------
// grid view

function GridThumb({ page, index }: { page: Page; index: number }) {
  const doc = useEditor((s) => s.doc)
  const [url, setUrl] = useState<string | null>(null)
  useEffect(() => {
    let live = true
    setUrl(null)
    getPageThumb(doc, page, 360).then((u) => live && setUrl(u)).catch(() => undefined)
    return () => {
      live = false
    }
  }, [doc, page])
  const [over, setOver] = useState(false)
  const count = doc.pages.length
  return (
    <li
      draggable
      onDragStart={(e) => e.dataTransfer.setData('text/page-index', String(index))}
      onDragOver={(e) => {
        e.preventDefault()
        setOver(true)
      }}
      onDragLeave={() => setOver(false)}
      onDrop={(e) => {
        e.preventDefault()
        setOver(false)
        const from = Number(e.dataTransfer.getData('text/page-index'))
        if (Number.isFinite(from)) reorderPages(from, index)
      }}
      className={`group relative rounded-lg border bg-surface p-2 ${over ? 'border-accent' : 'border-line'}`}
    >
      <button
        type="button"
        className={`block w-full ${focusRing}`}
        onClick={() => {
          editorStore.setActivePage(page.id)
          editorStore.set({ view: 'scroll' })
          setTimeout(() => document.getElementById(`page-${page.id}`)?.scrollIntoView({ block: 'center' }), 60)
        }}
      >
        <div className="flex items-center justify-center bg-surface-2" style={{ aspectRatio: `${doc.width}/${doc.height}` }}>
          {url ? <img src={url} alt={`Page ${index + 1}`} className={`h-full w-full object-contain ${page.hidden ? 'opacity-40' : ''}`} draggable={false} /> : <SpinnerGap className="animate-spin text-faint" size={18} />}
        </div>
      </button>
      <div className="mt-1.5 flex items-center justify-between text-xs text-muted">
        <span className="font-medium">{index + 1}</span>
        <span className="flex opacity-0 transition-opacity group-focus-within:opacity-100 group-hover:opacity-100">
          <IconButton label="Duplicate page" onClick={() => duplicatePage(page.id)} className="!h-6 !min-w-6"><Copy size={13} /></IconButton>
          <IconButton label={page.hidden ? 'Show page' : 'Hide page'} onClick={() => togglePageHidden(page.id)} className="!h-6 !min-w-6">{page.hidden ? <EyeSlash size={13} /> : <Eye size={13} />}</IconButton>
          <IconButton label="Delete page" disabled={count <= 1} onClick={() => deletePage(page.id)} className="!h-6 !min-w-6"><Trash size={13} /></IconButton>
        </span>
      </div>
    </li>
  )
}

// ---------------------------------------------------------------------------------------------
// zoom bar, busy chips, toast

const ZOOM_STEPS = [0.25, 0.5, 0.75, 1, 1.5, 2, 3]

function ZoomBar({ fitZoom, onShortcuts }: { fitZoom: number; onShortcuts: () => void }) {
  const zoom = useEditor((s) => s.zoom)
  const fit = useEditor((s) => s.fit)
  const view = useEditor((s) => s.view)
  const pages = useEditor((s) => s.doc.pages.length)
  const activeIdx = useEditor((s) => s.doc.pages.findIndex((p) => p.id === s.activePageId))
  return (
    <div className="absolute bottom-3 right-4 z-20 flex items-center gap-1 rounded-lg border border-line bg-surface p-1 shadow-md">
      <span className="px-2 text-xs tabular-nums text-muted">
        Page {Math.max(0, activeIdx) + 1} of {pages}
      </span>
      <IconButton label="Zoom out" shortcut="Cmd -" onClick={() => zoomTo(zoom / 1.2)} className="!h-7">
        <Minus size={14} />
      </IconButton>
      <input
        type="range"
        aria-label="Zoom"
        min={10}
        max={400}
        step={1}
        value={Math.round(zoom * 100)}
        onChange={(e) => zoomTo(Number(e.target.value) / 100)}
        className="editor-range h-1 w-28 cursor-pointer appearance-none rounded-full bg-line-strong"
      />
      <IconButton label="Zoom in" shortcut="Cmd +" onClick={() => zoomTo(zoom * 1.2)} className="!h-7">
        <Plus size={14} />
      </IconButton>
      <Popover
        width={150}
        align="end"
        trigger={({ toggle, ref, open }) => (
          <span ref={ref}>
            <IconButton label="Zoom level" active={open} onClick={toggle} className="!h-7 w-14 tabular-nums">
              {Math.round(zoom * 100)}%
            </IconButton>
          </span>
        )}
      >
        {(close) => (
          <div role="menu" className="-m-1">
            <MenuItem onSelect={() => { editorStore.set({ fit: true }); close() }}>Fit to screen</MenuItem>
            {ZOOM_STEPS.map((z) => (
              <MenuItem key={z} onSelect={() => { zoomTo(z); close() }}>{Math.round(z * 100)}%</MenuItem>
            ))}
          </div>
        )}
      </Popover>
      <IconButton label="Fit to screen" shortcut="Cmd 0" active={fit && Math.abs(zoom - fitZoom) < 0.01} onClick={() => editorStore.set({ fit: true })} className="!h-7">
        <CornersOut size={15} />
      </IconButton>
      <span className="mx-0.5 h-5 w-px bg-line" />
      <IconButton label={view === 'grid' ? 'Back to pages' : 'Grid view'} active={view === 'grid'} onClick={() => editorStore.set({ view: view === 'grid' ? 'scroll' : 'grid' })} className="!h-7">
        {view === 'grid' ? <Rows size={15} /> : <SquaresFour size={15} />}
      </IconButton>
      <IconButton label="Keyboard shortcuts" onClick={onShortcuts} className="!h-7">
        <Question size={15} />
      </IconButton>
    </div>
  )
}

function BusyChip({ id, text }: { id: string; text: string }) {
  const [sec, setSec] = useState(0)
  useEffect(() => {
    const t0 = Date.now()
    const t = setInterval(() => setSec(Math.round((Date.now() - t0) / 1000)), 500)
    return () => clearInterval(t)
  }, [id])
  return (
    <div role="status" className="flex items-center gap-2 rounded-full border border-line bg-surface px-3 py-1.5 text-xs text-ink shadow-md">
      <SpinnerGap size={14} className="animate-spin text-accent" />
      {text}... <span className="tabular-nums text-muted">{sec}s</span>
    </div>
  )
}

function Toast() {
  const notice = useEditor((s) => s.notice)
  useEffect(() => {
    if (!notice) return
    const t = setTimeout(() => editorStore.set({ notice: null }), notice.kind === 'error' ? 7000 : 3500)
    return () => clearTimeout(t)
  }, [notice])
  if (!notice) return null
  return (
    <div role={notice.kind === 'error' ? 'alert' : 'status'} className={`flex max-w-md items-start gap-3 rounded-lg border px-3.5 py-2.5 text-[13px] shadow-lg ${notice.kind === 'error' ? 'border-danger/40 bg-surface text-danger' : 'border-line bg-surface text-ink'}`}>
      <span className="min-w-0 flex-1">{notice.text}</span>
      <button type="button" aria-label="Dismiss" className={`text-muted hover:text-ink ${focusRing}`} onClick={() => editorStore.set({ notice: null })}>
        <X size={14} />
      </button>
    </div>
  )
}

// ---------------------------------------------------------------------------------------------

export default function Workspace({ onShortcuts }: { onShortcuts: () => void }) {
  const doc = useEditor((s) => s.doc)
  const fit = useEditor((s) => s.fit)
  const zoom = useEditor((s) => s.zoom)
  const view = useEditor((s) => s.view)
  const busy = useEditor((s) => s.busy)
  const scroller = useRef<HTMLDivElement>(null)
  const [size, setSize] = useState({ w: 800, h: 600 })
  const [menu, setMenu] = useState<MenuState | null>(null)

  useLayoutEffect(() => {
    const el = scroller.current
    if (!el) return
    const ro = new ResizeObserver(() => setSize({ w: el.clientWidth, h: el.clientHeight }))
    ro.observe(el)
    setSize({ w: el.clientWidth, h: el.clientHeight })
    return () => ro.disconnect()
  }, [])

  const fitZoom = useMemo(() => clamp(Math.min((size.w - 80) / doc.width, (size.h - 110) / doc.height), 0.1, 1), [size, doc.width, doc.height])
  useEffect(() => {
    if (fit) editorStore.set({ zoom: Math.round(fitZoom * 1000) / 1000 })
  }, [fit, fitZoom])

  // Cmd/Ctrl + wheel (and trackpad pinch) zooms the canvas instead of the browser page.
  useEffect(() => {
    const el = scroller.current
    if (!el) return
    const onWheel = (e: WheelEvent) => {
      if (!(e.ctrlKey || e.metaKey)) return
      e.preventDefault()
      zoomTo(editorStore.getState().zoom * Math.exp(-e.deltaY * 0.01))
    }
    el.addEventListener('wheel', onWheel, { passive: false })
    return () => el.removeEventListener('wheel', onWheel)
  }, [])

  const closeMenu = useCallback(() => setMenu(null), [])
  const busyEntries = Object.entries(busy)

  return (
    <div className="relative flex min-h-0 flex-1 flex-col bg-surface-2">
      <div
        ref={scroller}
        className="editor-scroll min-h-0 flex-1 overflow-auto px-10 pb-24 pt-6"
        onPointerDown={(e) => {
          if (e.target === e.currentTarget) editorStore.setSelection(null, [])
        }}
      >
        {view === 'grid' ? (
          <ul className="mx-auto grid max-w-5xl grid-cols-2 gap-4 md:grid-cols-3 lg:grid-cols-4" aria-label="Pages">
            {doc.pages.map((p, i) => (
              <GridThumb key={p.id} page={p} index={i} />
            ))}
            <li>
              <button type="button" onClick={() => addPage()} className={`flex h-full min-h-32 w-full items-center justify-center gap-2 rounded-lg border border-dashed border-line-strong text-[13px] font-medium text-muted hover:bg-surface hover:text-ink ${focusRing}`}>
                <Plus size={15} /> Add page
              </button>
            </li>
          </ul>
        ) : (
          <>
            {doc.pages.map((p, i) => (
              <PageBlock key={p.id} page={p} index={i} onMenu={setMenu} />
            ))}
            <div className="mx-auto" style={{ width: Math.round(doc.width * zoom) }}>
              <button type="button" onClick={() => addPage(doc.pages[doc.pages.length - 1].id)} className={`flex h-10 w-full items-center justify-center gap-2 rounded-lg border border-dashed border-line-strong text-[13px] font-medium text-muted hover:bg-surface hover:text-ink ${focusRing}`}>
                <Plus size={15} /> Add page
              </button>
            </div>
          </>
        )}
      </div>
      <div className="pointer-events-none absolute inset-x-0 top-3 z-20 flex flex-col items-center gap-2">
        {busyEntries.map(([k, v]) => (
          <BusyChip key={k} id={k} text={v} />
        ))}
      </div>
      <div className="pointer-events-none absolute inset-x-0 bottom-16 z-20 flex justify-center px-4">
        <div className="pointer-events-auto">
          <Toast />
        </div>
      </div>
      <ZoomBar fitZoom={fitZoom} onShortcuts={onShortcuts} />
      {menu && <ContextMenu state={menu} onClose={closeMenu} />}
    </div>
  )
}
