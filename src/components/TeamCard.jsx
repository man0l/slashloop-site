// Team roster manager for one workspace, shown on the Account page. The
// owner invites by email; teammates see the roster read-only (the server
// rejects their invite/remove attempts — owner-only, no roles yet).
// Membership is by login email: a teammate keeps their own Google sign-in and
// the shared workspace just shows up in their switcher.
import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { T, fB, fM } from "../lib/theme.js";
import { useWorkspace } from "../lib/workspace.jsx";
import { useAuth } from "../lib/auth.jsx";
import {
  listWorkspaceMembers,
  inviteWorkspaceMember,
  removeWorkspaceMember,
  TeamApiError,
} from "../lib/team.js";

export default function TeamCard() {
  const { accessToken } = useAuth();
  const { activeWorkspaceId, activeWorkspace } = useWorkspace();
  const queryClient = useQueryClient();

  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteStatus, setInviteStatus] = useState("idle"); // idle | loading | error
  const [inviteError, setInviteError] = useState("");
  const [removingEmail, setRemovingEmail] = useState(null);

  const membersQuery = useQuery({
    queryKey: ["team", activeWorkspaceId, accessToken],
    queryFn: ({ signal }) => listWorkspaceMembers(accessToken, activeWorkspaceId, signal),
    enabled: Boolean(accessToken && activeWorkspaceId),
    staleTime: 30_000,
  });

  const members = membersQuery.data?.members ?? [];
  const isOwner = activeWorkspace?.role !== "member"; // pre-team lists have no role — owners

  async function submitInvite(e) {
    e.preventDefault();
    if (!inviteEmail.trim() || !activeWorkspaceId) return;
    setInviteStatus("loading");
    setInviteError("");
    try {
      await inviteWorkspaceMember(accessToken, activeWorkspaceId, inviteEmail.trim());
      setInviteEmail("");
      setInviteStatus("idle");
      await queryClient.invalidateQueries({ queryKey: ["team", activeWorkspaceId] });
    } catch (err) {
      setInviteStatus("error");
      setInviteError(err instanceof TeamApiError ? err.message : "Couldn't send the invite — try again.");
    }
  }

  async function removeMember(email) {
    setRemovingEmail(email);
    try {
      await removeWorkspaceMember(accessToken, activeWorkspaceId, email);
      await queryClient.invalidateQueries({ queryKey: ["team", activeWorkspaceId] });
    } finally {
      setRemovingEmail(null);
    }
  }

  return (
    <div className="mt-6 rounded-xl p-6" style={{ background: T.card, border: `1px solid ${T.line}` }}>
      <div style={{ ...fM, fontSize: 11, letterSpacing: 2, color: T.muted }}>TEAM</div>
      <p className="mt-1" style={{ ...fM, fontSize: 13, color: T.ink }}>
        {activeWorkspace ? activeWorkspace.name : "…"}
        {activeWorkspace?.role === "member" ? " (shared with you)" : ""}
      </p>
      <p className="mt-1" style={{ ...fM, fontSize: 12, color: T.muted }}>
        Teammates sign in with their own Google account and get full access to this workspace —
        sources, gallery, calendar, and credits. Billing stays with the owner.
      </p>

      {membersQuery.isLoading ? (
        <p className="mt-4" style={{ ...fM, fontSize: 13, color: T.muted }}>Loading teammates…</p>
      ) : membersQuery.isError ? (
        <p className="mt-4" style={{ ...fM, fontSize: 13, color: "#B3261E" }}>
          {membersQuery.error?.message || "Couldn't load the team."}{" "}
          <button type="button" onClick={() => membersQuery.refetch()} style={{ ...fB, fontSize: 13, color: T.signal, textDecoration: "underline" }}>
            Retry
          </button>
        </p>
      ) : (
        <>
          {members.length > 0 && (
            <ul className="mt-4 flex flex-col gap-2">
              {members.map((m) => (
                <li key={m.id} className="flex items-center justify-between gap-3 rounded-lg px-3 py-2" style={{ border: `1px solid ${T.line}` }}>
                  <span style={{ ...fB, fontSize: 13 }}>{m.email}</span>
                  {isOwner && (
                    <button
                      type="button"
                      onClick={() => removeMember(m.email)}
                      disabled={removingEmail !== null}
                      style={{ ...fM, fontSize: 12, color: T.muted, textDecoration: "underline" }}
                    >
                      {removingEmail === m.email ? "Removing…" : "Remove"}
                    </button>
                  )}
                </li>
              ))}
            </ul>
          )}
          {members.length === 0 && (
            <p className="mt-4" style={{ ...fM, fontSize: 13, color: T.muted }}>
              No teammates yet.
            </p>
          )}

          {isOwner && (
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
              {inviteError && (
                <p className="basis-full" style={{ ...fM, fontSize: 12, color: "#B3261E" }}>
                  {inviteError}
                </p>
              )}
            </form>
          )}
        </>
      )}
    </div>
  );
}
