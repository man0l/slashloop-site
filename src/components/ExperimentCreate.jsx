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
export default function ExperimentCreate({ accessToken, workspaceId, videoIds, slideCountsByVideo, onClose }) {
  const navigate = useNavigate();
  const qc = useQueryClient();
  const [form, setForm] = useState(EMPTY_FORM);
  // Survey: step 1 picks the mode, step 2 fills the mode's form, step 3
  // reviews the output preview and starts. Both modes share the exact same
  // pipeline — edit adds one rule on top: strip the old overlay text from the
  // originals and keep their images.
  const [step, setStep] = useState(1);
  const [surveyMode, setSurveyMode] = useState("create");
  const [busy, setBusy] = useState(false);
  const [started, setStarted] = useState(0);
  const [problem, setProblem] = useState("");
  const inFlight = useRef(false);
  const mounted = useRef(true);
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, []);
  const keys = useRef(new Map());
  const set = (name, value) => setForm((prev) => ({ ...prev, [name]: value }));
  const isEdit = surveyMode === "edit";
  // Every selected original becomes its own experiment, so estimates and caps
  // are computed per source and summed. The briefs stage only ever sees one
  // source, which keeps two different concepts from merging into one brief.
  const fallbackSlides = Number(form.slideCount) || 5;
  const slidesFor = (id) => previewStorySlides([slideCountsByVideo?.[id]]) ?? fallbackSlides;
  const plan = videoIds.map((id) => {
    const slides = slidesFor(id);
    const one = estimateExperimentCredits(1, Number(form.variantCount) || 0, slides);
    return { id, slides, one, cap: Math.max(30, Math.ceil((one.total * 2) / 10) * 10) };
  });
  const est = plan.reduce((a, p) => ({ start: a.start + p.one.start, generation: a.generation + p.one.generation, total: a.total + p.one.total }), { start: 0, generation: 0, total: 0 });
  const caps = plan.map((p) => p.cap);
  const capLabel = new Set(caps).size > 1 ? `${Math.min(...caps)}–${Math.max(...caps)}` : String(caps[0] ?? 30);
  const capTotal = caps.reduce((a, b) => a + b, 0);
  const slideValues = [...new Set(plan.map((p) => p.slides))];
  const slidesLabel = slideValues.length > 1 ? `${Math.min(...slideValues)}–${Math.max(...slideValues)}` : String(slideValues[0] ?? fallbackSlides);
  // Live validation: each field reports its own problem as you type.
  const errors = {
    goal: form.goal.trim() ? "" : "Goal is required — what should the experiment find out?",
    sources: videoIds.length >= 1 && videoIds.length <= 20 ? "" : `Select 1–20 originals in Gallery (currently ${videoIds.length}).`,
    variantCount: Number.isInteger(Number(form.variantCount)) && Number(form.variantCount) >= 1 && Number(form.variantCount) <= 12 ? "" : "Choose 1–12 variants.",
  };
  const firstProblem = errors.goal || errors.sources || errors.variantCount || "";
  const EDIT_RULE = "Edit the selected originals: strip every existing overlay text from the images, keep the images themselves unchanged, then apply the brief below.";
  async function submit(event) {
    event.preventDefault();
    if (inFlight.current) return;
    const { goal, brand, audience, language, direction, lockedConstraints, mode, variables, customValues, variantCount } = form;
    const validation = errors.goal || errors.sources || errors.variantCount;
    if (validation) { setProblem(validation); return; }
    inFlight.current = true; setBusy(true); setProblem(""); setStarted(0);
    const failures = [];
    let startedCount = 0;
    let lastId = null;
    try {
      for (const p of plan) {
        // One isolated experiment per original — briefs never mix sources.
        const input = {
          workspaceId,
          videoIds: [p.id],
          variantCount: Number(variantCount),
          slideCount: p.slides,
          maxCredits: p.cap,
          instructions: {
            goal, brand, audience, language,
            direction: [isEdit && EDIT_RULE, direction, customValues && `Desired variable values: ${customValues}`].filter(Boolean).join("\n"),
            lockedConstraints: lockedConstraints.split("\n").map((s) => s.trim()).filter(Boolean),
            mode, variables,
          },
        };
        const invalid = validateExperiment(input);
        if (invalid) { failures.push({ error: invalid }); continue; }
        const fingerprint = JSON.stringify(input);
        if (!keys.current.has(fingerprint)) keys.current.set(fingerprint, mutationKey(`${workspaceId}:create:${p.id}`, input));
        try {
          const { experiment } = await createExperiment(accessToken, { ...input, idempotencyKey: keys.current.get(fingerprint) });
          if (!experiment?.id) throw new Error("Draft submitted. Open Experiments to check its status, or retry this identical request safely.");
          lastId = experiment.id;
          try {
            // One click starts the run: this click is the planning approval — the
            // estimate on the button was the reviewer. Generation stays a separate gate.
            await mutateExperiment(accessToken, workspaceId, experiment.id, "plan", { workspaceId, allowPartial: false, idempotencyKey: mutationKey(`${workspaceId}:${experiment.id}:plan`, { fingerprint, plan: true }) });
          } catch (planErr) {
            // A retry after a lost response lands on an already-planned experiment.
            if (planErr?.status !== 409) throw planErr;
          }
          startedCount++;
          if (mounted.current) setStarted(startedCount);
        } catch (err) {
          failures.push({ error: err?.message || "Could not create experiment. Retrying uses the same request key." });
        }
      }
    } finally {
      inFlight.current = false;
      if (mounted.current) setBusy(false);
    }
    await qc.invalidateQueries({ queryKey: experimentKey(accessToken, workspaceId) });
    if (!mounted.current) return;
    if (failures.length) {
      setProblem(`Started ${startedCount} of ${plan.length} experiments. ${failures[0].error}${failures.length > 1 ? ` (+${failures.length - 1} more originals failed)` : ""} Starting again continues the rest — started originals are not duplicated.`);
      return;
    }
    navigate(plan.length === 1 && lastId ? `/experiments/${encodeURIComponent(lastId)}` : "/experiments");
  }
  const totalImages = plan.reduce((n, p) => n + (Number(form.variantCount) || 0) * p.slides, 0);
  return <section className="my-6 rounded-xl p-5 sm:p-6" style={{ background: T.card, border: `1px solid ${T.line}` }} aria-label="Create experiment">
    <div className="flex flex-wrap items-start justify-between gap-3"><div><h2 style={{ ...fD, fontSize: 24, fontWeight: 800 }}>Create {videoIds.length > 1 ? `${videoIds.length} experiments` : "an experiment"}</h2><p className="mt-1 text-sm" style={{ color: T.muted }}>{videoIds.length} original{videoIds.length === 1 ? "" : "s"}, one experiment each · starts for ≈{est.start} credits · step {step} of 3</p></div><ExperimentButton onClick={onClose} disabled={busy}>Close setup</ExperimentButton></div>
    <div className="mt-3 flex gap-1.5" aria-hidden="true">{[1, 2, 3].map((n) => <span key={n} className="h-1 flex-1 rounded" style={{ background: n <= step ? T.signal : T.line }} />)}</div>
    <form onSubmit={submit} className="mt-5 space-y-5">
      {step === 1 && <div className="grid sm:grid-cols-2 gap-3" role="radiogroup" aria-label="Experiment mode">
        {[["edit", "Edit slideshow", "Keep the same images. Strip the old overlay text, then run the full pipeline: choose what changes — hook, character, style, angle — and what stays locked. 1–20 originals."], ["create", "Create variations", "Generate new versions: hook, character, style, caption, call to action or angle. Up to 20 originals."]].map(([value, title, desc]) => <label key={value} className="rounded-lg p-4 cursor-pointer" style={{ background: T.paper, border: `2px solid ${surveyMode === value ? T.signal : T.line}` }}><input type="radio" name="survey-mode" value={value} checked={surveyMode === value} onChange={() => setSurveyMode(value)} /><strong className="block mt-1">{title}</strong><p className="text-sm m-0" style={{ color: T.muted }}>{desc}</p></label>)}
      </div>}
      {step === 2 && <>
      {isEdit && <p className="text-xs rounded-lg px-3 py-2" style={{ background: T.paper, border: `1px solid ${T.line}`, color: T.muted }}>The old overlay text is stripped from the selected originals first — the same images are then reused for every variant below.</p>}
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
      {form.mode === "controlled" ? <ExperimentField label="What do you want to change?"><select value={form.variables[0]} onChange={(e) => set("variables", [e.target.value])} style={experimentInputStyle}>{Object.entries(VARIABLES).filter(([key]) => !["concept", "slides"].includes(key)).map(([key, label]) => <option key={key} value={key}>{label}</option>)}</select></ExperimentField> : <fieldset><legend className="text-sm mb-2">Variables to test</legend><div className="flex flex-wrap gap-3">{Object.entries(VARIABLES).map(([key, label]) => <label key={key} className="flex items-center gap-3 text-sm"><input type="checkbox" checked={form.variables.includes(key)} onChange={() => set("variables", form.variables.includes(key) ? form.variables.filter((v) => v !== key) : [...form.variables, key])} />{label}</label>)}</div></fieldset>}
      <ExperimentField label="Desired variable values (optional)"><input value={form.customValues} onChange={(e) => set("customValues", e.target.value)} style={experimentInputStyle} placeholder="Hook: question vs bold claim; character: founder" /></ExperimentField>
      <div className="grid sm:grid-cols-2 gap-4">
        <ExperimentField label="Variants (baseline included)"><input type="number" required min={1} max={12} step="1" value={form.variantCount} aria-invalid={!!errors.variantCount} onChange={(e) => set("variantCount", e.target.value)} style={{ ...experimentInputStyle, borderColor: errors.variantCount ? "#B3261E" : T.line }} />{errors.variantCount && <p className="text-xs m-0" style={{ color: "#B3261E" }}>✎ 1–12 variants</p>}</ExperimentField>
        <div className="flex flex-col gap-1.5 text-sm" style={{ color: T.ink }}><span>Slides per variant</span><p className="m-0 rounded-lg px-3 py-2" style={{ background: T.paper, border: `1px solid ${T.line}` }}><strong>{slidesLabel}</strong> story slides<span className="block text-xs font-normal mt-1" style={{ color: T.muted }}>From each original — every original runs as its own experiment. A call-to-action slide is omitted when the source has one.</span></p></div>
      </div>
      </>}
      {step === 3 && <>
      <p className="text-xs" style={{ color: T.muted }}>Each experiment auto-stops at <strong>{capLabel} credits</strong> (up to {capTotal} total) if anything runs away. Image generation is approved separately after brief review.</p>
      <section aria-label="What this experiment will produce" className="rounded-lg p-4 space-y-4" style={{ background: T.paper, border: `1px solid ${T.line}` }}>
        <h3 className="font-semibold">Output preview</h3>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          {[[videoIds.length, "originals", "▣"], [videoIds.length, "experiments", "▤"], [videoIds.length * (Number(form.variantCount) || 0) || "—", "decks", "▥"], [totalImages || "—", "images", "▧"]].map(([count, label, icon]) => <div key={label} className="rounded-lg p-3" style={{ background: T.card, border: `1px solid ${T.line}` }}><span aria-hidden="true" className="text-lg" style={{ color: T.teal }}>{icon}</span><p className="mt-1"><strong className="text-2xl" style={fD}>{count}</strong>{" "}<span className="text-xs" style={{ color: T.muted }}>{label}</span></p></div>)}
        </div>
        <div className="flex flex-wrap gap-2 text-xs font-medium">
          <span className="rounded-full px-3 py-1" style={{ background: T.card, color: T.teal }}>One experiment per original — briefs never mix sources</span>
          <span className="rounded-full px-3 py-1" style={{ background: T.card }}>{slidesLabel} slides per deck, from each original</span>
          <span className="rounded-full px-3 py-1" style={{ background: T.card }}>{isEdit ? "Same images, old overlay text stripped" : `Each deck: 1 baseline${(Number(form.variantCount) || 0) > 1 ? ` + ${(Number(form.variantCount) || 0) - 1} alternative${(Number(form.variantCount) || 0) === 2 ? "" : "s"}` : " only"}`}</span>
          {(Number(form.variantCount) || 0) > 1 && <span className="rounded-full px-3 py-1" style={{ background: T.card }}>{form.mode === "controlled" ? `${VARIABLES[form.variables[0]]} changes` : "Combined changes"}</span>}
          <span className="rounded-full px-3 py-1" style={{ background: T.card }}>Manual publishing</span>
          <span className="rounded-full px-3 py-1" style={{ background: T.card, color: T.teal }}>✨ ≈{est.generation} credits for images</span>
        </div>
        <details><summary className="text-sm cursor-pointer">Review exact inputs</summary><dl className="mt-3 grid sm:grid-cols-2 gap-3 text-sm">{(isEdit ? [["Overlay text", "Stripped from the originals first"]] : []).concat([["Goal", form.goal || "Add your goal above"], ["Audience", form.audience || "Not specified"], ["Brand", form.brand || "Not specified"], ["Language", form.language || "Not specified"], ["Creative direction", form.direction || "Use the source patterns"], ["Requested values", form.customValues || "Planner proposes values"], ["Keep unchanged", form.lockedConstraints || "No additional rules"], ["Spending cap", `${capLabel} credits per experiment, ${capTotal} total (automatic)`]]).map(([label, value]) => <div key={label}><dt className="font-semibold">{label}</dt><dd className="whitespace-pre-wrap break-words" style={{ color: T.muted }}>{value}</dd></div>)}</dl></details>
      </section>
      {problem && <p role="alert" className="text-sm" style={{ color: "#B3261E" }}>{problem}</p>}
      <div className="flex flex-wrap items-center gap-3">
        <ExperimentButton primary type="submit" disabled={busy || !!firstProblem} title={firstProblem || undefined}>{busy ? (started ? `Starting ${Math.min(started + 1, plan.length)} of ${plan.length}…` : "Starting…") : `✨ Start ${videoIds.length > 1 ? `${videoIds.length} experiments` : "experiment"} · ≈${est.start} credits`}</ExperimentButton>
        {firstProblem && !busy && <span className="text-xs" style={{ color: "#B3261E" }}>✎ {firstProblem}</span>}
      </div>
      </>}
      <div className="flex flex-wrap items-center gap-3">
        {step > 1 && <ExperimentButton onClick={() => setStep(step - 1)} disabled={busy}>← Back</ExperimentButton>}
        {step < 3 && <ExperimentButton primary onClick={() => setStep(step + 1)} disabled={busy}>Next →</ExperimentButton>}
      </div>
    </form>
  </section>;
}
