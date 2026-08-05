// Full analysis details, opened from a gallery card ("View analysis →").
// Mirrors ConfirmDialog's modal chrome; the content is grouped sections over
// the VideoAnalysisData the connector returns (schema in the connector's
// src/analysis/schema.ts). Video-native fields (keyMoments, shots, audio,
// emotional arc, on-screen text) render only when the analysis actually has
// them — a text-only run leaves those null and the modal just omits them.

import { T, fB, fM, fmtTime } from "../lib/theme.js";
import { CloseIcon } from "./ui.jsx";

const sectionLabel = { ...fM, fontSize: 11, letterSpacing: 2, color: T.signal, textTransform: "uppercase" };
const muted = { color: T.muted, fontSize: 12.5 };

function Chip({ children }) {
  return (
    <span className="inline-block rounded px-1.5 py-0.5" style={{ ...fM, fontSize: 11, background: "rgba(20,24,29,0.06)", color: T.ink }}>
      {children}
    </span>
  );
}

function Section({ title, children }) {
  return (
    <div className="mt-4">
      <div style={sectionLabel}>{title}</div>
      <div className="mt-1.5">{children}</div>
    </div>
  );
}

export default function AnalysisModal({ detail, onClose, onSeek }) {
  if (!detail?.analysis) return null;

  const { analysisBasis, backend, model } = detail.analysis;
  const d = detail.analysis.data || {};
  const overall = d.overallAssessment;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ background: "rgba(20,24,29,0.5)" }}
      onClick={onClose}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Video analysis"
        className="flex max-h-[85vh] w-full max-w-2xl flex-col rounded-lg p-5"
        style={{ background: T.card, border: `1px solid ${T.line}`, boxShadow: "0 12px 40px rgba(0,0,0,0.3)" }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between">
          <div style={{ ...fB, fontSize: 16, fontWeight: 700, color: T.ink }}>Analysis</div>
          <button type="button" aria-label="Close" onClick={onClose} className="rounded-md p-1 transition-colors hover:bg-black/5">
            <CloseIcon />
          </button>
        </div>
        <div className="mt-1 flex flex-wrap gap-1.5">
          {model && <Chip>{model}</Chip>}
          {analysisBasis && <Chip>basis: {analysisBasis}</Chip>}
          {backend && <Chip>{backend}</Chip>}
        </div>

        <div className="mt-3 overflow-y-auto pr-1 text-[13.4px] leading-relaxed" style={{ ...fB, color: T.ink }}>
          {overall?.summary && <p style={{ margin: 0 }}>{overall.summary}</p>}
          {(overall?.viralityScore != null || overall?.replicability) && (
            <div className="mt-2 flex flex-wrap gap-1.5">
              {overall?.viralityScore != null && <Chip>virality {overall.viralityScore}/10</Chip>}
              {overall?.replicability && <Chip>replicability: {overall.replicability}</Chip>}
            </div>
          )}

          {d.hook?.text && (
            <Section title="Hook">
              <p style={{ margin: 0 }}>{d.hook.text}</p>
              <div className="mt-1 flex flex-wrap items-center gap-1.5">
                {d.hook.type && <Chip>{d.hook.type}</Chip>}
                {d.hook.placement && <Chip>{d.hook.placement}</Chip>}
                {d.hook.mechanism && <span style={muted}>{d.hook.mechanism}</span>}
              </div>
            </Section>
          )}

          {d.angle?.description && (
            <Section title="Angle">
              <p style={{ margin: 0 }}>{d.angle.description}</p>
              {d.angle.type && <div className="mt-1"><Chip>{d.angle.type}</Chip></div>}
            </Section>
          )}

          {Array.isArray(d.storytellingBeats) && d.storytellingBeats.length > 0 && (
            <Section title="Storytelling beats">
              <ul className="m-0 list-none p-0">
                {d.storytellingBeats.map((b, i) => (
                  <li key={i} className="mt-1">
                    <span className="rounded px-1.5 py-0.5" style={{ ...fM, fontSize: 11, background: "#FFF0E8", color: T.signal }}>{b.type}</span>{" "}
                    <span style={muted}>{fmtTime(b.timestampSec)}</span> — {b.description}
                  </li>
                ))}
              </ul>
            </Section>
          )}

          {Array.isArray(d.keyMoments) && d.keyMoments.length > 0 && (
            <Section title="Key moments — tap to jump in the video">
              <ul className="m-0 list-none p-0">
                {d.keyMoments.map((m, i) => (
                  <li key={i} className="mt-1">
                    <button
                      type="button"
                      onClick={() => onSeek?.(m.timestampSec)}
                      className="underline decoration-dotted underline-offset-2"
                      style={{ ...fM, fontSize: 12, color: T.teal }}
                    >
                      {fmtTime(m.timestampSec)}
                    </button>
                    <span> · {m.role || "moment"}</span>
                    {m.subjectAction && <span> — {m.subjectAction}</span>}
                    {m.framing && <span> · {m.framing}</span>}
                    {m.lighting && <span> · {m.lighting}</span>}
                  </li>
                ))}
              </ul>
            </Section>
          )}

          {Array.isArray(d.keyMechanisms) && d.keyMechanisms.length > 0 && (
            <Section title="Key mechanisms">
              <div className="flex flex-wrap gap-1.5">{d.keyMechanisms.map((m, i) => <Chip key={i}>{m}</Chip>)}</div>
            </Section>
          )}

          {Array.isArray(d.emotionalDrivers) && d.emotionalDrivers.length > 0 && (
            <Section title="Emotional drivers">
              <div className="flex flex-wrap gap-1.5">{d.emotionalDrivers.map((m, i) => <Chip key={i}>{m}</Chip>)}</div>
            </Section>
          )}

          {d.pacing && (
            <Section title="Pacing">
              <p style={{ margin: 0 }}>
                {d.pacing.rhythm}
                {d.pacing.cutsPerMinute != null && <span> · {d.pacing.cutsPerMinute} cuts/min</span>}
              </p>
              {d.pacing.retentionStrategy && <p style={{ ...muted, margin: 0 }}>{d.pacing.retentionStrategy}</p>}
            </Section>
          )}

          {d.audienceInsight?.targetDemographic && (
            <Section title="Audience">
              <p style={{ margin: 0 }}>{d.audienceInsight.targetDemographic}</p>
              {d.audienceInsight.unspokenDesire && <p style={{ ...muted, margin: 0 }}>{d.audienceInsight.unspokenDesire}</p>}
            </Section>
          )}

          {Array.isArray(d.transferablePatterns) && d.transferablePatterns.length > 0 && (
            <Section title="Transferable patterns">
              {d.transferablePatterns.map((p, i) => (
                <div key={i} className="mt-2">
                  <p style={{ margin: 0, fontWeight: 600 }}>{p.pattern}</p>
                  {p.description && <p style={{ margin: 0 }}>{p.description}</p>}
                  {p.adaptationNotes && <p style={{ ...muted, margin: 0 }}>adapt: {p.adaptationNotes}</p>}
                </div>
              ))}
            </Section>
          )}

          {Array.isArray(d.visualTechniques) && d.visualTechniques.length > 0 && (
            <Section title="Visual techniques">
              <div className="flex flex-wrap gap-1.5">{d.visualTechniques.map((t, i) => <Chip key={i}>{t}</Chip>)}</div>
            </Section>
          )}

          {Array.isArray(d.audioTechniques) && d.audioTechniques.length > 0 && (
            <Section title="Audio techniques">
              <div className="flex flex-wrap gap-1.5">{d.audioTechniques.map((t, i) => <Chip key={i}>{t}</Chip>)}</div>
            </Section>
          )}

          {d.audioAnalysis && (
            <Section title="Audio analysis">
              <p style={{ margin: 0 }}>
                {d.audioAnalysis.tone}
                {d.audioAnalysis.speechDetected ? " · speech detected" : ""}
                {d.audioAnalysis.speechType ? ` (${d.audioAnalysis.speechType})` : ""}
              </p>
              {d.audioAnalysis.musicDescription && <p style={{ ...muted, margin: 0 }}>music: {d.audioAnalysis.musicDescription}</p>}
              {Array.isArray(d.audioAnalysis.soundEffects) && d.audioAnalysis.soundEffects.length > 0 && (
                <p style={{ ...muted, margin: 0 }}>sfx: {d.audioAnalysis.soundEffects.join(", ")}</p>
              )}
            </Section>
          )}

          {Array.isArray(d.onScreenText) && d.onScreenText.length > 0 && (
            <Section title="On-screen text">
              {d.onScreenText.map((t, i) => (
                <p key={i} style={{ margin: 0 }}>
                  <span style={muted}>{fmtTime(t.timestampSec)}</span> — {t.text}
                  {t.style ? ` (${t.style})` : ""}
                </p>
              ))}
            </Section>
          )}

          {Array.isArray(d.emotionalArc) && d.emotionalArc.length > 0 && (
            <Section title="Emotional arc">
              {d.emotionalArc.map((p, i) => (
                <p key={i} style={{ margin: 0 }}>
                  <span style={muted}>{fmtTime(p.timestampSec)}</span> — {p.primaryEmotion} ({p.intensity}/10)
                  {p.trigger ? ` · ${p.trigger}` : ""}
                </p>
              ))}
            </Section>
          )}

          {Array.isArray(d.shots) && d.shots.length > 0 && (
            <Section title={`Shots (${d.shots.length})`}>
              {d.shots.map((s, i) => (
                <p key={i} style={{ margin: 0 }}>
                  <span style={muted}>{fmtTime(s.timestampSec)}</span> — {s.type}
                  {s.description ? ` · ${s.description}` : ""}
                  {s.onScreenText ? ` · “${s.onScreenText}”` : ""}
                </p>
              ))}
            </Section>
          )}
        </div>
      </div>
    </div>
  );
}
