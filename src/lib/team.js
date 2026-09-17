// Client for the team endpoints on the connector at VITE_MCP_URL. Invites
// always cover every workspace the caller owns; each teammate keeps their
// own Google login and gets full access to all of them (no roles yet —
// membership is the only gate).

import { apiFetch, ApiError } from "./http.js";

export const TeamApiError = ApiError;

/** GET /api/workspaces?action=team -> { workspaces: [{ id, name, members }] } */
export function listTeamRoster(accessToken, signal) {
  return apiFetch(`/api/workspaces?action=team`, { accessToken, signal });
}

/**
 * POST /api/workspaces?action=invite-all { email }
 * -> { email, workspaces: [{ id, name, status }] }
 * One invite covering every workspace the caller owns; the teammate signs up
 * with that email and all of them appear in their switcher.
 */
export function inviteToAllWorkspaces(accessToken, email) {
  return apiFetch(`/api/workspaces?action=invite-all`, {
    method: "POST",
    accessToken,
    body: { email },
  });
}

/**
 * DELETE /api/workspaces?action=team&email=…
 * -> { ok: true, email, removedFrom: [workspaceId] }
 * Drops the teammate from every owned workspace at once.
 */
export function removeTeamMember(accessToken, email) {
  return apiFetch(
    `/api/workspaces?action=team&email=${encodeURIComponent(email)}`,
    { method: "DELETE", accessToken },
  );
}
