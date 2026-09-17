// The Team panel — global roster (no active-workspace scoping), invite always
// covers every owned workspace, remove drops from all at once. team.js and
// auth are mocked: these test the UI contract.
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

const state = vi.hoisted(() => ({
  accessToken: "tok-1",
  roster: { workspaces: [] },
}));
vi.mock("../lib/auth.jsx", () => ({
  useAuth: () => ({ accessToken: state.accessToken }),
}));

const teamApi = vi.hoisted(() => ({
  listTeamRoster: vi.fn(async () => state.roster),
  inviteToAllWorkspaces: vi.fn(async (_tok, email) => ({
    email,
    workspaces: [{ id: "ws-1", name: "Acme", status: "added" }],
  })),
  removeTeamMember: vi.fn(async () => ({ ok: true, email: "mate@x.co", removedFrom: ["ws-1"] })),
}));
vi.mock("../lib/team.js", () => ({
  TeamApiError: class extends Error {},
  listTeamRoster: (...a) => teamApi.listTeamRoster(...a),
  inviteToAllWorkspaces: (...a) => teamApi.inviteToAllWorkspaces(...a),
  removeTeamMember: (...a) => teamApi.removeTeamMember(...a),
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
    state.roster = { workspaces: [] };
    teamApi.listTeamRoster.mockClear();
    teamApi.inviteToAllWorkspaces.mockClear();
    teamApi.removeTeamMember.mockClear();
  });

  it("shows the empty state with no workspace scoping", async () => {
    renderCard();
    expect(await screen.findByText("No teammates yet.")).toBeInTheDocument();
    // No per-workspace UI: no switcher reference, no scope checkbox.
    expect(screen.queryByText(/shared with you/)).not.toBeInTheDocument();
    expect(screen.queryByLabelText(/all my workspaces/i)).not.toBeInTheDocument();
    expect(screen.getByLabelText("Teammate email")).toBeInTheDocument();
  });

  it("lists every teammate once with their workspaces", async () => {
    state.roster = {
      workspaces: [
        { id: "ws-1", name: "Acme", members: [{ id: "wm-1", email: "mate@x.co", createdAt: "now" }] },
        {
          id: "ws-2",
          name: "Side",
          members: [
            { id: "wm-2", email: "mate@x.co", createdAt: "now" },
            { id: "wm-3", email: "other@x.co", createdAt: "now" },
          ],
        },
      ],
    };
    renderCard();
    expect(await screen.findByText("mate@x.co")).toBeInTheDocument();
    // One row per email even when present in several workspaces.
    expect(screen.getAllByText("mate@x.co")).toHaveLength(1);
    expect(screen.getByText("other@x.co")).toBeInTheDocument();
  });

  it("invites to all workspaces and reports the result", async () => {
    renderCard();
    await screen.findByText("No teammates yet.");
    fireEvent.change(screen.getByLabelText("Teammate email"), { target: { value: "new@x.co" } });
    fireEvent.click(screen.getByRole("button", { name: "Invite" }));
    await waitFor(() =>
      expect(teamApi.inviteToAllWorkspaces).toHaveBeenCalledWith("tok-1", "new@x.co"),
    );
    expect(await screen.findByText(/added to 1 workspace/)).toBeInTheDocument();
  });

  it("warns when the invite lands but the email could not be sent", async () => {
    teamApi.inviteToAllWorkspaces.mockImplementationOnce(async (_tok, email) => ({
      email,
      workspaces: [{ id: "ws-1", name: "Acme", status: "added" }],
      mail: { sent: false, reason: "resend_403: domain not verified" },
    }));
    renderCard();
    await screen.findByText("No teammates yet.");
    fireEvent.change(screen.getByLabelText("Teammate email"), { target: { value: "new@x.co" } });
    fireEvent.click(screen.getByRole("button", { name: "Invite" }));
    expect(await screen.findByText(/could not be sent.*domain not verified/)).toBeInTheDocument();
  });

  it("removes from everywhere and refreshes the roster", async () => {
    state.roster = {
      workspaces: [{ id: "ws-1", name: "Acme", members: [{ id: "wm-1", email: "mate@x.co", createdAt: "now" }] }],
    };
    renderCard();
    expect(await screen.findByText("mate@x.co")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Remove" }));
    await waitFor(() => expect(teamApi.removeTeamMember).toHaveBeenCalledWith("tok-1", "mate@x.co"));
    await waitFor(() => expect(teamApi.listTeamRoster).toHaveBeenCalledTimes(2));
  });
});
