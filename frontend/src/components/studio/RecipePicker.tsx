import { recipeKey } from './keys'
import type { StudioEngineInfo, StudioRecipeInfo } from '../../types'


function Badge({ children, title, tone = 'neutral' }: { children: string; title?: string; tone?: 'neutral' | 'warn' }) {
  return (
    <span
      title={title}
      className={`inline-block max-w-full truncate rounded-full px-2 py-0.5 text-[11px] font-medium ${
        tone === 'warn' ? 'bg-danger/10 text-danger' : 'bg-surface-2 text-muted'
      }`}
    >
      {children}
    </span>
  )
}

export function RecipeBadges({ recipe }: { recipe: StudioRecipeInfo }) {
  const keys = recipe.missing_keys.join(', ')
  return (
    <>
      {recipe.paid && <Badge title="Uses paid API calls">paid</Badge>}
      {!recipe.configured && (
        <Badge tone="warn" title={`Missing on the server: ${keys}`}>
          {`needs ${recipe.missing_keys[0] ?? 'keys'}${recipe.missing_keys.length > 1 ? ` +${recipe.missing_keys.length - 1}` : ''}`}
        </Badge>
      )}
    </>
  )
}

function RecipeCard({
  title,
  description,
  recipe,
  selected,
  onSelect,
}: {
  title: string
  description: string
  recipe: StudioRecipeInfo
  selected: boolean
  onSelect: () => void
}) {
  return (
    <button
      type="button"
      aria-pressed={selected}
      onClick={onSelect}
      className={`flex min-h-24 w-full flex-col items-start gap-1.5 rounded-lg border p-3.5 text-left transition-colors motion-reduce:transition-none ${
        selected
          ? 'border-accent bg-accent/5 ring-1 ring-accent'
          : 'border-line bg-surface hover:border-line-strong hover:bg-surface-2'
      }`}
    >
      <span className="text-sm font-semibold text-ink">{title}</span>
      <span className="text-xs leading-relaxed text-muted">{description}</span>
      <span className="mt-auto flex max-w-full flex-wrap items-center gap-1.5 pt-1">
        <RecipeBadges recipe={recipe} />
      </span>
    </button>
  )
}

export default function RecipePicker({
  engines,
  selectedKey,
  onSelect,
}: {
  engines: StudioEngineInfo[]
  selectedKey: string | null
  onSelect: (engine: StudioEngineInfo, recipe: StudioRecipeInfo) => void
}) {
  return (
    <div className="@container"><div className="grid gap-x-3 gap-y-4 @md:grid-cols-2">
      {engines.map((engine) => {
        const single = engine.recipes.length === 1
        if (single) {
          const r = engine.recipes[0]
          return (
            <RecipeCard
              key={engine.id}
              title={engine.label}
              description={engine.description || r.description}
              recipe={r}
              selected={selectedKey === recipeKey(engine.id, r.id)}
              onSelect={() => onSelect(engine, r)}
            />
          )
        }
        return (
          <section key={engine.id} className="@md:col-span-2" aria-label={engine.label}>
            <div className="mb-2 px-0.5">
              <h3 className="text-sm font-semibold text-ink">{engine.label}</h3>
              {engine.description && <p className="text-xs text-faint">{engine.description}</p>}
            </div>
            <div className="grid gap-3 @md:grid-cols-2">
              {engine.recipes.map((r) => (
                <RecipeCard
                  key={r.id}
                  title={r.label}
                  description={r.description}
                  recipe={r}
                  selected={selectedKey === recipeKey(engine.id, r.id)}
                  onSelect={() => onSelect(engine, r)}
                />
              ))}
            </div>
          </section>
        )
      })}
    </div></div>
  )
}
