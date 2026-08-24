import { apiFetch, ApiError } from "./http.js";

export const StudioApiError = ApiError;

export function getWeeklyRetro(accessToken, workspaceId, signal) {
  const params = new URLSearchParams({ workspaceId });
  return apiFetch(`/api/studio/retro?${params}`, { accessToken, signal });
}

export function getBenchmark(accessToken, workspaceId, signal) {
  const params = new URLSearchParams({ workspaceId });
  return apiFetch(`/api/studio/benchmark?${params}`, { accessToken, signal });
}
