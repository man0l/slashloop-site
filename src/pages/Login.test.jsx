// The default post-login destination is a routing decision, not a hard-coded
// redirect: an account that tracks nothing yet activates better on /discover,
// everyone else lands on /account as before. Explicit ?next values always win.
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter, Routes, Route } from "react-router-dom";

const state = vi.hoisted(() => ({
  user: null,
  loading: false,
  accessToken: "tok-1",
  activeWorkspaceId: "ws-1",
}));
vi.mock("../lib/auth.jsx", () => ({
  useAuth: () => ({ user: state.user, loading: state.loading, accessToken: state.accessToken }),
}));
vi.mock("../lib/workspace.jsx", () => ({
  useWorkspace: () => ({ activeWorkspaceId: state.activeWorkspaceId, loading: false }),
}));

const listSources = vi.hoisted(() => vi.fn(async () => []));
vi.mock("../lib/sources.js", () => ({ listSources: (...a) => listSources(...a) }));

import Login from "./Login.jsx";

function renderLogin(initial = "/login") {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <MemoryRouter initialEntries={[initial]}>
        <Routes>
          <Route path="/login" element={<Login />} />
          <Route path="/account" element={<div>LANDED_ACCOUNT</div>} />
          <Route path="/discover" element={<div>LANDED_DISCOVER</div>} />
          <Route path="/gallery" element={<div>LANDED_GALLERY</div>} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

describe("Login — post-sign-in destination", () => {
  beforeEach(() => {
    listSources.mockClear();
    state.user = null;
    state.activeWorkspaceId = "ws-1";
  });

  it("an explicit ?next wins without consulting anything", () => {
    state.user = { id: "u1" };
    renderLogin("/login?next=/gallery");
    expect(screen.getByText("LANDED_GALLERY")).toBeInTheDocument();
    expect(listSources).not.toHaveBeenCalled();
  });

  it("a first-run workspace (no sources) is routed to /discover", async () => {
    state.user = { id: "u1" };
    listSources.mockResolvedValue([]);
    renderLogin();
    expect(await screen.findByText("LANDED_DISCOVER")).toBeInTheDocument();
  });

  it("a workspace that already tracks sources lands on /account", async () => {
    state.user = { id: "u1" };
    listSources.mockResolvedValue([{ id: "s0", sourceType: "keyword", query: "x" }]);
    renderLogin();
    expect(await screen.findByText("LANDED_ACCOUNT")).toBeInTheDocument();
  });

  it("no workspace yet -> /discover renders its create-a-workspace state", async () => {
    state.user = { id: "u1" };
    state.activeWorkspaceId = null;
    renderLogin();
    expect(await screen.findByText("LANDED_DISCOVER")).toBeInTheDocument();
    expect(listSources).not.toHaveBeenCalled();
  });
});
