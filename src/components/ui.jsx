import { Link } from "react-router-dom";
import { T, fB, fM } from "../lib/theme.js";

export function Cmd({ children }) {
  return (
    <span className="rounded px-1.5 py-0.5" style={{ ...fM, fontSize: "0.9em", background: "rgba(20,24,29,0.07)", color: T.ink }}>
      <span style={{ color: T.signal }}>/</span>{children}
    </span>
  );
}

export function SectionLabel({ children }) {
  return (
    <div style={{ ...fM, fontSize: 11, letterSpacing: 3, color: T.signal }}>{children}</div>
  );
}

/**
 * Renders as a <Link> when `to` is given, otherwise a <button>.
 * Kept as one component so pricing/nav CTAs share the exact visual style
 * that used to be scroll-to-waitlist-only.
 */
export function CTAButton({ big, to, href, onClick, disabled, children }) {
  const className = `inline-flex items-center justify-center rounded-md font-semibold transition-transform hover:-translate-y-0.5 ${big ? "px-6 py-3.5" : "px-4 py-2"} ${disabled ? "opacity-50 pointer-events-none" : ""}`;
  const style = { ...fB, fontSize: big ? 16 : 13, background: T.signal, color: "#fff", boxShadow: "0 6px 20px rgba(255,77,0,0.35)" };
  if (to) return <Link to={to} className={className} style={style}>{children}</Link>;
  if (href) return <a href={href} className={className} style={style}>{children}</a>;
  return <button onClick={onClick} disabled={disabled} className={className} style={style}>{children}</button>;
}

export function GhostButton({ to, onClick, children }) {
  const className = "inline-flex items-center justify-center rounded-md px-4 py-2 font-semibold transition-colors";
  const style = { ...fB, fontSize: 13, background: "transparent", color: T.ink, border: `1.5px solid ${T.ink}` };
  if (to) return <Link to={to} className={className} style={style}>{children}</Link>;
  return <button onClick={onClick} className={className} style={style}>{children}</button>;
}

/**
 * A small icon-only control with a proper (styled, hover-revealed) tooltip —
 * for dense row actions where a text label per action doesn't fit the row.
 * The tooltip is a sibling span shown on `:hover`/`:focus` via a `group`
 * wrapper, not the native `title` attribute, so it can be styled and shows
 * up immediately rather than after the browser's default delay.
 */
export function IconButton({ icon, label, onClick, disabled, tone, danger }) {
  return (
    <span className="relative inline-flex group">
      <button
        type="button"
        onClick={onClick}
        disabled={disabled}
        aria-label={label}
        className="inline-flex items-center justify-center rounded-md p-1.5 transition-colors disabled:opacity-40 disabled:cursor-not-allowed hover:bg-black/5"
        style={{ color: danger ? "#B3261E" : tone ?? T.ink }}
      >
        {icon}
      </button>
      <span
        role="tooltip"
        className="pointer-events-none absolute -top-8 left-1/2 -translate-x-1/2 whitespace-nowrap rounded px-2 py-1 opacity-0 transition-opacity group-hover:opacity-100 group-focus-within:opacity-100 z-10"
        style={{ ...fM, fontSize: 11, background: T.ink, color: "#fff" }}
      >
        {label}
      </span>
    </span>
  );
}

const ICON_PROPS = { width: 15, height: 15, viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: 1.8, strokeLinecap: "round", strokeLinejoin: "round" };

export const RefreshIcon = () => (
  <svg {...ICON_PROPS} aria-hidden="true">
    <path d="M21 12a9 9 0 1 1-3-6.7" />
    <path d="M21 3v6h-6" />
  </svg>
);

export const PauseIcon = () => (
  <svg {...ICON_PROPS} aria-hidden="true">
    <rect x="6" y="4" width="4" height="16" rx="1" />
    <rect x="14" y="4" width="4" height="16" rx="1" />
  </svg>
);

export const PlayIcon = () => (
  <svg {...ICON_PROPS} fill="currentColor" stroke="none" aria-hidden="true">
    <polygon points="6 4 20 12 6 20" />
  </svg>
);

export const EditIcon = () => (
  <svg {...ICON_PROPS} aria-hidden="true">
    <path d="M12 20h9" />
    <path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4Z" />
  </svg>
);

