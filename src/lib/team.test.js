// The team client — URL shape, method, and body/query for each call.
// apiFetch is mocked: this pins the contract, not the transport.
import { describe, it, expect, vi, beforeEach } from "vitest";

const apiFetch = vi.hoisted(() => vi.fn(async () => ({})));
vi.mock("./http.js", () => ({
  ApiError: class extends Error {},
  apiFetch: (...a) => apiFetch(...a),
}));

import {
  listTeamRoster,
  inviteToAllWorkspaces,
  removeTeamMember,
  TeamApiError,
} from "./team.js";

describe("team.js", () => {
  beforeEach(() => apiFetch.mockClear());

  it("lists the global roster", async () => {
    await listTeamRoster("tok");
    expect(apiFetch).toHaveBeenCalledWith("/api/workspaces?action=team", {
      accessToken: "tok",
      signal: undefined,
    });
  });

  it("invites to all workspaces via the bulk action", async () => {
    await inviteToAllWorkspaces("tok", "mate@x.co");
    expect(apiFetch).toHaveBeenCalledWith("/api/workspaces?action=invite-all", {
      method: "POST",
      accessToken: "tok",
      body: { email: "mate@x.co" },
    });
  });

  it("removes from all workspaces by email in the query string", async () => {
    await removeTeamMember("tok", "mate@x.co");
    const [url, init] = apiFetch.mock.calls[0];
    expect(url).toBe("/api/workspaces?action=team&email=mate%40x.co");
    expect(init.method).toBe("DELETE");
  });

  it("re-exports ApiError as TeamApiError", () => {
    expect(new TeamApiError("x", 400)).toBeInstanceOf(Error);
  });
});
