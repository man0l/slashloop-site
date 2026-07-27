import { useState } from "react";
import { Navigate, useSearchParams } from "react-router-dom";
import { T, fD, fB, fM } from "../lib/theme.js";
import { SectionLabel, CTAButton } from "../components/ui.jsx";
import { useAuth } from "../lib/auth.jsx";

export default function Login() {
  const { user, signInWithPassword, signUp } = useAuth();
  const [params] = useSearchParams();
  const next = params.get("next") || "/account";

  const [mode, setMode] = useState("signin"); // signin | signup
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [status, setStatus] = useState("idle"); // idle | loading | error | check-email
  const [error, setError] = useState("");

  if (user) return <Navigate to={next} replace />;

  async function submit(e) {
    e.preventDefault();
    setStatus("loading");
    setError("");
    const fn = mode === "signin" ? signInWithPassword : signUp;
    const { error: authError, data } = await fn(email, password);
    if (authError) {
      setStatus("error");
      setError(authError.message);
      return;
    }
    if (mode === "signup" && !data?.session) {
      // Email confirmation required by the Supabase project settings.
      setStatus("check-email");
      return;
    }
    // Session set by signInWithPassword/signUp triggers onAuthStateChange;
    // the <Navigate> above fires on the next render.
  }

  return (
    <section className="max-w-sm mx-auto px-5 py-20">
      <SectionLabel>{mode === "signin" ? "SIGN IN" : "CREATE ACCOUNT"}</SectionLabel>
      <h1 className="mt-3" style={{ ...fD, fontWeight: 900, fontSize: 30, letterSpacing: -0.8 }}>
        {mode === "signin" ? "Welcome back" : "Start free"}
      </h1>

      {status === "check-email" ? (
        <div className="mt-6 rounded-md px-4 py-3" style={{ background: "#E4F0ED", border: `1px solid ${T.teal}` }}>
          <span style={{ ...fM, fontSize: 13, color: T.teal }}>Check your inbox</span>
          <p className="mt-1" style={{ fontSize: 13, color: T.ink }}>
            We sent a confirmation link to {email}. Click it, then come back and sign in.
          </p>
        </div>
      ) : (
        <form onSubmit={submit} className="mt-6 flex flex-col gap-3">
          <input
            type="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="you@yourapp.dev"
            className="rounded-md px-4 py-3 outline-none"
            style={{ ...fM, fontSize: 14, background: T.card, border: `1.5px solid ${T.ink}`, color: T.ink }}
          />
          <input
            type="password"
            required
            minLength={6}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="password"
            className="rounded-md px-4 py-3 outline-none"
            style={{ ...fM, fontSize: 14, background: T.card, border: `1.5px solid ${T.ink}`, color: T.ink }}
          />
          {status === "error" && (
            <p style={{ ...fM, fontSize: 12, color: "#B3261E" }}>{error}</p>
          )}
          <CTAButton big disabled={status === "loading"}>
            {status === "loading" ? "…" : mode === "signin" ? "Sign in →" : "Create account →"}
          </CTAButton>
        </form>
      )}

      <button
        onClick={() => { setMode(mode === "signin" ? "signup" : "signin"); setStatus("idle"); setError(""); }}
        className="mt-4"
        style={{ ...fB, fontSize: 13, color: T.muted, textDecoration: "underline" }}
      >
        {mode === "signin" ? "New here? Create an account" : "Already have an account? Sign in"}
      </button>
    </section>
  );
}
