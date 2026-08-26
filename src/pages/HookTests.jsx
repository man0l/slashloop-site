// Standalone hook-test manager — every test in the workspace (open first,
// closed history behind the "Show closed" toggle), each row opening the same
// HookTestPanel the gallery cards use. This is the discovery index when the
// badge has scrolled away and the archive once a test is won or closed.

import { useState } from "react";
import { Link, Navigate } from "react-router-dom";
import { T, fD, fB, fM } from "../lib/theme.js";
import { SectionLabel, AlertBanner, Skeleton, Spinner } from "../components/ui.jsx";
import WorkspaceSwitcher from "../components/WorkspaceSwitcher.jsx";
import FirstRunSteps from "../components/FirstRunSteps.jsx";
import { useAuth } from "../lib/auth.jsx";
import { useWorkspace } from "../lib/workspace.jsx";
import { useHookTestList } from "../lib/useHookTests.js";
import HookTestPanel from "../components/HookTestPanel.jsx";

const statusChipStyle = (status) => ({
  fontWeight: 700,
  fontSize: 11,
  padding: "2px 8px",
  borderRadius: 999,
  whiteSpace: "nowrap",
  color: status === "won" ? "#0F7B6C" : status === "closed" ? "#6E7681" : "#7C5CFF",
  background: status === "won" ? "#EAF6F4" : status === "closed" ? "#EDEEF1" : "#F2EEFF",
});

function ageOf(iso) {
  const ms = Date.parse(iso);
  if (!Number.isFinite(ms)) return "";
  const sec = Math.max(0, Math.floor((Date.now() - ms) / 1000));
  if (sec < 3600) return `${Math.max(1, Math.floor(sec / 60))}m ago`;
  if (sec < 86400) return `${Math.floor(sec / 3600)}h ago`;
  return `${Math.floor(sec / 86400)}d ago`;
}

function Row({ t, onOpen }) {
  return (
    <button
      type="button"
      onClick={onOpen}
      data-testid={`hook-test-row-${t.id}`}
      className="flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-left transition-colors hover:bg-black/[0.03]"
      style={{ border: `1px solid ${T.line}`, background: T.card }}
    >
      {t.thumbUrl ? (
        <img
          src={t.thumbUrl}
          alt=""
          loading="lazy"
          className="shrink-0 rounded object-cover"
          style={{ width: 40, height: 71 }}
        />
      ) : (
        <span className="shrink-0 rounded" style={{ width: 40, height: 71, background: "#E7E8E3" }} />
      )}
      <span className="flex min-w-0 flex-col gap-1">
        <span className="flex items-center gap-2">
          <span style={{ ...fM, fontSize: 12, fontWeight: 700, color: T.ink }}>{t.creatorHandle || "unknown"}</span>
          <span style={statusChipStyle(t.status)}>
            {t.status === "won" && t.winnerLabel ? `${t.winnerLabel} won` : t.status}
          </span>
          <span style={{ ...fM, fontSize: 11, color: T.muted }}>
            {t.pickedCount}/{t.proposalCount} picked · {ageOf(t.createdAt)}
          </span>
        </span>
        <span
          style={{
            ...fB,
            fontSize: 13,
            color: T.ink,
            display: "-webkit-box",
            WebkitLineClamp: 1,
            WebkitBoxOrient: "vertical",
            overflow: "hidden",
          }}
        >
          {t.insight}
        </span>
        {(t.caption || t.videoUrl) && (
          <span
            style={{
              ...fB,
              fontSize: 11.5,
              color: T.muted,
              display: "-webkit-box",
              WebkitLineClamp: 1,
              WebkitBoxOrient: "vertical",
              overflow: "hidden",
            }}
          >
            {t.caption || t.videoUrl}
          </span>
        )}
      </span>
    </button>
  );
}

export default function HookTests() {
  const { user, loading: authLoading, accessToken } = useAuth();
  const { activeWorkspaceId } = useWorkspace();
  const [includeClosed, setIncludeClosed] = useState(false);
  // videoId of the row whose panel is open — the panel refetches server truth.
  const [openVideoId, setOpenVideoId] = useState(null);

  const listQuery = useHookTestList({ accessToken, workspaceId: activeWorkspaceId, includeClosed });
  const tests = listQuery.data?.tests ?? [];

  if (authLoading) {
    return (
      <section className="mx-auto max-w-4xl px-5 py-16">
        <SectionLabel>HOOK TESTS</SectionLabel>
        <h1 className="mt-3" style={{ ...fD, fontWeight: 900, fontSize: 32, letterSpacing: -0.8 }}>
          AI hook tests
        </h1>
        <div className="mt-6 flex flex-col gap-2">
          {Array.from({ length: 4 }, (_, i) => (
            <Skeleton key={i} style={{ height: 87, borderRadius: 8 }} />
          ))}
        </div>
      </section>
    );
  }
  if (!user) return <Navigate to="/login?next=/tests" replace />;

  return (
    <section className="mx-auto max-w-4xl px-5 py-16">
      <SectionLabel>HOOK TESTS</SectionLabel>
      <h1 className="mt-3" style={{ ...fD, fontWeight: 900, fontSize: 32, letterSpacing: -0.8 }}>
        AI hook tests
      </h1>

      <div className="mt-6">
        <WorkspaceSwitcher />
      </div>

      <FirstRunSteps />

      <div className="mt-6 flex flex-wrap items-center justify-between gap-3">
        <p style={{ ...fB, fontSize: 13, color: T.muted, margin: 0 }}>
          Four AI openings per proven outlier — pick winners, re-roll under the lock, export the shot list.
        </p>
        <label
          className="flex items-center gap-1.5"
          style={{ ...fM, fontSize: 12, color: T.muted, cursor: "pointer" }}
        >
          <input
            type="checkbox"
            checked={includeClosed}
            onChange={(e) => setIncludeClosed(e.target.checked)}
            data-testid="show-closed-toggle"
            style={{ accentColor: "#7C5CFF" }}
          />
          Show closed
        </label>
      </div>

      <div className="mt-6 flex flex-col gap-2">
        {listQuery.isPending && (
          <div className="flex items-center justify-center gap-2 py-10" style={{ ...fB, fontSize: 13, color: T.muted }}>
            <Spinner /> Loading…
          </div>
        )}
        {listQuery.isError && (
          <AlertBanner>{listQuery.error?.message || "Couldn't load your hook tests."}</AlertBanner>
        )}
        {!listQuery.isPending && !listQuery.isError && tests.length === 0 && (
          <div className="rounded-lg px-4 py-10 text-center" style={{ border: `1px dashed ${T.line}` }}>
            <p style={{ ...fB, fontSize: 14, color: T.muted, margin: 0 }}>
              No {includeClosed ? "" : "open "}hook tests yet.
            </p>
            <Link to="/gallery" className="mt-3 inline-block font-semibold underline decoration-dotted underline-offset-2" style={{ ...fB, fontSize: 13, color: "#7C5CFF" }}>
              Find an outlier in the gallery →
            </Link>
          </div>
        )}
        {tests.map((t) => (
          <Row key={t.id} t={t} onOpen={() => setOpenVideoId(t.videoId)} />
        ))}
      </div>

      {openVideoId && activeWorkspaceId && (
        <HookTestPanel
          accessToken={accessToken}
          workspaceId={activeWorkspaceId}
          videoId={openVideoId}
          onClose={() => setOpenVideoId(null)}
        />
      )}
    </section>
  );
}
