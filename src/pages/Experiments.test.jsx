import { fireEvent, render, screen, waitFor, cleanup } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { ExperimentDetail } from "./Experiments.jsx";
import * as api from "../lib/experiments.js";
vi.mock("../lib/experiments.js", async (original) => ({ ...await original(), getExperiment: vi.fn(), estimateExperiment: vi.fn(), mutateExperiment: vi.fn(), updateExperimentVariant: vi.fn() }));
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
  fireEvent.click(screen.getByRole("checkbox", { name: "Select for generation" }));
  fireEvent.click(screen.getByRole("button", { name: "Estimate selected generation" }));
  expect(await screen.findByRole("button", { name: "Approve & start generation" })).toBeEnabled();
  expect(api.estimateExperiment).toHaveBeenCalledWith("token", "w1", "e1", "generate", ["v1"], expect.any(AbortSignal));
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
  fireEvent.click(screen.getByRole("checkbox", { name: "Select for generation" })); fireEvent.click(screen.getByRole("button", { name: "Estimate selected generation" }));
  fireEvent.click(await screen.findByRole("button", { name: "Approve & start generation" }));
  await waitFor(() => expect(api.mutateExperiment).toHaveBeenCalledWith("token", "w1", "e1", "generate", expect.objectContaining({ variants: [{ id: "v1", revision: 3 }] })));
});
it("blocks an estimate over the explicit credit ceiling", async () => {
  api.estimateExperiment.mockResolvedValue({ totalCredits: 99, remainingCredits: 200 }); mount(); await screen.findByText("Question hook"); fireEvent.click(screen.getByRole("checkbox", { name: "Select for generation" })); fireEvent.click(screen.getByRole("button", { name: "Estimate selected generation" }));
  expect(await screen.findByRole("button", { name: "Approve & start generation" })).toBeDisabled(); expect(api.mutateExperiment).not.toHaveBeenCalled();
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
  expect(api.estimateExperiment).toHaveBeenCalledWith("token", "w1", "e1", "generate", ["v1"], expect.any(AbortSignal));
  expect(api.mutateExperiment).not.toHaveBeenCalled();
});
it("blocks paid actions for a paused experiment even without an error message", async () => {
  experiment.status = "paused";
  mount();
  expect(await screen.findByText(/A provider outcome is unknown/)).toBeInTheDocument();
  expect(screen.queryByRole("button", { name: /Estimate retry/ })).not.toBeInTheDocument();
  expect(screen.getByRole("button", { name: "Estimate selected generation" })).toBeDisabled();
});
it("resends the same key after a lost mutation response", async () => {
  api.mutateExperiment.mockRejectedValueOnce(new Error("Network lost")); mount(); await screen.findByText("Question hook"); fireEvent.click(screen.getByRole("checkbox", { name: "Select for generation" })); fireEvent.click(screen.getByRole("button", { name: "Estimate selected generation" })); fireEvent.click(await screen.findByRole("button", { name: "Approve & start generation" }));
  fireEvent.click(await screen.findByRole("button", { name: "Recheck original request" }));
  await waitFor(() => expect(api.mutateExperiment).toHaveBeenCalledTimes(2)); expect(api.mutateExperiment.mock.calls[0][4]).toEqual(api.mutateExperiment.mock.calls[1][4]);
});
