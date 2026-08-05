// Per-card state machine for "Analyze with Gemini" in the gallery.
//
//   idle -> checking (lazy GET detail on first hover) -> prompt | queued/running/polling | done | failed
//                                        \-- from a direct click (mobile) -- queued -> ... -> done | failed
//
// The lazy hydrate exists so an already-analyzed video is never charged twice:
// clicking analyze re-runs Gemini and debits credits, so the card only offers
// the action once the detail endpoint has confirmed the video is unexplored.

import { useCallback, useEffect, useRef, useState } from "react";
import { getVideoDetail, analyzeVideo, friendlyAnalysisError, friendlyJobError } from "./video.js";

// A queued native analysis takes ~20-60s+ and the worker drains in ~45s
// batches, so we poll every 4s and give up (as a retryable failure) after 4m
// rather than inferring a terminal state the endpoint hasn't confirmed yet.
const POLL_MS = 4000;
const POLL_CAP_MS = 4 * 60 * 1000;

export default function useVideoAnalysis({ accessToken, workspaceId, videoId }) {
  // idle | checking | prompt | queued | running | done | failed
  const [phase, setPhase] = useState("idle");
  const [detail, setDetail] = useState(null);
  const [error, setError] = useState(null); // { kind, retryable, message }
  const hydrated = useRef(false);
  const pollTimer = useRef(null);
  const pollStart = useRef(0);

  const busy = phase === "checking" || phase === "queued" || phase === "running";

  const stopPolling = useCallback(() => {
    if (pollTimer.current) {
      clearInterval(pollTimer.current);
      pollTimer.current = null;
    }
  }, []);

  // Clear any in-flight poll on unmount.
  useEffect(() => stopPolling, [stopPolling]);

  const startPolling = useCallback(
    (initialStatus) => {
      setPhase(initialStatus === "running" ? "running" : "queued");
      pollStart.current = Date.now();
      stopPolling();
      pollTimer.current = setInterval(async () => {
        if (Date.now() - pollStart.current > POLL_CAP_MS) {
          stopPolling();
          setError({ kind: "failure", retryable: true, message: "Analysis is still running — tap retry to check again." });
          setPhase("failed");
          return;
        }
        let d;
        try {
          d = await getVideoDetail(accessToken, { workspaceId, videoId });
        } catch {
          // A transient poll error (timeout, timeout blip) shouldn't fail the
          // card — keep polling; the next tick decides.
          return;
        }
        setDetail(d);
        if (d.analysis) {
          stopPolling();
          setPhase("done");
          return;
        }
        if (d.analysisJob?.status === "failed") {
          stopPolling();
          setError(friendlyJobError(d.analysisJob.errorCode, d.analysisJob.lastError));
          setPhase("failed");
          return;
        }
        setPhase(d.analysisJob?.status === "running" ? "running" : "queued");
      }, POLL_MS);
    },
    [accessToken, workspaceId, videoId, stopPolling],
  );

  const hydrate = useCallback(async () => {
    if (hydrated.current || !accessToken || !workspaceId || !videoId) return;
    hydrated.current = true;
    setPhase("checking");
    let d;
    try {
      d = await getVideoDetail(accessToken, { workspaceId, videoId });
    } catch (err) {
      setError(friendlyAnalysisError(err));
      setPhase("failed");
      return;
    }
    setDetail(d);
    if (d.analysis) {
      setPhase("done");
    } else if (d.analysisJob?.status === "queued" || d.analysisJob?.status === "running") {
      // A job is already in flight (stale page, deep link) — pick it up.
      startPolling(d.analysisJob.status);
    } else if (d.analysisJob?.status === "failed") {
      setError(friendlyJobError(d.analysisJob.errorCode, d.analysisJob.lastError));
      setPhase("failed");
    } else {
      setPhase("prompt");
    }
  }, [accessToken, workspaceId, videoId, startPolling]);

  const analyze = useCallback(async () => {
    // Guard against double-billing an already-analyzed video if the card was
    // interacted with before hydration finished (e.g. tap on mobile).
    if (!hydrated.current) {
      hydrated.current = true;
      try {
        const d = await getVideoDetail(accessToken, { workspaceId, videoId });
        setDetail(d);
        if (d.analysis) {
          setPhase("done");
          return;
        }
      } catch (err) {
        setError(friendlyAnalysisError(err));
        setPhase("failed");
        return;
      }
    }

    setPhase("queued");
    setError(null);
    let res;
    try {
      res = await analyzeVideo(accessToken, { workspaceId, videoId });
    } catch (err) {
      setError(friendlyAnalysisError(err));
      setPhase("failed");
      return;
    }

    if (res.queued) {
      startPolling(res.status);
      return;
    }

    // Inline success (text backend) — fetch the canonical detail (signed
    // mediaUrl + analysis) and render it.
    try {
      const d = await getVideoDetail(accessToken, { workspaceId, videoId });
      setDetail(d);
      setPhase(d.analysis ? "done" : "queued");
    } catch (err) {
      setError(friendlyAnalysisError(err));
      setPhase("failed");
    }
  }, [accessToken, workspaceId, videoId, startPolling]);

  return { phase, detail, error, busy, hydrate, analyze, retry: analyze };
}
