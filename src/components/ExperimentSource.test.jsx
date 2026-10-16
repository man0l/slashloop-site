import { fireEvent, render, screen, waitFor, cleanup } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, expect, it, vi } from "vitest";
import ExperimentSource from "./ExperimentSource.jsx";
import * as gallery from "../lib/gallery.js";

vi.mock("../lib/gallery.js", async (original) => ({ ...await original(), getGallery: vi.fn() }));
afterEach(() => { cleanup(); vi.clearAllMocks(); });

function mount() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(<QueryClientProvider client={client}><ExperimentSource accessToken="t" workspaceId="w" videoId="v1" title="Original 1" /></QueryClientProvider>);
}

it("shows source slides as thumbnails that open the slideshow preview", async () => {
  gallery.getGallery.mockResolvedValue({ cards: [{ id: "v1", slideshowImages: ["https://r2.example/a.jpg", "https://r2.example/b.jpg"], thumbUrl: "https://r2.example/c.jpg" }] });
  mount();
  fireEvent.click(await screen.findByLabelText("Preview Original 1 slide 2"));
  expect(gallery.getGallery).toHaveBeenCalledWith("t", { workspaceId: "w", videoId: "v1", limit: 1 }, expect.anything());
  expect(await screen.findByRole("dialog")).toBeTruthy();
  expect(screen.getByText(/Slide 2 · 2 of 2/)).toBeTruthy();
});

it("falls back to the cover for a video source and ignores TikTok CDN urls", async () => {
  gallery.getGallery.mockResolvedValue({ cards: [{ id: "v1", slideshowImages: ["https://p16.tiktokcdn-us.com/x.jpg"], thumbUrl: "https://r2.example/c.jpg" }] });
  mount();
  expect(await screen.findByAltText("Original 1 cover")).toBeTruthy();
  expect(screen.queryByLabelText(/Preview Original 1 slide/)).toBeNull();
});

it("renders nothing when the source card cannot be loaded", async () => {
  gallery.getGallery.mockRejectedValue(new Error("boom"));
  const { container } = mount();
  await waitFor(() => expect(gallery.getGallery).toHaveBeenCalled());
  expect(container.innerHTML).toBe("");
});
