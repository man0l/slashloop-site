import { useState } from "react";
import { Link } from "react-router-dom";
import { T, fB, fM } from "../lib/theme.js";
import { useWorkspace } from "../lib/workspace.jsx";
import { WorkspacesApiError } from "../lib/workspaces.js";

const selectStyle = {
  ...fB,
  fontSize: 13,
  padding: "8px 10px",
  borderRadius: 8,
  border: `1.5px solid ${T.ink}`,
  background: T.card,
  color: T.ink,
};

export default function WorkspaceSwitcher() {
  const { workspaces, activeWorkspaceId, setActiveWorkspaceId, loading, error, createWorkspace } = useWorkspace();
  const [creating, setCreating] = useState(false);
  const [name, setName] = useState("");
  const [createStatus, setCreateStatus] = useState("idle"); // idle | loading | error
  const [createError, setCreateError] = useState("");
  const [createErrorCode, setCreateErrorCode] = useState("");

  async function submitCreate(e) {
    e.preventDefault();
    if (!name.trim()) return;
    setCreateStatus("loading");
    setCreateError("");
    setCreateErrorCode("");
    try {
      await createWorkspace(name.trim());
      setName("");
      setCreating(false);
      setCreateStatus("idle");
    } catch (err) {
      setCreateStatus("error");
      setCreateError(err instanceof WorkspacesApiError ? err.message : "Couldn't create workspace — try again in a moment.");
      setCreateErrorCode(err instanceof WorkspacesApiError ? err.code : "");
    }
  }

  return (
    <div className="flex flex-wrap items-center gap-3">
      <select
        style={selectStyle}
        value={activeWorkspaceId ?? ""}
        onChange={(e) => setActiveWorkspaceId(e.target.value)}
        disabled={loading || workspaces.length === 0}
        aria-label="Active workspace"
      >
        {workspaces.length === 0 && <option value="">No workspaces yet</option>}
        {workspaces.map((w) => (
          <option key={w.id} value={w.id}>
            {w.name} · {w.planKey}
          </option>
        ))}
      </select>

      {!creating ? (
        <button
          type="button"
          onClick={() => setCreating(true)}
          style={{ ...fM, fontSize: 12, color: T.signal }}
        >
          + New workspace
        </button>
      ) : (
        <form onSubmit={submitCreate} className="flex items-center gap-2">
          <input
            autoFocus
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Workspace name"
            style={{ ...fB, fontSize: 13, padding: "7px 9px", borderRadius: 8, border: `1px solid ${T.line}`, background: T.card }}
          />
          <button
            type="submit"
            disabled={createStatus === "loading"}
            style={{ ...fB, fontSize: 12, padding: "7px 12px", borderRadius: 8, background: T.signal, color: "#fff" }}
          >
            {createStatus === "loading" ? "Creating…" : "Create"}
          </button>
          <button
            type="button"
            onClick={() => { setCreating(false); setCreateError(""); setCreateErrorCode(""); }}
            style={{ ...fB, fontSize: 12, color: T.muted }}
          >
            Cancel
          </button>
        </form>
      )}

      {(error || createError) && (
        <div
          role="alert"
          className="flex items-start gap-2 rounded-md px-3 py-2 w-full basis-full"
          style={{ background: "#FDECEA", border: "1px solid #F3B5AE" }}
        >
          <span style={{ ...fB, fontSize: 13, lineHeight: 1.4, color: "#7A1F17" }}>
            {createError || error}
          </span>
          {createErrorCode === "workspace_limit_reached" && (
            <Link
              to="/pricing"
              className="shrink-0"
              style={{ ...fM, fontSize: 12, color: T.signal, textDecoration: "underline" }}
            >
              Upgrade →
            </Link>
          )}
        </div>
      )}
    </div>
  );
}
