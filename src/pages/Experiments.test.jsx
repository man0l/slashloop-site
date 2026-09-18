import { fireEvent, render, screen, waitFor, cleanup } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { ExperimentDetail, ExperimentList } from "./Experiments.jsx";
import * as api from "../lib/experiments.js";
import { useExperimentList } from "../lib/useExperiments.js";
vi.mock("../lib/experiments.js", async (original) => ({ ...await original(), getExperiment: vi.fn(), estimateExperiment: vi.fn(), mutateExperiment: vi.fn(), updateExperimentVariant: vi.fn(), deleteExperiment: vi.fn() }));
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
it("shows a confirmed image rejection and estimates retry without starting another render", async () => {
  experiment.status = "failed";
  experiment.error = "provider_result_rejected";
  experiment.variants[0].status = "failed";
  experiment.variants[0].error = "provider_result_rejected";
  experiment.variants[0].slides = [{ index: 0, status: "failed", url: null, error: "provider_result_rejected" }];
  mount();
  expect(await screen.findByText("Recover known failures")).toBeInTheDocument();
  expect(screen.getAllByText(/provider_result_rejected/).length).toBeGreaterThan(0);
  expect(screen.queryByText(/A provider outcome is unknown/)).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: "Estimate retry of known failures" }));
  expect(await screen.findByRole("button", { name: "Approve & start retry" })).toBeEnabled();
  expect(api.estimateExperiment).toHaveBeenCalledWith("token", "w1", "e1", "generate", ["v1"], expect.any(AbortSignal), undefined);
  expect(api.mutateExperiment).not.toHaveBeenCalled();
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
  useExperimentList.mockReturnValue({ data: [{ id: "e9", workspaceId: "w1", status: "completed", instructions: { goal: "My grid test" }, variantCount: 2, slideCount: 3, creditsCharged: 5, maxCredits: 100, createdAt: new Date(Date.now() - 7200 * 1000).toISOString(), variants: [{ slides: [{ index: 0, url: "https://example.test/a.jpg", status: "done" }] }] }], isPending: false, isError: false, refetch: vi.fn() });
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
it("resends the same key after a lost mutation response", async () => {
  api.mutateExperiment.mockRejectedValueOnce(new Error("Network lost")); mount(); await screen.findByText("Question hook"); fireEvent.click(screen.getByRole("button", { name: "Estimate selected generation" })); fireEvent.click(await screen.findByRole("button", { name: "Approve & start generation" }));
  fireEvent.click(await screen.findByRole("button", { name: "Recheck original request" }));
  await waitFor(() => expect(api.mutateExperiment).toHaveBeenCalledTimes(2)); expect(api.mutateExperiment.mock.calls[0][4]).toEqual(api.mutateExperiment.mock.calls[1][4]);
});
