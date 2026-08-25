import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor, within } from "@testing-library/react";
import HookTestPanel from "./HookTestPanel.jsx";

// The panel's data layer is fully mocked — these tests pin the interactions
// (lock editing, picking, re-roll confirm, read-only closed state) against a
// stable server fixture, not the network.
const hooks = vi.hoisted(() => ({
  useOpenHookTest: vi.fn(),
  useStartHookTest: vi.fn(),
  useUpdateHookTestLock: vi.fn(),
  usePickHookVersions: vi.fn(),
  useRerollHooks: vi.fn(),
  useCloseHookTest: vi.fn(),
}));

vi.mock("../lib/useHookTests.js", () => hooks);

vi.mock("../lib/hookTests.js", async () => {
  const actual = await vi.importActual("../lib/hookTests.js");
  return { ...actual, getShotlist: vi.fn(async () => ({ markdown: "# Shot list\n- A" })) };
});

const noop = () => {};
function mutation() {
  return { isPending: false, mutateAsync: vi.fn(async () => ({})) };
}

beforeEach(() => {
  // Clear call history too — .mock.results[0] must be THIS test's hook call,
  // not one left over from an earlier test.
  Object.values(hooks).forEach((m) => m.mockReset());
  hooks.useStartHookTest.mockReturnValue(mutation());
  hooks.useUpdateHookTestLock.mockReturnValue(mutation());
  hooks.usePickHookVersions.mockReturnValue(mutation());
  hooks.useRerollHooks.mockReturnValue(mutation());
  hooks.useCloseHookTest.mockReturnValue(mutation());
});

const version = (label, status, over = {}) => ({
  id: `hv-${label}`,
  label,
  round: 1,
  hookText: `${label} — cold open on the mess`,
  firstFrame: "desk, daylight",
  hookType: "recognition",
  mechanism: "Names a feeling everyone has.",
  status,
  assetUrl: null,
  createdAt: new Date().toISOString(),
  ...over,
});

const testFor = (over = {}) => ({
  id: "ht-1",
  videoId: "vid-1",
  lever: "hook",
  insight: "The payoff is shown before it's explained.",
  sameIn: ["the desk", "daylight"],
  beats: [],
  stopRule: "Kill any version under 60,000 views in two days.",
  status: "picking",
  createdAt: new Date().toISOString(),
  versions: [version("A", "picked"), version("B", "proposed"), version("C", "proposed"), version("D", "discarded")],
  ...over,
});

function renderPanel({ test = testFor(), queryOver = {} } = {}) {
  const refetch = vi.fn();
  hooks.useOpenHookTest.mockReset();
  hooks.useOpenHookTest.mockImplementation(({ videoId }) => {
    // The panel must query by the video it was opened for.
    expect(videoId).toBe("vid-1");
    return {
      isPending: false,
      isError: false,
      error: null,
      data: { test },
      refetch,
      ...queryOver,
    };
  });
  return render(<HookTestPanel accessToken="tok-1" workspaceId="ws-1" videoId="vid-1" onClose={noop} />);
}

