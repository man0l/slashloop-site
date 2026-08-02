// Client for /api/workspaces on the connector (VITE_MCP_URL). A user may own
// several workspaces (agencies running one per client); count is capped by
// plan tier server-side (see WORKSPACE_LIMITS in the slashloop repo).

import { apiFetch, ApiError } from "./http.js";

export const WorkspacesApiError = ApiError;

/** GET /api/workspaces -> [{ id, name, planKey, createdAt }] */
export function listWorkspaces(accessToken) {
  return apiFetch("/api/workspaces", { accessToken });
}

/** POST /api/workspaces { name } -> { id, name, planKey, createdAt } */
export function createWorkspace(accessToken, name) {
  return apiFetch("/api/workspaces", { method: "POST", accessToken, body: { name } });
}

/** PATCH /api/workspaces/:id { name } -> { id, name, planKey } */
export function renameWorkspace(accessToken, workspaceId, name) {
  return apiFetch(`/api/workspaces/${workspaceId}`, { method: "PATCH", accessToken, body: { name } });
}
