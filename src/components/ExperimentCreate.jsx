import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useQueryClient } from "@tanstack/react-query";
import { T, fD } from "../lib/theme.js";
import { createExperiment, estimateExperimentCredits, mutationKey, mutateExperiment, validateExperiment } from "../lib/experiments.js";
import { experimentKey } from "../lib/useExperiments.js";

export const experimentInputStyle = { width: "100%", padding: "9px 11px", borderRadius: 8, border: `1px solid ${T.line}`, background: T.card, color: T.ink, fontSize: 14 };
export function ExperimentButton({ children, primary, ...props }) {
  return <button type="button" {...props} className={`rounded-lg px-4 py-2 text-sm font-semibold ${props.disabled ? "opacity-50 cursor-not-allowed" : "hover:opacity-80"}`} style={{ background: primary ? T.signal : T.card, color: primary ? "white" : T.ink, border: `1px solid ${primary ? T.signal : T.line}` }}>{children}</button>;
}
export function ExperimentField({ label, children }) {
  return <label className="flex flex-col gap-1.5 text-sm" style={{ color: T.ink }}><span>{label}</span>{children}</label>;
}
const VARIABLES = { hook: "Hook", character: "Character", visualStyle: "Visual style", caption: "Caption", cta: "Call to action", concept: "Concept / angle", slides: "Slide structure" };
const EMPTY_FORM = { goal: "", brand: "", audience: "", language: "English", direction: "", lockedConstraints: "", mode: "controlled", variables: ["hook"], customValues: "", variantCount: 3, slideCount: 5, maxCredits: "" };
const EXAMPLES = {
  hooks: { label: "Compare opening hooks", goal: "Find an opening hook that encourages the first swipe", direction: "Use the selected originals as inspiration for one new story. Test opening hooks without changing the rest of the story.", lockedConstraints: "Keep the character, visual style and story order unchanged\nDo not invent facts or performance claims", variables: ["hook"], customValues: "A question versus a curiosity-led statement", variantCount: 2, slideCount: 3 },
  portraits: { label: "Portrait style pilot", goal: "Compare two visual treatments for a portrait guide", audience: "Adults interested in better portrait photos", direction: "Create a fictional adult portrait guide about lighting, grooming and posture. Use one continuous full-bleed photograph per slide, no collages or split-screen. Avoid medical claims and attractiveness rankings.", lockedConstraints: "Keep the same fictional adult character, clothing and slide story\nKeep captions readable and call to action at most six words", variables: ["visualStyle"], customValues: "Natural everyday photography versus polished editorial photography", variantCount: 2, slideCount: 3 },
  cta: { label: "Compare calls to action", goal: "Compare ways to invite a useful next step", direction: "Build one helpful slideshow from the reference patterns. Change only the final call to action between variants.", lockedConstraints: "Keep the story, character, hook and visual style unchanged\nNo unsupported promises", variables: ["cta"], customValues: "Invite a save versus invite a comment", variantCount: 2, slideCount: 3 },
};