describe("HookTestPanel", () => {
  it("renders the lock (insight, chips, stop rule) and all four openings", () => {
    renderPanel();

    expect(screen.getByTestId("hook-insight-input").value).toBe("The payoff is shown before it's explained.");
    expect(screen.getByText("the desk")).toBeInTheDocument();
    expect(screen.getByText(/Kill any version under/)).toBeInTheDocument();
    for (const label of ["A", "B", "C", "D"]) {
      expect(screen.getByTestId(`hook-version-row-${label}`)).toBeInTheDocument();
    }
    // A starts picked (server truth); D is discarded and locked out.
    expect(screen.getByTestId("hook-version-check-A").checked).toBe(true);
    expect(screen.getByTestId("hook-version-check-D").disabled).toBe(true);
  });

  it("checking an unpicked opening enables Save picks, which submits every picked label", async () => {
    renderPanel();
    const pickM = hooks.usePickHookVersions.mock.results[0].value;

    const save = screen.getByTestId("save-picks");
    expect(save).toBeDisabled(); // nothing changed yet

    fireEvent.click(screen.getByTestId("hook-version-check-B"));
    expect(save).toBeEnabled();
    expect(save).toHaveTextContent("Save picks (2)");

    fireEvent.click(save);
    await waitFor(() =>
      expect(pickM.mutateAsync).toHaveBeenCalledWith({ accessToken: "tok-1", workspaceId: "ws-1", videoId: "vid-1", picks: ["A", "B"] }),
    );
  });

  it("unchecking a picked opening stages its removal too", () => {
    renderPanel();

    expect(screen.getByTestId("save-picks")).toBeDisabled();
    fireEvent.click(screen.getByTestId("hook-version-check-A"));
    expect(screen.getByTestId("save-picks")).toHaveTextContent("Save picks (0)");
  });

  it("adds a constant chip via Enter and PATCHes the full same-in list", async () => {
    renderPanel();
    const lockM = hooks.useUpdateHookTestLock.mock.results[0].value;

    const input = screen.getByTestId("hook-chip-input");
    fireEvent.change(input, { target: { value: "handheld camera" } });
    fireEvent.keyDown(input, { key: "Enter" });

    await waitFor(() =>
      expect(lockM.mutateAsync).toHaveBeenCalledWith({
        accessToken: "tok-1",
        workspaceId: "ws-1",
        videoId: "vid-1",
        insight: undefined,
        sameIn: ["the desk", "daylight", "handheld camera"],
      }),
    );
    expect(screen.getByText("handheld camera")).toBeInTheDocument();
  });

  it("saves an edited insight on blur", async () => {
    renderPanel();
    const lockM = hooks.useUpdateHookTestLock.mock.results[0].value;

    const input = screen.getByTestId("hook-insight-input");
    fireEvent.change(input, { target: { value: "Show the result first, then explain." } });
    fireEvent.blur(input);

    await waitFor(() =>
      expect(lockM.mutateAsync).toHaveBeenCalledWith({
        accessToken: "tok-1",
        workspaceId: "ws-1",
        videoId: "vid-1",
        insight: "Show the result first, then explain.",
        sameIn: undefined,
      }),
    );
  });

  it("re-roll goes through a cost-confirming dialog before spending credits", async () => {
    renderPanel();
    const rerollM = hooks.useRerollHooks.mock.results[0].value;

    fireEvent.click(screen.getByTestId("reroll-hooks"));

    const dialog = within(screen.getByRole("dialog", { name: "Re-roll all openings?" }));
    expect(dialog.getByText(/Costs 2 credits/)).toBeInTheDocument();
    // Not spent until confirmed:
    expect(rerollM.mutateAsync).not.toHaveBeenCalled();

    fireEvent.click(dialog.getByText("Re-roll · 2cr"));
    await waitFor(() =>
      expect(rerollM.mutateAsync).toHaveBeenCalledWith({ accessToken: "tok-1", workspaceId: "ws-1", videoId: "vid-1" }),
    );
  });

  it("a closed test is read-only: no editing, saving, re-rolling or closing again", () => {
    renderPanel({ test: testFor({ status: "won" }) });

    expect(screen.getByTestId("hook-insight-input")).toBeDisabled();
    expect(screen.queryByTestId("save-picks")).not.toBeInTheDocument();
    expect(screen.queryByTestId("reroll-hooks")).not.toBeInTheDocument();
    expect(screen.queryByText("Close without posting")).not.toBeInTheDocument();
    // Openings still readable, but not pickable.
    expect(screen.getByTestId("hook-version-check-A").disabled).toBe(true);
  });

  it("a load failure renders the friendly message with a retry", async () => {
    renderPanel({
      test: null,
      queryOver: { isError: true, error: { message: "Not signed in.", status: 401 }, data: undefined },
    });

    expect(screen.getByRole("alert")).toHaveTextContent("Not signed in.");
    fireEvent.click(screen.getByText("Try again"));
  });

  it("exports the shot list on demand", async () => {
    const { getShotlist } = await import("../lib/hookTests.js");
    renderPanel();

    fireEvent.click(screen.getByTestId("shotlist-btn"));
    await waitFor(() => expect(getShotlist).toHaveBeenCalledWith("tok-1", { workspaceId: "ws-1", videoId: "vid-1" }));
    expect(await screen.findByText(/# Shot list/)).toBeInTheDocument();
  });
});
