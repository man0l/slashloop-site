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

export default function ExperimentCreate({ accessToken, workspaceId, videoIds, onClose }) {
  const navigate = useNavigate();
  const qc = useQueryClient();
  const [form, setForm] = useState({ goal: "", brand: "", audience: "", language: "English", direction: "", lockedConstraints: "", mode: "controlled", variables: ["hook"], customValues: "", variantCount: 3, slideCount: 5, maxCredits: "" });
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
    <form onSubmit={submit} className="mt-5 space-y-4">
      <ExperimentField label="Goal"><input required value={form.goal} onChange={(e) => set("goal", e.target.value)} style={experimentInputStyle} placeholder="Find the hook that earns the first swipe" /></ExperimentField>
      <div className="grid sm:grid-cols-3 gap-4">{["brand", "audience", "language"].map((name) => <ExperimentField key={name} label={name[0].toUpperCase() + name.slice(1)}><input value={form[name]} onChange={(e) => set(name, e.target.value)} style={experimentInputStyle} /></ExperimentField>)}</div>
      <div className="grid sm:grid-cols-2 gap-4">
        <ExperimentField label="Creative direction"><textarea rows={3} value={form.direction} onChange={(e) => set("direction", e.target.value)} style={experimentInputStyle} /></ExperimentField>
        <ExperimentField label="Locked constraints (one per line)"><textarea rows={3} value={form.lockedConstraints} onChange={(e) => set("lockedConstraints", e.target.value)} style={experimentInputStyle} placeholder="Keep product name unchanged" /></ExperimentField>
      </div>
      <ExperimentField label="Test mode"><select value={form.mode} onChange={(e) => setForm((prev) => ({ ...prev, mode: e.target.value, variables: prev.variables.filter((v) => e.target.value === "exploration" || !["concept", "slides"].includes(v)) }))} style={experimentInputStyle}><option value="controlled">Controlled — baseline + one variable changed per variant</option><option value="exploration">Exploration — broader creative combinations</option></select></ExperimentField>
      <fieldset><legend className="text-sm mb-2">Variables to test</legend><div className="flex flex-wrap gap-3">{Object.entries(VARIABLES).filter(([key]) => form.mode === "exploration" || !["concept", "slides"].includes(key)).map(([key, label]) => <label key={key} className="flex items-center gap-2 text-sm"><input type="checkbox" checked={form.variables.includes(key)} onChange={() => set("variables", form.variables.includes(key) ? form.variables.filter((v) => v !== key) : [...form.variables, key])} />{label}</label>)}</div></fieldset>
      <ExperimentField label="Desired variable values (optional)"><input value={form.customValues} onChange={(e) => set("customValues", e.target.value)} style={experimentInputStyle} placeholder="Hook: question vs bold claim; character: founder" /></ExperimentField>
      <div className="grid sm:grid-cols-3 gap-4">{[["variantCount", "Variants (baseline included)", 1, 12], ["slideCount", "Slides per variant", 3, 8], ["maxCredits", "Credit ceiling", 1, undefined]].map(([key, label, min, max]) => <ExperimentField key={key} label={label}><input type="number" required min={min} max={max} step="1" value={form[key]} onChange={(e) => set(key, e.target.value)} style={experimentInputStyle} /></ExperimentField>)}</div>
      <p className="text-sm" style={{ color: T.muted }}>New text-directed images informed by source evidence, not exact frame copies. Review the server estimate before analysis or generation; review and edit briefs before selecting variants. Your credit ceiling applies to the whole experiment. No automatic publishing.</p>
      {problem && <p role="alert" className="text-sm" style={{ color: "#9B2C23" }}>{problem}</p>}
      <ExperimentButton primary type="submit" disabled={busy}>{busy ? "Saving draft…" : "Save experiment draft"}</ExperimentButton>
    </form>
  </section>;
}
