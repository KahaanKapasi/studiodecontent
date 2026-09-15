const COLORS: Record<string, string> = {
  new: 'bg-blue-500/10 text-blue-400',
  selected: 'bg-emerald-500/10 text-emerald-400',
  discarded: 'bg-surface-2 text-faint',
  draft: 'bg-amber-500/10 text-amber-400',
  published: 'bg-emerald-500/10 text-emerald-400',
  finalized: 'bg-emerald-500/10 text-emerald-400',
  article: 'bg-purple-500/10 text-purple-400',
  video: 'bg-sky-500/10 text-sky-400',
  both: 'bg-fuchsia-500/10 text-fuchsia-400',
}

export default function Badge({ label }: { label: string }) {
  return (
    <span
      className={`inline-block rounded-full px-2.5 py-0.5 text-xs font-medium capitalize ${
        COLORS[label] ?? 'bg-surface-2 text-muted'
      }`}
    >
      {label}
    </span>
  )
}
