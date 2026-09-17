import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useQueryClient } from "@tanstack/react-query";
import { T, fD } from "../lib/theme.js";
import { createExperiment, mutationKey, validateExperiment } from "../lib/experiments.js";
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

export default function ExperimentCreate({ accessToken, workspaceId, videoIds, onClose }) {
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
  async function submit(event) {
    event.preventDefault();
    if (inFlight.current) return;
    const { goal, brand, audience, language, direction, lockedConstraints, mode, variables, customValues, variantCount, slideCount, maxCredits } = form;
    const input = { workspaceId, videoIds, variantCount: Number(variantCount), slideCount: Number(slideCount), maxCredits: Number(maxCredits), instructions: { goal, brand, audience, language, direction: [direction, customValues && `Desired variable values: ${customValues}`].filter(Boolean).join("\n"), lockedConstraints: lockedConstraints.split("\n").map((s) => s.trim()).filter(Boolean), mode, variables } };
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
      navigate(`/experiments/${encodeURIComponent(experiment.id)}`);
    } catch (err) { if (mounted.current) setProblem(err.message || "Could not create experiment. Retrying uses the same request key."); }
    finally { inFlight.current = false; if (mounted.current) setBusy(false); }
  }
  return <section className="my-6 rounded-xl p-5 sm:p-6" style={{ background: T.card, border: `1px solid ${T.line}` }} aria-label="Create experiment">
    <div className="flex flex-wrap items-start justify-between gap-3"><div><h2 style={{ ...fD, fontSize: 24, fontWeight: 800 }}>Create an experiment</h2><p className="mt-1 text-sm" style={{ color: T.muted }}>{videoIds.length} Gallery originals · Saved draft first. Nothing runs automatically.</p></div><ExperimentButton onClick={onClose} disabled={busy}>Close setup</ExperimentButton></div>
    <form onSubmit={submit} className="mt-5 space-y-5">
      <div className="rounded-lg p-4 space-y-2" style={{ background: T.paper }}>
        <ExperimentField label="Start from an example"><select defaultValue="" disabled={busy} onChange={(e) => { const example = EXAMPLES[e.target.value]; if (example) { const { label, ...values } = example; setForm((prev) => ({ ...EMPTY_FORM, ...values, brand: prev.brand, language: prev.language, maxCredits: prev.maxCredits })); } }} style={experimentInputStyle}><option value="" disabled>Choose an example, or write your own below</option>{Object.entries(EXAMPLES).map(([id, example]) => <option key={id} value={id}>{example.label}</option>)}</select></ExperimentField>
        <p className="text-xs" style={{ color: T.muted }}>Examples replace the creative inputs below with an editable, two-deck pilot. Your brand, language and spending ceiling are kept. No hidden prompts or automatic generation.</p>
      </div>
      <ExperimentField label="Goal"><input required value={form.goal} onChange={(e) => set("goal", e.target.value)} style={experimentInputStyle} placeholder="Find the hook that earns the first swipe" /></ExperimentField>
      <div className="grid sm:grid-cols-3 gap-4">{["brand", "audience", "language"].map((name) => <ExperimentField key={name} label={name[0].toUpperCase() + name.slice(1)}><input value={form[name]} onChange={(e) => set(name, e.target.value)} style={experimentInputStyle} /></ExperimentField>)}</div>
      <div className="grid sm:grid-cols-2 gap-4">
        <ExperimentField label="Creative direction"><textarea rows={3} value={form.direction} onChange={(e) => set("direction", e.target.value)} style={experimentInputStyle} /></ExperimentField>
        <ExperimentField label="Keep unchanged (one per line)"><textarea rows={3} value={form.lockedConstraints} onChange={(e) => set("lockedConstraints", e.target.value)} style={experimentInputStyle} placeholder="Keep product name unchanged" /></ExperimentField>
      </div>
      <ExperimentField label="Test mode"><select value={form.mode} onChange={(e) => setForm((prev) => ({ ...prev, mode: e.target.value, variables: e.target.value === "controlled" ? [prev.variables.find((v) => !["concept", "slides"].includes(v)) || "hook"] : prev.variables }))} style={experimentInputStyle}><option value="controlled">Change one thing — compare against a baseline</option><option value="exploration">Explore combinations — change several things</option></select></ExperimentField>
      {form.mode === "controlled" ? <ExperimentField label="What do you want to change?"><select value={form.variables[0]} onChange={(e) => set("variables", [e.target.value])} style={experimentInputStyle}>{Object.entries(VARIABLES).filter(([key]) => !["concept", "slides"].includes(key)).map(([key, label]) => <option key={key} value={key}>{label}</option>)}</select></ExperimentField> : <fieldset><legend className="text-sm mb-2">Variables to test</legend><div className="flex flex-wrap gap-3">{Object.entries(VARIABLES).map(([key, label]) => <label key={key} className="flex items-center gap-2 text-sm"><input type="checkbox" checked={form.variables.includes(key)} onChange={() => set("variables", form.variables.includes(key) ? form.variables.filter((v) => v !== key) : [...form.variables, key])} />{label}</label>)}</div></fieldset>}
      <ExperimentField label="Desired variable values (optional)"><input value={form.customValues} onChange={(e) => set("customValues", e.target.value)} style={experimentInputStyle} placeholder="Hook: question vs bold claim; character: founder" /></ExperimentField>
      <div className="grid sm:grid-cols-3 gap-4">{[["variantCount", "Variants (baseline included)", 1, 12], ["slideCount", "Slides per variant", 3, 8], ["maxCredits", "Credit ceiling", 1, undefined]].map(([key, label, min, max]) => <ExperimentField key={key} label={label}><input type="number" required min={min} max={max} step="1" value={form[key]} onChange={(e) => set(key, e.target.value)} style={experimentInputStyle} /></ExperimentField>)}</div>
      <p className="text-xs" style={{ color: T.muted }}>Credit ceiling = the most you authorize for the whole experiment, not a price quote. Choose a cap you are comfortable with. Saving costs nothing; the server shows the actual estimate before each paid stage and blocks work above your cap. Brand, audience and creative direction are optional.</p>
      <section aria-label="What this experiment will produce" className="rounded-lg p-4 space-y-3" style={{ background: T.paper, border: `1px solid ${T.line}` }}>
        <h3 className="font-semibold">What we'll make</h3>
        <p className="text-sm">{videoIds.length} originals inform {Number(form.variantCount) || "—"} slideshow{Number(form.variantCount) === 1 ? "" : "s"}, with {Number(form.slideCount) || "—"} slides each ({Number(form.variantCount) * Number(form.slideCount) || "—"} images if you generate all decks).</p>
        <p className="text-sm">{Number(form.variantCount) === 1 ? "One baseline deck, with no alternative to compare yet." : form.mode === "controlled" ? `One baseline (your reference version) + ${Math.max(0, Number(form.variantCount) - 1)} alternative${Number(form.variantCount) === 2 ? "" : "s"}. Only ${VARIABLES[form.variables[0]]?.toLowerCase()} changes; everything else follows the baseline.` : "A baseline plus alternative decks that may combine the selected changes."}</p>
        <dl className="text-sm space-y-2">{[["Goal", form.goal || "Add your goal above"], ["Audience", form.audience || "Not specified"], ["Brand", form.brand || "Not specified"], ["Language", form.language || "Not specified"], ["Creative direction", form.direction || "Use the source patterns"], ["Requested values", form.customValues || "Planner proposes values"], ["Keep unchanged", form.lockedConstraints || "No additional rules"], ["Spending ceiling", form.maxCredits ? `${form.maxCredits} credits` : "Choose a ceiling above"]].map(([label, value]) => <div key={label}><dt className="font-semibold">{label}</dt><dd className="whitespace-pre-wrap break-words" style={{ color: T.muted }}>{value}</dd></div>)}</dl>
        <p className="text-xs" style={{ color: T.muted }}>Save draft → approve analysis estimate → review and edit briefs → approve selected images. New text-directed images, not exact source copies. Requested character consistency and text rules still need visual review. Nothing is published automatically.</p>
      </section>
      {problem && <p role="alert" className="text-sm" style={{ color: "#9B2C23" }}>{problem}</p>}
      <ExperimentButton primary type="submit" disabled={busy}>{busy ? "Saving draft…" : "Save experiment draft"}</ExperimentButton>
    </form>
  </section>;
}
