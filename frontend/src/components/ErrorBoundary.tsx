import { Component, type ErrorInfo, type ReactNode } from 'react'

interface State {
  error: Error | null
}

export default class ErrorBoundary extends Component<{ children: ReactNode }, State> {
  state: State = { error: null }

  static getDerivedStateFromError(error: Error): State {
    return { error }
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('Unhandled UI error', error, info.componentStack)
  }

  render() {
    if (!this.state.error) return this.props.children
    return (
      <div className="flex min-h-screen items-center justify-center bg-app p-6 text-ink">
        <div className="w-full max-w-md rounded-xl border border-line bg-surface p-8">
          <h1 className="mb-2 text-lg font-semibold">Something broke</h1>
          <p className="mb-4 break-words text-sm text-muted">{this.state.error.message}</p>
          <button
            onClick={() => window.location.reload()}
            className="rounded-md bg-accent px-4 py-2 text-sm font-medium text-accent-fg hover:bg-accent-hover"
          >
            Reload
          </button>
        </div>
      </div>
    )
  }
}
