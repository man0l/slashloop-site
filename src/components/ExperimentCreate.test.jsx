import { render, screen, fireEvent, waitFor, cleanup } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import ExperimentCreate from "./ExperimentCreate.jsx";
import { createExperiment, mutateExperiment } from "../lib/experiments.js";
vi.mock("../lib/experiments.js", async (original) => ({ ...await original(), createExperiment: vi.fn(), mutateExperiment: vi.fn() }));
let client;
function mount(videoIds = ["original1"], props = {}) { client = new QueryClient(); render(<QueryClientProvider client={client}><MemoryRouter><ExperimentCreate accessToken="auth" workspaceId="w1" videoIds={videoIds} onClose={() => {}} {...props} /></MemoryRouter></QueryClientProvider>); }
// Step 1 defaults to create mode — one Next lands on the details form.
function goCreate() { fireEvent.click(screen.getByRole("button", { name: /Next/ })); }
function goReview() { fireEvent.click(screen.getByRole("button", { name: /Next/ })); }
beforeEach(() => vi.clearAllMocks()); afterEach(() => { cleanup(); client?.clear(); });
it("omits a CTA slide from original carousel length", async () => {
  createExperiment.mockResolvedValue({ experiment: { id: "e1" } }); mutateExperiment.mockResolvedValue({});
  mount(["original1"]);
  // 6 original slides → 5 story slides when a CTA is present.
  cleanup();
  client = new QueryClient();
  render(<QueryClientProvider client={client}><MemoryRouter><ExperimentCreate accessToken="auth" workspaceId="w1" videoIds={["original1"]} originalSlideCounts={[6]} onClose={() => {}} /></MemoryRouter></QueryClientProvider>);
  goCreate();
  fireEvent.change(screen.getByLabelText(/^Goal/), { target: { value: "Improve swipe rate" } });
  expect(screen.getByText(/call-to-action slide is omitted/i)).toBeInTheDocument();
  goReview();
  expect(screen.getByRole("region", { name: "What this experiment will produce" })).toHaveTextContent("5");
  fireEvent.click(screen.getByRole("button", { name: /Start experiment/ }));
  await waitFor(() => expect(createExperiment).toHaveBeenCalledWith("auth", expect.objectContaining({ slideCount: 5 })));
});
it("starts the experiment in one click: creates the draft and approves planning", async () => {
  createExperiment.mockResolvedValue({ experiment: { id: "e1" } }); mutateExperiment.mockResolvedValue({}); mount();
  goCreate();
  fireEvent.change(screen.getByLabelText(/^Goal/), { target: { value: "Improve swipe rate" } });
  expect(screen.queryByLabelText("Credit ceiling")).not.toBeInTheDocument();
  goReview();
  expect(screen.getByRole("button", { name: /Start experiment/ })).toHaveTextContent("credits");
  fireEvent.click(screen.getByRole("button", { name: /Start experiment/ }));
  await waitFor(() => expect(createExperiment).toHaveBeenCalledWith("auth", expect.objectContaining({ workspaceId: "w1", videoIds: ["original1"], maxCredits: expect.any(Number), variantCount: 3, slideCount: 5, idempotencyKey: expect.any(String), instructions: expect.objectContaining({ mode: "controlled", variables: ["hook"], lockedConstraints: [] }) })));
  await waitFor(() => expect(mutateExperiment).toHaveBeenCalledWith("auth", "w1", "e1", "plan", expect.objectContaining({ allowPartial: false, idempotencyKey: expect.any(String) })));
});
it("shows live validation while the form is incomplete", () => {
  mount();
  goCreate();
  // Details step reports the missing goal; Start lives on the review step.
  expect(screen.getAllByText(/Goal is required/).length).toBeGreaterThan(0);
  fireEvent.change(screen.getByLabelText(/^Goal/), { target: { value: "Now valid" } });
  expect(screen.getByLabelText(/^Goal/)).toBeValid();
  expect(screen.queryAllByText(/Goal is required/).length).toBe(0);
  goReview();
  expect(screen.getByRole("button", { name: /Start experiment/ })).toBeEnabled();
});
it("validates selection limits before draft dispatch", async () => {
  mount(Array.from({ length: 21 }, (_, i) => String(i))); goCreate(); fireEvent.change(screen.getByLabelText(/^Goal/), { target: { value: "Test" } }); goReview(); fireEvent.click(screen.getByRole("button", { name: /Start experiment/ }));
  expect(screen.getByText(/Select 1–20 originals/)).toBeInTheDocument(); expect(createExperiment).not.toHaveBeenCalled();
});
it("fills an editable portrait example and sends only the visible instructions", async () => {
  createExperiment.mockResolvedValue({ experiment: { id: "e1" } }); mutateExperiment.mockResolvedValue({}); mount();
  goCreate();
  fireEvent.change(screen.getByLabelText("Start from an example"), { target: { value: "portraits" } });
  expect(screen.getByLabelText("What do you want to change?")).toHaveValue("visualStyle");
  expect(screen.getByLabelText("Variants (baseline included)")).toHaveValue(2);
  expect(screen.getByText(/story slides/)).toBeInTheDocument();
  fireEvent.change(screen.getByLabelText(/^Goal/), { target: { value: "My edited portrait test" } });
  goReview();
  expect(screen.getByRole("region", { name: "What this experiment will produce" })).toHaveTextContent("My edited portrait test");
  expect(screen.getByRole("region", { name: "What this experiment will produce" })).toHaveTextContent("6 images");
  fireEvent.click(screen.getByRole("button", { name: /Start experiment/ }));
  await waitFor(() => expect(createExperiment).toHaveBeenCalledWith("auth", expect.objectContaining({ variantCount: 2, slideCount: 3, maxCredits: expect.any(Number), instructions: expect.objectContaining({ goal: "My edited portrait test", variables: ["visualStyle"], direction: expect.stringContaining("Desired variable values: Natural everyday") }) })));
});
it("keeps the brand and language when replacing an example", () => {
  mount();
  goCreate();
  fireEvent.change(screen.getByLabelText("Brand"), { target: { value: "My channel" } });
  fireEvent.change(screen.getByLabelText("Start from an example"), { target: { value: "portraits" } });
  fireEvent.change(screen.getByLabelText("Start from an example"), { target: { value: "hooks" } });
  expect(screen.getByLabelText("Brand")).toHaveValue("My channel");
  expect(screen.getByLabelText("What do you want to change?")).toHaveValue("hook");
  expect(screen.getByLabelText("Audience")).toHaveValue("");
  expect(createExperiment).not.toHaveBeenCalled();
});
it("describes a baseline-only setup without claiming a comparison", () => {
  mount(); goCreate(); fireEvent.change(screen.getByLabelText("Variants (baseline included)"), { target: { value: "1" } });
  goReview();
  expect(screen.getByRole("region", { name: "What this experiment will produce" })).toHaveTextContent("1 baseline only");
  expect(screen.queryByText("Hook changes")).not.toBeInTheDocument();
});
it("allows concept/slide exploration but strips them when returning to controlled", () => {
  mount(); goCreate(); fireEvent.change(screen.getByLabelText("Test mode"), { target: { value: "exploration" } }); fireEvent.click(screen.getByRole("checkbox", { name: "Concept / angle" })); fireEvent.change(screen.getByLabelText("Test mode"), { target: { value: "controlled" } }); expect(screen.queryByRole("checkbox", { name: "Concept / angle" })).not.toBeInTheDocument();
});
it("edit mode runs the same pipeline on multiple originals: strip text, pick variables, lock constraints", async () => {
  createExperiment.mockResolvedValue({ experiment: { id: "e1" } }); mutateExperiment.mockResolvedValue({});
  mount(["original1", "original2"], { originalSlideCounts: [3, 3] });
  fireEvent.click(screen.getByRole("radio", { name: /Edit slideshow/ }));
  fireEvent.click(screen.getByRole("button", { name: /Next/ }));
  expect(screen.getByLabelText(/^Goal/)).toBeInTheDocument();
  expect(screen.getByLabelText("What do you want to change?")).toBeInTheDocument();
  fireEvent.change(screen.getByLabelText(/^Goal/), { target: { value: "New copy on the same images" } });
  fireEvent.change(screen.getByLabelText("What do you want to change?"), { target: { value: "character" } });
  fireEvent.change(screen.getByLabelText("Keep unchanged (one per line)"), { target: { value: "Keep the visual style unchanged" } });
  fireEvent.click(screen.getByRole("button", { name: /Next/ }));
  expect(screen.getByRole("region", { name: "What this experiment will produce" })).toHaveTextContent("Same images, old overlay text stripped");
  fireEvent.click(screen.getByRole("button", { name: /Start experiment/ }));
  await waitFor(() => expect(createExperiment).toHaveBeenCalledWith("auth", expect.objectContaining({ videoIds: ["original1", "original2"], variantCount: 3, slideCount: 3, instructions: expect.objectContaining({ goal: "New copy on the same images", variables: ["character"], mode: "controlled", lockedConstraints: ["Keep the visual style unchanged"], direction: expect.stringContaining("strip every existing overlay text") }) })));
  await waitFor(() => expect(mutateExperiment).toHaveBeenCalledWith("auth", "w1", "e1", "plan", expect.objectContaining({ allowPartial: false, idempotencyKey: expect.any(String) })));
});
it("edit mode sends no special rules when kept minimal, mirroring create", async () => {
  createExperiment.mockResolvedValue({ experiment: { id: "e1" } }); mutateExperiment.mockResolvedValue({});
  mount(["original1"], { originalSlideCounts: [5] });
  fireEvent.click(screen.getByRole("radio", { name: /Edit slideshow/ }));
  fireEvent.click(screen.getByRole("button", { name: /Next/ }));
  fireEvent.change(screen.getByLabelText(/^Goal/), { target: { value: "Test hooks again" } });
  fireEvent.click(screen.getByRole("button", { name: /Next/ }));
  fireEvent.click(screen.getByRole("button", { name: /Start experiment/ }));
  await waitFor(() => expect(createExperiment).toHaveBeenCalledWith("auth", expect.objectContaining({ videoIds: ["original1"], variantCount: 3, instructions: expect.objectContaining({ variables: ["hook"], lockedConstraints: [], mode: "controlled", direction: expect.stringContaining("strip every existing overlay text") }) })));
});
