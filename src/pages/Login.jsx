import { useState } from "react";
import { Navigate, useSearchParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { T, fD, fB } from "../lib/theme.js";
import { SectionLabel, Spinner } from "../components/ui.jsx";
import { useAuth } from "../lib/auth.jsx";
import { useWorkspace } from "../lib/workspace.jsx";
import { listSources } from "../lib/sources.js";

export default function Login() {
  const { user, signInWithOAuth } = useAuth();
  const [params] = useSearchParams();
  const next = params.get("next") || "/account";

  const [status, setStatus] = useState("idle"); // idle | loading | error
  const [error, setError] = useState("");

  if (user && next !== "/account") return <Navigate to={next} replace />;
  // An explicit ?next means the user was trying to reach something specific —
  // honor it above. The DEFAULT destination ("/account", including its
  // round-trip through the OAuth redirect) is where first-run routing kicks
  // in: an account that tracks nothing yet activates better on /discover.
  if (user) return <FirstRunGate />;

  async function oauth(provider) {
    setStatus("loading");
    setError("");
    const redirectTo = `${window.location.origin}/login?next=${encodeURIComponent(next)}`;
    const { error: authError } = await signInWithOAuth(provider, redirectTo);
    if (authError) {
      setStatus("error");
      setError(authError.message);
      return;
    }
    // supabase-js redirects the browser to the provider; nothing left to do here.
  }

  return (
    <section className="max-w-sm mx-auto px-5 py-20">
      <SectionLabel>SIGN IN</SectionLabel>
      <h1 className="mt-3" style={{ ...fD, fontWeight: 900, fontSize: 30, letterSpacing: -0.8 }}>
        Welcome back
      </h1>

      <div className="mt-6 flex flex-col gap-3">
        <button
          type="button"
          onClick={() => oauth("google")}
          disabled={status === "loading"}
          className={`flex items-center justify-center gap-2 rounded-md px-4 py-3 transition-colors ${status === "loading" ? "opacity-50 pointer-events-none" : ""}`}
          style={{ ...fB, fontSize: 14, fontWeight: 600, background: T.card, border: `1.5px solid ${T.ink}`, color: T.ink }}
        >
          <svg width="16" height="16" viewBox="0 0 48 48" aria-hidden="true">
            <path fill="#FFC107" d="M43.6 20.5H42V20H24v8h11.3C33.7 32.7 29.3 36 24 36c-6.6 0-12-5.4-12-12s5.4-12 12-12c3.1 0 5.8 1.1 8 3l5.7-5.7C34.6 6 29.6 4 24 4 12.9 4 4 12.9 4 24s8.9 20 20 20 20-8.9 20-20c0-1.3-.1-2.7-.4-3.5z"/>
            <path fill="#FF3D00" d="M6.3 14.7l6.6 4.8C14.6 15.9 18.9 13 24 13c3.1 0 5.8 1.1 8 3l5.7-5.7C34.6 6 29.6 4 24 4 16.3 4 9.6 8.3 6.3 14.7z"/>
            <path fill="#4CAF50" d="M24 44c5.5 0 10.4-1.9 14.2-5.1l-6.6-5.4C29.6 35.2 26.9 36 24 36c-5.3 0-9.7-3.3-11.3-8l-6.6 5.1C9.5 39.6 16.2 44 24 44z"/>
            <path fill="#1976D2" d="M43.6 20.5H42V20H24v8h11.3c-.8 2.3-2.3 4.3-4.3 5.7l6.6 5.4C39.9 37 44 31 44 24c0-1.3-.1-2.7-.4-3.5z"/>
          </svg>
          Continue with Google
        </button>
        <button
          type="button"
          onClick={() => oauth("github")}
          disabled={status === "loading"}
          className={`flex items-center justify-center gap-2 rounded-md px-4 py-3 transition-colors ${status === "loading" ? "opacity-50 pointer-events-none" : ""}`}
          style={{ ...fB, fontSize: 14, fontWeight: 600, background: T.ink, border: `1.5px solid ${T.ink}`, color: "#fff" }}
        >
          <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor" aria-hidden="true">
            <path d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27.68 0 1.36.09 2 .27 1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.01 8.01 0 0 0 16 8c0-4.42-3.58-8-8-8z"/>
          </svg>
          Continue with GitHub
        </button>
      </div>

      {status === "error" && (
        <p className="mt-3" style={{ ...fB, fontSize: 12, color: "#B3261E" }}>{error}</p>
      )}
    </section>
  );
}

/**
 * Default-destination routing: send brand-new workspaces to /discover (their
 * niche isn't tracked yet — activation IS seeing a first outlier), everyone
 * else on to /account as before. Shares the ["sources", workspaceId] cache
 * with the Sources/Discover pages, so this costs no extra fetch right after
 * tracking something.
 */
function FirstRunGate() {
  const { accessToken } = useAuth();
  const { activeWorkspaceId, loading: workspaceLoading } = useWorkspace();

  const sourcesQuery = useQuery({
    queryKey: ["sources", activeWorkspaceId],
    queryFn: ({ signal }) => listSources(accessToken, activeWorkspaceId, {}, signal),
    enabled: Boolean(accessToken && activeWorkspaceId),
  });

  // Auth or workspace still resolving -> wait here.
  if (!accessToken || workspaceLoading || (Boolean(activeWorkspaceId) && sourcesQuery.isPending)) {
    return (
      <section className="flex items-center justify-center py-24" role="status" aria-label="Preparing your workspace">
        <Spinner />
      </section>
    );
  }
  // Signed in but no workspace yet -> /discover renders its own
  // "create a workspace above first" state.
  if (!activeWorkspaceId) return <Navigate to="/discover" replace />;
  if (sourcesQuery.isError) return <Navigate to="/account" replace />;
  return <Navigate replace to={(sourcesQuery.data ?? []).length > 0 ? "/account" : "/discover"} />;
}
