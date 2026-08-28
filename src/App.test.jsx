// The nav's logout control: present only for a signed-in user (desktop and
// the mobile menu), and signing out lands on the marketing home rather than
// stranding the user on an app page that would bounce to /login anyway.
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";

const state = vi.hoisted(() => ({ user: null }));
const signOut = vi.hoisted(() => vi.fn(async () => ({ error: null })));
vi.mock("./lib/auth.jsx", () => ({
  useAuth: () => ({ user: state.user, loading: false, accessToken: state.user ? "tok-1" : null, signOut }),
}));
vi.mock("./lib/analytics.js", () => ({ trackPageview: vi.fn() }));

import App from "./App.jsx";

function renderApp(initial = "/pricing") {
  return render(
    <MemoryRouter initialEntries={[initial]}>
      <App />
    </MemoryRouter>,
  );
}

describe("Nav — logout", () => {
  beforeEach(() => {
    signOut.mockClear();
    state.user = null;
  });

  it("a signed-out visitor sees sign-in controls, not logout", async () => {
    renderApp();
    expect(await screen.findByText("WHAT A CREDIT BUYS")).toBeInTheDocument(); // /pricing chunk loaded
    expect(screen.queryByText("Sign out")).not.toBeInTheDocument();
    expect(screen.getAllByText("Sign in").length).toBeGreaterThan(0);
  });

  it("a signed-in user gets a logout control", async () => {
    state.user = { id: "u1", email: "a@b.c" };
    renderApp();
    expect(await screen.findByText("WHAT A CREDIT BUYS")).toBeInTheDocument();
    // Desktop nav + mobile hamburger menu both carry it.
    expect(screen.getAllByRole("button", { name: "Sign out" }).length).toBeGreaterThanOrEqual(1);
  });

  it("clicking Sign out calls signOut and lands on the home page", async () => {
    state.user = { id: "u1", email: "a@b.c" };
    renderApp("/pricing");
    const button = await screen.findAllByRole("button", { name: "Sign out" });
    fireEvent.click(button[0]);
    expect(signOut).toHaveBeenCalledTimes(1);
    // Home-only marker: the pricing page has no "OUTLIER SCORE" section.
    expect(await screen.findByText("THE OUTLIER SCORE", {}, { timeout: 3000 })).toBeInTheDocument();
  });
});
