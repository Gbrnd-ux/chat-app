"use client";
import React from "react";

type Props = {
  children: React.ReactNode;
  fallback?: React.ReactNode;
};

type State = {
  hasError: boolean;
  error?: Error;
};

export class ErrorBoundary extends React.Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, info: React.ErrorInfo) {
    // Log ke console; nanti bisa kirim ke Sentry / service lain
    console.error("[ErrorBoundary]", error, info.componentStack);
  }

  handleReload = () => {
    this.setState({ hasError: false, error: undefined });
    if (typeof window !== "undefined") {
      window.location.reload();
    }
  };

  render() {
    if (this.state.hasError) {
      if (this.props.fallback) return this.props.fallback;

      return (
        <div className="flex h-dvh items-center justify-center bg-neutral-950 px-6">
          <div className="max-w-md w-full text-center">
            <div className="mx-auto mb-4 h-12 w-12 rounded-full bg-red-600/20 grid place-items-center">
              <span className="text-2xl">⚠️</span>
            </div>
            <h1 className="text-xl font-semibold text-neutral-100 mb-2">
              Ada yang tidak beres
            </h1>
            <p className="text-sm text-neutral-400 mb-6">
              Terjadi kesalahan saat menampilkan halaman ini. Coba muat ulang. Kalau
              masih gagal, buka console browser (F12) untuk detail.
            </p>

            {this.state.error?.message && (
              <pre className="mb-6 max-h-32 overflow-auto rounded-lg bg-neutral-900 border border-neutral-800 p-3 text-left text-xs text-red-400">
                {this.state.error.message}
              </pre>
            )}

            <div className="flex gap-3 justify-center">
              <button
                onClick={this.handleReload}
                className="rounded-xl bg-sky-600 hover:bg-sky-500 px-4 py-2 text-sm font-medium text-white"
              >
                Muat ulang
              </button>
              <button
                onClick={() => {
                  if (typeof window !== "undefined") {
                    localStorage.removeItem("chat:conversations");
                    window.location.reload();
                  }
                }}
                className="rounded-xl border border-neutral-700 hover:bg-neutral-800 px-4 py-2 text-sm text-neutral-300"
              >
                Reset riwayat
              </button>
            </div>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}