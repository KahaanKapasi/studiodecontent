import { Suspense } from 'react'
import { Outlet, useLocation } from 'react-router-dom'
import CostTracker from '../components/cost/CostTracker'
import Sidebar from './Sidebar'

export default function AppShell() {
  const { pathname } = useLocation()
  // The Posts editor is a full-screen workspace with its own top bar (it carries the nav menu and cost pill).
  if (pathname.startsWith('/posts')) {
    return (
      <div className="h-dvh bg-app text-ink">
        <Suspense fallback={<p className="p-6 text-sm text-faint">Loading editor...</p>}>
          <Outlet />
        </Suspense>
      </div>
    )
  }
  return (
    <div className="flex h-dvh flex-col bg-app text-ink md:flex-row">
      <Sidebar />
      <div className="flex min-h-0 min-w-0 flex-1 flex-col">
        {/* Fixed-height top bar: brand on mobile, global cost pill on every screen (no layout shift). */}
        <header className="flex h-12 shrink-0 items-center justify-between border-b border-line bg-surface px-4 md:justify-end md:px-8">
          <span className="text-sm font-semibold text-ink md:hidden">Content Studio</span>
          <CostTracker />
        </header>
        <main className="min-h-0 min-w-0 flex-1 overflow-y-auto p-4 md:p-8">
          <Suspense fallback={<p className="text-sm text-faint">Loading…</p>}>
            <Outlet />
          </Suspense>
        </main>
      </div>
    </div>
  )
}
