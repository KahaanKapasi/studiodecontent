import { TEMPLATES } from './templates'

interface TemplateStripProps {
  selectedId: number
  onSelect: (id: number) => void
}

export default function TemplateStrip({ selectedId, onSelect }: TemplateStripProps) {
  return (
    <div className="flex gap-3">
      {TEMPLATES.map((template) => (
        <button
          key={template.id}
          onClick={() => onSelect(template.id)}
          title={template.description}
          className={`flex-1 rounded-md border px-3 py-2 text-left text-xs transition-colors ${
            selectedId === template.id
              ? 'border-amber-500/60 bg-amber-500/10 text-amber-300'
              : 'border-neutral-800 bg-neutral-900 text-neutral-400 hover:border-neutral-700'
          }`}
        >
          <div className="mb-1.5 h-8 w-full rounded bg-neutral-800" />
          {template.name}
        </button>
      ))}
    </div>
  )
}
