import { useQuery } from "@tanstack/react-query";
import { listExperiments, getExperiment, isExperimentActive, experimentPollInterval } from "./experiments.js";

// Token is part of the cache identity: no cross-account cached experiment data.
export const experimentKey = (accessToken, workspaceId, id) => ["experiments", accessToken, workspaceId, ...(id ? [id] : [])];
export function useExperimentList({ accessToken, workspaceId }) {
  return useQuery({
    queryKey: experimentKey(accessToken, workspaceId),
    queryFn: ({ signal }) => listExperiments(accessToken, workspaceId, signal),
    enabled: Boolean(accessToken && workspaceId),
    refetchInterval: (query) => query.state.data?.some(isExperimentActive) ? 2500 : false,
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
