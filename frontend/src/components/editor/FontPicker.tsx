import { useMemo, useRef, useState, useSyncExternalStore } from 'react'
import { CaretDown, MagnifyingGlass, UploadSimple } from '@phosphor-icons/react'
import {
  addCustomFont,
  BUNDLED_FONTS,
  customEntry,
  ensureFont,
  FONT_ACCEPT,
  getCustomFonts,
  GOOGLE_FONTS,
  onFontsChanged,
  requestAllGoogleFonts,
  SYSTEM_FONTS,
  type FontEntry,
} from './fonts'
import { editorStore } from './store'
import { Popover, focusRing } from './ui'

function useCustomFonts() {
  return useSyncExternalStore(onFontsChanged, getCustomFonts)
}

export function useFontCatalogue(): { uploaded: FontEntry[]; groups: { title: string; fonts: FontEntry[] }[] } {
  const custom = useCustomFonts()
  return useMemo(() => {
    const uploaded = custom.map(customEntry)
    const cats = ['Sans', 'Display', 'Serif', 'Script', 'Mono'] as const
    const groups = [
      { title: 'Bundled', fonts: BUNDLED_FONTS },
      ...cats.map((c) => ({ title: c, fonts: GOOGLE_FONTS.filter((f) => f.category === c) })),
      { title: 'System', fonts: SYSTEM_FONTS },
    ]
    return { uploaded, groups }
  }, [custom])
}

export function FontPicker({ value, onChange }: { value: string; onChange: (family: string) => void }) {
  const [q, setQ] = useState('')
  const cat = useFontCatalogue()
  const input = useRef<HTMLInputElement>(null)
  const file = useRef<HTMLInputElement>(null)
  const [busy, setBusy] = useState(false)

  const pick = (f: FontEntry, close: () => void) => {
    void ensureFont(f.family, false, false).then(() => onChange(f.family))
    onChange(f.family)
    close()
  }

  const upload = async (files: FileList | null, close: () => void) => {
    if (!files?.length) return
    setBusy(true)
    try {
      let last: string | null = null
      for (const f of Array.from(files)) {
        try {
          last = (await addCustomFont(f)).family
        } catch (e) {
          editorStore.notify(e instanceof Error ? e.message : 'Could not add that font', 'error')
        }
      }
      if (last) {
        onChange(last)
        close()
      }
    } finally {
      setBusy(false)
    }
  }

  const match = (f: FontEntry) => !q.trim() || f.family.toLowerCase().includes(q.trim().toLowerCase())

  return (
    <Popover
      width={300}
      onOpenChange={(o) => {
        if (o) {
          requestAllGoogleFonts()
          setTimeout(() => input.current?.focus(), 30)
        } else setQ('')
      }}
      trigger={({ open, toggle, ref }) => (
        <span ref={ref}>
          <button
            type="button"
            title="Font"
            aria-label={`Font: ${value}`}
            aria-expanded={open}
            onMouseDown={(e) => e.preventDefault()}
            onClick={toggle}
            className={`flex h-8 w-40 items-center justify-between gap-2 rounded-md border border-line px-2.5 text-[13px] hover:bg-surface-2 ${focusRing} ${open ? 'bg-surface-2' : ''}`}
          >
            <span className="truncate" style={{ fontFamily: `"${value}"` }}>
              {value}
            </span>
            <CaretDown size={12} className="shrink-0 text-muted" />
          </button>
        </span>
      )}
    >
      {(close) => (
        <div className="-m-1">
          <div className="mb-2 flex items-center gap-2 rounded-md border border-line bg-app px-2 focus-within:border-accent">
            <MagnifyingGlass size={14} className="text-muted" />
            <input
              ref={input}
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Search fonts"
              aria-label="Search fonts"
              className="h-8 w-full bg-transparent text-[13px] text-ink outline-none placeholder:text-faint"
            />
          </div>
          <button
            type="button"
            disabled={busy}
            onClick={() => file.current?.click()}
            className={`mb-2 flex h-9 w-full items-center justify-center gap-2 rounded-md border border-dashed border-line-strong text-[13px] font-medium text-ink hover:bg-surface-2 disabled:opacity-50 ${focusRing}`}
          >
            <UploadSimple size={15} />
            {busy ? 'Adding font' : 'Upload a font (TTF, OTF, WOFF, WOFF2)'}
          </button>
          <input ref={file} type="file" accept={FONT_ACCEPT} multiple hidden onChange={(e) => void upload(e.target.files, close).finally(() => (e.target.value = ''))} />
          <div className="max-h-[52vh] overflow-y-auto pr-1">
            {cat.uploaded.filter(match).length > 0 && (
              <FontGroup title="Uploaded" fonts={cat.uploaded.filter(match)} value={value} pick={(f) => pick(f, close)} />
            )}
            {cat.groups.map((g) => {
              const fonts = g.fonts.filter(match)
              return fonts.length ? <FontGroup key={g.title} title={g.title} fonts={fonts} value={value} pick={(f) => pick(f, close)} /> : null
            })}
          </div>
        </div>
      )}
    </Popover>
  )
}

function FontGroup({ title, fonts, value, pick }: { title: string; fonts: FontEntry[]; value: string; pick: (f: FontEntry) => void }) {
  return (
    <div className="mb-2">
      <div className="px-1 pb-1 text-xs font-semibold text-muted">{title}</div>
      {fonts.map((f) => (
        <button
          key={f.family}
          type="button"
          onMouseDown={(e) => e.preventDefault()}
          onClick={() => pick(f)}
          className={`flex w-full items-center rounded-md px-2 py-1.5 text-left text-[17px] leading-tight hover:bg-surface-2 ${focusRing} ${value === f.family ? 'bg-accent/10 text-accent' : 'text-ink'}`}
          style={{ fontFamily: `"${f.family}"` }}
        >
          <span className="truncate">{f.family}</span>
        </button>
      ))}
    </div>
  )
}
