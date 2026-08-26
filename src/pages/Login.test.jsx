// Post-sign-in destination: onboarding wins over everything until the first
// source is tracked — even an explicit ?next (deep links, page bounces) —
// then ?next is honored exactly as before.
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
          <Route path="/onboarding" element={<div>LANDED_ONBOARDING</div>} />
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
    listSources.mockReset();
    listSources.mockResolvedValue([]);
    state.user = null;
    state.activeWorkspaceId = "ws-1";
  });

  it("an incomplete onboarding wins even over an explicit ?next", async () => {
    state.user = { id: "u1" };
    renderLogin("/login?next=/gallery");
    expect(await screen.findByText("LANDED_ONBOARDING")).toBeInTheDocument();
  });

  it("no workspace yet -> the funnel, explicit ?next included", async () => {
    state.user = { id: "u1" };
    state.activeWorkspaceId = null;
    renderLogin("/login?next=/gallery");
    expect(await screen.findByText("LANDED_ONBOARDING")).toBeInTheDocument();
    expect(listSources).not.toHaveBeenCalled();
  });

  it("a finished onboarding honors an explicit ?next", async () => {
    state.user = { id: "u1" };
    listSources.mockResolvedValue([{ id: "s0", sourceType: "keyword", query: "x" }]);
    renderLogin("/login?next=/gallery");
    expect(await screen.findByText("LANDED_GALLERY")).toBeInTheDocument();
  });

  it("a first-run workspace (no sources) is routed into the funnel", async () => {
    state.user = { id: "u1" };
    renderLogin();
    expect(await screen.findByText("LANDED_ONBOARDING")).toBeInTheDocument();
  });

  it("a workspace that already tracks sources lands on /account", async () => {
    state.user = { id: "u1" };
    listSources.mockResolvedValue([{ id: "s0", sourceType: "keyword", query: "x" }]);
    renderLogin();
    expect(await screen.findByText("LANDED_ACCOUNT")).toBeInTheDocument();
  });

  it("a failed sources fetch never traps onboarding — honor ?next", async () => {
    state.user = { id: "u1" };
    listSources.mockRejectedValue(new Error("boom"));
    renderLogin("/login?next=/gallery");
    expect(await screen.findByText("LANDED_GALLERY")).toBeInTheDocument();
  });
});

describe("Login — OAuth error round-trip", () => {
  beforeEach(() => {
    state.user = null;
  });

  it("surfaces the provider failure Supabase redirects back with", () => {
    renderLogin(
      "/login?error=server_error&error_code=unexpected_failure" +
        "&error_description=" + encodeURIComponent("Error getting user profile from external provider"),
    );
    const banner = screen.getByTestId("oauth-error");
    expect(banner.textContent).toContain("Sign-in failed");
    expect(banner.textContent).toContain("Error getting user profile from external provider");
    // The buttons stay usable so the person can try Google instead.
    expect(screen.getByRole("button", { name: /continue with google/i })).toBeInTheDocument();
  });
});
