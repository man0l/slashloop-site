// The funnel: problem → solution → 3 questions → answers become real setup.
// Drives the full click-through against mocked APIs and asserts the payload
// shapes handed to createWorkspace/createSource/refreshSource, plus the
// guards (logged-out, already-complete) and the skip path.
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter, Routes, Route } from "react-router-dom";

const state = vi.hoisted(() => ({
  user: { id: "u1" },
  loading: false,
  accessToken: "tok-1",
  activeWorkspaceId: null,
}));
vi.mock("../lib/auth.jsx", () => ({
  useAuth: () => ({ user: state.user, loading: state.loading, accessToken: state.accessToken }),
}));

const createWorkspace = vi.hoisted(() => vi.fn());
vi.mock("../lib/workspace.jsx", () => ({
  useWorkspace: () => ({
    activeWorkspaceId: state.activeWorkspaceId,
    loading: false,
    createWorkspace: (...a) => createWorkspace(...a),
  }),
}));

vi.mock("../lib/toast.jsx", () => ({
  useToast: () => ({ showToast: vi.fn() }),
}));

const listSources = vi.hoisted(() => vi.fn(async () => []));
const createSource = vi.hoisted(() => vi.fn(async () => ({ id: "src-1" })));
const refreshSource = vi.hoisted(() => vi.fn(async () => ({})));
vi.mock("../lib/sources.js", () => ({
  SourcesApiError: class extends Error {},
  listSources: (...a) => listSources(...a),
  createSource: (...a) => createSource(...a),
  refreshSource: (...a) => refreshSource(...a),
}));

import Onboarding from "./Onboarding.jsx";

