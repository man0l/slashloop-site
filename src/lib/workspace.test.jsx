// A cached activeWorkspaceId that no longer exists server-side (deleted
// workspace, or another account's left in this browser) must clear to null
// once the workspace list lands — never feed it to pages, whose
// sources/gallery queries would 404 on every page with an id you don't own.
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter } from "react-router-dom";

const state = vi.hoisted(() => ({
  accessToken: "tok-1",
  listWorkspacesImpl: async () => [],
}));
vi.mock("./auth.jsx", () => ({
  useAuth: () => ({ accessToken: state.accessToken }),
}));

const listWorkspaces = vi.hoisted(() => vi.fn((...a) => state.listWorkspacesImpl(...a)));
vi.mock("./workspaces.js", () => ({
  WorkspacesApiError: class extends Error {},
  listWorkspaces: (...a) => listWorkspaces(...a),
  createWorkspace: vi.fn(),
}));

import { WorkspaceProvider, useWorkspace } from "./workspace.jsx";

function Probe() {
  const { activeWorkspaceId, loading } = useWorkspace();
  if (loading) return <div>loading</div>;
  return <div data-testid="probe">{activeWorkspaceId ?? "none"}</div>;
}

function renderProvider() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <MemoryRouter>
        <WorkspaceProvider>
          <Probe />
        </WorkspaceProvider>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

describe("WorkspaceProvider — stale cached id", () => {
  beforeEach(() => {
    localStorage.clear();
    listWorkspaces.mockClear();
    state.listWorkspacesImpl = async () => [];
  });

  it("clears a cached id the server no longer lists", async () => {
    localStorage.setItem("slashloop:activeWorkspaceId", "ws-gone");
    state.listWorkspacesImpl = async () => [];
    renderProvider();
    expect(await screen.findByTestId("probe")).toHaveTextContent("none");
    await waitFor(() => expect(localStorage.getItem("slashloop:activeWorkspaceId")).toBeNull());
  });

  it("keeps a cached id the server still lists", async () => {
    localStorage.setItem("slashloop:activeWorkspaceId", "ws-1");
    state.listWorkspacesImpl = async () => [{ id: "ws-1", name: "A" }, { id: "ws-2", name: "B" }];
    renderProvider();
    expect(await screen.findByTestId("probe")).toHaveTextContent("ws-1");
  });

  it("falls back to the oldest workspace when the cache is empty", async () => {
    state.listWorkspacesImpl = async () => [{ id: "ws-1", name: "A" }, { id: "ws-2", name: "B" }];
    renderProvider();
    expect(await screen.findByTestId("probe")).toHaveTextContent("ws-1");
  });
});
