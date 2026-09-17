import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link, Navigate, useParams } from "react-router-dom";
import { useQueryClient } from "@tanstack/react-query";
import { T, fD } from "../lib/theme.js";
import { useAuth } from "../lib/auth.jsx";
import { useWorkspace } from "../lib/workspace.jsx";
import { SectionLabel, Spinner } from "../components/ui.jsx";
import WorkspaceSwitcher from "../components/WorkspaceSwitcher.jsx";
import { ExperimentButton } from "../components/ExperimentCreate.jsx";
import ExperimentVariant from "../components/ExperimentVariant.jsx";
import { experimentKey, useExperimentDetail, useExperimentList } from "../lib/useExperiments.js";
import { errorText, estimateBlockReason, estimateExperiment, hasUnknownOutcome, isExperimentActive, mutateExperiment, mutationKey, updateExperimentVariant } from "../lib/experiments.js";
import { downloadSlideshowZip } from "../lib/slideshowZip.js";
import { ScheduleDrawer } from "../calendar/ScheduleDrawer.jsx";
import { createApiAdapter } from "../lib/social.js";

const panel = { background: T.card, border: `1px solid ${T.line}` };
const displayValue = (value) => typeof value === "object" ? JSON.stringify(value) : String(value ?? "");
const canSelect = (v) => ["draft", "planned", "review", "ready", "needs_review"].includes(v.status) && !v.slides?.some((s) => s.url) && !hasUnknownOutcome(v.error);
function Status({ status }) { return <span className="rounded-full px-3 py-1 text-xs font-medium" style={{ background: T.paper, color: isExperimentActive({ status }) ? T.teal : T.ink }}>{status?.replaceAll("_", " ") || "draft"}</span>; }
function Chip({ children, tone }) { return <span className="rounded-full px-2.5 py-1 text-xs font-medium" style={{ background: T.paper, color: tone || T.muted }}>{children}</span>; }
const STAGE_COLOR = { done: T.teal, failed: "#9B2C23", active: T.teal, pending: T.muted };
function Stage({ label, note, state }) {
  const color = STAGE_COLOR[state] || T.muted;
  return <li aria-label={`${label}: ${state}${note ? `, ${note}` : ""}`} className="flex items-start gap-1.5 text-xs font-semibold min-w-0" style={{ color }}>
    <span aria-hidden="true" className={`inline-flex shrink-0 items-center justify-center w-4 h-4 rounded-full text-[10px] leading-none ${state === "active" ? "animate-pulse" : ""}`} style={{ background: state === "pending" ? T.line : color, color: "white" }}>{state === "done" ? "✓" : state === "failed" ? "!" : ""}</span>
    <span>{label}<span className="sr-only"> · {state}</span>{note && <span className="block font-normal" style={{ color: T.muted }}>{note}</span>}</span>
  </li>;
}
function Pipeline({ experiment, completedInputs }) {
  const total = experiment.inputs?.length ?? 0;
  const sourcesDone = total > 0 && completedInputs === total;
  const planning = ["analyzing", "synthesizing", "planning"].includes(experiment.status);
  const failed = experiment.status === "failed";
  const variants = experiment.variants ?? [];
  // Only count variants that entered generation, not every requested brief.
  const generated = variants.filter((v) => v.slides?.length || ["queued", "generating", "partial", "failed", "done", "completed"].includes(v.status));
  const slides = generated.flatMap((v) => v.slides ?? []);
  const imageCount = slides.filter((s) => s.url && !s.error && ["done", "completed"].includes(s.status)).length;
  const failedImages = slides.filter((s) => s.status === "failed" && !hasUnknownOutcome(s.error)).length;
  const expectedImages = generated.reduce((sum, v) => sum + Math.max(experiment.slideCount ?? 0, v.brief?.slides?.length ?? 0, v.slides?.length ?? 0), 0);
  const imageFailure = failedImages > 0 || generated.some((v) => ["failed", "partial"].includes(v.status) && !hasUnknownOutcome(v));
  const imageUnknown = experiment.status === "paused" || hasUnknownOutcome(experiment.error) || generated.some((v) => hasUnknownOutcome(v));
  const imagesActive = experiment.status === "generating" || generated.some((v) => ["queued", "generating"].includes(v.status));
  const stages = [
    { label: "Sources", note: total ? `${completedInputs}/${total}` : "", state: sourcesDone ? "done" : experiment.inputs?.some((i) => i.status === "failed" && !hasUnknownOutcome(i.error)) ? "failed" : planning ? "active" : "pending" },
    { label: "Patterns", note: "", state: experiment.report ? "done" : planning && (sourcesDone || experiment.status === "synthesizing") ? "active" : failed && sourcesDone ? "failed" : "pending" },
    { label: "Briefs", note: "", state: variants.length > 0 ? "done" : planning && experiment.report ? "active" : failed && experiment.report ? "failed" : "pending" },
    { label: "Images", note: `${imageCount}${expectedImages ? `/${expectedImages}` : ""} ready${failedImages ? ` · ${failedImages} failed` : ""}`, state: imageUnknown ? "pending" : imagesActive ? "active" : imageFailure ? "failed" : expectedImages > 0 && imageCount === expectedImages ? "done" : "pending" },
  ];
  return <ol aria-label="Experiment stages" className="grid grid-cols-2 sm:grid-cols-4 gap-x-4 gap-y-3">{stages.map((s) => <Stage key={s.label} {...s} />)}</ol>;
}

