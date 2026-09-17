// Tests for the reusable scheduled-posts calendar: date math, the mock
// adapter contract, and the CalendarView interactions (render, drag-reschedule,
// drawer open). The API adapter (lib/social.js) is a thin fetch wrapper —
// its behavior is covered by the backend's bun tests.

import { describe, expect, it, vi } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { monthGrid, toLocalInputValue, fromLocalInputValue, moveEpochToDay, dayStartEpoch } from "./dates.js";
import { createMockAdapter } from "./adapter.js";
import { CalendarView } from "./CalendarView.jsx";
import { ScheduleDrawer } from "./ScheduleDrawer.jsx";

// ── date math ───────────────────────────────────────────────────────────────

describe("dates", () => {
  it("builds a Monday-start grid covering the month", () => {
    // Sep 2026: the 1st is a Tuesday.
    const weeks = monthGrid(2026, 8);
    expect(weeks[0][0].date.getDay()).toBe(1); // Monday
    expect(weeks.flat().some((cell) => cell.inMonth && cell.date.getDate() === 1)).toBe(true);
    expect(weeks.flat().some((cell) => cell.inMonth && cell.date.getDate() === 30)).toBe(true);
    // Every cell outside the month is padding only.
    for (const week of weeks) expect(week).toHaveLength(7);
  });

  it("round-trips epoch seconds through the local input format", () => {
    const epoch = Math.floor(new Date(2026, 8, 13, 14, 30).getTime() / 1000);
    const value = toLocalInputValue(epoch);
    expect(value).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/);
    expect(fromLocalInputValue(value)).toBe(epoch);
  });

  it("moves an epoch to another day keeping the time of day", () => {
    const source = new Date(2026, 8, 13, 14, 30, 0);
    const target = new Date(2026, 8, 21);
    const moved = moveEpochToDay(Math.floor(source.getTime() / 1000), target);
    const movedDate = new Date(moved * 1000);
    expect(movedDate.getDate()).toBe(21);
    expect(movedDate.getHours()).toBe(14);
    expect(movedDate.getMinutes()).toBe(30);
  });

  it("dayStartEpoch is local midnight", () => {
    const date = new Date(2026, 8, 13, 19, 45);
    const start = new Date(dayStartEpoch(date) * 1000);
    expect(start.getHours()).toBe(0);
    expect(start.getMinutes()).toBe(0);
  });
});

// ── mock adapter ────────────────────────────────────────────────────────────

describe("createMockAdapter", () => {
  const noon = (day) => Math.floor(new Date(2026, 8, day, 12, 0).getTime() / 1000);

  function seeded() {
    return createMockAdapter({
      groups: [
        {
          groupId: "g1",
          publishDate: noon(14),
          content: "Launch clip",
          media: [],
          state: "queued",
          posts: [{ id: "p1", provider: "tiktok", state: "QUEUE", releaseUrl: null, error: null }],
        },
      ],
    });
  }

  it("filters groups by the requested range", async () => {
    const adapter = seeded();
    expect((await adapter.listGroups(noon(13), noon(13))).groups).toHaveLength(0);
    const inRange = await adapter.listGroups(noon(13), noon(15));
    expect(inRange.groups).toHaveLength(1);
    expect(inRange.groups[0].groupId).toBe("g1");
  });

  it("creates, reschedules, and deletes groups", async () => {
    const adapter = seeded();
    const { groupId } = await adapter.createGroup({
      integrationIds: ["tt-1"],
      content: "Second post",
      media: [],
      publishDate: noon(20),
    });
    expect((await adapter.listGroups(noon(19), noon(21))).groups).toHaveLength(1);

    await adapter.rescheduleGroup(groupId, noon(22));
    const moved = await adapter.listGroups(noon(21), noon(23));
    expect(moved.groups[0].publishDate).toBe(noon(22));

    await adapter.deleteGroup(groupId);
    expect((await adapter.listGroups(noon(21), noon(23))).groups).toHaveLength(0);
  });

  it("rejects rescheduling a processing group with a 409", async () => {
    const adapter = createMockAdapter({
      groups: [
        {
          groupId: "g2",
          publishDate: noon(14),
          content: "In flight",
          media: [],
          state: "processing",
          posts: [{ id: "p2", provider: "youtube", state: "PROCESSING", releaseUrl: null, error: null }],
        },
      ],
    });
    await expect(adapter.rescheduleGroup("g2", noon(15))).rejects.toMatchObject({ status: 409 });
  });
});

