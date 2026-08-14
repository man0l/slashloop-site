import { Component } from "react";
import { T, fB } from "../lib/theme.js";

/**
 * Last-ditch render guard around the routed page content — without it a
 * single render error white-screens the whole app below the header. The nav
 * stays usable so the user can navigate away instead of reloading blind.
 */
export default class ErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { error: null };
  }

  static getDerivedStateFromError(error) {
    return { error };
  }

  componentDidCatch(error) {
    console.error("[ErrorBoundary]", error);
  }

  render() {
    if (!this.state.error) return this.props.children;
    return (
      <section className="max-w-xl mx-auto px-5 py-20">
        <div
          role="alert"
          className="rounded-xl p-6"
          style={{ background: "#FDECEA", border: "1px solid #F3B5AE" }}
        >
          <div style={{ ...fB, fontSize: 15, fontWeight: 700, color: "#7A1F17" }}>
            Something broke on this page
          </div>
          <p className="mt-2" style={{ ...fB, fontSize: 13, lineHeight: 1.5, color: "#7A1F17" }}>
            The error was logged to the console. Try reloading — if it keeps happening, the nav above still works.
          </p>
          <div className="mt-4 flex gap-2">
            <button
              type="button"
              onClick={() => window.location.reload()}
              className="rounded-md px-3 py-1.5"
              style={{ ...fB, fontSize: 13, fontWeight: 600, background: "#7A1F17", color: "#fff" }}
            >
              Reload
            </button>
            <button
              type="button"
              onClick={() => this.setState({ error: null })}
              className="rounded-md px-3 py-1.5"
              style={{ ...fB, fontSize: 13, color: "#7A1F17", textDecoration: "underline" }}
            >
              Try again
            </button>
          </div>
        </div>
      </section>
    );
  }
}