function previewStorySlides(counts) {
  const usable = (counts ?? []).filter((n) => Number.isInteger(n) && n >= 1);
  if (!usable.length) return null;
  // 4+ slide decks usually end on a CTA; the server confirms from analysis.
  return Math.min(...usable.map((n) => Math.min(8, Math.max(3, n >= 4 ? n - 1 : n))));
}
export default function ExperimentCreate({ accessToken, workspaceId, videoIds, originalSlideCounts, onClose }) {
  const navigate = useNavigate();
  const qc = useQueryClient();
  const [form, setForm] = useState(EMPTY_FORM);
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState("");
  const inFlight = useRef(false);
  const mounted = useRef(true);
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, []);
  const keys = useRef(new Map());
  const set = (name, value) => setForm((prev) => ({ ...prev, [name]: value }));
  // Live estimate, recomputed on every keystroke. Server pricing stays the billing authority.
  const storySlides = previewStorySlides(originalSlideCounts) ?? (Number(form.slideCount) || 5);
  const est = estimateExperimentCredits(videoIds.length, Number(form.variantCount) || 0, storySlides);
  // Safety cap stays mandatory server-side; derived automatically instead of asked.
  const autoCap = Math.max(30, Math.ceil((est.total * 2) / 10) * 10);
  // Live validation: each field reports its own problem as you type.
  const errors = {
    goal: form.goal.trim() ? "" : "Goal is required — what should the experiment find out?",
    sources: videoIds.length >= 1 && videoIds.length <= 20 ? "" : `Select 1–20 originals in Gallery (currently ${videoIds.length}).`,
    variantCount: Number.isInteger(Number(form.variantCount)) && Number(form.variantCount) >= 1 && Number(form.variantCount) <= 12 ? "" : "Choose 1–12 variants.",
  };
  const firstProblem = errors.goal || errors.sources || errors.variantCount || "";
  async function submit(event) {
    event.preventDefault();
    if (inFlight.current) return;
    const { goal, brand, audience, language, direction, lockedConstraints, mode, variables, customValues, variantCount } = form;
    const input = { workspaceId, videoIds, variantCount: Number(variantCount), slideCount: storySlides, maxCredits: autoCap, instructions: { goal, brand, audience, language, direction: [direction, customValues && `Desired variable values: ${customValues}`].filter(Boolean).join("\n"), lockedConstraints: lockedConstraints.split("\n").map((s) => s.trim()).filter(Boolean), mode, variables } };
    const error = validateExperiment(input);
    if (error) { setProblem(error); return; }
    const fingerprint = JSON.stringify(input);
    if (!keys.current.has(fingerprint)) keys.current.set(fingerprint, mutationKey(`${workspaceId}:create`, input));
    inFlight.current = true; setBusy(true); setProblem("");
    try {
      const { experiment } = await createExperiment(accessToken, { ...input, idempotencyKey: keys.current.get(fingerprint) });
      await qc.invalidateQueries({ queryKey: experimentKey(accessToken, workspaceId) });
      if (!mounted.current) return;
      if (!experiment?.id) throw new Error("Draft submitted. Open Experiments to check its status, or retry this identical request safely.");
      // One click starts the run: this click is the planning approval — the
      // estimate on the button was the reviewer. Generation stays a separate gate.
      try {
        await mutateExperiment(accessToken, workspaceId, experiment.id, "plan", { workspaceId, allowPartial: false, idempotencyKey: mutationKey(`${workspaceId}:${experiment.id}:plan`, { fingerprint, plan: true }) });
        await qc.invalidateQueries({ queryKey: experimentKey(accessToken, workspaceId) });
      } catch (planErr) {
        if (mounted.current) setProblem(planErr.message || "Could not start planning.");
      }
      navigate(`/experiments/${encodeURIComponent(experiment.id)}`);
    } catch (err) { if (mounted.current) setProblem(err.message || "Could not create experiment. Retrying uses the same request key."); }
    finally { inFlight.current = false; if (mounted.current) setBusy(false); }
  }
  return <section className="my-6 rounded-xl p-5 sm:p-6" style={{ background: T.card, border: `1px solid ${T.line}` }} aria-label="Create experiment">
    <div className="flex flex-wrap items-start justify-between gap-3"><div><h2 style={{ ...fD, fontSize: 24, fontWeight: 800 }}>Create an experiment</h2><p className="mt-1 text-sm" style={{ color: T.muted }}>{videoIds.length} originals · starts for ≈{est.start} credits</p></div><ExperimentButton onClick={onClose} disabled={busy}>Close setup</ExperimentButton></div>
    <form onSubmit={submit} className="mt-5 space-y-5">
      <div className="rounded-lg p-4 space-y-2" style={{ background: T.paper }}>
        <ExperimentField label="Start from an example"><select defaultValue="" disabled={busy} onChange={(e) => { const example = EXAMPLES[e.target.value]; if (example) { const { label, ...values } = example; setForm((prev) => ({ ...EMPTY_FORM, ...values, brand: prev.brand, language: prev.language, maxCredits: prev.maxCredits })); } }} style={experimentInputStyle}><option value="" disabled>Choose an example, or write your own below</option>{Object.entries(EXAMPLES).map(([id, example]) => <option key={id} value={id}>{example.label}</option>)}</select></ExperimentField>
        <p className="text-xs" style={{ color: T.muted }}>Replaces creative inputs. Keeps brand, language and credit cap.</p>
      </div>
      <ExperimentField label="Goal *"><input required value={form.goal} onChange={(e) => set("goal", e.target.value)} aria-invalid={!!errors.goal} style={{ ...experimentInputStyle, borderColor: errors.goal ? "#B3261E" : T.line }} placeholder="Find the hook that earns the first swipe" /></ExperimentField>
      {errors.goal && <p role="status" className="text-xs -mt-3" style={{ color: "#B3261E" }}>✎ {errors.goal}</p>}
      <div className="grid sm:grid-cols-3 gap-4">{["brand", "audience", "language"].map((name) => <ExperimentField key={name} label={name[0].toUpperCase() + name.slice(1)}><input value={form[name]} onChange={(e) => set(name, e.target.value)} style={experimentInputStyle} /></ExperimentField>)}</div>
      <div className="grid sm:grid-cols-2 gap-4">
        <ExperimentField label="Creative direction"><textarea rows={3} value={form.direction} onChange={(e) => set("direction", e.target.value)} style={experimentInputStyle} /></ExperimentField>
        <ExperimentField label="Keep unchanged (one per line)"><textarea rows={3} value={form.lockedConstraints} onChange={(e) => set("lockedConstraints", e.target.value)} style={experimentInputStyle} placeholder="Keep product name unchanged" /></ExperimentField>
      </div>
      <ExperimentField label="Test mode"><select value={form.mode} onChange={(e) => setForm((prev) => ({ ...prev, mode: e.target.value, variables: e.target.value === "controlled" ? [prev.variables.find((v) => !["concept", "slides"].includes(v)) || "hook"] : prev.variables }))} style={experimentInputStyle}><option value="controlled">One-variable comparison</option><option value="exploration">Explore combinations</option></select></ExperimentField>
      {form.mode === "controlled" ? <ExperimentField label="What do you want to change?"><select value={form.variables[0]} onChange={(e) => set("variables", [e.target.value])} style={experimentInputStyle}>{Object.entries(VARIABLES).filter(([key]) => !["concept", "slides"].includes(key)).map(([key, label]) => <option key={key} value={key}>{label}</option>)}</select></ExperimentField> : <fieldset><legend className="text-sm mb-2">Variables to test</legend><div className="flex flex-wrap gap-3">{Object.entries(VARIABLES).map(([key, label]) => <label key={key} className="flex items-center gap-2 text-sm"><input type="checkbox" checked={form.variables.includes(key)} onChange={() => set("variables", form.variables.includes(key) ? form.variables.filter((v) => v !== key) : [...form.variables, key])} />{label}</label>)}</div></fieldset>}
      <ExperimentField label="Desired variable values (optional)"><input value={form.customValues} onChange={(e) => set("customValues", e.target.value)} style={experimentInputStyle} placeholder="Hook: question vs bold claim; character: founder" /></ExperimentField>
      <div className="grid sm:grid-cols-2 gap-4">
        <ExperimentField label="Variants (baseline included)"><input type="number" required min={1} max={12} step="1" value={form.variantCount} aria-invalid={!!errors.variantCount} onChange={(e) => set("variantCount", e.target.value)} style={{ ...experimentInputStyle, borderColor: errors.variantCount ? "#B3261E" : T.line }} />{errors.variantCount && <p className="text-xs m-0" style={{ color: "#B3261E" }}>✎ 1–12 variants</p>}</ExperimentField>
        <div className="flex flex-col gap-1.5 text-sm" style={{ color: T.ink }}><span>Slides per variant</span><p className="m-0 rounded-lg px-3 py-2" style={{ background: T.paper, border: `1px solid ${T.line}` }}><strong>{storySlides}</strong> story slides<span className="block text-xs font-normal mt-1" style={{ color: T.muted }}>From the originals. A call-to-action slide is omitted when the source has one.</span></p></div>
      </div>
      <p className="text-xs" style={{ color: T.muted }}>Auto stop at <strong>{autoCap} credits</strong> if anything runs away. Image generation is approved separately after brief review.</p>
      <section aria-label="What this experiment will produce" className="rounded-lg p-4 space-y-4" style={{ background: T.paper, border: `1px solid ${T.line}` }}>
        <h3 className="font-semibold">Output preview</h3>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          {[[videoIds.length, "originals", "▣"], [Number(form.variantCount) || "—", "decks", "▤"], [storySlides || "—", "slides / deck", "▥"], [Number(form.variantCount) * storySlides || "—", "images", "▧"]].map(([count, label, icon]) => <div key={label} className="rounded-lg p-3" style={{ background: T.card, border: `1px solid ${T.line}` }}><span aria-hidden="true" className="text-lg" style={{ color: T.teal }}>{icon}</span><p className="mt-1"><strong className="text-2xl" style={fD}>{count}</strong>{" "}<span className="text-xs" style={{ color: T.muted }}>{label}</span></p></div>)}
        </div>
        <div className="flex flex-wrap gap-2 text-xs font-medium">
          <span className="rounded-full px-3 py-1" style={{ background: T.card }}>1 baseline{Number(form.variantCount) > 1 ? ` + ${Number(form.variantCount) - 1} alternative${Number(form.variantCount) === 2 ? "" : "s"}` : " only"}</span>
          {Number(form.variantCount) > 1 && <span className="rounded-full px-3 py-1" style={{ background: T.card, color: T.teal }}>{form.mode === "controlled" ? `${VARIABLES[form.variables[0]]} changes` : "Combined changes"}</span>}
          <span className="rounded-full px-3 py-1" style={{ background: T.card }}>Manual publishing</span>
          <span className="rounded-full px-3 py-1" style={{ background: T.card, color: T.teal }}>✨ ≈{est.generation} credits for images</span>
        </div>
        <details><summary className="text-sm cursor-pointer">Review exact inputs</summary><dl className="mt-3 grid sm:grid-cols-2 gap-3 text-sm">{[["Goal", form.goal || "Add your goal above"], ["Audience", form.audience || "Not specified"], ["Brand", form.brand || "Not specified"], ["Language", form.language || "Not specified"], ["Creative direction", form.direction || "Use the source patterns"], ["Requested values", form.customValues || "Planner proposes values"], ["Keep unchanged", form.lockedConstraints || "No additional rules"], ["Spending cap", `${autoCap} credits (automatic)`]].map(([label, value]) => <div key={label}><dt className="font-semibold">{label}</dt><dd className="whitespace-pre-wrap break-words" style={{ color: T.muted }}>{value}</dd></div>)}</dl></details>
      </section>
      {problem && <p role="alert" className="text-sm" style={{ color: "#9B2C23" }}>{problem}</p>}
      <div className="flex flex-wrap items-center gap-3">
        <ExperimentButton primary type="submit" disabled={busy || !!firstProblem} title={firstProblem || undefined}>{busy ? "Starting…" : `✨ Start experiment · ≈${est.start} credits`}</ExperimentButton>
        {firstProblem && !busy && <span className="text-xs" style={{ color: "#B3261E" }}>✎ {firstProblem}</span>}
      </div>
    </form>
  </section>;
}
