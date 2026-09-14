interface InstagramPreviewProps {
  canvasDataUrl: string | null
  caption: string
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

export default function InstagramPreview({ canvasDataUrl, caption }: InstagramPreviewProps) {
  return (
    <div className="w-80 shrink-0 overflow-hidden rounded-xl border border-neutral-800 bg-black">
      <div className="flex items-center gap-2 px-3 py-2.5">
        <div className="h-8 w-8 shrink-0 rounded-full bg-gradient-to-tr from-amber-400 to-pink-500" />
        <div className="text-sm font-semibold text-neutral-100">madridonomy</div>
      </div>

      <div className="aspect-square w-full bg-neutral-900">
        {canvasDataUrl ? (
          <img src={canvasDataUrl} alt="Post preview" className="h-full w-full object-cover" />
        ) : (
          <div className="flex h-full items-center justify-center text-xs text-neutral-600">
            Canvas preview will appear here
          </div>
        )}
      </div>

      <div className="flex items-center justify-between px-3 py-2.5 text-neutral-100">
        <div className="flex items-center gap-3">
          <HeartIcon />
          <CommentIcon />
          <ShareIcon />
        </div>
        <BookmarkIcon />
      </div>

      <div className="px-3 pb-3 text-sm text-neutral-200">
        <span className="font-semibold">madridonomy</span>{' '}
        <span className="text-neutral-300">{caption || 'Your caption will show here…'}</span>
      </div>
    </div>
  )
}
