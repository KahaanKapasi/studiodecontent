import { useEffect, useState } from 'react'
import { SpinnerGap } from '@phosphor-icons/react'
import { DownloadDialog, PreviewDialog, PublishDialog, ResizeDialog, ShortcutsDialog } from './Dialogs'
import { Rail, SidePanel } from './LeftPanels'
import { bootEditor, startAutosave } from './persistence'
import { useShortcuts } from './shortcuts'
import * as actions from './actions'
import { engine } from './engine'
import * as exporter from './export'
import * as fonts from './fonts'
import { editorStore, useEditor } from './store'
import ContextToolbar from './Toolbar'
import TopBar, { type DialogName } from './TopBar'
import Workspace from './Workspace'

/** The Posts editor: a Canva-style workspace (top bar, icon rail with slide-out panels, contextual
 * toolbar, stacked pages with zoom). Everything under components/editor/. */
export default function EditorPage() {
  const loaded = useEditor((s) => s.designLoaded)
  const [dialog, setDialog] = useState<DialogName | null>(null)
  const [bootError, setBootError] = useState('')
  useShortcuts()

  // Dev-only handle for poking the editor from the browser console.
  useEffect(() => {
    if (import.meta.env.DEV) (window as unknown as Record<string, unknown>).__editor = { store: editorStore, actions, exporter, fonts, engine }
  }, [])

  useEffect(() => {
    const off = startAutosave()
    bootEditor().catch((e) => setBootError(e instanceof Error ? e.message : 'The editor could not start'))
    return () => {
      off()
    }
  }, [])

  // Keep the browser from zooming the whole page on Cmd +/- while the editor is open.
  useEffect(() => {
    const block = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && ['=', '+', '-', '0'].includes(e.key)) e.preventDefault()
    }
    window.addEventListener('keydown', block)
    return () => window.removeEventListener('keydown', block)
  }, [])

  if (bootError) {
    return (
      <div className="flex h-dvh items-center justify-center bg-app p-6 text-center text-sm text-danger" role="alert">
        {bootError}
      </div>
    )
  }

  return (
    <div className="flex h-dvh min-h-0 flex-col bg-app text-ink">
      <TopBar onDialog={setDialog} />
      {!loaded ? (
        <div className="flex flex-1 items-center justify-center text-sm text-muted">
          <SpinnerGap size={18} className="mr-2 animate-spin" /> Opening editor
        </div>
      ) : (
        <div className="flex min-h-0 flex-1">
          <Rail />
          <SidePanel onDialog={(d) => setDialog(d)} />
          <div className="flex min-h-0 min-w-0 flex-1 flex-col">
            <ContextToolbar />
            <Workspace onShortcuts={() => setDialog('shortcuts')} />
          </div>
        </div>
      )}
      {dialog === 'new' && <ResizeDialog mode="new" onClose={() => setDialog(null)} />}
      {dialog === 'resize' && <ResizeDialog mode="resize" onClose={() => setDialog(null)} />}
      {dialog === 'download' && <DownloadDialog onClose={() => setDialog(null)} />}
      {dialog === 'preview' && <PreviewDialog onClose={() => setDialog(null)} />}
      {dialog === 'publish' && <PublishDialog onClose={() => setDialog(null)} />}
      {dialog === 'shortcuts' && <ShortcutsDialog onClose={() => setDialog(null)} />}
    </div>
  )
}

