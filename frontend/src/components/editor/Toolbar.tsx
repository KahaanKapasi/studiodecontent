import { useMemo, useRef, useState } from 'react'
import {
  ArrowDown,
  ArrowLineDown,
  ArrowLineUp,
  ArrowUp,
  Copy,
  Crop,
  Eye,
  EyeSlash,
  FlipHorizontal,
  FlipVertical,
  ListBullets,
  ListNumbers,
  LockSimple,
  LockSimpleOpen,
  Minus,
  Plus,
  RectangleDashed,
  SlidersHorizontal,
  Stack,
  Trash,
  TextAa,
  TextAlignCenter,
  TextAlignJustify,
  TextAlignLeft,
  TextAlignRight,
  TextB,
  TextItalic,
  TextStrikethrough,
  TextUnderline,
  Checkerboard,
  ArrowsClockwise,
  ImageSquare,
  Rectangle,
  Selection,
  Sparkle,
} from '@phosphor-icons/react'
import {
  arrange,
  deleteSelection,
  duplicateSelection,
  flip,
  groupSelection,
  moveLayer,
  patch,
  rotate90,
  setBackground,
  setLocked,
  setHidden,
  ungroupSelection,
  replaceImage,
} from './actions'
import { addAssetFromFile } from './assets'
import { ColorButton } from './colors'
import { engine } from './engine'
import { FontPicker } from './FontPicker'
import {
  isImage,
  isShape,
  isText,
  type CaseMode,
  type ImageObj,
  type ObjModel,
  type ShadowSpec,
  type ShapeObj,
  type TextObj,
} from './model'
import { editorStore, mapObjects, useEditor } from './store'
import { CROP_RATIOS } from './CropOverlay'
import { Divider, IconButton, TextButton, MenuDivider, MenuItem, NumberField, Popover, Segmented, SectionTitle, Slider, focusRing } from './ui'

// ---------------------------------------------------------------------------------------------
// helpers

