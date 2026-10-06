import type { VideoModelInfo, VideoProviderInfo } from '../../types'

/** What the user asked for. May be invalid for the current model — see resolveSelection. */
export interface SelectionPrefs {
  providerId?: string
  modelId?: string
  aspect: string
  duration: number
  resolution: string
}

export interface ResolvedSelection {
  provider: VideoProviderInfo
  model: VideoModelInfo
  aspect: string
  duration: number
  resolution: string
}

export const DEFAULT_PREFS: SelectionPrefs = { aspect: '9:16', duration: 8, resolution: '720p' }

function pick<T>(options: T[], preferred: T): T | undefined {
  return options.includes(preferred) ? preferred : options[0]
}

/**
 * Clamps the user's preferences to what the provider catalog (GET /providers) allows.
 * Nothing about capabilities is hard-coded: an invalid ratio/duration/resolution simply falls
 * back to the first valid option of the current model, while the preference itself is kept so
 * switching back to a model that supports it restores the choice.
 */
export function resolveSelection(
  providers: VideoProviderInfo[],
  prefs: SelectionPrefs,
): ResolvedSelection | null {
  const provider =
    providers.find((p) => p.id === prefs.providerId) ??
    providers.find((p) => p.configured) ??
    providers[0]
  if (!provider) return null
  const model =
    provider.models.find((m) => m.id === prefs.modelId) ??
    provider.models.find((m) => m.id === provider.default_model) ??
    provider.models[0]
  if (!model) return null
  const aspect = pick(model.aspect_ratios, prefs.aspect)
  const duration = pick(model.durations, prefs.duration)
  const resolution = pick(model.resolutions, prefs.resolution)
  if (aspect === undefined || duration === undefined || resolution === undefined) return null
  return { provider, model, aspect, duration, resolution }
}
