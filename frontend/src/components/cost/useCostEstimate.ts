import { keepPreviousData, useQuery } from '@tanstack/react-query'
import { useEffect, useState } from 'react'
import { costsApi } from '../../api/client'

/** Debounced value: the initial value is returned immediately, later changes after `ms`. */
function useDebounced<T>(value: T, ms: number): T {
  const [debounced, setDebounced] = useState(value)
  useEffect(() => {
    const t = setTimeout(() => setDebounced(value), ms)
    return () => clearTimeout(t)
  }, [value, ms])
  return debounced
}

/** Backend cost estimate for an action (docs/11_Cost_Awareness.md). Pure + cheap; debounced 300 ms. */
export function useCostEstimate(
  action: string,
  params: Record<string, unknown> = {},
  enabled = true,
) {
  const key = useDebounced(JSON.stringify(params), 300)
  const query = useQuery({
    queryKey: ['cost-estimate', action, key],
    queryFn: () => costsApi.estimate(action, JSON.parse(key) as Record<string, unknown>),
    placeholderData: keepPreviousData,
    staleTime: 5 * 60_000,
    retry: false,
    enabled,
  })
  return { estimate: query.data, isLoading: query.isLoading, isError: query.isError }
}