export default function Experiments() {
  const { user, loading, accessToken } = useAuth();
  const { activeWorkspaceId } = useWorkspace();
  const { experimentId } = useParams();
  if (loading) return <div className="py-24 text-center"><Spinner /></div>;
  if (!user) return <Navigate to={`/login?next=${encodeURIComponent(experimentId ? `/experiments/${experimentId}` : "/experiments")}`} replace />;
  return <main className="max-w-6xl mx-auto px-5 py-12 min-h-[70vh]">
    <SectionLabel>EXPERIMENTS</SectionLabel>
    <div className="mt-3 flex flex-wrap items-start justify-between gap-4"><div><h1 style={{ ...fD, fontSize: 32, fontWeight: 900, letterSpacing: -0.8 }}>From evidence to variants</h1></div><Link to="/gallery" className="rounded-lg px-4 py-2 text-sm font-semibold" style={{ background: T.signal, color: "white" }}>Select Gallery originals</Link></div>
    <div className="my-6"><WorkspaceSwitcher /></div>
    {!activeWorkspaceId ? <p className="text-sm" style={{ color: T.muted }}>Choose or create a workspace to view experiments.</p> : experimentId ? <ExperimentDetail key={`${accessToken}:${activeWorkspaceId}:${experimentId}`} accessToken={accessToken} workspaceId={activeWorkspaceId} experimentId={experimentId} /> : <ExperimentList key={`${accessToken}:${activeWorkspaceId}`} accessToken={accessToken} workspaceId={activeWorkspaceId} />}
  </main>;
}

export function ExperimentList({ accessToken, workspaceId }) {
  const query = useExperimentList({ accessToken, workspaceId });
  if (query.isPending) return <p role="status">Loading experiments…</p>;
  if (query.isError) return <div role="alert">{query.error.message} <ExperimentButton onClick={() => query.refetch()}>Refresh list</ExperimentButton></div>;
  if (!query.data.length) return <div className="rounded-xl p-8" style={panel}><h2 style={{ ...fD, fontWeight: 800, fontSize: 22 }}>Your first experiment starts in Gallery</h2><p className="mt-2 text-sm" style={{ color: T.muted }}>Select up to 20 original posts, set a credit ceiling, and create a draft. Nothing runs until you approve its estimate.</p><Link to="/gallery" className="inline-block mt-4 text-sm underline">Choose originals</Link></div>;
  return <div className="space-y-3">{query.data.filter((e) => !e.workspaceId || e.workspaceId === workspaceId).map((e) => <Link key={e.id} to={`/experiments/${encodeURIComponent(e.id)}`} className="block rounded-xl p-5 hover:shadow-sm" style={panel}><div className="flex flex-wrap items-center justify-between gap-3"><h2 style={{ ...fD, fontSize: 20, fontWeight: 800 }}>{e.instructions?.goal || e.title || "Untitled experiment"}</h2><Status status={e.status} /></div><p className="text-sm mt-3" style={{ color: T.muted }}>{e.variantCount ?? e.variants?.length ?? 0} variants · {e.slideCount ?? "—"} slides each · {e.creditsCharged ?? 0}/{e.maxCredits ?? "—"} credits{e.createdAt ? ` · ${new Date(e.createdAt).toLocaleDateString()}` : ""}</p></Link>)}</div>;
}

