import { fireEvent, render, screen, waitFor, cleanup } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { ExperimentDetail, ExperimentList } from "./Experiments.jsx";
import * as api from "../lib/experiments.js";
import { useExperimentList } from "../lib/useExperiments.js";
vi.mock("../lib/experiments.js", async (original) => ({ ...await original(), getExperiment: vi.fn(), estimateExperiment: vi.fn(), mutateExperiment: vi.fn(), updateExperimentVariant: vi.fn(), deleteExperiment: vi.fn(), deleteExperiments: vi.fn() }));
vi.mock("../lib/useExperiments.js", async (original) => ({ ...await original(), useExperimentList: vi.fn() }));
const base = () => ({ id: "e1", workspaceId: "w1", status: "review", updatedAt: "2026-09-16", instructions: { goal: "Test a better hook", mode: "controlled" }, maxCredits: 100, creditsCharged: 4, variantCount: 1, slideCount: 3, inputs: [{ videoId: "video1", status: "ready" }], report: { summary: "Strong opening contrast", patterns: [{ id: "p1", name: "Contrast", description: "Show before and after", sourceIds: ["video1"], evidence: [{ videoId: "video1", location: "opening", observation: "Immediate contrast" }] }] }, variants: [{ id: "v1", title: "Question hook", revision: 2, status: "ready", hypothesis: "A question invites a swipe", brief: { concept: "Morning routine", hook: "Need more time?", slides: [{ role: "hook", scene: "Desk", overlayText: "Before" }] }, slides: [] }] });
let experiment;
let client;
function mount() { client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } }); return render(<QueryClientProvider client={client}><MemoryRouter><ExperimentDetail accessToken="token" workspaceId="w1" experimentId="e1" /></MemoryRouter></QueryClientProvider>); }
beforeEach(() => { experiment = base(); vi.clearAllMocks(); api.getExperiment.mockImplementation(async () => structuredClone(experiment)); api.estimateExperiment.mockResolvedValue({ analysisCredits: 0, planningCredits: 0, generationCredits: 12, totalCredits: 12, remainingCredits: 80 }); api.mutateExperiment.mockResolvedValue({ experiment: { ...base(), status: "generating" } }); });
afterEach(() => { cleanup(); client?.clear(); });
it("renders persisted report/variants and requires explicit estimate approval before generation", async () => {
  mount();
  expect(await screen.findByText("Question hook")).toBeInTheDocument();
  expect(screen.getByText("Strong opening contrast")).toBeInTheDocument();
  expect(api.getExperiment).toHaveBeenCalledWith("token", "w1", "e1", expect.any(AbortSignal));
  expect(screen.getByRole("checkbox", { name: "Select for generation" })).toBeChecked();
  fireEvent.click(screen.getByRole("button", { name: "Estimate selected generation" }));
  expect(await screen.findByRole("button", { name: "Approve & start generation" })).toBeEnabled();
  expect(api.estimateExperiment).toHaveBeenCalledWith("token", "w1", "e1", "generate", ["v1"], expect.any(AbortSignal), undefined);
  expect(api.mutateExperiment).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole("button", { name: "Approve & start generation" }));
  await waitFor(() => expect(api.mutateExperiment).toHaveBeenCalledWith("token", "w1", "e1", "generate", { variants: [{ id: "v1", revision: 2 }], idempotencyKey: expect.any(String) }));
});
it("saves edited brief with its expected revision and uses the refreshed revision", async () => {
  api.updateExperimentVariant.mockImplementation(async (_token, _ws, _id, _vid, revision, brief) => { experiment.variants[0] = { ...experiment.variants[0], revision: revision + 1, brief }; return { experiment: structuredClone(experiment) }; });
  mount(); await screen.findByText("Question hook");
  fireEvent.click(screen.getByText("Review / edit brief"));
  fireEvent.change(screen.getByLabelText("Hook"), { target: { value: "What would you do with an extra hour?" } });
  expect(screen.getByRole("button", { name: "Estimate selected generation" })).toBeDisabled();
  fireEvent.click(screen.getByRole("button", { name: "Save brief" }));
  await waitFor(() => expect(api.updateExperimentVariant).toHaveBeenCalledWith("token", "w1", "e1", "v1", 2, expect.objectContaining({ hook: "What would you do with an extra hour?" })));
  await waitFor(() => expect(screen.getByText(/Revision 3/)).toBeInTheDocument());
  fireEvent.click(screen.getByRole("button", { name: "Estimate selected generation" }));
  fireEvent.click(await screen.findByRole("button", { name: "Approve & start generation" }));
  await waitFor(() => expect(api.mutateExperiment).toHaveBeenCalledWith("token", "w1", "e1", "generate", expect.objectContaining({ variants: [{ id: "v1", revision: 3 }] })));
});
it("places completed results before collapsed evidence and labels saved inputs", async () => {
  experiment.status = "completed";
  experiment.variants[0].status = "done";
  experiment.variants[0].slides = [0, 1, 2].map((index) => ({ index, status: "done", url: `https://example.test/${index}.jpg` }));
  mount();
  const results = await screen.findByRole("heading", { name: "Generated results" });
  const evidence = screen.getByText("Source analysis & pattern report").closest("details");
  expect(evidence).not.toHaveAttribute("open");
  expect(results.compareDocumentPosition(evidence) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  expect(screen.getByText("Your saved inputs & rules")).toBeInTheDocument();
  expect(screen.getByRole("button", { name: "Schedule this variant" })).toBeEnabled();
});
it("blocks when the workspace wallet cannot cover the estimate", async () => {
  api.estimateExperiment.mockResolvedValue({ totalCredits: 270, remainingCredits: 204, workspaceCredits: 204 }); mount(); await screen.findByText("Question hook"); fireEvent.click(screen.getByRole("button", { name: "Estimate selected generation" }));
  expect(await screen.findByRole("button", { name: "Approve & start generation" })).toBeDisabled(); expect(api.mutateExperiment).not.toHaveBeenCalled();
  expect(screen.getByText("Available").closest("div").querySelector("dd").textContent).toBe("204");
  expect(screen.getByText(/Not enough credits/)).toBeInTheDocument();
});
it("lets pack credits cover generation even when the experiment auto-cap is short", async () => {
  api.estimateExperiment.mockResolvedValue({ analysisCredits: 0, planningCredits: 0, generationCredits: 270, totalCredits: 270, remainingCredits: 204, workspaceCredits: 500 });
  mount(); await screen.findByText("Question hook"); fireEvent.click(screen.getByRole("button", { name: "Estimate selected generation" }));
  expect(await screen.findByRole("button", { name: "Approve & start generation" })).toBeEnabled();
  expect(screen.getByText("Available").closest("div").querySelector("dd").textContent).toBe("500");
  expect(screen.queryByText(/Not enough credits/)).not.toBeInTheDocument();
});
it("requires a planning estimate and leaves generation manual", async () => {
  experiment = { ...base(), status: "draft", variants: [], report: null }; mount();
  fireEvent.click(await screen.findByRole("button", { name: "Estimate analysis & planning" })); expect(api.mutateExperiment).not.toHaveBeenCalled();
  fireEvent.click(await screen.findByRole("button", { name: "Approve & start planning" }));
  await waitFor(() => expect(api.mutateExperiment).toHaveBeenCalledWith("token", "w1", "e1", "plan", expect.objectContaining({ allowPartial: false })));
});
it("does not offer blind retries for unknown provider outcomes", async () => {
  experiment.status = "needs_review"; experiment.error = { code: "provider_outcome_unknown" }; mount();
  expect(await screen.findByText(/A provider outcome is unknown/)).toBeInTheDocument(); expect(screen.queryByRole("button", { name: /Estimate retry/ })).not.toBeInTheDocument(); expect(screen.getByRole("button", { name: "Estimate selected generation" })).toBeDisabled();
});
it("shows a confirmed image rejection and retries inline from the pipeline", async () => {
  experiment.status = "failed";
  experiment.error = "provider_result_rejected";
  experiment.variants[0].status = "failed";
  experiment.variants[0].error = "provider_result_rejected";
  experiment.variants[0].slides = [{ index: 0, status: "failed", url: null, error: "provider_result_rejected" }];
  mount();
  expect(await screen.findByRole("listitem", { name: /Images: failed/ })).toBeInTheDocument();
  expect(screen.queryByText("Recover known failures")).not.toBeInTheDocument();
  expect(screen.getAllByText(/provider_result_rejected/).length).toBeGreaterThan(0);
  expect(screen.queryByText(/A provider outcome is unknown/)).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: "Retry Images" }));
  expect(await screen.findByRole("button", { name: "Approve & start retry" })).toBeEnabled();
  expect(api.estimateExperiment).toHaveBeenCalledWith("token", "w1", "e1", "generate", ["v1"], expect.any(AbortSignal), undefined);
  expect(api.mutateExperiment).not.toHaveBeenCalled();
});
it("retries a failed briefs job inline from the pipeline", async () => {
  experiment = { ...base(), status: "failed", error: "brief_candidates_invalid", variants: [], report: { summary: "S", patterns: [] }, jobs: [{ id: "b1", kind: "briefs", status: "failed", attempts: 5, error: "brief_candidates_invalid" }] };
  mount();
  expect(await screen.findByRole("listitem", { name: /Briefs: failed/ })).toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: "Retry Briefs" }));
  expect(await screen.findByRole("button", { name: "Approve & start retry" })).toBeEnabled();
  expect(api.estimateExperiment).toHaveBeenCalledWith("token", "w1", "e1", "plan", undefined, expect.any(AbortSignal), ["b1"]);
});
it("blocks paid actions for a paused experiment even without an error message", async () => {
  experiment.status = "paused";
  mount();
  expect(await screen.findByText(/A provider outcome is unknown/)).toBeInTheDocument();
  expect(screen.queryByRole("button", { name: /Estimate retry/ })).not.toBeInTheDocument();
  expect(screen.getByRole("button", { name: "Estimate selected generation" })).toBeDisabled();
});
it("does not mark downstream stages failed when a source fails", async () => {
  experiment = { ...base(), status: "failed", report: null, variants: [], inputs: [{ videoId: "video1", status: "failed" }] };
  mount();
  expect(await screen.findByRole("listitem", { name: "Sources: failed, 0/1" })).toBeInTheDocument();
  expect(screen.getByRole("listitem", { name: "Patterns: pending" })).toBeInTheDocument();
  expect(screen.getByRole("listitem", { name: "Briefs: pending" })).toBeInTheDocument();
  expect(screen.getByRole("listitem", { name: "Images: pending, 0 ready" })).toBeInTheDocument();
});
it("traces a retrying briefs job on Briefs, not Images", async () => {
  experiment = { ...base(), status: "planning", variants: [], report: { summary: "S", patterns: [] }, jobs: [
    { id: "a", kind: "analysis", status: "done", attempts: 1 },
    { id: "r", kind: "report", status: "done", attempts: 1 },
    { id: "b", kind: "briefs", status: "pending", error: "provider_result_rejected", attempts: 3, nextAttemptAt: Date.now() + 10 * 60_000 },
  ] };
  mount();
  expect(await screen.findByRole("listitem", { name: /Briefs: active, retry in 10m · attempt 3 · provider_result_rejected/ })).toBeInTheDocument();
  expect(screen.getByRole("listitem", { name: "Images: pending, 0 ready" })).toBeInTheDocument();
  expect(screen.getByRole("list", { name: "Pipeline jobs" })).toHaveTextContent(/briefs · pending · attempt 3/);
  expect(screen.getByRole("alert")).toHaveTextContent(/briefs attempt 3: provider_result_rejected · retry in 10m/);
});
it("names OpenRouter credit exhaustion on a live job", async () => {
  experiment = { ...base(), status: "planning", variants: [], report: { summary: "S", patterns: [] }, jobs: [
    { id: "b", kind: "briefs", status: "pending", error: "provider_outcome_unknown:credits_exhausted_402", attempts: 2, nextAttemptAt: Date.now() + 60_000 },
  ] };
  mount();
  expect(await screen.findByRole("alert")).toHaveTextContent(/briefs attempt 2: OpenRouter credits exhausted · retry in 1m/);
});
it("counts only generated decks in image progress", async () => {
  experiment.variantCount = 2;
  experiment.variants[0].status = "done";
  experiment.variants[0].slides = [0, 1, 2].map((index) => ({ index, status: "done", url: `https://example.test/${index}.jpg` }));
  experiment.variants.push({ ...base().variants[0], id: "v2", title: "Unused draft", status: "draft" });
  mount();
  expect(await screen.findByRole("listitem", { name: "Images: done, 3/3 ready" })).toBeInTheDocument();
});
it("retries a single failed job by task id after estimate approval", async () => {
  experiment.status = "failed";
  experiment.error = "provider_result_rejected";
  experiment.variants[0].status = "failed";
  experiment.variants[0].slides = [{ index: 0, status: "failed", url: null, error: "provider_result_rejected" }];
  experiment.jobs = [{ id: "job1", kind: "slide", target: "v1", index: 0, status: "failed", attempts: 1 }];
  api.estimateExperiment.mockResolvedValue({ analysisCredits: 0, planningCredits: 0, generationCredits: 2, totalCredits: 2, remainingCredits: 80 });
  mount();
  fireEvent.click(await screen.findByRole("button", { name: "Retry slide 1" }));
  expect(await screen.findByRole("button", { name: "Approve & start retry" })).toBeEnabled();
  expect(api.estimateExperiment).toHaveBeenCalledWith("token", "w1", "e1", "generate", undefined, expect.any(AbortSignal), ["job1"]);
  expect(api.mutateExperiment).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole("button", { name: "Approve & start retry" }));
  await waitFor(() => expect(api.mutateExperiment).toHaveBeenCalledWith("token", "w1", "e1", "retry", { taskIds: ["job1"], idempotencyKey: expect.any(String) }));
});
it("offers per-job retry for exhausted unknown outcomes", async () => {
  experiment.status = "paused";
  experiment.error = "provider_outcome_unknown";
  experiment.variants[0].status = "paused";
  experiment.variants[0].slides = [{ index: 0, status: "unknown", url: null, error: "provider_outcome_unknown" }];
  experiment.jobs = [{ id: "job2", kind: "slide", target: "v1", index: 0, status: "unknown", attempts: 4 }];
  mount();
  fireEvent.click(await screen.findByRole("button", { name: "Retry slide 1" }));
  expect(await screen.findByRole("button", { name: "Approve & start retry" })).toBeEnabled();
  expect(api.estimateExperiment).toHaveBeenCalledWith("token", "w1", "e1", "generate", undefined, expect.any(AbortSignal), ["job2"]);
});
it("hides per-job retry once the manual attempt limit is reached", async () => {
  experiment.status = "paused";
  experiment.variants[0].status = "paused";
  experiment.variants[0].slides = [{ index: 0, status: "unknown", url: null, error: "provider_outcome_unknown" }];
  experiment.jobs = [{ id: "job3", kind: "slide", target: "v1", index: 0, status: "unknown", attempts: 6 }];
  mount();
  await screen.findByText(/A provider outcome is unknown/);
  expect(screen.queryByRole("button", { name: "Retry slide 1" })).not.toBeInTheDocument();
});
it("declares completion clearly and suppresses stale unknown warnings", async () => {
  experiment.status = "completed";
  experiment.variants[0].status = "done";
  experiment.variants[0].error = "provider_outcome_unknown";
  experiment.variants[0].slides = [0, 1, 2].map((index) => ({ index, status: "done", url: `https://example.test/${index}.jpg` }));
  mount();
  expect(await screen.findByText(/Experiment complete/)).toBeInTheDocument();
  expect(screen.queryByText(/A provider outcome is unknown/)).not.toBeInTheDocument();
  expect(screen.queryByRole("button", { name: "Estimate selected generation" })).not.toBeInTheDocument();
});
it("lists experiments as a thumbnail grid with relative dates and delete", async () => {
  useExperimentList.mockReturnValue({ data: { pages: [{ experiments: [{ id: "e9", workspaceId: "w1", status: "completed", instructions: { goal: "My grid test" }, variantCount: 2, slideCount: 3, creditsCharged: 5, maxCredits: 100, createdAt: new Date(Date.now() - 7200 * 1000).toISOString(), variants: [{ slides: [{ index: 0, url: "https://example.test/a.jpg", status: "done" }] }] }], nextOffset: null }] }, isPending: false, isError: false, refetch: vi.fn(), hasNextPage: false, isFetchingNextPage: false, fetchNextPage: vi.fn() });
  api.deleteExperiment.mockResolvedValue({ deleted: true });
  client = new QueryClient();
  render(<QueryClientProvider client={client}><MemoryRouter><ExperimentList accessToken="token" workspaceId="w1" /></MemoryRouter></QueryClientProvider>);
  expect(await screen.findByText("My grid test")).toBeInTheDocument();
  expect(document.querySelector("img")?.getAttribute("src")).toBe("https://example.test/a.jpg");
  expect(screen.getByText(/2 hours ago/)).toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: /Delete/ }));
  expect(await screen.findByText("Delete experiment?")).toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: "Delete" }));
  await waitFor(() => expect(api.deleteExperiment).toHaveBeenCalledWith("token", "w1", "e9"));
});
it("switches to line view and bulk-deletes selected experiments", async () => {
  localStorage.setItem("experiments-view", "grid");
  useExperimentList.mockReturnValue({ data: { pages: [{ experiments: [
    { id: "e9", workspaceId: "w1", status: "completed", instructions: { goal: "Grid one" }, variantCount: 2, slideCount: 3, creditsCharged: 5, maxCredits: 100, createdAt: new Date().toISOString(), variants: [{ slides: [{ index: 0, url: "https://example.test/a.jpg", status: "done" }] }] },
    { id: "e10", workspaceId: "w1", status: "failed", instructions: { goal: "Line two" }, variantCount: 1, slideCount: 3, creditsCharged: 2, maxCredits: 50, createdAt: new Date().toISOString(), variants: [] },
  ], nextOffset: 2 }, { experiments: [], nextOffset: null }] }, isPending: false, isError: false, refetch: vi.fn(), hasNextPage: true, isFetchingNextPage: false, fetchNextPage: vi.fn() });
  api.deleteExperiments.mockResolvedValue({ deleted: 2, failed: [] });
  client = new QueryClient();
  render(<QueryClientProvider client={client}><MemoryRouter><ExperimentList accessToken="token" workspaceId="w1" /></MemoryRouter></QueryClientProvider>);
  expect(await screen.findByText("Grid one")).toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: "Line" }));
  expect(screen.getByRole("button", { name: "Line" })).toHaveAttribute("aria-pressed", "true");
  fireEvent.click(screen.getByRole("checkbox", { name: "Select Grid one" }));
  fireEvent.click(screen.getByRole("checkbox", { name: "Select Line two" }));
  expect(screen.getByText("2 selected")).toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: "Delete selected…" }));
  expect(await screen.findByText("Delete 2 experiments?")).toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: "Delete 2" }));
  await waitFor(() => expect(api.deleteExperiments).toHaveBeenCalledWith("token", "w1", ["e9", "e10"]));
  expect(screen.queryByText("2 selected")).not.toBeInTheDocument();
  // A second page exists — Load more is offered after the delete refresh.
  expect(screen.getByRole("button", { name: /Load more/ })).toBeInTheDocument();
});
it("offers load-more pagination for a longer history", async () => {
  localStorage.setItem("experiments-view", "line");
  const page1 = [{ id: "a1", workspaceId: "w1", status: "completed", instructions: { goal: "Row one" }, variantCount: 1, slideCount: 3, creditsCharged: 1, maxCredits: 10, createdAt: new Date().toISOString(), variants: [] },
    { id: "a2", workspaceId: "w1", status: "completed", instructions: { goal: "Row two" }, variantCount: 1, slideCount: 3, creditsCharged: 1, maxCredits: 10, createdAt: new Date().toISOString(), variants: [] }];
  useExperimentList.mockReturnValue({ data: { pages: [{ experiments: page1, nextOffset: 2 }] }, isPending: false, isError: false, refetch: vi.fn(), hasNextPage: true, isFetchingNextPage: false, fetchNextPage: vi.fn() });
  client = new QueryClient();
  render(<QueryClientProvider client={client}><MemoryRouter><ExperimentList accessToken="token" workspaceId="w1" /></MemoryRouter></QueryClientProvider>);
  expect(await screen.findByText("Row one")).toBeInTheDocument();
  expect(screen.getByText("Row two")).toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: /Load more/ }));
  expect(useExperimentList).toHaveBeenCalled();
});
it("reports partial bulk-delete failures instead of a native alert", async () => {
  localStorage.setItem("experiments-view", "line");
  useExperimentList.mockReturnValue({ data: { pages: [{ experiments: [
    { id: "e9", workspaceId: "w1", status: "completed", instructions: { goal: "Grid one" }, variantCount: 2, slideCount: 3, creditsCharged: 5, maxCredits: 100, createdAt: new Date().toISOString(), variants: [] },
    { id: "e10", workspaceId: "w1", status: "generating", instructions: { goal: "Line two" }, variantCount: 1, slideCount: 3, creditsCharged: 2, maxCredits: 50, createdAt: new Date().toISOString(), variants: [] },
  ], nextOffset: null }] }, isPending: false, isError: false, refetch: vi.fn(), hasNextPage: false, isFetchingNextPage: false, fetchNextPage: vi.fn() });
  api.deleteExperiments.mockResolvedValue({ deleted: 1, failed: [{ id: "e10", code: "active_experiment", message: "experiment is still running" }] });
  client = new QueryClient();
  render(<QueryClientProvider client={client}><MemoryRouter><ExperimentList accessToken="token" workspaceId="w1" /></MemoryRouter></QueryClientProvider>);
  expect(await screen.findByText("Grid one")).toBeInTheDocument();
  fireEvent.click(screen.getByRole("checkbox", { name: "Select Grid one" }));
  fireEvent.click(screen.getByRole("checkbox", { name: "Select Line two" }));
  fireEvent.click(screen.getByRole("button", { name: "Delete selected…" }));
  fireEvent.click(await screen.findByRole("button", { name: "Delete 2" }));
  expect(await screen.findByText(/Deleted 1 of 2/)).toBeInTheDocument();
  expect(screen.getByText(/Line two: experiment is still running/)).toBeInTheDocument();
});
it("resends the same key after a lost mutation response", async () => {
  api.mutateExperiment.mockRejectedValueOnce(new Error("Network lost")); mount(); await screen.findByText("Question hook"); fireEvent.click(screen.getByRole("button", { name: "Estimate selected generation" })); fireEvent.click(await screen.findByRole("button", { name: "Approve & start generation" }));
  fireEvent.click(await screen.findByRole("button", { name: "Recheck original request" }));
  await waitFor(() => expect(api.mutateExperiment).toHaveBeenCalledTimes(2)); expect(api.mutateExperiment.mock.calls[0][4]).toEqual(api.mutateExperiment.mock.calls[1][4]);
});
