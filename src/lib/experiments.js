import { apiFetch } from "./http.js";

export const SOURCE_LIMIT = 20;
export const ACTIVE_EXPERIMENT_STATES = new Set(["queued", "analyzing", "synthesizing", "planning", "generating", "running"]);
export const isExperimentActive = (experiment) => ACTIVE_EXPERIMENT_STATES.has(experiment?.status);
export const experimentPollInterval = (query) => isExperimentActive(query.state.data) ? 2500 : false;
export const errorText = (error) => typeof error === "string" ? error : error?.message || error?.code || "";
export function hasUnknownOutcome(value) {
  if (!value) return false;
  return /unknown|indeterminate|uncertain|reconcil|outcome_pending/i.test(JSON.stringify(value));
}
export function toggleSource(ids, id) {
  return ids.includes(id) ? ids.filter((item) => item !== id) : ids.length < SOURCE_LIMIT ? [...ids, id] : ids;
}
export function validateExperiment(input) {
  if (!input.workspaceId) return "Choose a workspace.";
  if (!Array.isArray(input.videoIds) || input.videoIds.length < 1 || input.videoIds.length > SOURCE_LIMIT || new Set(input.videoIds).size !== input.videoIds.length) return "Select 1–20 distinct Gallery originals.";
  if (!Number.isInteger(input.variantCount) || input.variantCount < 1 || input.variantCount > 12) return "Choose 1–12 variants, including the baseline.";
  if (!Number.isInteger(input.slideCount) || input.slideCount < 3 || input.slideCount > 8) return "Choose 3–8 slides per variant.";
  if (!Number.isFinite(input.maxCredits) || input.maxCredits <= 0) return "Enter an explicit credit ceiling greater than zero.";
  if (!input.instructions?.goal?.trim()) return "Enter a goal for this experiment.";
  if (!input.instructions?.variables?.length) return "Choose at least one variable to test.";
  return "";
}
// Mirror of backend CREDIT_COSTS (slashloop src/lib/credits.ts) — used only for
// live UI estimates; the server's pricing stays the billing authority.
export const EXPERIMENT_CREDIT_COSTS = { analyzeVideo: 5, planningCall: 2, slide: 2 };
export function estimateExperimentCredits(videoCount, variantCount, slideCount) {
  const start = videoCount * EXPERIMENT_CREDIT_COSTS.analyzeVideo + 2 * EXPERIMENT_CREDIT_COSTS.planningCall;
  const generation = variantCount * slideCount * EXPERIMENT_CREDIT_COSTS.slide;
  return { start, generation, total: start + generation };
}

// Persist only request fingerprints and random keys (not tokens or briefs).
// An identical request after a lost response or page refresh keeps its key.
export function mutationKey(scope, payload) {
  const text = JSON.stringify(payload);
  let hash = 2166136261;
  for (let i = 0; i < text.length; i++) hash = Math.imul(hash ^ text.charCodeAt(i), 16777619);
  const storageKey = `slashloop:experiment:${scope}:${(hash >>> 0).toString(16)}`;
  try {
    const existing = sessionStorage.getItem(storageKey);
    if (existing) return existing;
  } catch { /* storage may be unavailable */ }
  const key = globalThis.crypto?.randomUUID?.() || `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  try { sessionStorage.setItem(storageKey, key); } catch { /* same mounted action still retains its key */ }
  return key;
}

function requireScope(accessToken, workspaceId) {
  if (!accessToken) throw new Error("Not signed in.");
  if (!workspaceId) throw new Error("Choose a workspace.");
}
const pathFor = (id) => `/api/experiments/${encodeURIComponent(id)}`;
export async function listExperiments(accessToken, workspaceId, signal) {
  requireScope(accessToken, workspaceId);
  const result = await apiFetch(`/api/experiments?${new URLSearchParams({ workspaceId })}`, { accessToken, signal });
  return result.experiments ?? [];
}
export async function getExperiment(accessToken, workspaceId, id, signal) {
  requireScope(accessToken, workspaceId);
  const result = await apiFetch(`${pathFor(id)}?${new URLSearchParams({ workspaceId })}`, { accessToken, signal });
  if (result.experiment?.workspaceId !== workspaceId) throw new Error("Experiment not found in this workspace.");
  return result.experiment;
}
export function createExperiment(accessToken, input) {
  requireScope(accessToken, input.workspaceId);
  const problem = validateExperiment(input);
  if (problem) throw new Error(problem);
  return apiFetch("/api/experiments", { method: "POST", accessToken, body: input });
}
export async function estimateExperiment(accessToken, workspaceId, id, stage, variantIds, signal, taskIds) {
  requireScope(accessToken, workspaceId);
  const result = await apiFetch(`${pathFor(id)}/estimate`, {
    method: "POST", accessToken, signal, body: { workspaceId, stage, ...(variantIds ? { variantIds } : {}), ...(taskIds ? { taskIds } : {}) },
  });
  if (!result.estimate || !Number.isFinite(result.estimate.totalCredits)) throw new Error("The server did not return a valid credit estimate. No work was started.");
  return result.estimate;
}
export function mutateExperiment(accessToken, workspaceId, id, action, input = {}) {
  requireScope(accessToken, workspaceId);
  if (!["plan", "generate", "cancel", "retry"].includes(action)) throw new Error("Unsupported experiment action.");
  if (!input.idempotencyKey) throw new Error("An idempotency key is required.");
  return apiFetch(`${pathFor(id)}/${action}`, { method: "POST", accessToken, body: { ...input, workspaceId } });
}
export function updateExperimentVariant(accessToken, workspaceId, id, variantId, revision, brief) {
  requireScope(accessToken, workspaceId);
  return apiFetch(`${pathFor(id)}/variants/${encodeURIComponent(variantId)}`, {
    method: "PATCH", accessToken, body: { workspaceId, revision, brief },
  });
}
export async function deleteExperiment(accessToken, workspaceId, id) {
  requireScope(accessToken, workspaceId);
  return apiFetch(pathFor(id), { method: "DELETE", accessToken, body: { workspaceId } });
}
export function estimateBlockReason(estimate, experiment) {
  if (!estimate || !Number.isFinite(estimate.totalCredits) || estimate.totalCredits < 0) return "A valid estimate is required.";
  if (!Number.isFinite(estimate.remainingCredits)) return "Available credits could not be verified.";
  if (estimate.totalCredits > estimate.remainingCredits) return "Not enough credits. Add credits before continuing.";
  if (!Number.isFinite(experiment.maxCredits)) return "This experiment has no verified credit ceiling.";
  if (estimate.totalCredits + (experiment.creditsCharged ?? 0) > experiment.maxCredits) return "This estimate exceeds the experiment’s remaining credit ceiling.";
  return "";
}
