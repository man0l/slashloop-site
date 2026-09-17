import { render, screen, cleanup } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import ExperimentVariant from "./ExperimentVariant.jsx";
afterEach(cleanup);
const makeVariant = () => ({ id: "v", revision: 2, title: "Portrait", status: "done", brief: { visualStyle: "Editorial, one photograph", slides: [{}, {}, {}] }, slides: [0, 1, 2].map((index) => ({ index, status: "done", url: `https://example.test/${index}.png` })) });
function mount(variant, extra = {}) { return render(<ExperimentVariant variant={variant} index={1} expectedSlideCount={3} selected={false} selectable={false} onDirty={vi.fn()} onDownload={vi.fn()} onSchedule={vi.fn()} {...extra} />); }
it("allows scheduling only a completed deck with all expected slides", () => {
  mount(makeVariant());
  expect(screen.getByRole("button", { name: "Schedule this variant" })).toBeEnabled();
  expect(screen.getByText("3/3 images ready")).toBeInTheDocument();
});
it.each(["missing", "running", "failed", "unknown", "duplicate index"])("blocks scheduling for %s output", (kind) => {
  const v = makeVariant();
  if (kind === "missing") v.slides.pop();
  if (kind === "running") v.status = "generating";
  if (kind === "failed") v.slides[1].status = "failed";
  if (kind === "unknown") v.slides[1].error = "provider_outcome_unknown";
  if (kind === "duplicate index") v.slides[2].index = 1;
  mount(v);
  expect(screen.getByRole("button", { name: "Schedule this variant" })).toBeDisabled();
});
it("compares actual saved values, not stale planning metadata", () => {
  const v = makeVariant(); v.changedVariables = [{ name: "visualStyle", value: "Old studio prompt" }];
  mount(v, { baseline: { brief: { ...v.brief, visualStyle: "Natural portrait" } } });
  expect(screen.getByText(/Changed from baseline: Visual style/)).toBeInTheDocument();
  expect(screen.getByText("Compare exact changes").closest("details")).toHaveTextContent("Editorial, one photograph");
  expect(screen.getByText("Natural portrait")).toBeInTheDocument();
  expect(screen.queryByText("Old studio prompt")).not.toBeInTheDocument();
});
