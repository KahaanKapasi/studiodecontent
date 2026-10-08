import { useEffect, useRef, useState } from 'react'

/**
 * Fetches an authenticated resource (needs the access header, so a plain <img src> won't work)
 * as a Blob and exposes it as an object URL, revoked on unmount.
 */
export function useAuthedBlobUrl(fetcher: () => Promise<Blob>, deps: readonly unknown[]) {
  const [url, setUrl] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [attempt, setAttempt] = useState(0)
  const urlRef = useRef<string | null>(null)
  const fetcherRef = useRef(fetcher)

  useEffect(() => {
    fetcherRef.current = fetcher
  })

  useEffect(() => {
    let cancelled = false
    fetcherRef
      .current()
      .then((blob) => {
        if (cancelled) return
        if (urlRef.current) URL.revokeObjectURL(urlRef.current)
        const next = URL.createObjectURL(blob)
        urlRef.current = next
        setUrl(next)
        setError(null)
      })
      .catch((e: unknown) => {
        if (!cancelled) setError(e instanceof Error ? e.message : 'Could not load')
      })
    return () => {
      cancelled = true
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [...deps, attempt])

  useEffect(
    () => () => {
      if (urlRef.current) URL.revokeObjectURL(urlRef.current)
      urlRef.current = null
    },
    [],
  )

  return {
    url,
    error,
    loading: !url && !error,
    retry: () => {
      setError(null)
      setAttempt((n) => n + 1)
    },
  }
}
