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
              ? 'border-accent/60 bg-accent/10 text-accent'
              : 'border-line bg-surface text-muted hover:border-line-strong'
          }`}
        >
          <div className="mb-1.5 h-8 w-full rounded bg-surface-2" />
          {template.name}
        </button>
      ))}
    </div>
  )
}