// ── CalendarView interactions ───────────────────────────────────────────────

describe("CalendarView", () => {
  const noon = (day) => Math.floor(new Date(2026, 8, day, 12, 0).getTime() / 1000);

  function seedAdapter() {
    return createMockAdapter({
      groups: [
        {
          groupId: "g1",
          publishDate: noon(14),
          content: "Launch clip",
          media: [],
          state: "queued",
          posts: [{ id: "p1", provider: "tiktok", state: "QUEUE", releaseUrl: null, error: null }],
        },
      ],
    });
  }

  it("renders the scheduled group chip on its day", async () => {
    render(<CalendarView adapter={seedAdapter()} initialDate={new Date(2026, 8, 13)} />);
    await waitFor(() => expect(screen.getByTitle("Launch clip")).toBeTruthy());
    const chip = screen.getByTitle("Launch clip");
    expect(chip.closest("[data-day]")).toBeTruthy();
    expect(chip.closest("[data-day]").getAttribute("data-day")).toMatch(/-14$/);
  });

  it("opens the edit drawer from a chip and the create drawer from a day cell", async () => {
    render(<CalendarView adapter={seedAdapter()} initialDate={new Date(2026, 8, 13)} />);
    await waitFor(() => screen.getByTitle("Launch clip"));

    fireEvent.click(screen.getByTitle("Launch clip"));
    expect(screen.getByTestId("schedule-drawer")).toBeTruthy();
    expect(screen.getByText("Scheduled post")).toBeTruthy();

    fireEvent.click(screen.getByLabelText("Close"));
    await waitFor(() => expect(screen.queryByTestId("schedule-drawer")).toBeNull());

    fireEvent.click(screen.getByTestId("calendar-grid").querySelector("[data-day$='-20']"));
    expect(screen.getByText("New scheduled post")).toBeTruthy();
    fireEvent.click(screen.getByLabelText("Close"));
  });

  it("drag-reschedules a chip to another day through the adapter", async () => {
    const adapter = seedAdapter();
    const reschedule = vi.spyOn(adapter, "rescheduleGroup");
    render(<CalendarView adapter={adapter} initialDate={new Date(2026, 8, 13)} />);
    await waitFor(() => screen.getByTitle("Launch clip"));

    const chip = screen.getByTitle("Launch clip");
    const targetCell = screen.getByTestId("calendar-grid").querySelector("[data-day$='-21']");
    fireEvent.dragStart(chip, { dataTransfer: { setData: vi.fn(), effectAllowed: "" } });
    fireEvent.drop(targetCell);

    await waitFor(() => expect(reschedule).toHaveBeenCalled());
    const [groupId, epoch] = reschedule.mock.calls[0];
    expect(groupId).toBe("g1");
    expect(new Date(epoch * 1000).getDate()).toBe(21);
    expect(new Date(epoch * 1000).getHours()).toBe(12); // time of day preserved
  });
});

// ── ScheduleDrawer: media strip, prefill, drafts ────────────────────────────

