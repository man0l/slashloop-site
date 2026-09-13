// /calendar — schedule posts to connected platforms (TikTok / YouTube /
// Instagram). Thin page: connects the reusable src/calendar module to the
// mcp.slashloop.dev API via src/lib/social.js, plus the connect-accounts
// row and the OAuth-callback status banner.

import { useEffect, useMemo, useState } from "react";
import { Navigate, useNavigate, useSearchParams } from "react-router-dom";
import { T, fD, fB, fM } from "../lib/theme.js";
import { SectionLabel, Spinner } from "../components/ui.jsx";
import { useAuth } from "../lib/auth.jsx";
import { CalendarView, providerMeta } from "../calendar/index.js";
import { createApiAdapter } from "../lib/social.js";

const CONNECT_STATUS = {
  ok: { tone: "ok", text: "Account connected — you can schedule to it now." },
  error: { tone: "error", text: "Connecting that account failed. Check the platform app setup and try again." },
  expired: { tone: "error", text: "The connect attempt timed out — start it again." },
};

function PageBanner({ tone, text, onDismiss }) {
  const ok = tone === "ok";
  return (
    <div
      role={ok ? "status" : "alert"}
      className="flex items-start justify-between gap-2 rounded-md px-3 py-2"
      style={{
        background: ok ? "#EAF7EE" : "#FDECEA",
        border: `1px solid ${ok ? "#BCE0C6" : "#F3B5AE"}`,
      }}
    >
      <span style={{ ...fB, fontSize: 13, lineHeight: 1.4, color: ok ? "#1F5C2E" : "#7A1F17" }}>{text}</span>
      {onDismiss && (
        <button type="button" onClick={onDismiss} style={{ color: ok ? "#1F5C2E" : "#7A1F17" }} aria-label="Dismiss">
          ✕
        </button>
      )}
    </div>
  );
}

export default function CalendarPage() {
  const { user, loading, accessToken } = useAuth();
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const [banner, setBanner] = useState(null);
  const [integrations, setIntegrations] = useState([]);
  const [configured, setConfigured] = useState([]);
  const [integrationsLoaded, setIntegrationsLoaded] = useState(false);

  const adapter = useMemo(() => createApiAdapter(accessToken), [accessToken]);
  const refreshIntegrations = useMemo(
    () => () => {
      if (!accessToken) return;
      adapter
        .listIntegrations()
        .then(({ integrations: rows, configured: providers }) => {
          setIntegrations(rows);
          setConfigured(providers);
        })
        .catch(() => setIntegrations([]))
        .finally(() => setIntegrationsLoaded(true));
    },
    [adapter, accessToken],
  );

  // Connected-account status feeds both the composer and the connect row;
  // reload it whenever the OAuth callback redirects back with ?connect=.
  useEffect(() => {
    refreshIntegrations();
  }, [refreshIntegrations, searchParams]);

  if (loading) {
    return (
      <main className="flex items-center justify-center py-24" role="status" aria-label="Loading">
        <Spinner />
      </main>
    );
  }
  if (!user) return <Navigate to="/login" replace />;

  const connectStatus = CONNECT_STATUS[searchParams.get("connect")];

  async function connect(provider) {
    try {
      const { url } = await adapter.connectUrl(provider);
      window.location.href = url; // full redirect — the callback bounces back here
    } catch (err) {
      setBanner({ tone: "error", text: err.message || "Could not start the connect flow." });
    }
  }

  async function disconnect(id) {
    try {
      await adapter.disconnect(id);
      refreshIntegrations();
    } catch (err) {
      setBanner({ tone: "error", text: err.message || "Could not disconnect." });
    }
  }

  const knownProviders = ["tiktok", "youtube", "instagram"];
  const connectedProviders = new Set(integrations.map((row) => row.provider));  return (
    <main className="max-w-5xl mx-auto px-5 py-8">
      <SectionLabel>Scheduler</SectionLabel>
      <h1 style={{ ...fD, fontWeight: 800, fontSize: 26 }} className="mt-1">
        Post calendar
      </h1>
      <p style={{ ...fM, fontSize: 13, color: T.muted }} className="mt-1">
        Plan posts across platforms — drag to reschedule, click a day to create.
      </p>

      {connectStatus && (
        <div className="mt-4">
          <PageBanner tone={connectStatus.tone} text={connectStatus.text} onDismiss={() => navigate("/calendar", { replace: true })} />
        </div>
      )}
      {banner && (
        <div className="mt-4">
          <PageBanner tone={banner.tone} text={banner.text} onDismiss={() => setBanner(null)} />
        </div>
      )}

      <section className="mt-6">
        <h2 style={{ ...fB, fontSize: 14, fontWeight: 600 }} className="mb-2">
          Connected accounts
        </h2>
        {!integrationsLoaded ? (
          <Spinner />
        ) : (
          <div className="flex flex-col gap-3">
            {integrations.length === 0 && configured.length === 0 && (
              <p className="rounded-md px-3 py-2" style={{ background: "#FFF8E6", border: "1px solid #EAD39B", ...fB, fontSize: 13, color: "#7A5B00" }}>
                No platforms are configured on the server yet. Create the developer apps (TikTok / Google / Meta), register the redirect
                URI <code>mcp.slashloop.dev/api/social/callback/&lt;provider&gt;</code> in each, then set the <code>SOCIAL_*</code> secrets on the
                worker — the connect buttons appear here automatically.
              </p>
            )}
            <div className="flex flex-wrap items-center gap-2">
            {integrations.map((integration) => {
              const meta = providerMeta(integration.provider);
              return (
                <span
                  key={integration.id}
                  className="flex items-center gap-2 rounded-lg px-3 py-1.5"
                  style={{ border: `1px solid ${T.line}`, background: T.card, ...fM, fontSize: 13 }}
                >
                  <span className="rounded px-1 text-[10px] font-bold text-white" style={{ background: meta.accent }}>
                    {meta.glyph}
                  </span>
                  {integration.name || meta.label}
                  {integration.profile ? <span style={{ color: T.muted }}>@{integration.profile}</span> : null}
                  <button type="button" onClick={() => disconnect(integration.id)} style={{ color: T.muted }} className="hover:text-red-400">
                    ✕
                  </button>
                </span>
              );
            })}
            {knownProviders
              .filter((provider) => !connectedProviders.has(provider) && configured.includes(provider))
              .map((provider) => {
                const meta = providerMeta(provider);
                return (
                  <button
                    key={provider}
                    type="button"
                    onClick={() => connect(provider)}
                    title={meta.note}
                    className="flex items-center gap-2 rounded-lg px-3 py-1.5 hover:opacity-90"
                    style={{ border: `1px dashed ${T.line}`, background: "transparent", ...fM, fontSize: 13, color: T.muted }}
                  >
                    <span className="rounded px-1 text-[10px] font-bold text-white" style={{ background: meta.accent }}>
                      {meta.glyph}
                    </span>
                    Connect {meta.label}
                  </button>
                );
              })}
            </div>
          </div>
        )}
      </section>

      <section className="mt-8">
        <CalendarView
          adapter={adapter}
          onError={(err) =>
            setBanner({
              tone: err?.status === 409 ? "error" : "error",
              text:
                err?.status === 409
                  ? "That post is publishing right now — try moving it again in a moment."
                  : err?.message || "Something went wrong talking to the scheduler.",
            })
          }
        />
      </section>
    </main>
  );
}
