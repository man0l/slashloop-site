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
