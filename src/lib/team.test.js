// The team client — URL shape, method, and body/query for each roster call.
// apiFetch is mocked: this pins the contract, not the transport.
import { describe, it, expect, vi, beforeEach } from "vitest";

const apiFetch = vi.hoisted(() => vi.fn(async () => ({})));
vi.mock("./http.js", () => ({
  ApiError: class extends Error {},
  apiFetch: (...a) => apiFetch(...a),
}));

import {
  listWorkspaceMembers,
  inviteWorkspaceMember,
  removeWorkspaceMember,
  TeamApiError,
} from "./team.js";

describe("team.js", () => {
  beforeEach(() => apiFetch.mockClear());

  it("lists the roster", async () => {
    await listWorkspaceMembers("tok", "ws-1");
    expect(apiFetch).toHaveBeenCalledWith("/api/workspaces/ws-1/members", {
      accessToken: "tok",
      signal: undefined,
    });
  });

  it("invites by email in the body", async () => {
    await inviteWorkspaceMember("tok", "ws-1", "mate@x.co");
    expect(apiFetch).toHaveBeenCalledWith("/api/workspaces/ws-1/members", {
      method: "POST",
      accessToken: "tok",
      body: { email: "mate@x.co" },
    });
  });

  it("removes by email in the query string", async () => {
    await removeWorkspaceMember("tok", "ws-1", "mate@x.co");
    const [url, init] = apiFetch.mock.calls[0];
    expect(url).toBe("/api/workspaces/ws-1/members?email=mate%40x.co");
    expect(init.method).toBe("DELETE");
  });

  it("re-exports ApiError as TeamApiError", () => {
    expect(new TeamApiError("x", 400)).toBeInstanceOf(Error);
  });
});
