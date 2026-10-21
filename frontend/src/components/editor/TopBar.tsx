import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  ArrowUUpLeft,
  ArrowUUpRight,
  CaretDown,
  CheckCircle,
  DownloadSimple,
  Eye,
  FilePlus,
  FloppyDisk,
  House,
  Keyboard,
  PaperPlaneTilt,
  Copy,
  SpinnerGap,
  WarningCircle,
  ArrowsOutSimple,
} from '@phosphor-icons/react'
import CostTracker from '../cost/CostTracker'
import { setTitle } from './actions'
import { engine } from './engine'
import { duplicateDesign, flushSave, openDesign } from './persistence'
import { editorStore, useEditor } from './store'
import { IconButton, MenuDivider, MenuItem, Popover, TextButton, focusRing } from './ui'

export type DialogName = 'new' | 'resize' | 'download' | 'preview' | 'publish' | 'shortcuts'

const NAV = [
  ['/discovery', 'Discovery'],
  ['/articles', 'Articles'],
  ['/video', 'Video'],
  ['/genjutsu', 'Genjutsu'],
  ['/dashboard', 'Dashboard'],
  ['/footonomy', 'Footonomy'],
] as const

function SaveStatus() {
  const s = useEditor((x) => x.saveStatus)
  const map = {
    saved: { t: 'Saved', icon: <CheckCircle size={14} weight="fill" className="text-success" />, c: 'text-muted' },
    saving: { t: 'Saving', icon: <SpinnerGap size={14} className="animate-spin" />, c: 'text-muted' },
    unsaved: { t: 'Unsaved changes', icon: <SpinnerGap size={14} className="animate-spin" />, c: 'text-muted' },
    error: { t: 'Not saved: storage blocked', icon: <WarningCircle size={14} weight="fill" className="text-danger" />, c: 'text-danger' },
  }[s]
  return (
    <span role="status" aria-live="polite" className={`hidden items-center gap-1.5 whitespace-nowrap text-xs lg:flex ${map.c}`} title={s === 'error' ? 'Your browser blocked local storage. Download the design to keep it.' : undefined}>
      {map.icon}
      {map.t}
    </span>
  )
}

export default function TopBar({ onDialog }: { onDialog: (d: DialogName) => void }) {
  const navigate = useNavigate()
  const title = useEditor((s) => s.doc.title)
  const docId = useEditor((s) => s.doc.id)
  useEditor((s) => s.histVersion)
  const [draft, setDraft] = useState(title)
  useEffect(() => setDraft(title), [title, docId])

  const undo = () => {
    engine.finishEditing()
    editorStore.undo()
  }
  const redo = () => {
    engine.finishEditing()
    editorStore.redo()
  }

  return (
    <header className="relative z-40 flex h-14 shrink-0 items-center gap-1.5 border-b border-line bg-surface px-3">
      <Popover
        width={200}
        trigger={({ open, toggle, ref }) => (
          <span ref={ref}>
            <IconButton label="Content Studio menu" active={open} onClick={toggle} className="px-2">
              <House size={18} />
              <CaretDown size={11} className="text-muted" />
            </IconButton>
          </span>
        )}
      >
        {(close) => (
          <div role="menu" className="-m-1">
            {NAV.map(([to, label]) => (
              <MenuItem key={to} onSelect={() => { close(); void flushSave().then(() => navigate(to)) }}>
                {label}
              </MenuItem>
            ))}
          </div>
        )}
      </Popover>

      <Popover
        width={240}
        trigger={({ open, toggle, ref }) => (
          <span ref={ref}>
            <IconButton label="File" active={open} onClick={toggle} className="px-2.5">
              File
            </IconButton>
          </span>
        )}
      >
        {(close) => {
          const go = (fn: () => void) => () => {
            close()
            fn()
          }
          return (
            <div role="menu" className="-m-1">
              <MenuItem icon={<FilePlus size={15} />} onSelect={go(() => onDialog('new'))}>New design</MenuItem>
              <MenuItem icon={<ArrowsOutSimple size={15} />} onSelect={go(() => onDialog('resize'))}>Resize</MenuItem>
              <MenuItem icon={<DownloadSimple size={15} />} onSelect={go(() => onDialog('download'))}>Download</MenuItem>
              <MenuItem icon={<FloppyDisk size={15} />} shortcut="Cmd+S" onSelect={go(() => { engine.finishEditing(); void flushSave() })}>Save now</MenuItem>
              <MenuItem
                icon={<Copy size={15} />}
                onSelect={go(() => {
                  engine.finishEditing()
                  void flushSave()
                    .then(() => duplicateDesign(editorStore.getState().doc.id))
                    .then((r) => r && openDesign(r.id))
                })}
              >
                Make a copy
              </MenuItem>
              <MenuDivider />
              <MenuItem icon={<Keyboard size={15} />} onSelect={go(() => onDialog('shortcuts'))}>Keyboard shortcuts</MenuItem>
            </div>
          )
        }}
      </Popover>

      <TextButton onClick={() => onDialog('resize')} className="!h-8">
        <ArrowsOutSimple size={15} /> Resize
      </TextButton>

      <span aria-hidden className="mx-1 h-5 w-px bg-line" />
      <IconButton label="Undo" shortcut="Cmd+Z" disabled={!editorStore.canUndo()} onClick={undo}>
        <ArrowUUpLeft size={18} />
      </IconButton>
      <IconButton label="Redo" shortcut="Cmd+Shift+Z" disabled={!editorStore.canRedo()} onClick={redo}>
        <ArrowUUpRight size={18} />
      </IconButton>

      <input
        aria-label="Design title"
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={() => setTitle(draft.trim() || 'Untitled design')}
        onKeyDown={(e) => {
          if (e.key === 'Enter') (e.target as HTMLInputElement).blur()
          if (e.key === 'Escape') {
            setDraft(title)
            ;(e.target as HTMLInputElement).blur()
          }
        }}
        className={`mx-2 h-8 w-56 min-w-0 rounded-md border border-transparent bg-transparent px-2 text-sm font-medium text-ink hover:border-line focus:border-accent focus:bg-app ${focusRing} focus-visible:outline-none`}
      />
      <SaveStatus />

      <div className="flex-1" />
      <div className="hidden xl:block">
        <CostTracker />
      </div>
      <TextButton onClick={() => onDialog('preview')}>
        <Eye size={15} /> Preview
      </TextButton>
      <TextButton onClick={() => onDialog('download')}>
        <DownloadSimple size={15} /> Download
      </TextButton>
      <TextButton primary onClick={() => onDialog('publish')}>
        <PaperPlaneTilt size={15} /> Publish
      </TextButton>
    </header>
  )
}
