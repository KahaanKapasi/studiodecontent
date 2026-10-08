export const ENGINES_KEY = ['studio', 'engines'] as const
export const PROJECTS_KEY = ['studio', 'projects'] as const
export const projectKey = (id: number) => ['studio', 'project', id] as const
export const recipeKey = (engineId: string, recipeId: string) => `${engineId}/${recipeId}`
