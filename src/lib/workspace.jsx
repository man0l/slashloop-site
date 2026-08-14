// Tracks which of the user's workspaces is active across the Sources and
// Gallery pages. A user may own several (agencies running one per client,
// see WORKSPACE_LIMITS in the slashloop repo) — this is the switcher's state.
//
// The list itself lives in TanStack Query (['workspaces']): keying on the
// access token means a sign-out → sign-in swap automatically refetches under
// the new session, and an in-flight response for the old session can never
// land on top of the new one (query keys don't share cache entries).
import { createContext, useCallback, useContext, useEffect, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "./auth.jsx";
import { listWorkspaces, createWorkspace as apiCreateWorkspace, WorkspacesApiError } from "./workspaces.js";

const WorkspaceContext = createContext(null);

const ACTIVE_ID_KEY = "slashloop:activeWorkspaceId";

export function WorkspaceProvider({ children }) {
  const { accessToken } = useAuth();
  const queryClient = useQueryClient();
  const [activeWorkspaceId, setActiveWorkspaceIdState] = useState(
    () => localStorage.getItem(ACTIVE_ID_KEY) || null,
  );

  const setActiveWorkspaceId = useCallback((id) => {
    setActiveWorkspaceIdState(id);
    if (id) localStorage.setItem(ACTIVE_ID_KEY, id);
    else localStorage.removeItem(ACTIVE_ID_KEY);
  }, []);

  const { data: workspaces = [], isLoading: loading, error, refetch } = useQuery({
    queryKey: ["workspaces", accessToken],
    queryFn: ({ signal }) => listWorkspaces(accessToken, signal),
    enabled: Boolean(accessToken),
    staleTime: 60_000,
  });

  // Default to the oldest workspace (list is server-sorted createdAt asc)
  // unless the persisted id still refers to one the user owns.
  useEffect(() => {
    if (!accessToken || workspaces.length === 0) return;
    setActiveWorkspaceIdState((current) => {
      if (current && workspaces.some((w) => w.id === current)) return current;
      const fallback = workspaces[0]?.id ?? null;
      if (fallback) localStorage.setItem(ACTIVE_ID_KEY, fallback);
      return fallback;
    });
  }, [accessToken, workspaces]);

  // Signing out clears the switcher; signing back in re-reads the persisted
  // choice before the validator below re-defaults it to the oldest workspace.
  useEffect(() => {
    if (!accessToken) {
      setActiveWorkspaceIdState(null);
      return;
    }
    const persisted = localStorage.getItem(ACTIVE_ID_KEY);
    if (persisted) setActiveWorkspaceIdState(persisted);
  }, [accessToken]);

  const createWorkspace = useCallback(
    async (name) => {
      const workspace = await apiCreateWorkspace(accessToken, name);
      await queryClient.invalidateQueries({ queryKey: ["workspaces"] });
      setActiveWorkspaceId(workspace.id);
      return workspace;
    },
    [accessToken, queryClient, setActiveWorkspaceId],
  );

  const value = {
    workspaces,
    activeWorkspaceId,
    activeWorkspace: workspaces.find((w) => w.id === activeWorkspaceId) ?? null,
    setActiveWorkspaceId,
    loading,
    error: error ? (error instanceof WorkspacesApiError ? error.message : "Couldn't load workspaces.") : "",
    refresh: refetch,
    createWorkspace,
  };

  return <WorkspaceContext.Provider value={value}>{children}</WorkspaceContext.Provider>;
}

export function useWorkspace() {
  const ctx = useContext(WorkspaceContext);
  if (!ctx) throw new Error("useWorkspace must be used within WorkspaceProvider");
  return ctx;
}
