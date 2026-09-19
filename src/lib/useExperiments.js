import { useInfiniteQuery, useQuery } from "@tanstack/react-query";
import { listExperiments, getExperiment, isExperimentActive, experimentPollInterval } from "./experiments.js";

// Token is part of the cache identity: no cross-account cached experiment data.
export const experimentKey = (accessToken, workspaceId, id) => ["experiments", accessToken, workspaceId, ...(id ? [id] : [])];
export function useExperimentList({ accessToken, workspaceId }) {
  return useInfiniteQuery({
    // "list" keeps the infinite cache distinct from a detail row whose id
    // happens to collide; the base experimentKey still invalidates it.
    queryKey: [...experimentKey(accessToken, workspaceId), "list"],
    queryFn: ({ signal, pageParam }) => listExperiments(accessToken, workspaceId, signal, { offset: pageParam ?? 0 }),
    initialPageParam: 0,
    getNextPageParam: (last) => last.nextOffset ?? undefined,
    enabled: Boolean(accessToken && workspaceId),
    refetchInterval: (query) => query.state.data?.pages.some((p) => p.experiments.some(isExperimentActive)) ? 2500 : false,
  });
}
export function useExperimentDetail({ accessToken, workspaceId, experimentId }) {
  return useQuery({
    queryKey: experimentKey(accessToken, workspaceId, experimentId),
    queryFn: ({ signal }) => getExperiment(accessToken, workspaceId, experimentId, signal),
    enabled: Boolean(accessToken && workspaceId && experimentId),
    refetchInterval: experimentPollInterval,
    refetchIntervalInBackground: false,
  });
}
