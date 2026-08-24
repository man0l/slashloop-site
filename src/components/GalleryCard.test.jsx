import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor, within } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter } from "react-router-dom";
import { VideoApiError } from "../lib/video.js";
import GalleryCard from "./GalleryCard.jsx";

// Stub only the network calls; keep the real friendlyAnalysisError /
// friendlyJobError so the card's error path is tested against the real mapping.
const { getVideoDetail, analyzeVideo } = vi.hoisted(() => ({
  getVideoDetail: vi.fn(),
  analyzeVideo: vi.fn(),
}));

vi.mock("../lib/video.js", async () => {
  const actual = await vi.importActual("../lib/video.js");
  return { ...actual, getVideoDetail, analyzeVideo };
});

vi.mock("../lib/toast.jsx", () => ({
  useToast: () => ({ showToast: vi.fn() }),
}));

vi.mock("../lib/gallery.js", async () => {
  const actual = await vi.importActual("../lib/gallery.js");
  return { ...actual, getCreatorPreview: vi.fn(async () => ({ cards: [] })) };
});

beforeEach(() => {
  getVideoDetail.mockReset();
  analyzeVideo.mockReset();
});

const card = {
  id: "vid-1",
  thumbUrl: "https://t/1.jpg",
  creatorHandle: "maker",
  views: 1200,
  postedAt: Date.now() - 86400000,
  outlierScore: 8.2,
  caption: "A bold claim about X",
  url: "https://tiktok.com/@maker/v/1",
  mediaUrl: null,
};

const analysis = {
  hook: { text: "I built JARVIS in 3 minutes.", type: "bold_claim", placement: "spoken", mechanism: "Because it relabels a huge project as a weekend one." },
  angle: { type: "insider_secret", description: "Turns a huge project into a weekend task." },
  overallAssessment: { summary: "Short and punchy.", viralityScore: 9, replicability: "high" },
  storytellingBeats: [{ type: "hook", timestampSec: 0, description: "opens with the claim" }],
  keyMoments: [
    { timestampSec: 12, role: "payoff", subjectAction: "shows the demo", framing: "close_up", lighting: null },
    { timestampSec: 25, role: "cta", subjectAction: "asks to follow", framing: null, lighting: null },
  ],
  keyMechanisms: ["fast results"],
  emotionalDrivers: ["awe"],
  pacing: { rhythm: "fast", retentionStrategy: "constant payoff", cutsPerMinute: 5 },
  audienceInsight: { targetDemographic: "builders", unspokenDesire: "to feel capable" },
  transferablePatterns: [
    { pattern: "Pop-culture shortcut", description: "Map a big concept onto a small demo.", adaptationNotes: "Rewrite the CTA." },
  ],
  visualTechniques: ["overlays"],
  audioTechniques: ["trending sound"],
  audioAnalysis: null,
  onScreenText: null,
  emotionalArc: null,
  shots: null,
};

const detailFor = (over = {}) => ({
  id: "vid-1",
  thumbUrl: "https://t/1.jpg",
  mediaUrl: "https://media/1.mp4",
  creatorHandle: "maker",
  caption: "A bold claim about X",
  views: 1200,
  outlierScore: 8.2,
  analysis: { id: "an-1", analysisBasis: "thumbnail+caption", backend: "gemini-native", model: "gemini-3.5-flash", data: analysis },
  analysisJob: null,
  ...over,
});

const unexploredDetail = detailFor({ analysis: null });

function renderCard(ui) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <MemoryRouter>
        {ui ?? <GalleryCard card={card} index={1} accessToken="tok-1" workspaceId="ws-1" />}
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

