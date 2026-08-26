import { Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { T, fB } from "../lib/theme.js";
import { useAuth } from "../lib/auth.jsx";
import { useWorkspace } from "../lib/workspace.jsx";
import { listSources } from "../lib/sources.js";

/**
 * The three-step onboarding strip, shown on every app page until the first
 * source is tracked — so a user who deep-linked straight to Sources or
 * Gallery (llms.txt, bookmarks, the nav) still sees how to finish onboarding.
 * Discover keeps its own contextual copy inside the niche form ("below"),
 * which is why this component isn't mounted there.
 *
 * Shares the ["sources", workspaceId] cache with the Sources/Discover pages,
 * so on those it costs no extra fetch; elsewhere it's one cheap GET. Hidden
 * while anything is still resolving to avoid a flash, and once onboarding is
 * complete (>= 1 source tracked) it never renders again.
 */
export default function FirstRunSteps() {
  const { user, accessToken } = useAuth();
  const { activeWorkspaceId, loading: workspaceLoading } = useWorkspace();

  const sourcesQuery = useQuery({
    queryKey: ["sources", activeWorkspaceId],
    queryFn: ({ signal }) => listSources(accessToken, activeWorkspaceId, {}, signal),
    enabled: Boolean(user && accessToken && activeWorkspaceId),
  });

  if (!user || workspaceLoading) return null;
  // No workspace yet is the purest first run — show the steps. With a
  // workspace, wait for the count: pending or a failed fetch means we can't
  // tell, and nagging someone who may have finished onboarding is worse than
  // staying quiet.
  if (activeWorkspaceId && (sourcesQuery.isPending || sourcesQuery.isError || (sourcesQuery.data ?? []).length > 0)) {
    return null;
  }

  return (
    <div
      className="mt-4 flex flex-wrap items-center gap-x-5 gap-y-2 rounded-lg px-3 py-2.5"
      style={{ background: "#F9F7FF", border: `1px dashed #7C5CFF` }}
      data-testid="first-run-steps"
    >
      <span style={{ ...fB, fontSize: 12, fontWeight: 700, color: "#7C5CFF" }}>Finish setting up</span>
      <Link to="/discover" style={{ ...fB, fontSize: 12, color: T.ink, textDecoration: "underline" }}>
        ① Describe your niche on Discover
      </Link>
      <span style={{ ...fB, fontSize: 12, color: T.ink }}>② Track 2–3 of the suggestions — your free allowance</span>
      <Link to="/gallery" style={{ ...fB, fontSize: 12, color: T.ink, textDecoration: "underline" }}>
        ③ Watch your outliers land in the Gallery
      </Link>
    </div>
  );
}
