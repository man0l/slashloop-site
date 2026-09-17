// The Team card — owner invites/removes teammates by email; a member sees
// the roster read-only. team.js and workspace state are mocked: these test
// the UI contract (who gets edit controls, what the invite flow calls).
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

const state = vi.hoisted(() => ({
  accessToken: "tok-1",
  activeWorkspaceId: "ws-1",
  activeWorkspace: { id: "ws-1", name: "Acme", role: "owner" },
  members: [],
}));
vi.mock("../lib/auth.jsx", () => ({
  useAuth: () => ({ accessToken: state.accessToken }),
}));
vi.mock("../lib/workspace.jsx", () => ({
  useWorkspace: () => ({
    activeWorkspaceId: state.activeWorkspaceId,
    activeWorkspace: state.activeWorkspace,
  }),
}));

const teamApi = vi.hoisted(() => ({
  listWorkspaceMembers: vi.fn(async () => ({ members: state.members })),
  inviteWorkspaceMember: vi.fn(async (_tok, _wsId, email) => ({ id: "wm-new", email, createdAt: "now" })),
  inviteToAllWorkspaces: vi.fn(async (_tok, email) => ({
    email,
    workspaces: [
      { id: "ws-1", name: "Acme", status: "added" },
      { id: "ws-2", name: "Side", status: "already_member" },
    ],
  })),
  removeWorkspaceMember: vi.fn(async () => ({ ok: true })),
}));
vi.mock("../lib/team.js", () => ({
  TeamApiError: class extends Error {},
  listWorkspaceMembers: (...a) => teamApi.listWorkspaceMembers(...a),
  inviteWorkspaceMember: (...a) => teamApi.inviteWorkspaceMember(...a),
  inviteToAllWorkspaces: (...a) => teamApi.inviteToAllWorkspaces(...a),
  removeWorkspaceMember: (...a) => teamApi.removeWorkspaceMember(...a),
}));

import TeamCard from "./TeamCard.jsx";

function renderCard() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <TeamCard />
    </QueryClientProvider>,
  );
}

describe("TeamCard", () => {
  beforeEach(() => {
    state.accessToken = "tok-1";
    state.activeWorkspaceId = "ws-1";
    state.activeWorkspace = { id: "ws-1", name: "Acme", role: "owner" };
    state.members = [];
    teamApi.listWorkspaceMembers.mockClear();
    teamApi.listWorkspaceMembers.mockImplementation(async () => ({ members: state.members }));
    teamApi.inviteWorkspaceMember.mockClear();
    teamApi.inviteToAllWorkspaces.mockClear();
    teamApi.removeWorkspaceMember.mockClear();
  });

  it("lists members and shows the invite form for an owner", async () => {
    state.members = [{ id: "wm-1", email: "mate@x.co", createdAt: "now" }];
    renderCard();
    expect(await screen.findByText("mate@x.co")).toBeInTheDocument();
    expect(screen.getByLabelText("Teammate email")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Invite" })).toBeInTheDocument();
  });

  it("sends the invite and refreshes the roster", async () => {
    renderCard();
    await screen.findByText("No teammates yet.");
    fireEvent.change(screen.getByLabelText("Teammate email"), { target: { value: "new@x.co" } });
    // Single workspace: uncheck the default "all my workspaces" box.
    fireEvent.click(screen.getByLabelText("Add to all my workspaces"));
    fireEvent.click(screen.getByRole("button", { name: "Invite" }));
    await waitFor(() =>
      expect(teamApi.inviteWorkspaceMember).toHaveBeenCalledWith("tok-1", "ws-1", "new@x.co"),
    );
    expect(teamApi.inviteToAllWorkspaces).not.toHaveBeenCalled();
    // listWorkspaceMembers re-ran after the invalidation
    await waitFor(() => expect(teamApi.listWorkspaceMembers).toHaveBeenCalledTimes(2));
  });

  it("invites to all workspaces by default and reports the result", async () => {
    renderCard();
    await screen.findByText("No teammates yet.");
    expect(screen.getByLabelText("Add to all my workspaces").checked).toBe(true);
    fireEvent.change(screen.getByLabelText("Teammate email"), { target: { value: "new@x.co" } });
    fireEvent.click(screen.getByRole("button", { name: "Invite" }));
    await waitFor(() =>
      expect(teamApi.inviteToAllWorkspaces).toHaveBeenCalledWith("tok-1", "new@x.co"),
    );
    expect(teamApi.inviteWorkspaceMember).not.toHaveBeenCalled();
    expect(await screen.findByText(/added to 1 workspace, already in 1/)).toBeInTheDocument();
  });

  it("hides edit controls from a member viewing a shared workspace", async () => {
    state.activeWorkspace = { id: "ws-1", name: "Acme", role: "member" };
    renderCard();
    expect(await screen.findByText(/shared with you/)).toBeInTheDocument();
    expect(screen.queryByLabelText("Teammate email")).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Invite" })).not.toBeInTheDocument();
  });

  it("shows a read-only roster without a Remove button for members", async () => {
    state.activeWorkspace = { id: "ws-1", name: "Acme", role: "member" };
    state.members = [{ id: "wm-1", email: "mate@x.co", createdAt: "now" }];
    renderCard();
    expect(await screen.findByText("mate@x.co")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Remove" })).not.toBeInTheDocument();
  });
});
