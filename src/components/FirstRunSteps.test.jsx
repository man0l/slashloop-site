// The onboarding strip follows the user across every app page until the
// first source is tracked — then it never comes back.
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter } from "react-router-dom";

const state = vi.hoisted(() => ({
  user: { id: "u1" },
  accessToken: "tok-1",
  activeWorkspaceId: "ws-1",
  workspaceLoading: false,
}));
vi.mock("../lib/auth.jsx", () => ({
  useAuth: () => ({ user: state.user, accessToken: state.accessToken }),
}));
vi.mock("../lib/workspace.jsx", () => ({
  useWorkspace: () => ({ activeWorkspaceId: state.activeWorkspaceId, loading: state.workspaceLoading }),
}));

const listSources = vi.hoisted(() => vi.fn(async () => []));
vi.mock("../lib/sources.js", () => ({ listSources: (...a) => listSources(...a) }));

import FirstRunSteps from "./FirstRunSteps.jsx";

function renderStrip() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <MemoryRouter>
        <FirstRunSteps />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

describe("FirstRunSteps", () => {
  beforeEach(() => {
    listSources.mockReset();
    listSources.mockResolvedValue([]);
    state.user = { id: "u1" };
    state.activeWorkspaceId = "ws-1";
    state.workspaceLoading = false;
  });

  it("shows the steps for a workspace that tracks nothing", async () => {
    renderStrip();
    expect(await screen.findByTestId("first-run-steps")).toBeTruthy();
    expect(screen.getByText(/Describe your niche on Discover/i)).toBeTruthy();
  });

  it("shows the steps before a workspace even exists", () => {
    state.activeWorkspaceId = null;
    renderStrip();
    expect(screen.getByTestId("first-run-steps")).toBeTruthy();
    expect(listSources).not.toHaveBeenCalled();
  });

  it("disappears once the first source is tracked", async () => {
    listSources.mockResolvedValue([{ id: "s0", sourceType: "keyword", query: "x" }]);
    renderStrip();
    await waitFor(() => expect(screen.queryByTestId("first-run-steps")).not.toBeInTheDocument());
  });

  it("stays quiet while workspaces are still resolving", () => {
    state.workspaceLoading = true;
    renderStrip();
    expect(screen.queryByTestId("first-run-steps")).not.toBeInTheDocument();
  });

  it("stays quiet when the sources fetch fails rather than nagging", async () => {
    listSources.mockRejectedValue(new Error("boom"));
    renderStrip();
    await waitFor(() => expect(screen.queryByTestId("first-run-steps")).not.toBeInTheDocument());
  });

  it("never renders for a signed-out visitor", () => {
    state.user = null;
    renderStrip();
    expect(screen.queryByTestId("first-run-steps")).not.toBeInTheDocument();
    expect(listSources).not.toHaveBeenCalled();
  });
});
