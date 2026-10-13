import { render, screen, cleanup, fireEvent } from "@testing-library/react";
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
it("collects slideshow and per-slide feedback and hands it to the estimate flow (SLA-797)", () => {
  const onFeedback = vi.fn();
  mount(makeVariant(), { canFeedback: true, onFeedback });
  fireEvent.click(screen.getByRole("button", { name: "Request changes" }));
  const estimate = screen.getByRole("button", { name: "Estimate regeneration" });
  expect(estimate).toBeDisabled();
  fireEvent.change(screen.getByLabelText("Change on slide 3"), { target: { value: "  LTN still looks like MTN  " } });
  fireEvent.change(screen.getByLabelText(/across the whole slideshow/), { target: { value: "stronger downgrade" } });
  fireEvent.click(estimate);
  expect(onFeedback).toHaveBeenCalledWith({ variantId: "v", feedback: "stronger downgrade", slides: [{ index: 2, feedback: "LTN still looks like MTN" }] });
});
it("lets every finished slide request changes on its own, not only failed ones", () => {
  const onFeedback = vi.fn();
  mount(makeVariant(), { canFeedback: true, onFeedback });
  expect(screen.getAllByRole("button", { name: /^Request changes on slide \d$/ })).toHaveLength(3);
  fireEvent.click(screen.getByRole("button", { name: "Request changes on slide 2" }));
  expect(screen.getByLabelText("Change on slide 2")).toHaveFocus();
  expect(screen.queryByRole("button", { name: "Request changes on slide 2" })).not.toBeInTheDocument();
  fireEvent.change(screen.getByLabelText("Change on slide 2"), { target: { value: "softer jaw" } });
  fireEvent.click(screen.getByRole("button", { name: "Estimate regeneration" }));
  expect(onFeedback).toHaveBeenCalledWith({ variantId: "v", slides: [{ index: 1, feedback: "softer jaw" }] });
});
it("disables per-slide feedback while the variant cannot be regenerated", () => {
  mount(makeVariant(), { canFeedback: false, onFeedback: vi.fn() });
  for (const b of screen.getAllByRole("button", { name: /^Request changes on slide/ })) expect(b).toBeDisabled();
});
it("hides the feedback form on legacy experiments and disables it while the variant cannot be regenerated", () => {
  const { unmount } = mount(makeVariant());
  expect(screen.queryByRole("button", { name: "Request changes" })).not.toBeInTheDocument();
  unmount();
  mount(makeVariant(), { canFeedback: false, onFeedback: vi.fn() });
  expect(screen.getByRole("button", { name: "Request changes" })).toBeDisabled();
});
it("shows the feedback history and marks slides carrying feedback", () => {
  const v = makeVariant();
  v.slides[1].feedback = ["This slide: softer jaw"];
  v.feedback = [{ at: "2026-10-13T07:00:00Z", feedback: null, slides: [{ index: 1, feedback: "softer jaw" }], redo: [1], previousQa: "passed" }];
  mount(v, { canFeedback: true, onFeedback: vi.fn() });
  expect(screen.getByText("Feedback history (1)")).toBeInTheDocument();
  expect(screen.getByText("Your feedback applied")).toBeInTheDocument();
  expect(screen.getByText(/regenerated slide 2/)).toBeInTheDocument();
});
