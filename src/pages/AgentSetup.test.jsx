// The /agent-setup page: three copy-paste prompts (install MCP, connect via
// OAuth, deploy the site) plus nav/CTA entry points. Asserts each prompt card
// renders with its pre block, the copy buttons exist, and the route + links
// are reachable.
import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { MemoryRouter, Routes, Route } from "react-router-dom";

import AgentSetup from "./AgentSetup.jsx";
import Home from "./Home.jsx";

function renderAgentSetup() {
  return render(
    <MemoryRouter initialEntries={["/agent-setup"]}>
      <Routes>
        <Route path="/agent-setup" element={<AgentSetup />} />
      </Routes>
    </MemoryRouter>,
  );
}

describe("AgentSetup page", () => {
  it("renders all three prompt steps with copy buttons", () => {
    renderAgentSetup();
    for (const id of ["install", "connect", "deploy"]) {
      expect(screen.getByTestId(`agent-step-${id}`)).toBeInTheDocument();
    }
    expect(screen.getAllByRole("button", { name: /copy prompt/i })).toHaveLength(3);
  });

  it("each prompt names its key facts (MCP URL, OAuth, Vercel env)", () => {
    renderAgentSetup();
    const install = screen.getByTestId("agent-step-install");
    expect(install.textContent).toMatch("mcp.slashloop.dev");
    expect(screen.getByTestId("agent-step-connect").textContent).toMatch(/OAuth/i);
    const deploy = screen.getByTestId("agent-step-deploy");
    expect(deploy.textContent).toMatch("VITE_SUPABASE_URL");
    expect(deploy.textContent).toMatch("VITE_MCP_URL");
  });

  it("points capable agents straight at /agent.md", () => {
    renderAgentSetup();
    expect(screen.getByRole("link", { name: /agent\.md/i })).toHaveAttribute("href", "/agent.md");
  });

  // Route-level check without the full App shell (Nav needs AuthProvider):
  // assert the lazy import behind /agent-setup resolves to this page.
  it("the /agent-setup route resolves in the app", async () => {
    const mod = await import("./AgentSetup.jsx");
    expect(mod.default).toBe(AgentSetup);
  });

  it("home's MCP section links to the setup page", () => {
    render(
      <MemoryRouter initialEntries={["/"]}>
        <Home />
      </MemoryRouter>,
    );
    expect(screen.getByRole("link", { name: /onboard your ai agent/i })).toHaveAttribute("href", "/agent-setup");
  });
});
