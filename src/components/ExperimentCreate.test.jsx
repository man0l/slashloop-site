import { render, screen, fireEvent, waitFor, cleanup } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import ExperimentCreate from "./ExperimentCreate.jsx";
import { createExperiment } from "../lib/experiments.js";
vi.mock("../lib/experiments.js", async (original) => ({ ...await original(), createExperiment: vi.fn() }));
let client;
function mount(videoIds = ["original1"]) { client = new QueryClient(); render(<QueryClientProvider client={client}><MemoryRouter><ExperimentCreate accessToken="auth" workspaceId="w1" videoIds={videoIds} onClose={() => {}} /></MemoryRouter></QueryClientProvider>); }
beforeEach(() => vi.clearAllMocks()); afterEach(() => { cleanup(); client?.clear(); });
it("creates a workspace draft with explicit ceiling and permitted controlled variables", async () => {
  createExperiment.mockResolvedValue({ experiment: { id: "e1" } }); mount();
  fireEvent.change(screen.getByLabelText("Goal"), { target: { value: "Improve swipe rate" } });
  fireEvent.change(screen.getByLabelText("Credit ceiling"), { target: { value: "80" } });
  fireEvent.change(screen.getByLabelText("Keep unchanged (one per line)"), { target: { value: "Keep logo\nKeep name" } });
  expect(screen.queryByRole("checkbox", { name: "Concept / angle" })).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: "Save experiment draft" }));
  await waitFor(() => expect(createExperiment).toHaveBeenCalledWith("auth", expect.objectContaining({ workspaceId: "w1", videoIds: ["original1"], maxCredits: 80, variantCount: 3, slideCount: 5, idempotencyKey: expect.any(String), instructions: expect.objectContaining({ mode: "controlled", variables: ["hook"], lockedConstraints: ["Keep logo", "Keep name"] }) })));
});
it("validates selection limits before draft dispatch", async () => {
  mount(Array.from({ length: 21 }, (_, i) => String(i))); fireEvent.change(screen.getByLabelText("Goal"), { target: { value: "Test" } }); fireEvent.change(screen.getByLabelText("Credit ceiling"), { target: { value: "80" } }); fireEvent.click(screen.getByRole("button", { name: "Save experiment draft" }));
  expect(await screen.findByRole("alert")).toHaveTextContent("Select 1–20"); expect(createExperiment).not.toHaveBeenCalled();
});
it("fills an editable portrait example and sends only the visible instructions", async () => {
  createExperiment.mockResolvedValue({ experiment: { id: "e1" } }); mount();
  fireEvent.change(screen.getByLabelText("Start from an example"), { target: { value: "portraits" } });
  expect(screen.getByLabelText("What do you want to change?")).toHaveValue("visualStyle");
  expect(screen.getByLabelText("Variants (baseline included)")).toHaveValue(2);
  expect(screen.getByLabelText("Slides per variant")).toHaveValue(3);
  expect(screen.getByLabelText("Credit ceiling")).toHaveValue(null);
  fireEvent.change(screen.getByLabelText("Goal"), { target: { value: "My edited portrait test" } });
  fireEvent.change(screen.getByLabelText("Credit ceiling"), { target: { value: "30" } });
  expect(screen.getByRole("region", { name: "What this experiment will produce" })).toHaveTextContent("My edited portrait test");
  expect(screen.getByRole("region", { name: "What this experiment will produce" })).toHaveTextContent("6 images");
  expect(screen.getByText("Review exact inputs").closest("details")).not.toHaveAttribute("open");
  fireEvent.click(screen.getByText("Review exact inputs"));
  expect(screen.getByText("Review exact inputs").closest("details")).toHaveAttribute("open");
  fireEvent.click(screen.getByRole("button", { name: "Save experiment draft" }));
  await waitFor(() => expect(createExperiment).toHaveBeenCalledWith("auth", expect.objectContaining({ variantCount: 2, slideCount: 3, maxCredits: 30, instructions: expect.objectContaining({ goal: "My edited portrait test", variables: ["visualStyle"], direction: expect.stringContaining("Desired variable values: Natural everyday") }) })));
});
it("keeps the user's spending ceiling when replacing an example", () => {
  mount();
  fireEvent.change(screen.getByLabelText("Credit ceiling"), { target: { value: "35" } });
  fireEvent.change(screen.getByLabelText("Brand"), { target: { value: "My channel" } });
  fireEvent.change(screen.getByLabelText("Start from an example"), { target: { value: "portraits" } });
  fireEvent.change(screen.getByLabelText("Start from an example"), { target: { value: "hooks" } });
  expect(screen.getByLabelText("Credit ceiling")).toHaveValue(35);
  expect(screen.getByLabelText("Brand")).toHaveValue("My channel");
  expect(screen.getByLabelText("What do you want to change?")).toHaveValue("hook");
  expect(screen.getByLabelText("Audience")).toHaveValue("");
  expect(createExperiment).not.toHaveBeenCalled();
});
it("describes a baseline-only setup without claiming a comparison", () => {
  mount(); fireEvent.change(screen.getByLabelText("Variants (baseline included)"), { target: { value: "1" } });
  expect(screen.getByRole("region", { name: "What this experiment will produce" })).toHaveTextContent("1 baseline only");
  expect(screen.queryByText("Hook changes")).not.toBeInTheDocument();
});
it("allows concept/slide exploration but strips them when returning to controlled", () => {
  mount(); fireEvent.change(screen.getByLabelText("Test mode"), { target: { value: "exploration" } }); fireEvent.click(screen.getByRole("checkbox", { name: "Concept / angle" })); fireEvent.change(screen.getByLabelText("Test mode"), { target: { value: "controlled" } }); expect(screen.queryByRole("checkbox", { name: "Concept / angle" })).not.toBeInTheDocument();
});
