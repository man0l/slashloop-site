import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { Modal, ConfirmDialog, Skeleton } from "./ui.jsx";

describe("Modal", () => {
  it("renders its children inside a labelled dialog", () => {
    render(
      <Modal ariaLabel="Test dialog" onClose={() => {}}>
        <button type="button">Inside</button>
      </Modal>,
    );
    expect(screen.getByRole("dialog", { name: "Test dialog" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Inside" })).toBeInTheDocument();
  });

  it("calls onClose when Escape is pressed", () => {
    const onClose = vi.fn();
    render(
      <Modal ariaLabel="Test dialog" onClose={onClose}>
        <button type="button">Inside</button>
      </Modal>,
    );
    fireEvent.keyDown(document, { key: "Escape" });
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("closes on backdrop click but not on panel click", () => {
    const onClose = vi.fn();
    render(
      <Modal ariaLabel="Test dialog" onClose={onClose}>
        <button type="button">Inside</button>
      </Modal>,
    );
    fireEvent.click(screen.getByRole("button", { name: "Inside" }));
    expect(onClose).not.toHaveBeenCalled();
    // The backdrop is the dialog's parent element.
    fireEvent.click(screen.getByRole("dialog").parentElement);
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("focuses the first focusable element and traps Tab inside the panel", () => {
    render(
      <Modal ariaLabel="Test dialog" onClose={() => {}}>
        <button type="button">First</button>
        <button type="button">Second</button>
      </Modal>,
    );
    const first = screen.getByRole("button", { name: "First" });
    const second = screen.getByRole("button", { name: "Second" });
    expect(first).toHaveFocus();

    // Tab from the last focusable wraps back to the first.
    second.focus();
    fireEvent.keyDown(document, { key: "Tab" });
    expect(first).toHaveFocus();

    // Shift+Tab from the first wraps forward to the last.
    fireEvent.keyDown(document, { key: "Tab", shiftKey: true });
    expect(second).toHaveFocus();
  });

  it("returns focus to the element that had it when it opened", () => {
    const opener = document.createElement("button");
    document.body.appendChild(opener);
    opener.focus();

    const { unmount } = render(
      <Modal ariaLabel="Test dialog" onClose={() => {}}>
        <button type="button">Inside</button>
      </Modal>,
    );
    expect(document.activeElement).not.toBe(opener);
    unmount();
    expect(document.activeElement).toBe(opener);
    document.body.removeChild(opener);
  });
});

describe("ConfirmDialog", () => {
  it("renders nothing when closed and Esc cancels when open", () => {
    const onCancel = vi.fn();
    const { rerender } = render(
      <ConfirmDialog open={false} title="Delete?" onConfirm={() => {}} onCancel={onCancel} />,
    );
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();

    rerender(<ConfirmDialog open title="Delete?" onConfirm={() => {}} onCancel={onCancel} />);
    fireEvent.keyDown(document, { key: "Escape" });
    expect(onCancel).toHaveBeenCalledTimes(1);
  });
});

describe("Skeleton", () => {
  it("renders an aria-hidden placeholder", () => {
    const { container } = render(<Skeleton style={{ height: 20 }} />);
    const el = container.firstChild;
    expect(el).toHaveAttribute("aria-hidden", "true");
  });
});
