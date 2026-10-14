import { Component, type ReactNode } from "react";

interface Props {
  children: ReactNode;
}

interface State {
  error: Error | null;
}

// Without this, an uncaught render error anywhere unmounts the whole React
// tree silently — the user just sees a blank page (or, on the login page,
// the background video with nothing on top of it) with no clue anything
// went wrong. This shows the actual error instead, so a report back is
// actionable rather than just "wala, walang lumalabas."
export class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error) {
    return { error };
  }

  componentDidCatch(error: Error, info: { componentStack?: string | null }) {
    console.error("Unhandled render error:", error, info.componentStack);
  }

  render() {
    if (this.state.error) {
      return (
        <div
          style={{
            position: "fixed",
            inset: 0,
            zIndex: 9999,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            background: "#0f172a",
            color: "white",
            padding: 24,
            textAlign: "center",
            fontFamily: "Inter, sans-serif",
          }}
        >
          <div>
            <p style={{ fontWeight: 700, fontSize: 18, marginBottom: 8 }}>Something went wrong loading the page.</p>
            <p style={{ fontSize: 13, color: "#94a3b8", maxWidth: 420, margin: "0 auto" }}>{this.state.error.message}</p>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}
