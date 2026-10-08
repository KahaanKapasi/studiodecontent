import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { studioApi } from '../../api/client'
import type { StudioEngineInfo, StudioRecipeInfo } from '../../types'
import { ENGINES_KEY, recipeKey } from './keys'
import ProjectList from './ProjectList'
import RecipeForm from './RecipeForm'
import RecipePicker, { RecipeBadges } from './RecipePicker'

export default function StudioTab() {
  const enginesQuery = useQuery({
    queryKey: ENGINES_KEY,
    queryFn: studioApi.engines,
    staleTime: 5 * 60_000,
  })
  const engines = enginesQuery.data
  const [selectedKey, setSelectedKey] = useState<string | null>(null)

  let selected: { engine: StudioEngineInfo; recipe: StudioRecipeInfo } | null = null
  for (const engine of engines ?? []) {
    for (const recipe of engine.recipes) {
      if (recipeKey(engine.id, recipe.id) === selectedKey) selected = { engine, recipe }
    }
  }

  function handleCreated() {
    // On narrow screens the projects sit below the form — bring them into view.
    if (window.matchMedia('(max-width: 1023px)').matches) {
      requestAnimationFrame(() =>
        document.getElementById('studio-projects')?.scrollIntoView({ behavior: 'smooth', block: 'start' }),
      )
    }
  }

  function pick(key: string) {
    setSelectedKey(key)
    requestAnimationFrame(() =>
      document.getElementById('studio-form')?.scrollIntoView({ behavior: 'smooth', block: 'start' }),
    )
  }

  return (
    <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,5fr)_minmax(0,6fr)]">
      <section className="space-y-5 rounded-lg border border-line bg-surface p-4 sm:p-6" aria-label="New video">
        {enginesQuery.isLoading && (
          <p className="text-sm text-faint">Loading recipes… the server may take up to a minute to wake up.</p>
        )}
        {enginesQuery.isError && (
          <div role="alert" className="space-y-2 text-sm">
            <p className="text-danger">
              {enginesQuery.error instanceof Error ? enginesQuery.error.message : 'Could not load the recipes.'}
            </p>
            <button
              type="button"
              onClick={() => enginesQuery.refetch()}
              className="min-h-10 rounded-md border border-line-strong px-4 py-2 font-medium text-ink hover:bg-surface-2"
            >
              Try again
            </button>
          </div>
        )}

        {engines && !selected && (
          <>
            <div>
              <h2 className="text-sm font-semibold text-ink">Choose a recipe</h2>
              <p className="mt-0.5 text-xs text-faint">Each one turns a few inputs into a finished video.</p>
            </div>
            <RecipePicker engines={engines} selectedKey={selectedKey} onSelect={(e, r) => pick(recipeKey(e.id, r.id))} />
          </>
        )}

        {selected && (
          <div id="studio-form" className="scroll-mt-4 space-y-5">
            <div className="flex items-start gap-3">
              <div className="min-w-0 flex-1">
                <h2 className="text-base font-semibold text-ink">
                  {selected.engine.recipes.length > 1 ? selected.recipe.label : selected.engine.label}
                </h2>
                <p className="mt-0.5 text-xs leading-relaxed text-muted">
                  {selected.recipe.description || selected.engine.description}
                </p>
                <div className="mt-2 flex flex-wrap items-center gap-1.5">
                  <RecipeBadges recipe={selected.recipe} />
                </div>
              </div>
              <button
                type="button"
                onClick={() => setSelectedKey(null)}
                className="min-h-10 shrink-0 rounded-md border border-line-strong px-3.5 py-2 text-sm font-medium text-ink hover:bg-surface-2"
              >
                Change
              </button>
            </div>
            <RecipeForm
              key={recipeKey(selected.engine.id, selected.recipe.id)}
              engine={selected.engine}
              recipe={selected.recipe}
              onCreated={handleCreated}
            />
          </div>
        )}
      </section>

      <div id="studio-projects" className="scroll-mt-4">
        <ProjectList engines={engines} />
      </div>
    </div>
  )
}