function rgbaOf(color: string): { hex: string; a: number } {
  const m = /rgba?\((\d+),\s*(\d+),\s*(\d+)(?:,\s*([\d.]+))?\)/.exec(color)
  if (m) {
    const hex = '#' + [m[1], m[2], m[3]].map((n) => Number(n).toString(16).padStart(2, '0')).join('')
    return { hex, a: m[4] === undefined ? 1 : Number(m[4]) }
  }
  return { hex: /^#[0-9a-f]{6}$/i.test(color) ? color : '#000000', a: 1 }
}
function toRgba(hex: string, a: number): string {
  const n = parseInt(hex.slice(1), 16)
  return `rgba(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255}, ${Math.round(a * 100) / 100})`
}

function useSelectedModels(): ObjModel[] {
  const doc = useEditor((s) => s.doc)
  const sel = useEditor((s) => s.selection)
  return useMemo(() => {
    const out: ObjModel[] = []
    for (const p of doc.pages) {
      if (p.id !== sel.pageId) continue
      for (const o of p.objects) if (sel.ids.includes(o.id)) out.push(o)
    }
    return out
  }, [doc, sel])
}

function ToolbarButton({ icon, children, onClick, active, title, disabled }: { icon?: React.ReactNode; children?: React.ReactNode; onClick?: () => void; active?: boolean; title?: string; disabled?: boolean }) {
  return (
    <IconButton label={title ?? String(children)} onClick={onClick} active={active} disabled={disabled} className={children ? 'px-2.5' : ''}>
      {icon}
      {children}
    </IconButton>
  )
}

function PopButton({ label, icon, children, width = 260, align }: { label: string; icon?: React.ReactNode; children: (close: () => void) => React.ReactNode; width?: number; align?: 'start' | 'end' }) {
  return (
    <Popover
      width={width}
      align={align}
      trigger={({ open, toggle, ref }) => (
        <span ref={ref}>
          <IconButton label={label} active={open} onClick={toggle} className="px-2.5" aria-expanded={open}>
            {icon}
            <span>{label}</span>
          </IconButton>
        </span>
      )}
    >
      {children}
    </Popover>
  )
}

// ---------------------------------------------------------------------------------------------
// shared panels

function TransparencyButton({ ids, value }: { ids: string[]; value: number }) {
  return (
    <Popover
      width={240}
      trigger={({ open, toggle, ref }) => (
        <span ref={ref}>
          <IconButton label="Transparency" active={open} onClick={toggle}>
            <Checkerboard size={18} />
          </IconButton>
        </span>
      )}
    >
      {() => <Slider label="Transparency" value={Math.round(value * 100)} min={0} max={100} format={(v) => `${v}`} onChange={(v) => patch(ids, { opacity: v / 100 }, 'opacity')} />}
    </Popover>
  )
}

function ShadowPanel({ shadow, onChange }: { shadow: ShadowSpec | null | undefined; onChange: (s: ShadowSpec | null) => void }) {
  const cur = shadow ?? null
  const { hex, a } = rgbaOf(cur?.color ?? 'rgba(0,0,0,0.4)')
  const set = (p: Partial<ShadowSpec>) => onChange({ color: cur?.color ?? 'rgba(0, 0, 0, 0.4)', blur: cur?.blur ?? 12, x: cur?.x ?? 6, y: cur?.y ?? 6, ...p })
  const presets: { id: string; label: string; s: ShadowSpec | null }[] = [
    { id: 'none', label: 'None', s: null },
    { id: 'soft', label: 'Soft', s: { color: 'rgba(0, 0, 0, 0.35)', blur: 24, x: 0, y: 8 } },
    { id: 'hard', label: 'Hard', s: { color: 'rgba(0, 0, 0, 0.55)', blur: 0, x: 8, y: 8 } },
    { id: 'glow', label: 'Glow', s: { color: 'rgba(255, 255, 255, 0.8)', blur: 30, x: 0, y: 0 } },
  ]
  return (
    <div className="space-y-3">
      <div className="grid grid-cols-4 gap-1.5">
        {presets.map((p) => (
          <button
            key={p.id}
            type="button"
            onClick={() => onChange(p.s)}
            className={`h-8 rounded-md border text-xs font-medium ${focusRing} ${JSON.stringify(cur) === JSON.stringify(p.s) ? 'border-accent bg-accent/10 text-accent' : 'border-line text-ink hover:bg-surface-2'}`}
          >
            {p.label}
          </button>
        ))}
      </div>
      {cur && (
        <>
          <Slider label="Blur" value={cur.blur} min={0} max={60} onChange={(v) => set({ blur: v })} />
          <Slider label="Offset X" value={cur.x} min={-40} max={40} center onChange={(v) => set({ x: v })} />
          <Slider label="Offset Y" value={cur.y} min={-40} max={40} center onChange={(v) => set({ y: v })} />
          <Slider label="Transparency" value={Math.round((1 - a) * 100)} min={0} max={100} onChange={(v) => set({ color: toRgba(hex, 1 - v / 100) })} />
          <div className="flex items-center justify-between text-xs text-muted">
            Colour
            <ColorButton value={hex} label="Shadow colour" onChange={(c) => typeof c === 'string' && set({ color: toRgba(c, a) })} />
          </div>
        </>
      )}
    </div>
  )
}

function PositionPanel({ models }: { models: ObjModel[] }) {
  const [tab, setTab] = useState<'arrange' | 'layers'>('arrange')
  const ids = models.map((m) => m.id)
  const first = models[0]
  const b = engine.boundsOf(ids)
  const single = models.length === 1 ? first : null
  const moveTo = (axis: 'x' | 'y', v: number) => {
    if (!b) return
    const d = axis === 'x' ? v - b.left : v - b.top
    editorStore.commit((doc) => mapObjects(doc, ids, (o) => ({ ...o, [axis]: Math.round(((axis === 'x' ? o.x : o.y) + d) * 100) / 100 }) as ObjModel), { key: 'pos' })
  }
  return (
    <div>
      <Segmented
        label="Position panel"
        value={tab}
        onChange={setTab}
        options={[
          { value: 'arrange', label: 'Arrange' },
          { value: 'layers', label: 'Layers' },
        ]}
      />
      {tab === 'arrange' ? (
        <div className="mt-3 space-y-4">
          <div>
            <SectionTitle>Arrange</SectionTitle>
            <div className="grid grid-cols-2 gap-1.5">
              <ArrBtn icon={<ArrowUp size={15} />} label="Forward" onClick={() => arrange('forward')} />
              <ArrBtn icon={<ArrowDown size={15} />} label="Backward" onClick={() => arrange('backward')} />
              <ArrBtn icon={<ArrowLineUp size={15} />} label="To front" onClick={() => arrange('front')} />
              <ArrBtn icon={<ArrowLineDown size={15} />} label="To back" onClick={() => arrange('back')} />
            </div>
          </div>
          <div>
            <SectionTitle>Align to page</SectionTitle>
            <div className="grid grid-cols-3 gap-1.5">
              {(
                [
                  ['left', 'Left'],
                  ['center', 'Centre'],
                  ['right', 'Right'],
                  ['top', 'Top'],
                  ['middle', 'Middle'],
                  ['bottom', 'Bottom'],
                ] as const
              ).map(([k, l]) => (
                <button key={k} type="button" onClick={() => engine.alignToPage(ids, k)} className={`h-8 rounded-md border border-line text-xs font-medium text-ink hover:bg-surface-2 ${focusRing}`}>
                  {l}
                </button>
              ))}
            </div>
          </div>
          {b && (
            <div>
              <SectionTitle>Advanced</SectionTitle>
              <div className="grid grid-cols-2 gap-2">
                <NumberField label="X" value={b.left} onChange={(v) => moveTo('x', v)} suffix="px" />
                <NumberField label="Y" value={b.top} onChange={(v) => moveTo('y', v)} suffix="px" />
                {single && single.type !== 'text' && !(isShape(single) && (single.kind === 'line' || single.kind === 'arrow')) && (
                  <>
                    <NumberField label="Width" value={single.width} min={8} onChange={(v) => resizeTo(single, v, undefined)} suffix="px" />
                    <NumberField label="Height" value={isShape(single) ? single.height : (single as ImageObj).height} min={8} onChange={(v) => resizeTo(single, undefined, v)} suffix="px" />
                  </>
                )}
                {single && (isText(single) || (isShape(single) && (single.kind === 'line' || single.kind === 'arrow'))) && (
                  <NumberField label="Width" value={single.width} min={24} onChange={(v) => patch([single.id], { width: v }, 'w')} suffix="px" />
                )}
                {single && <NumberField label="Rotate" value={single.angle} min={-180} max={180} onChange={(v) => patch([single.id], { angle: v }, 'rot')} suffix="deg" />}
              </div>
            </div>
          )}
        </div>
      ) : (
        <LayersList />
      )}
    </div>
  )
}

function resizeTo(m: ObjModel, w?: number, h?: number) {
  if (m.type === 'image') {
    const ratio = m.width / m.height
    if (w !== undefined) patch([m.id], { width: w, height: w / ratio }, 'size')
    else if (h !== undefined) patch([m.id], { width: h * ratio, height: h }, 'size')
  } else if (m.type === 'shape') {
    patch([m.id], { width: w ?? m.width, height: h ?? m.height }, 'size')
  }
}

function ArrBtn({ icon, label, onClick }: { icon: React.ReactNode; label: string; onClick: () => void }) {
  return (
    <button type="button" onClick={onClick} className={`flex h-8 items-center justify-center gap-1.5 rounded-md border border-line text-xs font-medium text-ink hover:bg-surface-2 ${focusRing}`}>
      {icon}
      {label}
    </button>
  )
}

export function layerLabel(o: ObjModel): string {
  if (o.name) return o.name
  if (o.type === 'text') return o.text.replace(/\s+/g, ' ').trim().slice(0, 28) || 'Text'
  if (o.type === 'shape') return { rect: 'Rectangle', circle: 'Circle', triangle: 'Triangle', star: 'Star', line: 'Line', arrow: 'Arrow' }[o.kind]
  return o.assetId ? 'Image' : 'Frame'
}

export function LayersList() {
  const doc = useEditor((s) => s.doc)
  const sel = useEditor((s) => s.selection)
  const activeId = useEditor((s) => s.activePageId)
  const page = doc.pages.find((p) => p.id === activeId) ?? doc.pages[0]
  const [dragId, setDragId] = useState<string | null>(null)
  const [over, setOver] = useState<number | null>(null)
  const rows = [...page.objects].reverse()
  if (!rows.length) return <p className="mt-3 text-xs text-faint">This page has no layers yet.</p>
  return (
    <ul className="mt-3 max-h-72 space-y-1 overflow-y-auto" aria-label="Layers">
      {rows.map((o, i) => {
        const arrayIndex = page.objects.length - 1 - i
        const selected = sel.pageId === page.id && sel.ids.includes(o.id)
        return (
          <li
            key={o.id}
            draggable
            onDragStart={(e) => {
              setDragId(o.id)
              e.dataTransfer.effectAllowed = 'move'
            }}
            onDragOver={(e) => {
              e.preventDefault()
              setOver(i)
            }}
            onDragEnd={() => {
              setDragId(null)
              setOver(null)
            }}
            onDrop={(e) => {
              e.preventDefault()
              if (dragId) moveLayer(page.id, dragId, arrayIndex)
              setDragId(null)
              setOver(null)
            }}
            className={`flex items-center gap-1 rounded-md border px-1.5 py-1 text-xs ${over === i && dragId && dragId !== o.id ? 'border-accent' : selected ? 'border-accent bg-accent/10' : 'border-line'} ${o.hidden ? 'opacity-50' : ''}`}
          >
            <button
              type="button"
              className={`flex min-w-0 flex-1 items-center gap-2 truncate rounded px-1 py-0.5 text-left ${focusRing}`}
              onClick={(e) => {
                if (o.hidden) return
                const ids = e.shiftKey && sel.pageId === page.id ? [...new Set([...sel.ids, o.id])] : [o.id]
                editorStore.setSelection(page.id, ids)
              }}
            >
              <span className="flex h-4 w-4 shrink-0 items-center justify-center text-muted">{o.type === 'text' ? <TextAa size={14} /> : o.type === 'image' ? <ImageSquare size={14} /> : <Rectangle size={14} />}</span>
              <span className="truncate">{layerLabel(o)}</span>
            </button>
            <IconButton label={o.hidden ? 'Show layer' : 'Hide layer'} className="!h-6 !min-w-6" onClick={() => setHidden([o.id], !o.hidden)}>
              {o.hidden ? <EyeSlash size={14} /> : <Eye size={14} />}
            </IconButton>
            <IconButton label={o.locked ? 'Unlock layer' : 'Lock layer'} className="!h-6 !min-w-6" onClick={() => setLocked([o.id], !o.locked)}>
              {o.locked ? <LockSimple size={14} /> : <LockSimpleOpen size={14} />}
            </IconButton>
          </li>
        )
      })}
    </ul>
  )
}

function CommonActions({ models }: { models: ObjModel[] }) {
  const ids = models.map((m) => m.id)
  const locked = models.every((m) => m.locked)
  const groupIds = new Set(models.map((m) => m.groupId))
  const grouped = groupIds.size === 1 && !groupIds.has(undefined)
  return (
    <>
      {(models.length > 1 || grouped) && (
        <>
          <Divider />
          <ToolbarButton onClick={grouped ? ungroupSelection : groupSelection} title={grouped ? 'Ungroup (Cmd+Shift+G)' : 'Group (Cmd+G)'}>
            {grouped ? 'Ungroup' : 'Group'}
          </ToolbarButton>
        </>
      )}
      <Divider />
      <TransparencyButton ids={ids} value={models[0].opacity} />
      <PopButton label="Position" icon={<Stack size={16} />} width={300} align="end">
        {() => <PositionPanel models={models} />}
      </PopButton>
      <IconButton label="Duplicate" shortcut="Cmd+D" onClick={duplicateSelection}>
        <Copy size={17} />
      </IconButton>
      <IconButton label={locked ? 'Unlock' : 'Lock'} active={locked} onClick={() => setLocked(ids, !locked)}>
        {locked ? <LockSimple size={17} /> : <LockSimpleOpen size={17} />}
      </IconButton>
      <IconButton label="Delete" shortcut="Del" onClick={deleteSelection}>
        <Trash size={17} />
      </IconButton>
    </>
  )
}

function FlipMenu({ rotate }: { rotate?: boolean }) {
  return (
    <Popover
      width={190}
      trigger={({ open, toggle, ref }) => (
        <span ref={ref}>
          <IconButton label="Flip and rotate" active={open} onClick={toggle} className="px-2.5">
            <FlipHorizontal size={16} />
            <span>Flip</span>
          </IconButton>
        </span>
      )}
    >
      {(close) => (
        <div role="menu" className="-m-1">
          <MenuItem icon={<FlipHorizontal size={15} />} onSelect={() => { flip('x'); close() }}>
            Flip horizontal
          </MenuItem>
          <MenuItem icon={<FlipVertical size={15} />} onSelect={() => { flip('y'); close() }}>
            Flip vertical
          </MenuItem>
          {rotate && (
            <>
              <MenuDivider />
              <MenuItem icon={<ArrowsClockwise size={15} />} onSelect={() => { rotate90(); close() }}>
                Rotate 90 degrees
              </MenuItem>
            </>
          )}
        </div>
      )}
    </Popover>
  )
}

// ---------------------------------------------------------------------------------------------
// text

const EFFECTS = [
  { id: 'none', label: 'None' },
  { id: 'shadow', label: 'Shadow' },
  { id: 'lift', label: 'Lift' },
  { id: 'hollow', label: 'Hollow' },
  { id: 'outline', label: 'Outline' },
  { id: 'background', label: 'Background' },
  { id: 'neon', label: 'Neon' },
] as const
type EffectId = (typeof EFFECTS)[number]['id']

function effectOf(t: TextObj): EffectId {
  if (t.highlight) return 'background'
  if (t.hollow) return 'hollow'
  if (t.stroke) return 'outline'
  if (t.shadow) {
    if (t.shadow.x === 0 && t.shadow.y === 0) return 'neon'
    if (t.shadow.blur >= 16) return 'lift'
    return 'shadow'
  }
  return 'none'
}

function applyEffect(ids: string[], t: TextObj, id: EffectId) {
  const reset = { shadow: null, stroke: null, hollow: false, highlight: null }
  const sw = Math.max(2, Math.round(t.fontSize * 0.05))
  const map: Record<EffectId, Record<string, unknown>> = {
    none: reset,
    shadow: { ...reset, shadow: { color: 'rgba(0, 0, 0, 0.55)', blur: 0, x: 6, y: 6 } },
    lift: { ...reset, shadow: { color: 'rgba(0, 0, 0, 0.4)', blur: 26, x: 0, y: 10 } },
    hollow: { ...reset, hollow: true, stroke: { color: t.fill, width: sw } },
    outline: { ...reset, stroke: { color: t.fill === '#000000' ? '#ffffff' : '#000000', width: sw } },
    background: { ...reset, highlight: t.fill === '#ffffff' ? '#000000' : '#ffffff' },
    neon: { ...reset, shadow: { color: t.fill, blur: 34, x: 0, y: 0 } },
  }
  patch(ids, map[id], 'effect')
}

function EffectsPanel({ models }: { models: TextObj[] }) {
  const t = models[0]
  const ids = models.map((m) => m.id)
  const cur = effectOf(t)
  return (
    <div className="space-y-3">
      <div className="grid grid-cols-3 gap-1.5">
        {EFFECTS.map((e) => (
          <button
            key={e.id}
            type="button"
            onClick={() => applyEffect(ids, t, e.id)}
            className={`flex h-14 flex-col items-center justify-center rounded-md border text-[11px] font-medium ${focusRing} ${cur === e.id ? 'border-accent bg-accent/10 text-accent' : 'border-line text-ink hover:bg-surface-2'}`}
          >
            <span
              className="text-lg font-bold leading-none"
              style={{
                color: e.id === 'hollow' ? 'transparent' : undefined,
                WebkitTextStroke: e.id === 'hollow' || e.id === 'outline' ? '1px currentColor' : undefined,
                textShadow: e.id === 'shadow' ? '2px 2px 0 rgba(0,0,0,.5)' : e.id === 'lift' ? '0 3px 6px rgba(0,0,0,.45)' : e.id === 'neon' ? '0 0 8px currentColor' : undefined,
                background: e.id === 'background' ? 'var(--accent-color)' : undefined,
                padding: e.id === 'background' ? '0 3px' : undefined,
              }}
            >
              Ag
            </span>
            <span className="mt-1">{e.label}</span>
          </button>
        ))}
      </div>
      {(cur === 'shadow' || cur === 'lift' || cur === 'neon') && t.shadow && (
        <ShadowPanel shadow={t.shadow} onChange={(s) => patch(ids, { shadow: s }, 'tshadow')} />
      )}
      {(cur === 'hollow' || cur === 'outline') && t.stroke && (
        <>
          <Slider label="Thickness" value={t.stroke.width} min={1} max={Math.max(12, Math.round(t.fontSize * 0.2))} onChange={(v) => patch(ids, { stroke: { ...t.stroke!, width: v } }, 'tstroke')} />
          <div className="flex items-center justify-between text-xs text-muted">
            Colour
            <ColorButton value={t.stroke.color} label="Outline colour" onChange={(c) => typeof c === 'string' && patch(ids, { stroke: { ...t.stroke!, color: c } }, 'tstrokec')} />
          </div>
        </>
      )}
      {cur === 'background' && t.highlight && (
        <div className="flex items-center justify-between text-xs text-muted">
          Background colour
          <ColorButton value={t.highlight} label="Background colour" onChange={(c) => typeof c === 'string' && patch(ids, { highlight: c }, 'thl')} />
        </div>
      )}
    </div>
  )
}

const CASES: CaseMode[] = ['none', 'upper', 'lower', 'title']
const CASE_LABEL: Record<CaseMode, string> = { none: 'Normal case', upper: 'UPPERCASE', lower: 'lowercase', title: 'Title Case' }

function TextToolbar({ models }: { models: TextObj[] }) {
  const t = models[0]
  const ids = models.map((m) => m.id)
  const setSize = (n: number) => patch(ids, { fontSize: Math.max(6, Math.min(600, Math.round(n))) }, 'fsize')
  const aligns = ['left', 'center', 'right', 'justify'] as const
  const AlignIcon = { left: TextAlignLeft, center: TextAlignCenter, right: TextAlignRight, justify: TextAlignJustify }[t.align]
  return (
    <>
      <FontPicker value={t.fontFamily} onChange={(f) => patch(ids, { fontFamily: f }, 'font')} />
      <div className="mx-1 flex items-center rounded-md border border-line">
        <IconButton label="Decrease font size" onClick={() => setSize(t.fontSize - (t.fontSize > 60 ? 4 : 1))} className="!h-7">
          <Minus size={13} />
        </IconButton>
        <SizeInput value={t.fontSize} onChange={setSize} />
        <IconButton label="Increase font size" onClick={() => setSize(t.fontSize + (t.fontSize >= 60 ? 4 : 1))} className="!h-7">
          <Plus size={13} />
        </IconButton>
      </div>
      <ColorButton value={t.fill} label="Text colour" onChange={(c) => typeof c === 'string' && patch(ids, { fill: c }, 'tfill')} />
      <Divider />
      <IconButton label="Bold" shortcut="Cmd+B" active={t.bold} onClick={() => patch(ids, { bold: !t.bold })}>
        <TextB size={17} />
      </IconButton>
      <IconButton label="Italic" shortcut="Cmd+I" active={t.italic} onClick={() => patch(ids, { italic: !t.italic })}>
        <TextItalic size={17} />
      </IconButton>
      <IconButton label="Underline" shortcut="Cmd+U" active={t.underline} onClick={() => patch(ids, { underline: !t.underline })}>
        <TextUnderline size={17} />
      </IconButton>
      <IconButton label="Strikethrough" active={t.strike} onClick={() => patch(ids, { strike: !t.strike })}>
        <TextStrikethrough size={17} />
      </IconButton>
      <IconButton label={`Align: ${t.align}`} onClick={() => patch(ids, { align: aligns[(aligns.indexOf(t.align) + 1) % 4] })}>
        <AlignIcon size={17} />
      </IconButton>
      <IconButton label={`Case: ${CASE_LABEL[t.caseMode]}`} active={t.caseMode !== 'none'} onClick={() => patch(ids, { caseMode: CASES[(CASES.indexOf(t.caseMode) + 1) % 4] })}>
        <TextAa size={17} />
      </IconButton>
      <IconButton
        label={t.list === 'none' ? 'Bulleted list' : t.list === 'bullet' ? 'Numbered list' : 'No list'}
        active={t.list !== 'none'}
        onClick={() => patch(ids, { list: t.list === 'none' ? 'bullet' : t.list === 'bullet' ? 'number' : 'none' })}
      >
        {t.list === 'number' ? <ListNumbers size={17} /> : <ListBullets size={17} />}
      </IconButton>
      <Divider />
      <PopButton label="Spacing" icon={<SlidersHorizontal size={16} />} width={260}>
        {() => (
          <div className="space-y-3">
            <Slider label="Letter spacing" value={t.letterSpacing} min={-100} max={800} step={5} onChange={(v) => patch(ids, { letterSpacing: v }, 'lsp')} />
            <Slider label="Line spacing" value={t.lineHeight} min={0.7} max={2.6} step={0.05} onChange={(v) => patch(ids, { lineHeight: v }, 'lh')} />
          </div>
        )}
      </PopButton>
      <PopButton label="Effects" icon={<Sparkle size={16} />} width={290}>
        {() => <EffectsPanel models={models} />}
      </PopButton>
      <CommonActions models={models} />
    </>
  )
}

function SizeInput({ value, onChange }: { value: number; onChange: (n: number) => void }) {
  const [draft, setDraft] = useState<string | null>(null)
  return (
    <input
      aria-label="Font size"
      inputMode="numeric"
      value={draft ?? String(Math.round(value))}
      onChange={(e) => setDraft(e.target.value.replace(/[^0-9]/g, ''))}
      onBlur={() => {
        if (draft !== null && draft !== '') onChange(Number(draft))
        setDraft(null)
      }}
      onKeyDown={(e) => {
        if (e.key === 'Enter') (e.target as HTMLInputElement).blur()
      }}
      className="h-7 w-11 bg-transparent text-center text-[13px] tabular-nums text-ink outline-none"
    />
  )
}

// ---------------------------------------------------------------------------------------------
// image

function ImageToolbar({ models }: { models: ImageObj[] }) {
  const m = models[0]
  const ids = models.map((x) => x.id)
  const file = useRef<HTMLInputElement>(null)
  const single = models.length === 1
  return (
    <>
      {single && m.assetId && (
        <ToolbarButton icon={<SlidersHorizontal size={16} />} onClick={() => editorStore.set({ panel: 'editimage' })} title="Edit image">
          Edit image
        </ToolbarButton>
      )}
      {single && m.assetId && (
        <ToolbarButton icon={<Crop size={16} />} onClick={() => editorStore.set({ cropId: m.id })} title="Crop (double-click the image)">
          Crop
        </ToolbarButton>
      )}
      {single && (
        <>
          <ToolbarButton icon={<ImageSquare size={16} />} onClick={() => file.current?.click()} title="Replace image">
            Replace
          </ToolbarButton>
          <input
            ref={file}
            type="file"
            accept="image/*"
            hidden
            onChange={async (e) => {
              const f = e.target.files?.[0]
              e.target.value = ''
              if (!f) return
              try {
                const meta = await addAssetFromFile(f)
                await replaceImage(m.id, meta.id)
              } catch (err) {
                editorStore.notify(err instanceof Error ? err.message : 'Could not read that image', 'error')
              }
            }}
          />
        </>
      )}
      <Divider />
      <FlipMenu rotate />
      <PopButton label="Corners" icon={<Selection size={16} />} width={240}>
        {() => <Slider label="Corner radius" value={m.radius} min={0} max={Math.round(Math.min(m.width, m.height) / 2)} onChange={(v) => patch(ids, { radius: v, frame: m.frame === 'circle' || m.frame === 'arch' ? 'none' : m.frame }, 'radius')} />}
      </PopButton>
      <PopButton label="Border" icon={<RectangleDashed size={16} />} width={260}>
        {() => <BorderPanel border={m.border} onChange={(b) => patch(ids, { border: b }, 'imgborder')} />}
      </PopButton>
      <PopButton label="Shadow" icon={<Copy size={16} />} width={270}>
        {() => <ShadowPanel shadow={m.shadow} onChange={(s) => patch(ids, { shadow: s }, 'shadow')} />}
      </PopButton>
      <CommonActions models={models} />
    </>
  )
}

function BorderPanel({ border, onChange }: { border: { width: number; color: string } | null; onChange: (b: { width: number; color: string } | null) => void }) {
  const cur = border ?? { width: 0, color: '#ffffff' }
  return (
    <div className="space-y-3">
      <Slider label="Border width" value={cur.width} min={0} max={60} onChange={(v) => onChange(v === 0 ? null : { ...cur, width: v })} />
      <div className="flex items-center justify-between text-xs text-muted">
        Border colour
        <ColorButton value={cur.color} label="Border colour" onChange={(c) => typeof c === 'string' && onChange({ width: cur.width || 8, color: c })} />
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------------------------
// shape

function ShapeToolbar({ models }: { models: ShapeObj[] }) {
  const m = models[0]
  const ids = models.map((x) => x.id)
  const isLine = m.kind === 'line' || m.kind === 'arrow'
  return (
    <>
      {isLine ? (
        <ColorButton value={m.stroke} label="Line colour" onChange={(c) => typeof c === 'string' && patch(ids, { stroke: c }, 'sstroke')} />
      ) : (
        <ColorButton value={m.fill} label="Fill colour" allowGradient allowTransparent onChange={(c) => patch(ids, { fill: c }, 'sfill')} />
      )}
      <PopButton label={isLine ? 'Line' : 'Border'} icon={<RectangleDashed size={16} />} width={270}>
        {() => (
          <div className="space-y-3">
            <Slider label="Weight" value={m.strokeWidth} min={isLine ? 1 : 0} max={40} onChange={(v) => patch(ids, { strokeWidth: v }, 'sw')} />
            <Segmented
              label="Line style"
              value={m.dash}
              onChange={(v) => patch(ids, { dash: v })}
              options={[
                { value: 'solid', label: 'Solid' },
                { value: 'dashed', label: 'Dashed' },
                { value: 'dotted', label: 'Dotted' },
              ]}
            />
            {!isLine && (
              <div className="flex items-center justify-between text-xs text-muted">
                Border colour
                <ColorButton value={m.stroke} label="Border colour" onChange={(c) => typeof c === 'string' && patch(ids, { stroke: c, strokeWidth: m.strokeWidth || 6 }, 'sstroke')} />
              </div>
            )}
          </div>
        )}
      </PopButton>
      {m.kind === 'rect' && (
        <PopButton label="Corners" icon={<Selection size={16} />} width={240}>
          {() => <Slider label="Corner radius" value={m.radius} min={0} max={Math.round(Math.min(m.width, m.height) / 2)} onChange={(v) => patch(ids, { radius: v }, 'radius')} />}
        </PopButton>
      )}
      <PopButton label="Shadow" icon={<Copy size={16} />} width={270}>
        {() => <ShadowPanel shadow={m.shadow} onChange={(s) => patch(ids, { shadow: s }, 'shadow')} />}
      </PopButton>
      <FlipMenu rotate />
      <CommonActions models={models} />
    </>
  )
}

// ---------------------------------------------------------------------------------------------
// main

export default function ContextToolbar() {
  const models = useSelectedModels()
  const page = useEditor((s) => s.doc.pages.find((p) => p.id === s.activePageId) ?? s.doc.pages[0])
  const cropping = useEditor((s) => s.cropId)
  let body: React.ReactNode
  if (cropping) {
    body = <CropBar />
  } else if (!models.length) {
    body = (
      <>
        <ColorButton value={page.background} label="Page background" allowGradient onChange={(p) => setBackground(p, page.id)} />
        <span className="px-1 text-[13px] text-muted">Page background</span>
      </>
    )
  } else if (models.every(isText)) {
    body = <TextToolbar models={models as TextObj[]} />
  } else if (models.every(isImage)) {
    body = <ImageToolbar models={models as ImageObj[]} />
  } else if (models.every(isShape)) {
    body = <ShapeToolbar models={models as ShapeObj[]} />
  } else {
    body = <MultiToolbar models={models} />
  }
  return (
    <div role="toolbar" aria-label="Selection tools" className="relative z-40 flex h-12 shrink-0 items-center gap-1 overflow-x-auto border-b border-line bg-surface px-3">
      {body}
    </div>
  )
}

function CropBar() {
  const ratioId = useEditor((s) => s.cropRatioId)
  return (
    <>
      <span className="pr-2 text-[13px] text-muted">Aspect ratio</span>
      {CROP_RATIOS.map((r) => (
        <IconButton key={r.id} label={`Crop ${r.label}`} active={ratioId === r.id} onClick={() => editorStore.set({ cropRatioId: r.id })} className="px-2.5">
          {r.label}
        </IconButton>
      ))}
      <span className="flex-1" />
      <span className="hidden pr-2 text-xs text-faint lg:block">Drag inside to move the photo</span>
      <TextButton onClick={() => editorStore.set({ cropCmd: 'cancel' })}>Cancel</TextButton>
      <TextButton primary onClick={() => editorStore.set({ cropCmd: 'done' })}>Done</TextButton>
    </>
  )
}

function MultiToolbar({ models }: { models: ObjModel[] }) {
  return (
    <>
      <span className="px-1 text-[13px] text-muted">{models.length} selected</span>
      <CommonActions models={models} />
    </>
  )
}
