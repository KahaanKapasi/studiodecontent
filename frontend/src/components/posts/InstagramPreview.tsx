import { useState } from 'react'

interface InstagramPreviewProps {
  /** One image per carousel slide (a single image = a plain post). */
  images: string[]
  caption: string
  /** Design width / height. Instagram crops anything outside 4:5 .. 1.91:1 in the feed. */
  aspect?: number
  loading?: boolean
}

const HeartIcon = () => (
  <svg viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" strokeWidth="1.8">
    <path d="M12 21s-7.5-4.6-10-9.1C.5 8.6 2 5 5.5 5c2 0 3.5 1.2 4.5 2.6C11 6.2 12.5 5 14.5 5 18 5 19.5 8.6 22 11.9 19.5 16.4 12 21 12 21Z" />
  </svg>
)
const CommentIcon = () => (
  <svg viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" strokeWidth="1.8">
    <path d="M21 11.5a8.38 8.38 0 0 1-8.5 8.5 8.5 8.5 0 0 1-4-1L3 21l2-5.5A8.38 8.38 0 0 1 3.5 12 8.5 8.5 0 0 1 12 3.5a8.38 8.38 0 0 1 9 8Z" />
  </svg>
)
const ShareIcon = () => (
  <svg viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" strokeWidth="1.8">
    <path d="M22 2 11 13" />
    <path d="M22 2 15 22l-4-9-9-4 20-7Z" />
  </svg>
)
const BookmarkIcon = () => (
  <svg viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" strokeWidth="1.8">
    <path d="M19 21 12 16l-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2Z" />
  </svg>
)

export default function InstagramPreview({ images, caption, aspect = 1, loading }: InstagramPreviewProps) {
  const [index, setIndex] = useState(0)
  const i = Math.min(index, Math.max(0, images.length - 1))
  const feedAspect = Math.min(1.91, Math.max(0.8, aspect))
  return (
    <div className="w-80 shrink-0 overflow-hidden rounded-xl border border-neutral-800 bg-black">
      <div className="flex items-center gap-2 px-3 py-2.5">
        <div className="h-8 w-8 shrink-0 rounded-full bg-gradient-to-tr from-amber-400 to-pink-500" />
        <div className="text-sm font-semibold text-neutral-100">madridonomy</div>
      </div>

      <div className="relative w-full bg-neutral-900" style={{ aspectRatio: String(feedAspect) }}>
        {images[i] ? (
          <img src={images[i]} alt={`Slide ${i + 1} preview`} className="h-full w-full object-cover" />
        ) : (
          <div className="flex h-full items-center justify-center text-xs text-neutral-500">{loading ? 'Rendering preview...' : 'Nothing to preview yet'}</div>
        )}
        {images.length > 1 && (
          <>
            <span className="absolute right-2 top-2 rounded-full bg-black/60 px-2 py-0.5 text-[11px] text-white tabular-nums">
              {i + 1}/{images.length}
            </span>
            {i > 0 && (
              <button type="button" aria-label="Previous slide" onClick={() => setIndex(i - 1)} className="absolute left-2 top-1/2 flex h-7 w-7 -translate-y-1/2 items-center justify-center rounded-full bg-white/85 text-black">
                <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2.4"><path d="m15 5-7 7 7 7" /></svg>
              </button>
            )}
            {i < images.length - 1 && (
              <button type="button" aria-label="Next slide" onClick={() => setIndex(i + 1)} className="absolute right-2 top-1/2 flex h-7 w-7 -translate-y-1/2 items-center justify-center rounded-full bg-white/85 text-black">
                <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2.4"><path d="m9 5 7 7-7 7" /></svg>
              </button>
            )}
          </>
        )}
      </div>

      <div className="relative flex items-center justify-between px-3 py-2.5 text-neutral-100">
        <div className="flex items-center gap-3">
          <HeartIcon />
          <CommentIcon />
          <ShareIcon />
        </div>
        {images.length > 1 && (
          <div className="absolute left-1/2 flex -translate-x-1/2 gap-1" aria-hidden>
            {images.map((_, n) => (
              <span key={n} className={`h-1.5 w-1.5 rounded-full ${n === i ? 'bg-sky-400' : 'bg-neutral-600'}`} />
            ))}
          </div>
        )}
        <BookmarkIcon />
      </div>

      <div className="px-3 pb-3 text-sm text-neutral-200">
        <span className="font-semibold">madridonomy</span>{' '}
        <span className="text-neutral-300">{caption || 'Your caption will show here...'}</span>
      </div>
    </div>
  )
}