function renderOnboarding(initial = "/onboarding") {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <MemoryRouter initialEntries={[initial]}>
        <Routes>
          <Route path="/onboarding" element={<Onboarding />} />
          <Route path="/login" element={<div>LANDED_LOGIN</div>} />
          <Route path="/account" element={<div>LANDED_ACCOUNT</div>} />
          <Route path="/discover" element={<div>LANDED_DISCOVER</div>} />
          <Route path="/sources" element={<div>LANDED_SOURCES</div>} />
          <Route path="/gallery" element={<div>LANDED_GALLERY</div>} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

async function clickThroughToSetup() {
  // With a workspace the sources check resolves async — wait for screen 1.
  await screen.findByTestId("onboarding-problem");
  fireEvent.click(screen.getByRole("button", { name: /that's me/i }));
  fireEvent.click(screen.getByRole("button", { name: /set up my loop/i }));

  fireEvent.change(screen.getByTestId("onboarding-product-input"), { target: { value: "Sauna Tracker" } });
  // Enter advances Q1 — the keyboard path, not just the button.
  fireEvent.keyDown(screen.getByTestId("onboarding-product-input"), { key: "Enter" });

  fireEvent.change(screen.getByTestId("onboarding-niche-input"), {
    target: { value: "home sauna, #saunatok, @coldplungequeen, extra keyword" },
  });
  // Still on Q2 — 3 of the 4 items become chips, the 4th is overflow.
  expect(screen.getAllByTestId("niche-chip").length).toBe(3);
  fireEvent.click(screen.getByRole("button", { name: /track them/i }));

  fireEvent.click(screen.getByTestId("stuck-views"));
  fireEvent.click(screen.getByRole("button", { name: /almost there/i }));
}

describe("Onboarding funnel", () => {
  beforeEach(() => {
    localStorage.clear();
    listSources.mockReset();
    listSources.mockResolvedValue([]);
    createSource.mockClear();
    createSource.mockResolvedValue({ id: "src-1" });
    refreshSource.mockClear();
    createWorkspace.mockReset();
    createWorkspace.mockResolvedValue({ id: "ws-new", name: "Sauna Tracker" });
    state.user = { id: "u1" };
    state.activeWorkspaceId = null;
  });

  it("walks problem → solution → survey and turns answers into tracked sources", async () => {
    renderOnboarding();
    expect(screen.getByTestId("onboarding-problem")).toBeInTheDocument();

    await clickThroughToSetup();

    expect(screen.getByTestId("onboarding-setup")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: /enter the \/loop/i }));

    await waitFor(() => expect(createWorkspace).toHaveBeenCalledWith("Sauna Tracker"));
    await waitFor(() => expect(createSource).toHaveBeenCalledTimes(3));
    // @→creator, #→hashtag, bare → keyword; the overflow item never tracks.
    expect(createSource).toHaveBeenCalledWith("tok-1", "ws-new", {
      platform: "tiktok", sourceType: "keyword", query: "home sauna", videoLimit: 20,
    });
    expect(createSource).toHaveBeenCalledWith("tok-1", "ws-new", {
      platform: "tiktok", sourceType: "hashtag", query: "saunatok", videoLimit: 20,
    });
    expect(createSource).toHaveBeenCalledWith("tok-1", "ws-new", {
      platform: "tiktok", sourceType: "creator", query: "coldplungequeen", videoLimit: 20,
    });
    await waitFor(() => expect(refreshSource).toHaveBeenCalledTimes(3));
    // Tags tracked -> Sources shows them (scrape status included); the
    // Gallery would be an empty grid until the first scrape lands.
    expect(await screen.findByText("LANDED_SOURCES")).toBeInTheDocument();
    expect(localStorage.getItem("slashloop:onboarding")).toBeNull();
  });

  it("mid-setup, the sources query waking up never bounces the user to /account", async () => {
    // Reproduces the production race: the workspace created mid-setup
    // enables the sources query, which sees the tracked sources and would
    // fire the "already onboarded" guard before runSetup navigates.
    createWorkspace.mockImplementation(async (name) => {
      state.activeWorkspaceId = "ws-new";
      listSources.mockResolvedValue([{ id: "s0", sourceType: "keyword", query: "x" }]);
      return { id: "ws-new", name };
    });
    renderOnboarding();
    await clickThroughToSetup();
    fireEvent.click(screen.getByRole("button", { name: /enter the \/loop/i }));

    expect(await screen.findByText("LANDED_SOURCES")).toBeInTheDocument();
    expect(screen.queryByText("LANDED_ACCOUNT")).not.toBeInTheDocument();
  });

  it("reuses the existing workspace instead of creating one", async () => {
    state.activeWorkspaceId = "ws-mine";
    renderOnboarding();
    await clickThroughToSetup();
    fireEvent.click(screen.getByRole("button", { name: /enter the \/loop/i }));

    await waitFor(() => expect(createSource).toHaveBeenCalledTimes(3));
    expect(createWorkspace).not.toHaveBeenCalled();
    expect(createSource).toHaveBeenCalledWith("tok-1", "ws-mine", expect.objectContaining({ query: "home sauna" }));
  });

  it("an empty niche routes to Discover instead of an empty gallery", async () => {
    renderOnboarding();
    fireEvent.click(screen.getByRole("button", { name: /that's me/i }));
    fireEvent.click(screen.getByRole("button", { name: /set up my loop/i }));
    fireEvent.click(screen.getByRole("button", { name: /^next →$/i })); // skip product
    fireEvent.click(screen.getByRole("button", { name: /track them/i })); // empty niche
    fireEvent.click(screen.getByRole("button", { name: /almost there/i }));

    fireEvent.click(screen.getByRole("button", { name: /enter the \/loop/i }));

    await waitFor(() => expect(createWorkspace).toHaveBeenCalledWith("My niche"));
    expect(createSource).not.toHaveBeenCalled();
    expect(await screen.findByText("LANDED_DISCOVER")).toBeInTheDocument();
  });

  it("a createSource failure doesn't sink the rest of the setup", async () => {
    createSource.mockRejectedValueOnce(new Error("limit reached")).mockResolvedValue({ id: "src-2" });
    renderOnboarding();
    await clickThroughToSetup();
    fireEvent.click(screen.getByRole("button", { name: /enter the \/loop/i }));

    await waitFor(() => expect(createSource).toHaveBeenCalledTimes(3));
    expect(await screen.findByText("LANDED_SOURCES")).toBeInTheDocument();
  });

  it("skip hands off to Discover", () => {
    renderOnboarding();
    fireEvent.click(screen.getByTestId("onboarding-skip"));
    expect(screen.getByText("LANDED_DISCOVER")).toBeInTheDocument();
  });

  it("logged-out visitors bounce to login and come straight back", () => {
    state.user = null;
    renderOnboarding();
    expect(screen.getByText("LANDED_LOGIN")).toBeInTheDocument();
  });

  it("an account that already tracks sources skips the funnel", async () => {
    state.activeWorkspaceId = "ws-1";
    listSources.mockResolvedValue([{ id: "s0", sourceType: "keyword", query: "x" }]);
    renderOnboarding();
    expect(await screen.findByText("LANDED_ACCOUNT")).toBeInTheDocument();
  });

  it("?again lets an onboarded account re-run the funnel against its workspace", async () => {
    state.activeWorkspaceId = "ws-1";
    listSources.mockResolvedValue([{ id: "s0", sourceType: "keyword", query: "x" }]);
    renderOnboarding("/onboarding?again=1");
    // The completion guard would have bounced to /account — the override
    // shows the funnel, and setup tracks into the existing workspace.
    await clickThroughToSetup();
    fireEvent.click(screen.getByRole("button", { name: /enter the \/loop/i }));

    await waitFor(() => expect(createSource).toHaveBeenCalledTimes(3));
    expect(createWorkspace).not.toHaveBeenCalled();
    expect(createSource).toHaveBeenCalledWith("tok-1", "ws-1", expect.objectContaining({ query: "home sauna" }));
    expect(await screen.findByText("LANDED_SOURCES")).toBeInTheDocument();
  });

  it("answers survive a mid-funnel refresh", () => {
    localStorage.setItem("slashloop:onboarding", JSON.stringify({ product: "Sauna Tracker", niche: "#saunatok" }));
    renderOnboarding();
    // Walk to Q1 — the input holds the persisted product name.
    fireEvent.click(screen.getByRole("button", { name: /that's me/i }));
    fireEvent.click(screen.getByRole("button", { name: /set up my loop/i }));
    expect(screen.getByTestId("onboarding-product-input").value).toBe("Sauna Tracker");
  });
});