export function ExperimentDetail({ accessToken, workspaceId, experimentId }) {
  const query = useExperimentDetail({ accessToken, workspaceId, experimentId });
  const qc = useQueryClient();
  const [selected, setSelected] = useState([]);
  const [dirty, setDirty] = useState({});
  const [approval, setApproval] = useState(null);
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState("");
  const [notice, setNotice] = useState("");
  const [allowPartial, setAllowPartial] = useState(false);
  const [schedule, setSchedule] = useState(null);
  const [uncertain, setUncertain] = useState(null);
  const mounted = useRef(true);
  const lock = useRef(false);
  const estimateAbort = useRef(null);
  const requestKeys = useRef(new Map());
  const adapter = useMemo(() => createApiAdapter(accessToken), [accessToken]);
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; estimateAbort.current?.abort(); }; }, []);
  const onDirty = useCallback((id, value) => { setDirty((prev) => ({ ...prev, [id]: value })); if (value) setApproval(null); }, []);
  const experiment = query.data;
  const variants = experiment?.variants ?? [];
  const active = isExperimentActive(experiment);
  const anyDirty = Object.values(dirty).some(Boolean);
  const selectedVariants = variants.filter((v) => selected.includes(v.id) && canSelect(v));
  const snapshot = JSON.stringify({ updatedAt: experiment?.updatedAt, status: experiment?.status, variants: variants.map((v) => [v.id, v.revision, v.status]), selected });
  const currentSnapshot = useRef(snapshot); currentSnapshot.current = snapshot;
  const approvalCurrent = approval?.snapshot === snapshot;
  const unknown = experiment?.status === "paused" || hasUnknownOutcome(experiment?.error) || variants.some((v) => hasUnknownOutcome(v.error) || v.slides?.some((s) => hasUnknownOutcome(s.error))) || experiment?.inputs?.some((i) => hasUnknownOutcome(i.error));
  const knownFailed = variants.filter((v) => !hasUnknownOutcome(v) && (v.status === "failed" || v.status === "partial" || v.slides?.some((s) => s.status === "failed")));

  function stableKey(action, payload) {
    const fingerprint = JSON.stringify({ action, payload, version: experiment.updatedAt });
    if (!requestKeys.current.has(fingerprint)) requestKeys.current.set(fingerprint, mutationKey(`${workspaceId}:${experimentId}:${action}`, fingerprint));
    return requestKeys.current.get(fingerprint);
  }
  async function sync(result) {
    if (result?.experiment?.workspaceId === workspaceId) qc.setQueryData(experimentKey(accessToken, workspaceId, experimentId), result.experiment);
    else if (experiment) qc.setQueryData(experimentKey(accessToken, workspaceId, experimentId), { ...experiment, status: "queued" });
    await qc.invalidateQueries({ queryKey: experimentKey(accessToken, workspaceId) });
  }
  async function prepare(action, stage, payload = {}) {
    if (lock.current || active || anyDirty || unknown) return;
    lock.current = true; setBusy(true); setProblem(""); setApproval(null);
    const version = snapshot;
    estimateAbort.current?.abort(); estimateAbort.current = new AbortController();
    try {
      const ids = payload.variants?.map((v) => v.id) ?? payload.variantIds;
      const estimate = await estimateExperiment(accessToken, workspaceId, experimentId, stage, ids, estimateAbort.current.signal);
      if (!mounted.current || version !== currentSnapshot.current) return;
      setApproval({ action, stage, payload, estimate, snapshot: version, idempotencyKey: stableKey(action, payload) });
    } catch (err) { if (mounted.current && !estimateAbort.current.signal.aborted) setProblem(err.message); }
    finally { lock.current = false; if (mounted.current) setBusy(false); }
  }
  async function dispatch(request) {
    if (lock.current) return;
    lock.current = true; setBusy(true); setProblem("");
    try {
      const result = await mutateExperiment(accessToken, workspaceId, experimentId, request.action, { ...request.payload, idempotencyKey: request.idempotencyKey });
      await sync(result);
      if (mounted.current) { setApproval(null); setUncertain(null); setNotice("Request accepted. Status updates are saved on the server."); }
    } catch (err) {
      await qc.invalidateQueries({ queryKey: experimentKey(accessToken, workspaceId) });
      if (mounted.current) {
        setProblem(err.status === 409 ? "The experiment changed. Refresh and review the latest revisions before continuing." : err.message);
        setApproval(null);
        if (!err.status || err.status >= 500) setUncertain(request);
      }
    } finally { lock.current = false; if (mounted.current) setBusy(false); }
  }
  async function saveVariant(variant, brief) {
    setApproval(null);
    try {
      const result = await updateExperimentVariant(accessToken, workspaceId, experimentId, variant.id, variant.revision, brief);
      // A queued-only PATCH must be refreshed, not overwrite the draft with a
      // fabricated revision. Generation stays disabled until refetch resolves.
      if (result?.experiment?.workspaceId === workspaceId) qc.setQueryData(experimentKey(accessToken, workspaceId, experimentId), result.experiment);
      const refreshed = await query.refetch({ throwOnError: true });
      const saved = refreshed.data?.variants?.find((v) => v.id === variant.id);
      if (!saved || saved.revision === variant.revision) throw new Error("Save is not confirmed yet. Refresh status before generating; your unsaved brief remains here.");
      if (mounted.current) setSelected((ids) => ids.filter((id) => id !== variant.id));
    } catch (err) { if (err.status === 409) await query.refetch(); throw err; }
  }
  async function download(variant, images) {
    setProblem("");
    try { const count = await downloadSlideshowZip(images, { fileName: `experiment-${experimentId}-${variant.id}.zip` }); if (mounted.current) setNotice(`Downloaded ${count}/${images.length} ready images${count < images.length ? "; some images could not be fetched" : ""}.`); }
    catch (err) { if (mounted.current) setProblem(err.message); }
  }
  if (query.isPending) return <p role="status">Loading experiment…</p>;
  if (query.isError && !experiment) return <div role="alert"><p>{query.error.message}</p><Link to="/experiments" className="underline text-sm">Back to experiments</Link> <ExperimentButton onClick={() => query.refetch()}>Refresh status</ExperimentButton></div>;
  if (!experiment) return null;
  const hasOutputs = variants.some((v) => v.slides?.some((slide) => slide.url));
  const blockReason = approval && estimateBlockReason(approval.estimate, experiment);
  const completedInputs = experiment.inputs?.filter((i) => ["completed", "done", "ready", "analyzed"].includes(i.status)).length ?? 0;
  return <div className="space-y-6">
    <Link to="/experiments" className="text-sm underline">All experiments</Link>
    <section className="rounded-xl p-5 sm:p-6 space-y-4" style={panel}>
      <div className="flex flex-wrap justify-between gap-3"><h2 style={{ ...fD, fontSize: 26, fontWeight: 800 }}>{experiment.instructions?.goal || "Experiment"}</h2><Status status={experiment.status} /></div>
      <div className="flex flex-wrap gap-2"><Chip>{experiment.instructions?.mode === "exploration" ? "Exploration" : "One-variable test"}</Chip><Chip>{experiment.variantCount} variants × {experiment.slideCount} slides</Chip><Chip>{experiment.creditsCharged ?? 0}/{experiment.maxCredits} credits used</Chip><Chip>Manual publishing</Chip></div>
      <Pipeline experiment={experiment} completedInputs={completedInputs} />
      <details><summary className="text-sm cursor-pointer">Your saved inputs & rules</summary><dl className="mt-3 grid sm:grid-cols-2 gap-3 text-sm">{Object.entries(experiment.instructions ?? {}).map(([key, value]) => <div key={key}><dt className="font-semibold">{({ goal: "Goal", brand: "Brand", audience: "Audience", language: "Language", direction: "Creative direction", lockedConstraints: "Keep unchanged", mode: "Test mode", variables: "What may change" })[key] || key}</dt><dd className="whitespace-pre-wrap break-words" style={{ color: T.muted }}>{key === "mode" ? value === "controlled" ? "Change one thing at a time" : "Explore combinations" : key === "variables" ? value.map((v) => ({ visualStyle: "Visual style", cta: "Call to action" })[v] || v).join(", ") : Array.isArray(value) ? value.join("\n") : displayValue(value) || "Not specified"}</dd></div>)}</dl></details>
      <div className="flex flex-wrap gap-2"><ExperimentButton onClick={() => query.refetch()} disabled={busy || query.isFetching}>Refresh status</ExperimentButton>{active && <ExperimentButton disabled={busy} onClick={() => dispatch({ action: "cancel", payload: {}, idempotencyKey: stableKey("cancel", {}) })}>Cancel queued work</ExperimentButton>}</div>
      {active && <p role="status" className="text-sm" style={{ color: T.teal }}>Running in background · Cancel stops queued work only.</p>}
      {experiment.error && <p role="alert" style={{ color: "#9B2C23" }}>{errorText(experiment.error)}</p>}
    </section>
    {(problem || query.isError) && <p role="alert" className="rounded-lg p-4 text-sm" style={{ background: "#FFF0E8", color: "#9B2C23" }}>{problem || query.error.message}</p>}
    {notice && <p role="status" className="text-sm" style={{ color: T.teal }}>{notice}</p>}
    {unknown && <p role="alert" className="rounded-lg p-4 text-sm" style={panel}>A provider outcome is unknown. Paid actions paused to avoid duplicate charges. Refresh or contact support.</p>}
    {uncertain && !unknown && <div className="rounded-lg p-4 text-sm space-y-3" style={panel}><p>Response lost. Recheck the same request safely.</p><ExperimentButton disabled={busy} onClick={() => dispatch(uncertain)}>Recheck original request</ExperimentButton></div>}
    {variants.length > 0 && <section className="space-y-4"><div className="flex flex-wrap items-center justify-between gap-3"><div><h2 style={{ ...fD, fontWeight: 800, fontSize: 24 }}>{hasOutputs ? "Generated results" : "Review variant briefs"}</h2><p className="text-sm mt-1" style={{ color: T.muted }}>{anyDirty ? "Unsaved changes — save or discard first." : hasOutputs ? "Review images before use." : `${selectedVariants.length} selected`}</p></div><ExperimentButton primary disabled={busy || active || unknown || !!uncertain || anyDirty || !selectedVariants.length} onClick={() => prepare("generate", "generate", { variants: selectedVariants.map((v) => ({ id: v.id, revision: v.revision })) })}>Estimate selected generation</ExperimentButton></div>{variants.map((v, i) => <ExperimentVariant key={`${v.id}:${v.revision}`} variant={v} baseline={variants.find((b) => b.id === v.baselineId)} expectedSlideCount={experiment.slideCount} index={i} selected={selected.includes(v.id)} selectable={canSelect(v) && !active && !unknown && !uncertain} busy={busy} onSelect={() => { setSelected((ids) => ids.includes(v.id) ? ids.filter((id) => id !== v.id) : [...ids, v.id]); setApproval(null); }} onSave={saveVariant} onDirty={onDirty} onDownload={download} onSchedule={(variant, images) => setSchedule({ variant, images })} />)}</section>}
    <details open={!hasOutputs} className="rounded-xl p-5" style={panel}><summary className="cursor-pointer font-semibold">Source analysis & pattern report</summary><section className="mt-4"><h2 style={{ ...fD, fontWeight: 800, fontSize: 20 }}>Source analysis <span className="text-sm font-normal" style={{ color: T.muted }}>{completedInputs}/{experiment.inputs?.length ?? 0} ready</span></h2><div className="mt-3 space-y-2">{experiment.inputs?.map((input) => <div key={input.videoId} className="flex flex-wrap justify-between gap-2 text-sm rounded-lg p-3" style={{ background: T.paper }}><Link to={`/gallery?video=${encodeURIComponent(input.videoId)}`} className="underline break-all">Original {(experiment.inputs?.indexOf(input) ?? 0) + 1}</Link><span>{input.status}{input.error ? ` · ${errorText(input.error)}` : ""}{input.coverage ? ` · Coverage: ${displayValue(input.coverage)}` : ""}</span></div>)}</div></section>
    {experiment.report && <section className="rounded-xl p-5 sm:p-6" style={panel}><SectionLabel>PATTERN REPORT</SectionLabel><h2 style={{ ...fD, fontWeight: 800, fontSize: 22 }} className="mt-2">What the originals have in common</h2><p className="mt-3 text-sm whitespace-pre-wrap">{experiment.report.summary}</p>{experiment.report.coverage && <p className="mt-2 text-xs" style={{ color: T.muted }}>Coverage: {displayValue(experiment.report.coverage)}</p>}<div className="grid md:grid-cols-2 gap-4 mt-5">{experiment.report.patterns?.map((pattern) => <article key={pattern.id} className="rounded-lg p-4 space-y-2" style={{ border: `1px solid ${T.line}` }}><h3 className="font-semibold">{pattern.name}</h3><p className="text-sm">{pattern.description}</p><p className="text-xs" style={{ color: T.muted }}>Confidence: {displayValue(pattern.confidence) || "not provided"} · Frequency: {displayValue(pattern.frequency) || "not provided"} · {pattern.sourceIds?.length ?? 0} sources</p><details><summary className="text-sm cursor-pointer">Source evidence</summary><ul className="text-sm space-y-2 mt-2">{pattern.evidence?.map((e, i) => <li key={i}><Link className="underline" to={`/gallery?video=${encodeURIComponent(e.videoId)}`}>{e.videoId}</Link> · {displayValue(e.location)}<p style={{ color: T.muted }}>{e.observation}</p></li>)}</ul></details></article>)}</div></section>}
    </details>
    {!active && experiment.status === "draft" && <section className="rounded-xl p-5 space-y-3" style={panel}><h2 className="font-semibold">Ready to find the patterns?</h2><p className="text-sm" style={{ color: T.muted }}>Review briefs before approving images.</p><label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={allowPartial} onChange={(e) => { setAllowPartial(e.target.checked); setApproval(null); }} />Allow planning from successfully analyzed sources if some fail</label><ExperimentButton primary disabled={busy || unknown || !!uncertain} onClick={() => prepare("plan", "plan", { allowPartial })}>Estimate analysis & planning</ExperimentButton></section>}

    {!active && !unknown && (["failed", "partial"].includes(experiment.status) || knownFailed.length > 0) && <section className="rounded-xl p-5 space-y-3" style={panel}><h2 className="font-semibold">Recover known failures</h2><p className="text-sm" style={{ color: T.muted }}>Completed images are kept.</p><ExperimentButton disabled={busy || anyDirty || !!uncertain} onClick={() => prepare("retry", knownFailed.length ? "generate" : "plan", knownFailed.length ? { variantIds: knownFailed.map((v) => v.id) } : {})}>Estimate retry of known failures</ExperimentButton></section>}
    {approval && <section aria-label="Approve credit estimate" className="rounded-xl p-5 space-y-4" style={{ ...panel, borderColor: T.teal }}><h2 style={{ ...fD, fontWeight: 800, fontSize: 22 }}>Review credit estimate</h2><dl className="grid grid-cols-2 sm:grid-cols-5 gap-3 text-sm">{[["Analysis", approval.estimate.analysisCredits], ["Planning", approval.estimate.planningCredits], ["Generation", approval.estimate.generationCredits], ["Total", approval.estimate.totalCredits], ["Available", approval.estimate.remainingCredits]].map(([label, value]) => <div key={label}><dt style={{ color: T.muted }}>{label}</dt><dd className="font-semibold text-lg">{value ?? "—"}</dd></div>)}</dl><div className="flex flex-wrap gap-2"><Chip>Paid {approval.stage === "plan" ? "analysis & planning" : "generation"}</Chip><Chip>{experiment.maxCredits}-credit cap</Chip></div>{(!approvalCurrent || blockReason) && <p role="alert" className="text-sm" style={{ color: "#9B2C23" }}>{!approvalCurrent ? "The experiment changed. Request a fresh estimate." : blockReason}</p>}<div className="flex flex-wrap gap-2"><ExperimentButton primary disabled={busy || active || anyDirty || unknown || !approvalCurrent || !!blockReason} onClick={() => dispatch(approval)}>Approve & start {approval.action === "retry" ? "retry" : approval.stage === "plan" ? "planning" : "generation"}</ExperimentButton><ExperimentButton disabled={busy} onClick={() => setApproval(null)}>Dismiss estimate</ExperimentButton></div></section>}
    {schedule && <ScheduleDrawer key={schedule.variant.id} adapter={adapter} mode="create" mediaIsRecreated initialContent={schedule.variant.brief?.caption ?? ""} initialMedia={schedule.images.map((url) => ({ type: "image", url }))} initialDate={new Date()} onClose={() => setSchedule(null)} onSaved={() => { setSchedule(null); setNotice("Scheduling action saved. View Calendar for its publishing status."); }} onError={(err) => setProblem(err.message)} />}
  </div>;
}
