import { useEffect, useState } from "react";
import { Navigate } from "react-router-dom";
import { T, fD, fB, fM } from "../lib/theme.js";
import { SectionLabel, GhostButton } from "../components/ui.jsx";
import { useAuth } from "../lib/auth.jsx";
import { getDigestSettings, updateDigestSettings } from "../lib/api.js";

/**
 * /settings/email — turn the weekly digest on or off per workspace.
 * Delivery is one combined email per owner every Monday to the account
 * email; there is deliberately nothing else to configure here.
 */
export default function EmailSettings() {
  const { user, loading, accessToken } = useAuth();
  const [workspaces, setWorkspaces] = useState(null);
  const [error, setError] = useState("");
  const [busyId, setBusyId] = useState(null);

  useEffect(() => {
    if (!accessToken) return;
    getDigestSettings(accessToken)
      .then((data) => setWorkspaces(data.workspaces ?? []))
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

  return (
    <section className="max-w-2xl mx-auto px-5 py-16">
      <SectionLabel>EMAIL SETTINGS</SectionLabel>
      <h1 className="mt-3" style={{ ...fD, fontWeight: 900, fontSize: 32, letterSpacing: -0.8 }}>
        Weekly digest
      </h1>
      <p className="mt-2" style={{ ...fB, fontSize: 15, color: T.muted }}>
        One email every Monday to your account email: the videos taking off in the
        niches you track. Pause a workspace below to leave it out.
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
            <div key={w.id} className="flex items-center justify-between gap-3 rounded-xl p-5" style={{ background: T.card, border: `1px solid ${T.line}` }}>
              <div>
                <div style={{ ...fD, fontWeight: 800, fontSize: 17 }}>{w.name}</div>
                <div style={{ ...fM, fontSize: 12, color: T.muted }}>{w.digestEnabled ? "On" : "Off"}</div>
              </div>
              <button
                onClick={() => toggle(w)}
                disabled={busyId === w.id}
                aria-label={w.digestEnabled ? `Turn off the digest for ${w.name}` : `Turn on the digest for ${w.name}`}
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
          ))}
        </div>
      )}

      <div className="mt-6">
        <GhostButton to="/account">Back to account</GhostButton>
      </div>
    </section>
  );
}