describe("ScheduleDrawer media strip + prefill", () => {
  it("creates a post from prefilled caption + media (gallery push)", async () => {
    const adapter = createMockAdapter({});
    const createGroup = vi.spyOn(adapter, "createGroup");
    render(
      <ScheduleDrawer
        adapter={adapter}
        mode="create"
        initialContent="Hello deck"
        initialMedia={[{ type: "image", url: "https://cdn.example/1.jpg" }]}
        initialDate={new Date(2026, 8, 13)}
        onClose={() => {}}
        onSaved={() => {}}
      />,
    );

    expect(screen.getByTestId("caption-input").value).toBe("Hello deck");
    expect(screen.getByRole("img", { name: "media 1" }).getAttribute("src")).toBe("https://cdn.example/1.jpg");

    // Integration list loads asynchronously — wait for the toggles.
    fireEvent.click(await screen.findByRole("checkbox", { name: /Demo TikTok/ }));
    fireEvent.click(screen.getByTestId("save-post"));

    await waitFor(() => expect(createGroup).toHaveBeenCalled());
    expect(createGroup.mock.calls[0][0].content).toBe("Hello deck");
    expect(createGroup.mock.calls[0][0].media).toEqual([{ type: "image", url: "https://cdn.example/1.jpg" }]);
  });

  it("removes a thumb with its ✕ button", () => {
    const adapter = createMockAdapter({});
    render(
      <ScheduleDrawer
        adapter={adapter}
        mode="create"
        initialContent="x"
        initialMedia={[
          { type: "image", url: "https://cdn.example/1.jpg" },
          { type: "image", url: "https://cdn.example/2.jpg" },
        ]}
        initialDate={new Date(2026, 8, 13)}
        onClose={() => {}}
        onSaved={() => {}}
      />,
    );
    expect(screen.getAllByRole("img")).toHaveLength(2);
    fireEvent.click(screen.getByLabelText("Remove media 1"));
    expect(screen.getAllByRole("img")).toHaveLength(1);
    expect(screen.getByRole("img", { name: "media 1" }).getAttribute("src")).toBe("https://cdn.example/2.jpg");
  });

  it("uploads picked files through the adapter and appends the returned url", async () => {
    const adapter = createMockAdapter({});
    const uploadMedia = vi.spyOn(adapter, "uploadMedia").mockResolvedValue({ url: "https://cdn.example/social/new.jpg", type: "image" });
    render(
      <ScheduleDrawer
        adapter={adapter}
        mode="create"
        initialContent="x"
        initialMedia={[]}
        initialDate={new Date(2026, 8, 13)}
        onClose={() => {}}
        onSaved={() => {}}
      />,
    );
    const input = screen.getByLabelText("Upload media").closest("div").parentElement.querySelector('input[type="file"]');
    await waitFor(async () => {
      fireEvent.change(input, { target: { files: [new File(["bits"], "slide.jpg", { type: "image/jpeg" })] } });
    });
    await waitFor(() => expect(uploadMedia).toHaveBeenCalled());
    await waitFor(() => expect(screen.getByRole("img", { name: "media 1" }).getAttribute("src")).toBe("https://cdn.example/social/new.jpg"));
  });
});

describe("ScheduleDrawer drafts", () => {
  function draftGroup() {
    return {
      groupId: "d1",
      publishDate: 0,
      content: "Draft body",
      media: [{ type: "image", url: "https://cdn.example/1.jpg" }],
      state: "draft",
      posts: [{ id: "p1", provider: "tiktok", state: "DRAFT", releaseUrl: null, error: null }],
    };
  }

  it("saves caption/media and keeps the draft when no date is set", async () => {
    const adapter = createMockAdapter({ drafts: [draftGroup()] });
    const updateGroup = vi.spyOn(adapter, "updateGroup");
    const scheduleDraft = vi.spyOn(adapter, "scheduleDraft");
    render(
      <ScheduleDrawer adapter={adapter} mode="draft" group={draftGroup()} initialDate={new Date(2026, 8, 13)} onClose={() => {}} onSaved={() => {}} />,
    );
    fireEvent.click(screen.getByTestId("save-draft"));
    await waitFor(() => expect(updateGroup).toHaveBeenCalled());
    expect(updateGroup.mock.calls[0][1].content).toBe("Draft body");
    expect(scheduleDraft).not.toHaveBeenCalled();
  });

  it("schedules a draft when a date is set (DRAFT → QUEUE)", async () => {
    const adapter = createMockAdapter({ drafts: [draftGroup()] });
    const updateGroup = vi.spyOn(adapter, "updateGroup");
    const scheduleDraft = vi.spyOn(adapter, "scheduleDraft");
    render(
      <ScheduleDrawer adapter={adapter} mode="draft" group={draftGroup()} initialDate={new Date(2026, 8, 13)} onClose={() => {}} onSaved={() => {}} />,
    );
    fireEvent.change(screen.getByTestId("when-input"), { target: { value: "2026-09-20T10:30" } });
    fireEvent.click(screen.getByTestId("save-post"));
    await waitFor(() => expect(scheduleDraft).toHaveBeenCalled());
    expect(updateGroup).toHaveBeenCalled();
    const epoch = scheduleDraft.mock.calls[0][1];
    expect(new Date(epoch * 1000).getDate()).toBe(20);
  });
});

// ── CalendarView drafts ─────────────────────────────────────────────────────