export const WarningIcon = () => (
  <svg {...ICON_PROPS} aria-hidden="true">
    <path d="M10.3 3.9 1.9 18a1.6 1.6 0 0 0 1.4 2.4h17.4a1.6 1.6 0 0 0 1.4-2.4L13.7 3.9a1.6 1.6 0 0 0-2.8 0Z" />
    <line x1="12" y1="9" x2="12" y2="13.5" />
    <line x1="12" y1="16.5" x2="12" y2="16.6" />
  </svg>
);

export const TrashIcon = () => (
  <svg {...ICON_PROPS} aria-hidden="true">
    <path d="M3 6h18" />
    <path d="M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
    <path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6" />
    <line x1="10" y1="11" x2="10" y2="17" />
    <line x1="14" y1="11" x2="14" y2="17" />
  </svg>
);

export const CloseIcon = () => (
  <svg {...ICON_PROPS} aria-hidden="true">
    <line x1="18" y1="6" x2="6" y2="18" />
    <line x1="6" y1="6" x2="18" y2="18" />
  </svg>
);

// The "Analyze with Gemini" action — a sparkle reads as generative/AI without
// adding a word next to the glyph.
export const SparkleIcon = () => (
  <svg {...ICON_PROPS} aria-hidden="true">
    <path d="M12 4l1.7 4.3L18 10l-4.3 1.7L12 16l-1.7-4.3L6 10l4.3-1.7Z" />
    <path d="M18.5 15.5l.8 2.2 2.2.8-2.2.8-.8 2.2-.8-2.2-2.2-.8 2.2-.8Z" />
  </svg>
);

// Indeterminate progress ("Analyzing…") — a rotating arc, Tailwind's
// animate-spin drives the motion.
export const Spinner = () => (
  <svg className="animate-spin" {...ICON_PROPS} aria-hidden="true">
    <circle cx="12" cy="12" r="9" opacity="0.25" />
    <path d="M21 12a9 9 0 0 0-9-9" />
  </svg>
);

/**
 * Error/status banner for the outcome of an action (create, delete,
 * refresh, ...) — a bordered card instead of a bare line of red text, so
 * it reads as a notification rather than stray text near the controls.
 * `action` renders a link/button on the right (e.g. "Upgrade →").
 */
export function AlertBanner({ children, action, className = "" }) {
  return (
    <div
      role="alert"
      className={`flex items-start gap-2 rounded-md px-3 py-2 ${className}`}
      style={{ background: "#FDECEA", border: "1px solid #F3B5AE" }}
    >
      <span style={{ ...fB, fontSize: 13, lineHeight: 1.4, color: "#7A1F17" }}>{children}</span>
      {action && <span className="shrink-0">{action}</span>}
    </div>
  );
}

/**
 * An actual popup — a centered modal over a dimmed backdrop — for
 * confirming a destructive action. Replaces swapping a row's buttons out
 * for "confirm/cancel" in place, which is easy to miss and doesn't read as
 * a deliberate checkpoint.
 */
export function ConfirmDialog({ open, title, message, confirmLabel = "Confirm", danger, busy, onConfirm, onCancel }) {
  if (!open) return null;
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ background: "rgba(20,24,29,0.45)" }}
      onClick={onCancel}
    >
      <div
        role="alertdialog"
        aria-modal="true"
        aria-label={title}
        className="w-full max-w-sm rounded-lg p-5"
        style={{ background: T.card, border: `1px solid ${T.line}`, boxShadow: "0 12px 40px rgba(0,0,0,0.25)" }}
        onClick={(e) => e.stopPropagation()}
      >
        {title && <div style={{ ...fB, fontSize: 15, fontWeight: 700, color: T.ink }}>{title}</div>}
        {message && <p className="mt-2" style={{ ...fB, fontSize: 13, color: T.muted, lineHeight: 1.5 }}>{message}</p>}
        <div className="mt-4 flex justify-end gap-2">
          <button
            type="button"
            onClick={onCancel}
            disabled={busy}
            className="rounded-md px-3 py-1.5"
            style={{ ...fB, fontSize: 13, color: T.muted }}
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={onConfirm}
            disabled={busy}
            className="rounded-md px-3 py-1.5"
            style={{ ...fB, fontSize: 13, fontWeight: 600, background: danger ? "#B3261E" : T.signal, color: "#fff", opacity: busy ? 0.6 : 1 }}
          >
            {busy ? "…" : confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
