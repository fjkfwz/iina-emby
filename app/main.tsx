import React from "react";
import ReactDOM from "react-dom/client";
import "./app.css";
import "./view-transitions.css";
import { App } from "./App";
import { type LanguageCode, translations } from "./lib/i18n";

window.addEventListener("error", (event) => {
  console.error("[GlobalError]", event.error || event.message);
  try {
    const errBox = document.getElementById("debug-error-overlay");
    if (errBox) {
      errBox.style.display = "block";
      errBox.innerText += `\n[GlobalError] ${event.message}\n${event.error?.stack || ""}\n`;
    }
  } catch {}
});

window.addEventListener("unhandledrejection", (event) => {
  console.error("[UnhandledRejection]", event.reason);
  try {
    const errBox = document.getElementById("debug-error-overlay");
    if (errBox) {
      errBox.style.display = "block";
      errBox.innerText += `\n[UnhandledRejection] ${event.reason?.message || event.reason}\n${event.reason?.stack || ""}\n`;
    }
  } catch {}
});

interface ErrorBoundaryProps {
  children: React.ReactNode;
}

interface ErrorBoundaryState {
  hasError: boolean;
  error: Error | null;
  errorInfo: React.ErrorInfo | null;
}

function ErrorFallback({ error, errorInfo }: { error: Error | null; errorInfo: React.ErrorInfo | null }) {
  let title = "Rendering Error Encountered";
  let backBtn = "Back to Home";
  try {
    const saved = localStorage.getItem("emby_language");
    const lang = saved && saved in translations ? saved : "zh-CN";
    title = translations[lang as LanguageCode]?.renderingError || title;
    backBtn = translations[lang as LanguageCode]?.backToHome || backBtn;
  } catch {}

  return (
    <div
      style={{
        padding: "40px 24px",
        color: "#ff6b6b",
        background: "#15161d",
        fontFamily: "monospace",
        zIndex: 99999,
        position: "fixed",
        inset: 0,
        overflow: "auto",
        whiteSpace: "pre-wrap",
      }}
    >
      <h2 style={{ color: "#ff4d4f", marginBottom: "16px" }}>{title}</h2>
      <p style={{ fontSize: "1.1rem", fontWeight: "bold" }}>{error?.toString()}</p>
      <pre style={{ color: "#e0e0e0", fontSize: "0.85rem", background: "rgba(0,0,0,0.5)", padding: "12px", borderRadius: "6px" }}>
        {error?.stack}
      </pre>
      <pre style={{ color: "#a0a0a0", fontSize: "0.8rem", background: "rgba(0,0,0,0.3)", padding: "12px", borderRadius: "6px" }}>
        {errorInfo?.componentStack}
      </pre>
      <button
        type="button"
        onClick={() => {
          window.location.hash = "#/";
          window.location.reload();
        }}
        style={{
          marginTop: "20px",
          padding: "10px 20px",
          background: "#38bdf8",
          color: "#000",
          border: "none",
          borderRadius: "6px",
          fontWeight: "bold",
          cursor: "pointer",
        }}
      >
        {backBtn}
      </button>
    </div>
  );
}

class ErrorBoundary extends React.Component<ErrorBoundaryProps, ErrorBoundaryState> {
  constructor(props: ErrorBoundaryProps) {
    super(props);
    this.state = { hasError: false, error: null, errorInfo: null };
  }

  static getDerivedStateFromError(error: Error): Partial<ErrorBoundaryState> {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    this.setState({ errorInfo });
    console.error("[ErrorBoundary] Caught error:", error, errorInfo);
  }

  render() {
    if (this.state.hasError) {
      return <ErrorFallback error={this.state.error} errorInfo={this.state.errorInfo} />;
    }
    return this.props.children;
  }
}

function mount() {
  const rootElement = document.getElementById("root");
  if (rootElement) {
    ReactDOM.createRoot(rootElement).render(
      <React.StrictMode>
        <ErrorBoundary>
          <App />
        </ErrorBoundary>
      </React.StrictMode>,
    );
  }
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", mount);
} else {
  mount();
}
