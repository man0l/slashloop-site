import { useEffect, useState } from "react";
import { T, fD } from "../lib/theme.js";
import { errorText, hasUnknownOutcome } from "../lib/experiments.js";
import { ExperimentButton, ExperimentField, experimentInputStyle } from "./ExperimentCreate.jsx";

const FIELD_LABELS = { concept: "Concept", hook: "Hook", character: "Character", visualStyle: "Visual style", caption: "Caption", cta: "Call to action", slides: "Slide structure", lockedConstraints: "Keep unchanged" };
const showValue = (value) => typeof value === "string" ? value : JSON.stringify(value ?? "Not specified");
export default function ExperimentVariant({ variant, baseline, expectedSlideCount, index, selected, selectable, busy, onSelect, onSave, onDirty, onDownload, onSchedule }) {
  const [brief, setBrief] = useState(() => structuredClone(variant.brief ?? {}));
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);
  const [problem, setProblem] = useState("");
  useEffect(() => () => onDirty(variant.id, false), [variant.id, onDirty]);
  function edit(next) { setBrief(next); setDirty(true); onDirty(variant.id, true); }
  async function save() {
    setSaving(true); setProblem("");
    try { await onSave(variant, brief); setDirty(false); onDirty(variant.id, false); }
    catch (err) { setProblem(err.status === 409 ? "This brief changed on the server. Reload the latest revision before editing again." : err.message); }
    finally { setSaving(false); }
  }
  const slides = [...(variant.slides ?? [])].sort((a, b) => a.index - b.index);
  const images = slides.filter((s) => s.url && !s.error && ["done", "completed"].includes(s.status)).map((s) => s.url);
  const expected = Math.max(expectedSlideCount || 0, variant.brief?.slides?.length || 0);
  const finished = ["done", "completed"].includes(variant.status) && !variant.error && !hasUnknownOutcome(variant.error) && !slides.some((s) => hasUnknownOutcome(s.error)) && expected > 0 && slides.length === expected && images.length === expected && slides.every((s, i) => s.index === i);
  const differences = baseline ? Object.keys(FIELD_LABELS).filter((key) => JSON.stringify(variant.brief?.[key]) !== JSON.stringify(baseline.brief?.[key])) : [];
  return <article className="rounded-xl p-5 space-y-4 min-w-0" style={{ background: T.card, border: `1px solid ${selected ? T.teal : T.line}` }}>
    <div className="flex flex-wrap items-start justify-between gap-3"><div><h3 style={{ ...fD, fontWeight: 800, fontSize: 20 }}>{variant.title || `Variant ${index + 1}`}</h3><p className="text-xs mt-1" style={{ color: T.muted }}>{index === 0 ? "Baseline · your reference version" : baseline ? "Compared with baseline" : "Alternative"} · Revision {variant.revision} · {variant.status === "done" ? "Images complete" : variant.status}</p></div>{!slides.length && <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={selected} disabled={!selectable || busy || dirty} onChange={onSelect} />Select for generation</label>}</div>
    {slides.length > 0 && <section aria-label={`${variant.title || "Variant"} images`}>
      <p className="text-sm mb-3" style={{ color: T.muted }}>{images.length}/{expected || slides.length} images ready</p>
      <div className="grid gap-3" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(130px, 1fr))" }}>{slides.map((slide, i) => <figure key={slide.index ?? i} className="min-w-0"><div className="rounded-lg flex items-center justify-center overflow-hidden" style={{ background: T.paper, aspectRatio: "9/16", border: `1px solid ${T.line}` }}>{slide.url ? <a href={slide.url} target="_blank" rel="noreferrer" className="w-full h-full" aria-label={`Open slide ${i + 1} full size`}><img src={slide.url} alt={slide.overlayText || `Generated slide ${i + 1}`} loading="lazy" className="w-full h-full object-contain" /></a> : <span className="text-xs p-3 text-center" style={{ color: T.muted }}>{slide.status || "Waiting"}</span>}</div><figcaption className="text-xs mt-2" style={{ color: slide.error ? "#9B2C23" : T.muted }}>Slide {i + 1} · {slide.status}{slide.error ? ` · ${errorText(slide.error)}` : ""}</figcaption></figure>)}</div>
      <div className="flex flex-wrap gap-2 mt-4"><ExperimentButton disabled={!images.length} onClick={() => onDownload(variant, images)}>Download ZIP{!finished ? " (ready images)" : ""}</ExperimentButton><ExperimentButton disabled={!finished || busy} onClick={() => onSchedule(variant, images)}>Schedule this variant</ExperimentButton></div>
    </section>}
    {baseline && <p className="text-sm" style={{ color: T.teal }}>Changed from baseline: {differences.map((key) => FIELD_LABELS[key]).join(", ") || "No saved brief fields differ"}. Comparison uses the saved brief, not the original title.</p>}
    {differences.length > 0 && <details><summary className="cursor-pointer text-sm font-semibold">Compare exact changes</summary><dl className="space-y-4 mt-3 text-sm">{differences.map((key) => <div key={key}><dt className="font-semibold">{FIELD_LABELS[key]}</dt><dd className="grid sm:grid-cols-2 gap-3 mt-2"><div className="rounded-lg p-3 whitespace-pre-wrap break-words" style={{ background: T.paper }}><strong>Baseline</strong><p>{showValue(baseline.brief?.[key])}</p></div><div className="rounded-lg p-3 whitespace-pre-wrap break-words" style={{ background: T.paper }}><strong>This variant</strong><p>{showValue(variant.brief?.[key])}</p></div></dd></div>)}</dl></details>}
    {variant.hypothesis && <details><summary className="cursor-pointer text-sm">Original planning hypothesis (not a measured result)</summary><p className="text-sm mt-2">{variant.hypothesis}</p></details>}
    {variant.error && <p role="alert" className="text-sm" style={{ color: "#9B2C23" }}>{errorText(variant.error)}</p>}
    <details open={dirty}><summary className="cursor-pointer text-sm font-semibold">{slides.length ? "Saved generation brief" : "Review / edit brief"} {dirty ? "· Unsaved changes" : ""}</summary>
      <div className="mt-4 space-y-3"><fieldset disabled={busy || saving || !selectable} className="space-y-3">
        <div className="grid sm:grid-cols-2 gap-3">{["concept", "hook", "character", "visualStyle", "caption", "cta"].map((key) => <ExperimentField key={key} label={key === "visualStyle" ? "Visual style" : key === "cta" ? "CTA" : key[0].toUpperCase() + key.slice(1)}><textarea rows={2} value={brief[key] ?? ""} onChange={(e) => edit({ ...brief, [key]: e.target.value })} style={experimentInputStyle} /></ExperimentField>)}</div>
        <ExperimentField label="Locked constraints"><textarea rows={2} value={Array.isArray(brief.lockedConstraints) ? brief.lockedConstraints.join("\n") : brief.lockedConstraints ?? ""} onChange={(e) => edit({ ...brief, lockedConstraints: e.target.value.split("\n") })} style={experimentInputStyle} /></ExperimentField>
        {(brief.slides ?? []).map((slide, i) => <fieldset key={i} className="rounded-lg p-3 space-y-2" style={{ border: `1px solid ${T.line}` }}><legend className="text-xs px-1">Slide {i + 1}</legend>{["role", "scene", "overlayText"].map((key) => <ExperimentField key={key} label={`${key === "overlayText" ? "Overlay text" : key[0].toUpperCase() + key.slice(1)} ${i + 1}`}><textarea rows={key === "scene" ? 2 : 1} value={slide[key] ?? ""} style={experimentInputStyle} onChange={(e) => edit({ ...brief, slides: brief.slides.map((s, n) => n === i ? { ...s, [key]: e.target.value } : s) })} /></ExperimentField>)}</fieldset>)}
      </fieldset>
      {dirty && <div className="flex gap-2"><ExperimentButton primary disabled={busy || saving} onClick={save}>{saving ? "Saving…" : "Save brief"}</ExperimentButton><ExperimentButton disabled={saving} onClick={() => { setBrief(structuredClone(variant.brief ?? {})); setDirty(false); onDirty(variant.id, false); setProblem(""); }}>Discard edits</ExperimentButton></div>}
      {problem && <p role="alert" className="text-sm" style={{ color: "#9B2C23" }}>{problem}</p>}
      </div>
    </details>

  </article>;
}
