// Repro harness for the production "Something broke on this page" report on
// /discover: drive the full flow (submit -> seeds -> mines -> suggestions ->
// track) against mocked APIs matching the backend's response shapes exactly.
import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter } from "react-router-dom";

vi.mock("../lib/auth.jsx", () => ({
  useAuth: () => ({ user: { id: "u1" }, loading: false, accessToken: "tok" }),
}));
vi.mock("../lib/workspace.jsx", () => ({
  useWorkspace: () => ({ activeWorkspaceId: "ws1", loading: false }),
}));
vi.mock("../lib/toast.jsx", () => ({
  useToast: () => ({ showToast: vi.fn() }),
}));
vi.mock("../components/WorkspaceSwitcher.jsx", () => ({ default: () => <div /> }));

const createSource = vi.fn();
const refreshSource = vi.fn();
const dismissSuggestedSource = vi.fn();
const listSources = vi.fn(async () => [{ id: "s0", sourceType: "keyword", query: "already tracked" }]);
vi.mock("../lib/sources.js", () => ({
  SourcesApiError: class extends Error {},
  listSources: (...a) => listSources(...a),
  createSource: (...a) => createSource(...a),
  refreshSource: (...a) => refreshSource(...a),
  dismissSuggestedSource: (...a) => dismissSuggestedSource(...a),
}));

const discoverSeedsMock = vi.fn();
const mineMock = vi.fn();
vi.mock("../lib/discover.js", () => ({
  DiscoverApiError: class extends Error {},
  discoverSeeds: (...a) => discoverSeedsMock(...a),
  mineDiscoverSeed: (...a) => mineMock(...a),
}));

import Discover from "./Discover.jsx";

function renderPage() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <MemoryRouter>
        <Discover />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

const SEEDS = [
  { sourceType: "hashtag", query: "saunatok", rationale: "Typed by the user.", origin: "input" },
  { sourceType: "keyword", query: "home sauna", rationale: "AI seed.", origin: "ai" },
];

function mineResult(seed, overrides = {}) {
  return {
    ok: true,
    verified: true,
    seed,
    sampleCount: 5,
    topViews: 120000,
    hashtags: [{ query: "fittok", videoCount: 3, avgViews: 40000, sampleCaption: "so hot" }],
    creators: [{ query: "saunaguy", videoCount: 2, medianViews: 90000, followers: 15000, sampleCaption: "best sauna" }],
    creditsCharged: 8,
    creditsRemaining: 92,
    ...overrides,
  };
}

describe("Discover page flow", () => {
  it("renders seeds + suggestions without crashing and tracks a pick", async () => {
    discoverSeedsMock.mockResolvedValue({
      ok: true, seeds: SEEDS, alreadyTrackedCount: 0, alreadyDismissedCount: 0,
      creditsCharged: 3, creditsRemaining: 97, errors: [],
    });
    mineMock.mockImplementation(async (_tok, _ws, seed) => mineResult(seed));

    renderPage();

    const box = screen.getByPlaceholderText(/home sauna/i);
    fireEvent.change(box, { target: { value: "home sauna, #saunatok" } });
    fireEvent.click(screen.getByRole("button", { name: /discover sources/i }));

    expect(await screen.findByText("#saunatok")).toBeTruthy();
    expect(await screen.findByText("fittok", { exact: false })).toBeTruthy();
    expect(await screen.findByText("@saunaguy", { exact: false })).toBeTruthy();

    // Probed seeds section (the "live seeds" group) — both seeds verified.
    expect((await screen.findAllByText(/Probed directly/i)).length).toBe(2);

    createSource.mockResolvedValue({ id: "new1" });
    refreshSource.mockResolvedValue({});
    fireEvent.click(screen.getAllByRole("button", { name: /track this/i })[0]);
    await waitFor(() => expect(createSource).toHaveBeenCalled());
    await waitFor(() => expect(refreshSource).toHaveBeenCalled());

    // Tracking anything hands the session over to the Gallery — that's where
    // the outliers land once the first scrape lands.
    expect(await screen.findByTestId("feed-populating")).toBeTruthy();
    expect(screen.getByTestId("open-gallery-cta").getAttribute("href")).toBe("/gallery");
  });

  it("shows the start-here strip only while the workspace tracks nothing", async () => {
    listSources.mockResolvedValue([]);
    const first = renderPage();
    expect(await screen.findByTestId("first-run-steps")).toBeTruthy();
    first.unmount();

    // A workspace that already tracks something skips the tutorial strip.
    listSources.mockResolvedValue([{ id: "s0", sourceType: "keyword", query: "x" }]);
    renderPage();
    await waitFor(() => expect(screen.queryByTestId("first-run-steps")).not.toBeInTheDocument());
  });

  it("survives an unverified probe and a rejected one", async () => {
    discoverSeedsMock.mockResolvedValue({
      ok: true, seeds: SEEDS, alreadyTrackedCount: 0, alreadyDismissedCount: 0,
      creditsCharged: 3, creditsRemaining: 97, errors: [],
    });
    mineMock.mockImplementation(async (_tok, _ws, seed) =>
      seed.query === "saunatok"
        ? mineResult(seed, { verified: false, sampleCount: 0, topViews: 0, hashtags: [], creators: [] })
        : Promise.reject(new Error("boom")),
    );

    renderPage();

    const box = screen.getByPlaceholderText(/home sauna/i);
    fireEvent.change(box, { target: { value: "home sauna, #saunatok" } });
    fireEvent.click(screen.getByRole("button", { name: /discover sources/i }));

    expect(await screen.findByText(/no content/i, { exact: false })).toBeTruthy();
    expect(await screen.findByText(/nothing trackable/i)).toBeTruthy();
  });
});
