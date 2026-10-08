/**
 * Object-URL cache for local File previews. URLs are created lazily during render and released
 * explicitly when a file is removed/replaced or the form unmounts (no effect needed per preview).
 */
const urls = new Map<File, string>()

export function fileUrl(file: File): string {
  let url = urls.get(file)
  if (!url) {
    url = URL.createObjectURL(file)
    urls.set(file, url)
  }
  return url
}

export function releaseFile(file: File | undefined | null) {
  if (!file) return
  const url = urls.get(file)
  if (url) {
    URL.revokeObjectURL(url)
    urls.delete(file)
  }
}

export function releaseFiles(files: Iterable<File>) {
  for (const f of files) releaseFile(f)
}

export function formatBytes(n: number): string {
  if (n < 1024) return `${n} B`
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(0)} KB`
  return `${(n / 1024 / 1024).toFixed(1)} MB`
}

export function formatDuration(seconds: number): string {
  const s = Math.round(seconds)
  const m = Math.floor(s / 60)
  return m > 0 ? `${m}:${String(s % 60).padStart(2, '0')}` : `${s}s`
}
