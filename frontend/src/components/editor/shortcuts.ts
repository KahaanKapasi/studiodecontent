import { useEffect } from 'react'
import {
  addImageFiles,
  addShape,
  addText,
  arrange,
  copySelection,
  cutSelection,
  deleteSelection,
  duplicateSelection,
  groupSelection,
  nudge,
  pasteClipboard,
  selectAll,
  ungroupSelection,
  zoomTo,
} from './actions'
import { engine } from './engine'
import { flushSave } from './persistence'
import { editorStore, hasClipboard } from './store'

function isTyping(t: EventTarget | null) {
  const el = t as HTMLElement | null
  return !!el?.tagName && (['INPUT', 'TEXTAREA', 'SELECT'].includes(el.tagName) || el.isContentEditable)
}
function modalOpen() {
  return !!document.querySelector('[aria-modal="true"]')
}

/** Canva-style keyboard shortcuts. Everything is disabled while a text box, an input, a dialog or
 * the crop tool owns the keyboard. */
export function useShortcuts() {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (modalOpen()) return
      const mod = e.metaKey || e.ctrlKey
      const key = e.key.toLowerCase()
      const s = editorStore.getState()

      if (mod && key === 's') {
        e.preventDefault()
        engine.finishEditing()
        void flushSave()
        return
      }
      if (isTyping(e.target) || engine.isEditingText()) return
      if (s.cropId) return

      if (mod && (key === '=' || key === '+')) {
        e.preventDefault()
        zoomTo(s.zoom * 1.2)
        return
      }
      if (mod && (key === '-' || key === '_')) {
        e.preventDefault()
        zoomTo(s.zoom / 1.2)
        return
      }
      if (mod && key === '0') {
        e.preventDefault()
        editorStore.set({ fit: true })
        return
      }
      if (mod && key === 'z') {
        e.preventDefault()
        if (e.shiftKey) editorStore.redo()
        else editorStore.undo()
        return
      }
      if (mod && key === 'y') {
        e.preventDefault()
        editorStore.redo()
        return
      }
      if (mod && key === 'c') {
        if (s.selection.ids.length) {
          e.preventDefault()
          copySelection()
        }
        return
      }
      if (mod && key === 'x') {
        if (s.selection.ids.length) {
          e.preventDefault()
          cutSelection()
        }
        return
      }
      if (mod && key === 'd') {
        e.preventDefault()
        duplicateSelection()
        return
      }
      if (mod && key === 'g') {
        e.preventDefault()
        if (e.shiftKey) ungroupSelection()
        else groupSelection()
        return
      }
      if (mod && key === 'a') {
        e.preventDefault()
        selectAll()
        return
      }
      if (mod && key === ']') {
        e.preventDefault()
        arrange(e.shiftKey ? 'front' : 'forward')
        return
      }
      if (mod && key === '[') {
        e.preventDefault()
        arrange(e.shiftKey ? 'back' : 'backward')
        return
      }
      if (mod || e.altKey) return

      if (key === 'delete' || key === 'backspace') {
        if (s.selection.ids.length) {
          e.preventDefault()
          deleteSelection()
        }
        return
      }
      if (key.startsWith('arrow') && s.selection.ids.length) {
        e.preventDefault()
        const step = e.shiftKey ? 10 : 1
        nudge(key === 'arrowleft' ? -step : key === 'arrowright' ? step : 0, key === 'arrowup' ? -step : key === 'arrowdown' ? step : 0)
        return
      }
      if (key === 'escape') {
        if (s.selection.ids.length) editorStore.setSelection(null, [])
        return
      }
      if (key === 'enter' && s.selection.ids.length === 1) {
        const id = s.selection.ids[0]
        const found = s.doc.pages.flatMap((p) => p.objects).find((o) => o.id === id)
        if (found?.type === 'text' && !found.locked) {
          e.preventDefault()
          engine.editText(id)
        }
        return
      }
      if (key === 't') {
        e.preventDefault()
        addText('heading')
      } else if (key === 'r') {
        e.preventDefault()
        addShape('rect')
      } else if (key === 'c') {
        e.preventDefault()
        addShape('circle')
      } else if (key === 'l') {
        e.preventDefault()
        addShape('line')
      }
    }

    const onPaste = (e: ClipboardEvent) => {
      if (isTyping(e.target) || engine.isEditingText() || modalOpen()) return
      const cd = e.clipboardData
      const files = [...(cd?.files ?? [])].filter((f) => f.type.startsWith('image/'))
      const fromItems = [...(cd?.items ?? [])].filter((it) => it.kind === 'file' && it.type.startsWith('image/')).map((it) => it.getAsFile()).filter((f): f is File => !!f)
      const imgs = files.length ? files : fromItems
      if (imgs.length) {
        e.preventDefault()
        void addImageFiles(imgs)
      } else if (hasClipboard()) {
        e.preventDefault()
        pasteClipboard()
      }
    }

    document.addEventListener('keydown', onKey)
    document.addEventListener('paste', onPaste)
    return () => {
      document.removeEventListener('keydown', onKey)
      document.removeEventListener('paste', onPaste)
    }
  }, [])
}
