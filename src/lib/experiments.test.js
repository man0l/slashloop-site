import { beforeEach, expect, it, vi } from "vitest";
import { apiFetch } from "./http.js";
import { createExperiment, estimateBlockReason, estimateExperiment, experimentPollInterval, explainExperimentError, getExperiment, listExperiments, mutateExperiment, mutationKey, SOURCE_LIMIT, toggleSource, updateExperimentVariant, validateExperiment, walletCredits } from "./experiments.js";
vi.mock("./http.js", () => ({ apiFetch: vi.fn() }));
beforeEach(() => { vi.clearAllMocks(); sessionStorage.clear(); });
const valid = () => ({ workspaceId: "w1", videoIds: ["v1"], variantCount: 3, slideCount: 5, maxCredits: 80, instructions: { goal: "Find a hook", mode: "controlled", variables: ["hook"] } });
it("scopes reads with workspace, token, encoded IDs and cancellation", async () => {
  const signal = new AbortController().signal; apiFetch.mockResolvedValueOnce({ experiments: [] }).mockResolvedValueOnce({ experiment: { id: "e/1", workspaceId: "w 1" } });
  await listExperiments("auth", "w 1", signal); await getExperiment("auth", "w 1", "e/1", signal);
  expect(apiFetch).toHaveBeenNthCalledWith(1, "/api/experiments?workspaceId=w+1", { accessToken: "auth", signal });
  expect(apiFetch).toHaveBeenNthCalledWith(2, "/api/experiments/e%2F1?workspaceId=w+1", { accessToken: "auth", signal });
});
it("refuses absent auth/workspace and foreign detail responses", async () => {
  await expect(listExperiments(null, "w1")).rejects.toThrow("Not signed in"); await expect(listExperiments("auth", null)).rejects.toThrow("workspace"); expect(apiFetch).not.toHaveBeenCalled();
  apiFetch.mockResolvedValue({ experiment: { workspaceId: "foreign" } }); await expect(getExperiment("auth", "w1", "e1")).rejects.toThrow("not found");
});
it("enforces original selection, variant and slide count bounds", () => {
  expect(validateExperiment(valid())).toBe("");
  for (const value of [0, 13, 1.5]) expect(validateExperiment({ ...valid(), variantCount: value })).not.toBe("");
  for (const value of [2, 9, 3.5]) expect(validateExperiment({ ...valid(), slideCount: value })).not.toBe("");
  for (const videoIds of [[], ["v1", "v1"], Array.from({ length: 21 }, (_, i) => String(i))]) expect(validateExperiment({ ...valid(), videoIds })).not.toBe("");
  expect(validateExperiment({ ...valid(), maxCredits: 0 })).not.toBe("");
  const ids = Array.from({ length: SOURCE_LIMIT }, (_, i) => String(i)); expect(toggleSource(ids, "extra")).toBe(ids); expect(toggleSource(ids, "0")).toHaveLength(19);
});
it("sends exact create, estimate, revision and selected generation contract", async () => {
  apiFetch.mockResolvedValue({ estimate: { totalCredits: 12 } });
  const input = { ...valid(), idempotencyKey: "stable" }; await createExperiment("auth", input);
  expect(apiFetch).toHaveBeenLastCalledWith("/api/experiments", { method: "POST", accessToken: "auth", body: input });
  await estimateExperiment("auth", "w1", "e1", "generate", ["v2"]);
  expect(apiFetch).toHaveBeenLastCalledWith("/api/experiments/e1/estimate", expect.objectContaining({ body: { workspaceId: "w1", stage: "generate", variantIds: ["v2"] } }));
  await updateExperimentVariant("auth", "w1", "e1", "v2", 7, { hook: "New hook" });
  expect(apiFetch).toHaveBeenLastCalledWith("/api/experiments/e1/variants/v2", { method: "PATCH", accessToken: "auth", body: { workspaceId: "w1", revision: 7, brief: { hook: "New hook" } } });
  await mutateExperiment("auth", "w1", "e1", "generate", { idempotencyKey: "stable", variants: [{ id: "v2", revision: 8 }] });
  expect(apiFetch).toHaveBeenLastCalledWith("/api/experiments/e1/generate", expect.objectContaining({ body: { workspaceId: "w1", idempotencyKey: "stable", variants: [{ id: "v2", revision: 8 }] } }));
});
it("keeps mutation keys stable across identical retries, separates changes and workspaces", () => {
  const first = mutationKey("w1:create", valid()); expect(mutationKey("w1:create", valid())).toBe(first); expect(mutationKey("w2:create", valid())).not.toBe(first); expect(mutationKey("w1:create", { ...valid(), slideCount: 6 })).not.toBe(first);
});
it("polls only active experiments", () => {
  for (const status of ["queued", "analyzing", "synthesizing", "planning", "generating", "running"]) expect(experimentPollInterval({ state: { data: { status } } })).toBe(2500);
  for (const status of ["draft", "review", "ready", "completed", "partial", "failed", "cancelled", "needs_review"]) expect(experimentPollInterval({ state: { data: { status } } })).toBe(false);
});
it("fails closed for missing estimates and unavailable credit balances", async () => {
  apiFetch.mockResolvedValue({ estimate: {} }); await expect(estimateExperiment("auth", "w1", "e1", "plan")).rejects.toThrow("valid credit estimate");
  expect(estimateBlockReason({ totalCredits: 10 }, { maxCredits: 80 })).toMatch(/verified/);
  expect(estimateBlockReason({ totalCredits: 10, remainingCredits: 5 }, { maxCredits: 80 })).toMatch(/Not enough/);
  expect(walletCredits({ workspaceCredits: 500, remainingCredits: 204 })).toBe(500);
  expect(estimateBlockReason({ totalCredits: 270, remainingCredits: 204, workspaceCredits: 500 }, { maxCredits: 210, creditsCharged: 6 })).toBe("");
  expect(estimateBlockReason({ totalCredits: 270, remainingCredits: 204, workspaceCredits: 204 }, { maxCredits: 210, creditsCharged: 6 })).toMatch(/Not enough/);
});

it("explains job causes with what happened and what to do", () => {
  const credits = explainExperimentError("provider_result_rejected:credits_exhausted_402");
  expect(credits.what).toMatch(/OpenRouter credits ran out/);
  expect(credits.fix).toMatch(/openrouter\.ai\/settings\/credits/);
  const wave = explainExperimentError("provider_result_rejected:all_candidates_failed[OpenRouter image error 400: policy | timeout]");
  expect(wave.what).toMatch(/Every image candidate/);
  expect(wave.fix).toMatch(/policy/);
  const timeout = explainExperimentError("provider_outcome_unknown:The operation timed out. The operation timed out.");
  expect(timeout.what).toMatch(/did not answer in time/);
  expect(explainExperimentError("provider_result_rejected:insufficient_budget").fix).toMatch(/Account page/);
  expect(explainExperimentError("something entirely novel")).toBe(null);
  expect(explainExperimentError("")).toBe(null);
});
