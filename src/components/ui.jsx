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
