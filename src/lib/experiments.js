import { apiFetch } from "./http.js";

export const SOURCE_LIMIT = 20;
export const ACTIVE_EXPERIMENT_STATES = new Set(["queued", "analyzing", "synthesizing", "planning", "generating", "running"]);
export const isExperimentActive = (experiment) => ACTIVE_EXPERIMENT_STATES.has(experiment?.status);
export const experimentPollInterval = (query) => isExperimentActive(query.state.data) ? 2500 : false;
export const errorText = (error) => typeof error === "string" ? error : error?.message || error?.code || "";
/** Strip the engine's cause wrapper (experiments/engine.ts jobError) to the bare cause. */
export const bareErrorCause = (error) => {
  const raw = errorText(error);
  return raw.replace(/^provider_result_rejected:|^provider_outcome_unknown:/, "") || raw;
};
/**
 * What happened + what to do, for every cause the backend can put on a job or
 * experiment (src/experiments/engine.ts, providers.ts). Returns { what, fix }
 * or null when the cause is unknown — callers fall back to the raw text.
 */
export function explainExperimentError(error) {
  const cause = bareErrorCause(error);
  if (!cause) return null;
  const wave = /^all_candidates_failed\[(.+)\]$/.exec(cause);
  if (wave) return { what: "Every image candidate was rejected by the provider.", fix: `Provider said: ${wave[1]}. Retry the slide; if the reason is content-related, reword the overlay copy in the brief.` };
  const table = [
    [/credits_exhausted/, "OpenRouter credits ran out — no new images can render.", "Top up at openrouter.ai/settings/credits, then retry the failed jobs. Charged slides were refunded."],
    [/in_flight_budget/, "Too many parallel requests for the current OpenRouter balance — the in-flight budget is full.", "It retries automatically after the cooldown. A larger top-up raises this cap and removes it entirely above a threshold."],
    [/^auth/, "The provider API key was rejected.", "Check the OPENROUTER_API_KEY secret on the worker, then retry."],
    [/^rate_limited/, "The provider rate-limited this request.", "It retries automatically with backoff; use Retry if it stays stuck."],
    [/timeout|timed out/i, "The provider did not answer in time.", "It retries automatically; if it keeps timing out, retry later."],
    [/^provider_server/, "The provider had a server error.", "Usually transient — retry the job."],
    [/^gemini_rejected_(\d+)/, "Google's analysis endpoint rejected the request.", "Retry; a repeated 4xx means the source may need replacing."],
    [/^gemini_(invalid_json|empty_result)/, "The analysis model returned an unusable response.", "It retries automatically; persistent failures mean the source is hard to read — try a different original."],
    [/^media_unavailable/, "A source image or video could not be fetched.", "Re-check the original in Gallery, then retry."],
    [/^media_too_large|^visual_input_memory_limit/, "A source file is too large to analyze.", "Remove that original from the selection and pick a smaller one."],
    [/^unsupported_image/, "A source slide is in an unsupported image format.", "Replace that original with a JPG/PNG/WebP version."],
    [/^carousel_over_16/, "A source has more than 16 slides.", "Remove that original from the selection."],
    [/^video_over_180/, "A source video is longer than 3 minutes.", "Remove that original from the selection."],
    [/^source_not_found/, "A selected original no longer exists in this workspace.", "Remove it from the experiment and re-create or retry."],
    [/^source_hydration_failed/, "The source media could not be downloaded for analysis.", "Retry; if it repeats, the original may be gone from its platform."],
    [/^incomplete_visual_analysis/, "The analysis did not cover every slide of a source.", "It retries automatically; if it persists, the source may be unreadable."],
    [/^(grok|gemini)_invalid_json|^invalid_schema/, "The model returned malformed JSON.", "It retries automatically with the same inputs."],
    [/^brief_candidates_invalid/, "The planner could not produce usable variant briefs.", "It retries automatically; if all attempts fail, re-plan with a clearer goal."],
    [/^identical_storyboard/, "Two variants told the exact same story, which would test nothing.", "The planner retries automatically; add a direction hint to separate the angles."],
    [/^(unapproved_variable|not_one_variable|incorrect_changed_variables|incorrect_variable_value|baseline_has_changes)/, "The planner proposed changes outside the agreed variables.", "It retries automatically; if it persists, re-plan in exploration mode."],
    [/^variant_count/, "The planner returned the wrong number of variants.", "It retries automatically; large variant counts may deliver fewer variants than requested."],
    [/^locked_constraints/, "A brief drifted from the experiment's slide count or locked rules.", "It retries automatically."],
    [/^(duplicate_pattern|invalid_source_frequency|unverified_evidence)/, "The pattern report cited evidence that does not match the sources.", "It retries automatically."],
    [/^invalid_image_size/, "The provider returned a broken image.", "Retry the slide."],
    [/^(missing_frozen_brief|invalid_slide)/, "The variant's approved brief is missing or out of date.", "Re-request the estimate for that variant."],
    [/^openrouter_not_configured/, "The server has no OpenRouter API key set.", "Set the OPENROUTER_API_KEY secret on the worker."],
    [/^reference_/, "A reference image for this slide is unavailable.", "Retry; if it persists, check the original's slides in Gallery."],
    [/^insufficient_budget/, "Not enough app credits on this workspace for this task.", "Add credits on the Account page, then retry."],
    [/^preparation_failed/, "The job could not be prepared against the database.", "Retry; if it repeats, check the worker logs."],
  ];
  const hit = table.find(([match]) => match.test(cause));
  if (!hit) return null;
  return { what: hit[1], fix: hit[2] };
}
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
// Mirror of backend CREDIT_COSTS (slashloop src/lib/credits.ts) and SLIDE_FANOUT
// (slashloop src/experiments/schema.ts) — used only for live UI estimates; the
// server's pricing stays the billing authority.
export const EXPERIMENT_CREDIT_COSTS = { analyzeVideo: 5, planningCall: 2, slide: 10 };
export const SLIDE_FANOUT = 3;
export function estimateExperimentCredits(videoCount, variantCount, slideCount) {
  const start = videoCount * EXPERIMENT_CREDIT_COSTS.analyzeVideo + 2 * EXPERIMENT_CREDIT_COSTS.planningCall;
  const generation = variantCount * slideCount * EXPERIMENT_CREDIT_COSTS.slide * SLIDE_FANOUT;
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
export async function listExperiments(accessToken, workspaceId, signal, { limit = 12, offset = 0 } = {}) {
  requireScope(accessToken, workspaceId);
  const result = await apiFetch(`/api/experiments?${new URLSearchParams({ workspaceId, limit: String(limit), offset: String(offset) })}`, { accessToken, signal });
  return { experiments: result.experiments ?? [], nextOffset: result.nextOffset ?? null };
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
/** One call for many ids; the endpoint is best-effort per id and reports failures. */
export function deleteExperiments(accessToken, workspaceId, ids) {
  requireScope(accessToken, workspaceId);
  if (!Array.isArray(ids) || !ids.length) throw new Error("Select at least one experiment to delete.");
  return apiFetch("/api/experiments", { method: "DELETE", accessToken, body: { workspaceId, ids } });
}
/** Plan + pack wallet. remainingCredits is the experiment cap leftover, not spendable cash. */
export function walletCredits(estimate) {
  if (Number.isFinite(estimate?.workspaceCredits)) return estimate.workspaceCredits;
  if (Number.isFinite(estimate?.remainingCredits)) return estimate.remainingCredits;
  return NaN;
}
export function estimateBlockReason(estimate, experiment) {
  if (!estimate || !Number.isFinite(estimate.totalCredits) || estimate.totalCredits < 0) return "A valid estimate is required.";
  const wallet = walletCredits(estimate);
  if (!Number.isFinite(wallet)) return "Available credits could not be verified.";
  if (estimate.totalCredits > wallet) return "Not enough credits. Add credits before continuing.";
  if (!Number.isFinite(experiment.maxCredits)) return "This experiment has no verified credit ceiling.";
  return "";
}
