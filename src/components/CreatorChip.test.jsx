import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter } from "react-router-dom";
import CreatorChip from "./CreatorChip.jsx";

const showToast = vi.fn();
vi.mock("../lib/toast.jsx", () => ({
  useToast: () => ({ showToast }),
}));

const createSource = vi.fn();
const refreshSource = vi.fn();
vi.mock("../lib/sources.js", () => ({
  SourcesApiError: class extends Error {},
  createSource: (...a) => createSource(...a),
  refreshSource: (...a) => refreshSource(...a),
}));

const getCreatorPreview = vi.fn();
vi.mock("../lib/gallery.js", async () => {
  const actual = await vi.importActual("../lib/gallery.js");
  return { ...actual, getCreatorPreview: (...a) => getCreatorPreview(...a) };
});

const cards = [
  {
    id: "v1",
    creatorHandle: "maker",
    outlierScore: 8.2,
    postedAt: 1,
    views: 1200,
    thumbUrl: "https://t/1.jpg",
    caption: "hook",
    url: "https://tiktok.com/@maker/v/1",
  },
  {
    id: "v2",
    creatorHandle: "maker",
    outlierScore: 3.1,
    postedAt: 2,
    views: 400,
    thumbUrl: "https://t/2.jpg",
    caption: "payoff",
    url: "https://tiktok.com/@maker/v/2",
  },
];

function renderChip(props = {}) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <MemoryRouter>
        <CreatorChip
          handle="maker"
          accessToken="tok-1"
          workspaceId="ws-1"
          sources={[]}
          galleryCards={cards}
          {...props}
        />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  showToast.mockReset();
  createSource.mockReset();
  refreshSource.mockReset();
  getCreatorPreview.mockReset();
  getCreatorPreview.mockResolvedValue({ cards: [] }); // old-connector shape → fallback
});

describe("CreatorChip", () => {
  it("shows a Track button next to the handle", () => {
    renderChip();
    expect(screen.getByRole("button", { name: "@maker creator preview" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Track" })).toBeInTheDocument();
  });

  it("shows Tracked (linking to that source's gallery) when the creator is already a source", () => {
    renderChip({ sources: [{ id: "s-cr", sourceType: "creator", query: "@maker" }] });
    expect(screen.queryByRole("button", { name: "Track" })).not.toBeInTheDocument();
    const tracked = screen.getByRole("link", { name: "Tracked" });
    expect(tracked).toHaveAttribute("href", "/gallery?sourceId=s-cr");
  });

  it("opens a hover-style preview with outliers and last 5 from gallery cards", async () => {
    renderChip();
    fireEvent.click(screen.getByRole("button", { name: "@maker creator preview" }));

    const dialog = await screen.findByRole("dialog", { name: "@maker creator preview" });
    expect(dialog).toBeInTheDocument();
    expect(screen.getByText("OUTLIERS")).toBeInTheDocument();
    expect(screen.getByText("LAST 5")).toBeInTheDocument();
    expect(screen.getByText(/2 videos/)).toBeInTheDocument();
    expect(screen.getByText(/2 outliers/)).toBeInTheDocument();
  });

  it("tracks the creator and queues the first scrape", async () => {
    createSource.mockResolvedValue({ id: "new-1", sourceType: "creator", query: "@maker" });
    refreshSource.mockResolvedValue({ jobId: "j1" });

    renderChip();
    fireEvent.click(screen.getByRole("button", { name: "Track" }));

    await waitFor(() =>
      expect(createSource).toHaveBeenCalledWith("tok-1", "ws-1", {
        platform: "tiktok",
        sourceType: "creator",
        query: "@maker",
        videoLimit: 20,
      }),
    );
    await waitFor(() => expect(refreshSource).toHaveBeenCalledWith("tok-1", "ws-1", "new-1"));
    expect(showToast).toHaveBeenCalledWith(
      expect.stringMatching(/Now tracking @maker/),
      expect.objectContaining({ type: "success" }),
    );
  });

  it("uses the API preview when the connector returns outliers/recent", async () => {
    getCreatorPreview.mockResolvedValue({
      handle: "maker",
      trackedSourceId: null,
      videoCount: 12,
      outlierCount: 3,
      followers: 15000,
      medianViews: 2100,
      outliers: [
        { id: "o1", thumbUrl: "https://t/o1.jpg", views: 9000, outlierScore: 12.4, caption: "hit", postedAt: 9, url: "https://t/o1" },
      ],
      recent: [
        { id: "r1", thumbUrl: "https://t/r1.jpg", views: 200, outlierScore: null, caption: "new", postedAt: 10, url: "https://t/r1" },
      ],
    });

    renderChip();
    fireEvent.click(screen.getByRole("button", { name: "@maker creator preview" }));

    expect(await screen.findByText(/12 videos/)).toBeInTheDocument();
    expect(screen.getByText(/3 outliers/)).toBeInTheDocument();
    expect(screen.getByText(/15K followers/)).toBeInTheDocument();
    expect(screen.getByText(/median 2K/)).toBeInTheDocument();
  });
});