describe("GalleryCard — analyze flow", () => {
  it("own-account posts show a You badge", () => {
    getVideoDetail.mockResolvedValue(unexploredDetail);
    renderCard(<GalleryCard card={{ ...card, isSelf: true }} index={1} accessToken="tok-1" workspaceId="ws-1" />);
    expect(screen.getByText("You")).toBeInTheDocument();
  });

  it("does not show a You badge on other creators", () => {
    getVideoDetail.mockResolvedValue(unexploredDetail);
    renderCard();
    expect(screen.queryByText("You")).not.toBeInTheDocument();
  });

  it("shows a hook-test badge with picked count when the card carries an open test", () => {
    getVideoDetail.mockResolvedValue(unexploredDetail);
    renderCard(
      <GalleryCard card={{ ...card, hookTest: { id: "ht-1", status: "picking", pickedCount: 2 } }} index={1} accessToken="tok-1" workspaceId="ws-1" />,
    );
    expect(screen.getByTestId("hook-test-badge")).toHaveTextContent("🧪 2 picked");
    expect(screen.getByTestId("hook-test-badge")).toHaveAccessibleDescription(/picking/i);
  });

  it("shows the bare hook-test badge when nothing is picked yet", () => {
    getVideoDetail.mockResolvedValue(unexploredDetail);
    renderCard(
      <GalleryCard card={{ ...card, hookTest: { id: "ht-1", status: "picking", pickedCount: 0 } }} index={1} accessToken="tok-1" workspaceId="ws-1" />,
    );
    expect(screen.getByTestId("hook-test-badge")).toHaveTextContent("🧪 hook test");
  });

  it("no hook-test badge without an open test", () => {
    getVideoDetail.mockResolvedValue(unexploredDetail);
    renderCard();
    expect(screen.queryByTestId("hook-test-badge")).not.toBeInTheDocument();
  });

  it("downloads-only: video replaces the thumbnail as soon as mediaUrl is present, before any analysis", async () => {    // Card already has a downloaded copy (mediaUrl) but no analysis yet.
    getVideoDetail.mockResolvedValue(unexploredDetail); // analysis: null

    renderCard(<GalleryCard card={{ ...card, mediaUrl: "https://media/1.mp4" }} index={1} accessToken="tok-1" workspaceId="ws-1" />);

    // Video renders immediately on load — no hover/analyze needed.
    const video = document.querySelector("video");
    expect(video).not.toBeNull();
    expect(video.getAttribute("src")).toBe("https://media/1.mp4");
    // Not analyzed yet, so no summary/details — the analyze affordance remains.
    expect(screen.queryByText("View analysis →")).not.toBeInTheDocument();
  });

  it("scrape failure: shows a warning icon + tooltip and a note when the card carries a fetchError and has no media", async () => {
    getVideoDetail.mockResolvedValue({ ...unexploredDetail, mediaUrl: null });

    renderCard(
      <GalleryCard
        card={{
          ...card,
          mediaUrl: null,
          fetchError: { code: "apify_spend_cap", message: "Apify monthly spend cap reached — scraping is paused." },
        }}
        index={1}
        accessToken="tok-1"
        workspaceId="ws-1"
      />,
    );

    // Warning icon button whose tooltip is the scrape message (Sources-style).
    expect(
      screen.getByRole("button", { name: "Apify monthly spend cap reached — scraping is paused." }),
    ).toBeInTheDocument();
    // Note where the video would be.
    expect(screen.getByText(/Couldn't scrape this video/)).toBeInTheDocument();
    // No video to play, no analysis summary.
    expect(document.querySelector("video")).toBeNull();
    expect(screen.queryByText("View analysis →")).not.toBeInTheDocument();
  });

  it("slideshow: ignores TikTok CDN slides and uses the stored thumb instead", async () => {
    getVideoDetail.mockResolvedValue({ ...unexploredDetail, mediaUrl: null, slideshowImages: [] });

    renderCard(
      <GalleryCard
        card={{
          ...card,
          mediaUrl: null,
          thumbUrl: "https://pub-abc.r2.dev/ws/vid.jpg",
          slideshowImages: [
            "https://p19-common-sign.tiktokcdn-us.com/tos-useast8-p-0068-tx2/x~tplv-tiktokx-origin.image",
          ],
        }}
        index={1}
        accessToken="tok-1"
        workspaceId="ws-1"
      />,
    );

    expect(document.querySelector("video")).toBeNull();
    const img = document.querySelector("img");
    expect(img).not.toBeNull();
    expect(img.getAttribute("src")).toBe("https://pub-abc.r2.dev/ws/vid.jpg");
  });

  it("slideshow: renders the photo carousel instead of a video or scrape error", async () => {
    getVideoDetail.mockResolvedValue({
      ...unexploredDetail,
      mediaUrl: null,
      slideshowImages: ["https://cdn.example/a.jpg", "https://cdn.example/b.jpg"],
    });

    renderCard(
      <GalleryCard
        card={{
          ...card,
          mediaUrl: null,
          slideshowImages: ["https://cdn.example/a.jpg", "https://cdn.example/b.jpg"],
        }}
        index={1}
        accessToken="tok-1"
        workspaceId="ws-1"
      />,
    );

    expect(document.querySelector("video")).toBeNull();
    expect(screen.queryByText(/Couldn't scrape this video/)).not.toBeInTheDocument();
    const img = document.querySelector("img");
    expect(img).not.toBeNull();
    expect(img.getAttribute("src")).toBe("https://cdn.example/a.jpg");
    expect(screen.getByText("1/2")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Next slide" }));
    expect(document.querySelector("img").getAttribute("src")).toBe("https://cdn.example/b.jpg");
    expect(screen.getByText("2/2")).toBeInTheDocument();
  });

  it("already-analyzed video on hover swaps the thumbnail for the playable video and offers the details, not a re-charge", async () => {
    getVideoDetail.mockResolvedValue(detailFor());

    renderCard();
    fireEvent.mouseEnter(screen.getByText("@maker").closest("article"));

    await waitFor(() => expect(screen.getByText("View analysis →")).toBeInTheDocument());

    const video = document.querySelector("video");
    expect(video).not.toBeNull();
    expect(video.getAttribute("src")).toBe("https://media/1.mp4");
    expect(screen.queryByText("Analyze with Gemini")).not.toBeInTheDocument();
    expect(getVideoDetail).toHaveBeenCalledTimes(1);
    expect(analyzeVideo).not.toHaveBeenCalled();
  });

  it("already-analyzed video offers a re-analyze icon that re-runs the analysis", async () => {
    getVideoDetail.mockResolvedValue(detailFor()); // already analyzed
    analyzeVideo.mockResolvedValueOnce({ queued: false }); // re-analyze succeeds
    getVideoDetail.mockResolvedValueOnce(detailFor({ analysis: { ...detailFor().analysis } })); // refreshed result

    renderCard();
    fireEvent.mouseEnter(screen.getByText("@maker").closest("article"));

    await waitFor(() => expect(screen.getByText("View analysis →")).toBeInTheDocument());

    const reAnalyze = screen.getByRole("button", { name: "Re-analyze this video" });
    expect(reAnalyze).toBeInTheDocument();

    fireEvent.click(reAnalyze);

    await waitFor(() => expect(analyzeVideo).toHaveBeenCalledWith("tok-1", { workspaceId: "ws-1", videoId: "vid-1" }));
    // After re-analysis completes, the done state is shown again.
    await waitFor(() => expect(screen.getByText("View analysis →")).toBeInTheDocument());
  });

  it("clicking Analyze posts the job and renders the analysis + summary once done", async () => {
    getVideoDetail.mockResolvedValueOnce(unexploredDetail); // hydrate on hover
    analyzeVideo.mockResolvedValueOnce({ queued: false }); // inline text success
    getVideoDetail.mockResolvedValueOnce(detailFor()); // canonical after inline

    renderCard();
    fireEvent.mouseEnter(screen.getByText("@maker").closest("article"));

    await waitFor(() => expect(screen.getByText("Analyze with Gemini")).toBeInTheDocument());
    fireEvent.click(screen.getByText("Analyze with Gemini"));

    await waitFor(() => expect(screen.getByText("View analysis →")).toBeInTheDocument());
    expect(analyzeVideo).toHaveBeenCalledWith("tok-1", { workspaceId: "ws-1", videoId: "vid-1" });
    // summary strip rendered from the analysis
    expect(screen.getByText(/9\/10 virality/)).toBeInTheDocument();
    expect(screen.getByText(/high/)).toBeInTheDocument();
  });

  it("View analysis opens the modal with the full details", async () => {
    getVideoDetail.mockResolvedValue(detailFor());

    renderCard();
    fireEvent.mouseEnter(screen.getByText("@maker").closest("article"));
    await waitFor(() => expect(screen.getByText("View analysis →")).toBeInTheDocument());
    fireEvent.click(screen.getByText("View analysis →"));

    expect(screen.getByRole("dialog")).toBeInTheDocument();
    const dialog = within(screen.getByRole("dialog"));
    expect(dialog.getByText("I built JARVIS in 3 minutes.")).toBeInTheDocument();
    expect(dialog.getByText(/Pop-culture shortcut/)).toBeInTheDocument();
  });

  it("a quota failure shows the warning icon + tooltip and a retry that re-runs the job", async () => {
    getVideoDetail.mockResolvedValueOnce(unexploredDetail); // hydrate
    analyzeVideo.mockRejectedValueOnce(
      new VideoApiError("Gemini is temporarily unavailable.", 429, "gemini_quota_exhausted"),
    );

    renderCard();
    fireEvent.mouseEnter(screen.getByText("@maker").closest("article"));
    await waitFor(() => expect(screen.getByText("Analyze with Gemini")).toBeInTheDocument());
    fireEvent.click(screen.getByText("Analyze with Gemini"));

    await waitFor(() =>
      expect(screen.getByRole("button", { name: "Gemini is temporarily unavailable." })).toBeInTheDocument(),
    );
    const retry = screen.getByRole("button", { name: "Retry — last analysis failed" });
    expect(retry).toBeInTheDocument();

    // The retry actually re-runs analysis and lands on the done state.
    analyzeVideo.mockResolvedValueOnce({ queued: false });
    getVideoDetail.mockResolvedValueOnce(detailFor());
    fireEvent.click(retry);

    await waitFor(() => expect(screen.getByText("View analysis →")).toBeInTheDocument());
  });

  it("insufficient credits shows the warning but no retry (a retry would just re-charge)", async () => {
    getVideoDetail.mockResolvedValueOnce(unexploredDetail); // hydrate
    analyzeVideo.mockRejectedValueOnce(
      new VideoApiError("Insufficient credits — 5 required, 3 remaining.", 402, "insufficient_credits"),
    );

    renderCard();
    fireEvent.mouseEnter(screen.getByText("@maker").closest("article"));
    await waitFor(() => expect(screen.getByText("Analyze with Gemini")).toBeInTheDocument());
    fireEvent.click(screen.getByText("Analyze with Gemini"));

    await waitFor(() =>
      expect(screen.getByRole("button", { name: /Insufficient credits/ })).toBeInTheDocument(),
    );
    expect(screen.queryByRole("button", { name: "Retry — last analysis failed" })).not.toBeInTheDocument();
  });
});
