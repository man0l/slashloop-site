import { useEffect, useState } from "react";
import { Navigate } from "react-router-dom";
import { T, fD, fB, fM } from "../lib/theme.js";
import { SectionLabel, GhostButton } from "../components/ui.jsx";
import { useAuth } from "../lib/auth.jsx";
import { getDigestSettings, updateDigestSettings } from "../lib/api.js";

/**
 * /settings/email — where weekly digest emails go and whether they arrive.
 * Linked from the digest email footer; edits apply per workspace, delivery
 * is one combined email per owner every Monday.
 */
export default function EmailSettings() {
  const { user, loading, accessToken } = useAuth();
  const [workspaces, setWorkspaces] = useState(null);
  const [error, setError] = useState("");
  // Draft recipient per workspace id — empty string means "account email".
  const [emails, setEmails] = useState({});
  const [savedIds, setSavedIds] = useState(new Set());
  const [busyId, setBusyId] = useState(null);

  useEffect(() => {
    if (!accessToken) return;
    getDigestSettings(accessToken)
      .then((data) => {
        setWorkspaces(data.workspaces ?? []);
        setEmails(Object.fromEntries((data.workspaces ?? []).map((w) => [w.id, w.digestEmail ?? ""])));
      })
      .catch(() => setError("Couldn't load your email settings. Try again shortly."));
  }, [accessToken]);

  if (loading) return null;
  if (!user) return <Navigate to="/login?next=/settings/email" replace />;

  async function toggle(w) {
    setBusyId(w.id);
    setError("");
    try {
      const data = await updateDigestSettings(accessToken, {
        workspaceId: w.id,
        digestEnabled: !w.digestEnabled,
      });
      setWorkspaces(data.workspaces);
    } catch {
      setError("Couldn't save that. Try again shortly.");
    } finally {
      setBusyId(null);
    }
  }

  async function saveEmail(w) {
    setBusyId(w.id);
    setError("");
    try {
      const value = (emails[w.id] ?? "").trim();
      const data = await updateDigestSettings(accessToken, {
        workspaceId: w.id,
        digestEmail: value === "" ? null : value,
      });
      setWorkspaces(data.workspaces);
      setSavedIds((prev) => new Set(prev).add(w.id));
      setTimeout(() => setSavedIds((prev) => {
        const next = new Set(prev);
        next.delete(w.id);
        return next;
      }), 2500);
    } catch (err) {
      setError(err?.message?.includes("valid address")
        ? "That doesn't look like an email address."
        : "Couldn't save that. Try again shortly.");
    } finally {
      setBusyId(null);
    }
  }

  return (
    <section className="max-w-2xl mx-auto px-5 py-16">
      <SectionLabel>EMAIL SETTINGS</SectionLabel>
      <h1 className="mt-3" style={{ ...fD, fontWeight: 900, fontSize: 32, letterSpacing: -0.8 }}>
        Weekly digest
      </h1>
      <p className="mt-2" style={{ ...fB, fontSize: 15, color: T.muted }}>
        One email every Monday: the videos that beat their creator's usual numbers,
        from the sources you track. Turn it off or send it somewhere else below.
      </p>

      {error && (
        <p className="mt-4 rounded-lg px-4 py-3" style={{ ...fM, fontSize: 13, background: "#FDECEA", color: "#B3261E" }}>
          {error}
        </p>
      )}

      {!workspaces ? (
        <p className="mt-6" style={{ ...fB, fontSize: 14, color: T.muted }}>Loading…</p>
      ) : workspaces.length === 0 ? (
        <p className="mt-6" style={{ ...fB, fontSize: 14, color: T.muted }}>
          You don't have any workspaces yet — start tracking a source first.
        </p>
      ) : (
        <div className="mt-6 flex flex-col gap-4">
          {workspaces.map((w) => (
            <div key={w.id} className="rounded-xl p-5" style={{ background: T.card, border: `1px solid ${T.line}` }}>
              <div className="flex items-center justify-between gap-3">
                <div>
                  <div style={{ ...fD, fontWeight: 800, fontSize: 17 }}>{w.name}</div>
                  <div style={{ ...fM, fontSize: 12, color: T.muted }}>
                    {w.digestEnabled
                      ? w.digestEmail
                        ? `Sent to ${w.digestEmail}`
                        : `Sent to your account email`
                      : "Paused"}
                  </div>
                </div>
                <button
                  onClick={() => toggle(w)}
                  disabled={busyId === w.id}
                  aria-label={w.digestEnabled ? "Pause the weekly digest" : "Resume the weekly digest"}
                  className="relative shrink-0 rounded-full transition-colors"
                  style={{
                    width: 46, height: 26,
                    background: w.digestEnabled ? "#111111" : "#D4D4D4",
                    opacity: busyId === w.id ? 0.6 : 1,
                  }}
                >
                  <span
                    className="absolute top-0.5 rounded-full bg-white shadow"
                    style={{ width: 22, height: 22, left: w.digestEnabled ? 22 : 2 }}
                  />
                </button>
              </div>

              {w.digestEnabled && (
                <div className="mt-4">
                  <label htmlFor={`email-${w.id}`} style={{ ...fM, fontSize: 11, letterSpacing: 2, color: T.muted }}>
                    SEND TO
                  </label>
                  <div className="mt-2 flex flex-col sm:flex-row gap-2">
                    <input
                      id={`email-${w.id}`}
                      type="email"
                      value={emails[w.id] ?? ""}
                      onChange={(e) => setEmails((prev) => ({ ...prev, [w.id]: e.target.value }))}
                      placeholder={`${user.email} (account email)`}
                      className="flex-1 rounded-lg px-3 py-2.5 outline-none"
                      style={{ ...fB, fontSize: 14, background: "#fff", border: `1px solid ${T.line}`, color: T.ink }}
                    />
                    <button
                      onClick={() => saveEmail(w)}
                      disabled={busyId === w.id}
                      className="rounded-lg px-4 py-2.5"
                      style={{ ...fB, fontSize: 13, fontWeight: 700, background: "#111", color: "#fff", opacity: busyId === w.id ? 0.6 : 1 }}
                    >
                      {savedIds.has(w.id) ? "Saved ✓" : "Save"}
                    </button>
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      <div className="mt-6">
        <GhostButton to="/account">Back to account</GhostButton>
      </div>
    </section>
  );
}
