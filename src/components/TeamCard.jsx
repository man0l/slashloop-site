// Team panel on the Account page — deliberately NOT scoped to any active
// workspace. An invite always covers every workspace the caller owns: the
// teammate signs up with that email (Google login) and all of them appear in
// their switcher. Removing drops them from all owned workspaces at once.
import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { T, fB, fM } from "../lib/theme.js";
import { useAuth } from "../lib/auth.jsx";
import {
  listTeamRoster,
  inviteToAllWorkspaces,
  removeTeamMember,
  TeamApiError,
} from "../lib/team.js";

export default function TeamCard() {
  const { accessToken } = useAuth();
  const queryClient = useQueryClient();

  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteStatus, setInviteStatus] = useState("idle"); // idle | loading | error
  const [inviteError, setInviteError] = useState("");
  const [inviteResult, setInviteResult] = useState("");
  const [removingEmail, setRemovingEmail] = useState(null);

  const rosterQuery = useQuery({
    queryKey: ["team-roster", accessToken],
    queryFn: ({ signal }) => listTeamRoster(accessToken, signal),
    enabled: Boolean(accessToken),
    staleTime: 30_000,
  });

  const workspaces = rosterQuery.data?.workspaces ?? [];
  const teammates = new Map();
  for (const ws of workspaces) {
    for (const m of ws.members ?? []) {
      if (!teammates.has(m.email)) teammates.set(m.email, { email: m.email, workspaces: [] });
      teammates.get(m.email).workspaces.push(ws.name);
    }
  }
  const roster = [...teammates.values()].sort((a, b) => a.email.localeCompare(b.email));

  async function submitInvite(e) {
    e.preventDefault();
    if (!inviteEmail.trim()) return;
    setInviteStatus("loading");
    setInviteError("");
    setInviteResult("");
    try {
      const result = await inviteToAllWorkspaces(accessToken, inviteEmail.trim());
      const added = result.workspaces.filter((w) => w.status === "added").length;
      const existing = result.workspaces.filter((w) => w.status === "already_member").length;
      const skipped = result.workspaces.filter((w) => w.status === "skipped_limit").length;
      const parts = [];
      if (added) parts.push(`added to ${added} workspace${added === 1 ? "" : "s"}`);
      if (existing) parts.push(`already in ${existing}`);
      if (skipped) parts.push(`${skipped} full — not added`);
      setInviteResult(`${result.email} ${parts.join(", ")}. They sign up with that email and everything appears in their switcher.`);
      setInviteEmail("");
      setInviteStatus("idle");
      await queryClient.invalidateQueries({ queryKey: ["team-roster"] });
    } catch (err) {
      setInviteStatus("error");
      setInviteError(err instanceof TeamApiError ? err.message : "Couldn't send the invite — try again.");
    }
  }

  async function removeMember(email) {
    setRemovingEmail(email);
    try {
      await removeTeamMember(accessToken, email);
      await queryClient.invalidateQueries({ queryKey: ["team-roster"] });
    } catch {
      // Roster refetch on next focus heals a failed removal from view;
      // the row stays (no optimistic delete) so nothing silently vanishes.
    } finally {
      setRemovingEmail(null);
    }
  }

  return (
    <div className="mt-6 rounded-xl p-6" style={{ background: T.card, border: `1px solid ${T.line}` }}>
      <div style={{ ...fM, fontSize: 11, letterSpacing: 2, color: T.muted }}>TEAM</div>
      <p className="mt-1" style={{ ...fM, fontSize: 12, color: T.muted }}>
        Teammates sign in with their own Google account and get full access to every workspace
        you own — sources, gallery, calendar, and credits. Billing stays with you.
      </p>

      {rosterQuery.isLoading ? (
        <p className="mt-4" style={{ ...fM, fontSize: 13, color: T.muted }}>Loading teammates…</p>
      ) : rosterQuery.isError ? (
        <p className="mt-4" style={{ ...fM, fontSize: 13, color: "#B3261E" }}>
          {rosterQuery.error?.message || "Couldn't load the team."}{" "}
          <button type="button" onClick={() => rosterQuery.refetch()} style={{ ...fB, fontSize: 13, color: T.signal, textDecoration: "underline" }}>
            Retry
          </button>
        </p>
      ) : (
        <>
          {roster.length > 0 && (
            <ul className="mt-4 flex flex-col gap-2">
              {roster.map((m) => (
                <li key={m.email} className="flex items-center justify-between gap-3 rounded-lg px-3 py-2" style={{ border: `1px solid ${T.line}` }}>
                  <span>
                    <span style={{ ...fB, fontSize: 13 }}>{m.email}</span>
                    <span style={{ ...fM, fontSize: 11, color: T.muted }}> · {m.workspaces.join(", ")}</span>
                  </span>
                  <button
                    type="button"
                    onClick={() => removeMember(m.email)}
                    disabled={removingEmail !== null}
                    style={{ ...fM, fontSize: 12, color: T.muted, textDecoration: "underline" }}
                  >
                    {removingEmail === m.email ? "Removing…" : "Remove"}
                  </button>
                </li>
              ))}
            </ul>
          )}
          {roster.length === 0 && (
            <p className="mt-4" style={{ ...fM, fontSize: 13, color: T.muted }}>
              No teammates yet.
            </p>
          )}

          <form onSubmit={submitInvite} className="mt-4 flex flex-wrap items-center gap-2">
            <input
              type="email"
              required
              value={inviteEmail}
              onChange={(e) => setInviteEmail(e.target.value)}
              placeholder="teammate@email.com"
              aria-label="Teammate email"
              style={{ ...fB, fontSize: 13, padding: "8px 10px", borderRadius: 8, border: `1px solid ${T.line}`, background: T.card, minWidth: 220 }}
            />
            <button
              type="submit"
              disabled={inviteStatus === "loading"}
              style={{ ...fB, fontSize: 12, padding: "8px 14px", borderRadius: 8, background: T.signal, color: "#fff", opacity: inviteStatus === "loading" ? 0.7 : 1 }}
            >
              {inviteStatus === "loading" ? "Inviting…" : "Invite"}
            </button>
            {inviteResult && (
              <p className="basis-full" style={{ ...fM, fontSize: 12, color: "#1F5C2E" }}>
                {inviteResult}
              </p>
            )}
            {inviteError && (
              <p className="basis-full" style={{ ...fM, fontSize: 12, color: "#B3261E" }}>
                {inviteError}
              </p>
            )}
          </form>
        </>
      )}
    </div>
  );
}
