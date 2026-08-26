// React-query layer over lib/hookTests.js — one open test per video, the
// workspace-wide index, and mutations that resync every surface a test shows
// up on (panel query, /tests index, gallery badges).
//
// Spending mutations (start/reroll) deliberately pass no AbortSignal: closing
// the panel mid-generation must not orphan a generation the user paid for.

import { useCallback } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  getHookTestForVideo,
  listHookTests,
  startHookTest,
  updateHookTestLock,
  pickHookVersions,
  rerollHooks,
  closeHookTest,
} from "./hookTests.js";

/** GET /api/videos/:id/hook-test → { test | null }. */
export function useOpenHookTest({ accessToken, workspaceId, videoId }, options = {}) {
  return useQuery({
    queryKey: ["hook-test", workspaceId, videoId],
    queryFn: ({ signal }) => getHookTestForVideo(accessToken, { workspaceId, videoId }, signal),
    enabled: Boolean(accessToken && workspaceId && videoId && options.enabled !== false),
  });
}

/** GET /api/workspaces?resource=hook-tests → { tests } (the /tests index). */
export function useHookTestList({ accessToken, workspaceId, includeClosed }) {
  return useQuery({
    queryKey: ["hook-tests", workspaceId, includeClosed],
    queryFn: ({ signal }) => listHookTests(accessToken, { workspaceId, includeClosed }, signal),
    enabled: Boolean(accessToken && workspaceId),
  });
}

/**
 * A test change touches three caches: the per-video detail query (prefix
 * ["hook-test"]), the index (["hook-tests"]), and any gallery page whose
 * cards carry badges/filters. Runs on settle so conflict responses (409
 * "someone just opened one") also resync to server truth.
 */
function useInvalidateHookTests() {
  const qc = useQueryClient();
  return useCallback(() => {
    qc.invalidateQueries({ queryKey: ["hook-test"] });
    qc.invalidateQueries({ queryKey: ["hook-tests"] });
    qc.invalidateQueries({ queryKey: ["gallery"] });
  }, [qc]);
}

export function useStartHookTest() {
  const invalidate = useInvalidateHookTests();
  return useMutation({
    mutationFn: ({ accessToken, workspaceId, videoId, brandContext, insight }) =>
      startHookTest(accessToken, { workspaceId, videoId, brandContext, insight }),
    onSettled: invalidate,
  });
}

export function useUpdateHookTestLock() {
  const invalidate = useInvalidateHookTests();
  return useMutation({
    mutationFn: ({ accessToken, workspaceId, videoId, insight, sameIn }) =>
      updateHookTestLock(accessToken, { workspaceId, videoId, insight, sameIn }),
    onSettled: invalidate,
  });
}

export function usePickHookVersions() {
  const invalidate = useInvalidateHookTests();
  return useMutation({
    mutationFn: ({ accessToken, workspaceId, videoId, picks }) =>
      pickHookVersions(accessToken, { workspaceId, videoId, picks }),
    onSettled: invalidate,
  });
}

export function useRerollHooks() {
  const invalidate = useInvalidateHookTests();
  return useMutation({
    mutationFn: ({ accessToken, workspaceId, videoId }) =>
      rerollHooks(accessToken, { workspaceId, videoId }),
    onSettled: invalidate,
  });
}

export function useCloseHookTest() {
  const invalidate = useInvalidateHookTests();
  return useMutation({
    mutationFn: ({ accessToken, workspaceId, videoId, outcome, winner }) =>
      closeHookTest(accessToken, { workspaceId, videoId, outcome, winner }),
    onSettled: invalidate,
  });
}