describe("CalendarView drafts", () => {
  function seedWithDraft() {
    return createMockAdapter({
      drafts: [
        {
          groupId: "d1",
          publishDate: 0,
          content: "Untitled launch",
          media: [{ type: "image", url: "https://cdn.example/1.jpg" }],
          state: "draft",
          posts: [{ id: "dp1", provider: "tiktok", state: "DRAFT", releaseUrl: null, error: null }],
        },
      ],
    });
  }

  it("shows the N-drafts strip for undated drafts and opens the draft in the drawer", async () => {
    render(<CalendarView adapter={seedWithDraft()} initialDate={new Date(2026, 8, 13)} />);
    const strip = await screen.findByTestId("drafts-strip");
    expect(strip.textContent).toContain("1 draft");

    fireEvent.click(screen.getByRole("button", { name: /1 draft/ })); // expand
    fireEvent.click(screen.getByTitle("Untitled launch")); // open the draft card
    expect(screen.getByTestId("schedule-drawer")).toBeTruthy();
    expect(screen.getByRole("heading", { name: "Draft" })).toBeTruthy();
    expect(screen.getByTestId("caption-input").value).toBe("Untitled launch");
    expect(screen.getByRole("img", { name: "media 1" }).getAttribute("src")).toBe("https://cdn.example/1.jpg");
  });

  it("does not show the drafts strip when there are none", async () => {
    render(
      <CalendarView
        adapter={createMockAdapter({
          groups: [
            {
              groupId: "g1",
              publishDate: Math.floor(new Date(2026, 8, 14, 12).getTime() / 1000),
              content: "Launch clip",
              media: [],
              state: "queued",
              posts: [{ id: "p1", provider: "tiktok", state: "QUEUE", releaseUrl: null, error: null }],
            },
          ],
        })}
        initialDate={new Date(2026, 8, 13)}
      />,
    );
    await waitFor(() => expect(screen.getByTitle("Launch clip")).toBeTruthy());
    expect(screen.queryByTestId("drafts-strip")).toBeNull();
  });
});

// ── Media lightbox (click thumb → full size + download) ─────────────────────

describe("MediaThumbStrip lightbox", () => {
  function stripWithTwo() {
    const adapter = createMockAdapter({});
    render(
      <ScheduleDrawer
        adapter={adapter}
        mode="create"
        initialContent="x"
        initialMedia={[
          { type: "image", url: "https://cdn.example/1.jpg" },
          { type: "image", url: "https://cdn.example/2.png" },
        ]}
        initialDate={new Date(2026, 8, 13)}
        onClose={() => {}}
        onSaved={() => {}}
      />,
    );
  }

  it("opens the full-size viewer from a thumb and closes on Escape", async () => {
    stripWithTwo();
    fireEvent.click(screen.getByRole("img", { name: "media 1" }));
    expect(screen.getByTestId("media-viewer")).toBeTruthy();
    expect(screen.getByTestId("media-viewer-img").getAttribute("src")).toBe("https://cdn.example/1.jpg");
    expect(screen.getByText("1 / 2")).toBeTruthy();

    fireEvent.click(screen.getByLabelText("Next media"));
    expect(screen.getByTestId("media-viewer-img").getAttribute("src")).toBe("https://cdn.example/2.png");
    expect(screen.getByText("2 / 2")).toBeTruthy();

    fireEvent.keyDown(window, { key: "Escape" });
    expect(screen.queryByTestId("media-viewer")).toBeNull();
  });

  it("downloads the full image as a file", async () => {
    const objectUrl = "blob:mock";
    const revoke = vi.fn();
    vi.stubGlobal("URL", { ...URL, createObjectURL: vi.fn(() => objectUrl), revokeObjectURL: revoke });
    const fetchMock = vi.fn(() => Promise.resolve({ ok: true, blob: () => Promise.resolve(new Blob(["bits"])) }));
    vi.stubGlobal("fetch", fetchMock);
    const clickSpy = vi.fn();
    const originalCreate = document.createElement.bind(document);
    vi.spyOn(document, "createElement").mockImplementation((tag, ...rest) => {
      const el = originalCreate(tag, ...rest);
      if (tag === "a") el.click = clickSpy;
      return el;
    });

    stripWithTwo();
    fireEvent.click(screen.getByRole("img", { name: "media 1" }));
    fireEvent.click(screen.getByTestId("media-download"));

    await waitFor(() => expect(clickSpy).toHaveBeenCalled());
    const anchor = originalCreate("a");
    expect(fetchMock).toHaveBeenCalledWith("https://cdn.example/1.jpg");
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });
});
