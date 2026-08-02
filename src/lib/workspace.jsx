// Tracks which of the user's workspaces is active across the Sources and
// Gallery pages. A user may own several (agencies running one per client,
// see WORKSPACE_LIMITS in the slashloop repo) — this is the switcher's state.
import { createContext, useContext, useEffect, useState, useCallback } from "react";
import { useAuth } from "./auth.jsx";
import { listWorkspaces, createWorkspace as apiCreateWorkspace, WorkspacesApiError } from "./workspaces.js";

const WorkspaceContext = createContext(null);

const ACTIVE_ID_KEY = "slashloop:activeWorkspaceId";

export function WorkspaceProvider({ children }) {
  const { accessToken } = useAuth();
  const [workspaces, setWorkspaces] = useState([]);
  const [activeWorkspaceId, setActiveWorkspaceIdState] = useState(
    () => localStorage.getItem(ACTIVE_ID_KEY) || null,
  );
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const setActiveWorkspaceId = useCallback((id) => {
    setActiveWorkspaceIdState(id);
    if (id) localStorage.setItem(ACTIVE_ID_KEY, id);
    else localStorage.removeItem(ACTIVE_ID_KEY);
  }, []);

  const refresh = useCallback(() => {
    if (!accessToken) {
      setWorkspaces([]);
      return Promise.resolve();
    }
    setLoading(true);
    setError("");
    return listWorkspaces(accessToken)
      .then((list) => {
        setWorkspaces(list);
        // Default to the oldest workspace (list is server-sorted createdAt asc)
        // unless the persisted id still refers to one the user owns.
        setActiveWorkspaceIdState((current) => {
          if (current && list.some((w) => w.id === current)) return current;
          const fallback = list[0]?.id ?? null;
          if (fallback) localStorage.setItem(ACTIVE_ID_KEY, fallback);
          return fallback;
        });
      })
      .catch((err) => setError(err instanceof WorkspacesApiError ? err.message : "Couldn't load workspaces."))
      .finally(() => setLoading(false));
  }, [accessToken]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const createWorkspace = useCallback(
    async (name) => {
      const workspace = await apiCreateWorkspace(accessToken, name);
      await refresh();
      setActiveWorkspaceId(workspace.id);
      return workspace;
    },
    [accessToken, refresh, setActiveWorkspaceId],
  );

  const value = {
    workspaces,
    activeWorkspaceId,
    activeWorkspace: workspaces.find((w) => w.id === activeWorkspaceId) ?? null,
    setActiveWorkspaceId,
    loading,
    error,
    refresh,
    createWorkspace,
  };

  return <WorkspaceContext.Provider value={value}>{children}</WorkspaceContext.Provider>;
}

export function useWorkspace() {
  const ctx = useContext(WorkspaceContext);
  if (!ctx) throw new Error("useWorkspace must be used within WorkspaceProvider");
  return ctx;
}
