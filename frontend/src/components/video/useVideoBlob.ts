import { useCallback, useEffect, useRef, useState } from 'react'
import { videoApi } from '../../api/client'
import type { VideoGeneration } from '../../types'

function saveBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  a.remove()
  setTimeout(() => URL.revokeObjectURL(url), 10_000)
}

/**
 * Resolves a playable `src` for a generation.
 * - A public `video_url` is used directly (falls back to the blob if it fails to load, e.g. expired).
 * - Otherwise the file endpoint (which needs the access header) is fetched as a Blob and exposed as
 *   an object URL, cached for the life of the component and revoked on unmount.
 * Blobs are only fetched once `enabled` flips true (card scrolled into view).
 */
export function useVideoBlob(gen: VideoGeneration, enabled: boolean) {
  const [blobUrl, setBlobUrl] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [attempt, setAttempt] = useState(0)
  const [directFailed, setDirectFailed] = useState(false)
  const blobRef = useRef<Blob | null>(null)
  const urlRef = useRef<string | null>(null)

  const useDirect = !!gen.video_url && !directFailed
  const canFetchBlob = gen.status === 'succeeded' && gen.has_file
  const wantBlob = enabled && canFetchBlob && !useDirect && !blobUrl

  useEffect(() => {
    if (!wantBlob) return
    let cancelled = false
    videoApi
      .fetchFileBlob(gen.id)
      .then((blob) => {
        if (cancelled) return
        blobRef.current = blob
        const url = URL.createObjectURL(blob)
        urlRef.current = url
        setBlobUrl(url)
      })
      .catch((e: unknown) => {
        if (!cancelled) setError(e instanceof Error ? e.message : 'Could not load the video')
      })
    return () => {
      cancelled = true
    }
    // `attempt` re-triggers after a failed load
  }, [wantBlob, gen.id, attempt])

  useEffect(
    () => () => {
      if (urlRef.current) URL.revokeObjectURL(urlRef.current)
      urlRef.current = null
      blobRef.current = null
    },
    [],
  )

  const download = useCallback(async () => {
    const filename = `madridonomy-video-${gen.id}.mp4`
    if (blobRef.current) return saveBlob(blobRef.current, filename)
    if (gen.video_url && !directFailed) {
      try {
        const res = await fetch(gen.video_url)
        if (!res.ok) throw new Error(String(res.status))
        return saveBlob(await res.blob(), filename)
      } catch {
        // Cross-origin hosts may block fetch — let the browser handle the URL itself.
        window.open(gen.video_url, '_blank', 'noopener')
        return
      }
    }
    saveBlob(await videoApi.fetchFileBlob(gen.id), filename)
  }, [gen.id, gen.video_url, directFailed])

  return {
    src: useDirect ? gen.video_url : blobUrl,
    loading: wantBlob && !error,
    error,
    unavailable: gen.status === 'succeeded' && !gen.has_file && !gen.video_url,
    retryLoad: () => {
      setError(null)
      setAttempt((n) => n + 1)
    },
    /** Call from <video onError> — switches from a dead public URL to the authenticated blob. */
    onDirectError: () => {
      if (gen.video_url && gen.has_file) setDirectFailed(true)
    },
    download,
  }
}
