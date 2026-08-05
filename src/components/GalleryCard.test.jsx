import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor, within } from "@testing-library/react";
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
const renderCard = () =>
  render(<GalleryCard card={card} index={1} accessToken="tok-1" workspaceId="ws-1" />);

describe("GalleryCard — analyze flow", () => {
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
