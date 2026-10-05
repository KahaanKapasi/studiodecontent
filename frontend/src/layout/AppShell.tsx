import { Suspense } from 'react'
import { Outlet } from 'react-router-dom'
import Sidebar from './Sidebar'

export default function AppShell() {
  return (
    <div className="flex h-screen bg-app text-ink">
      <Sidebar />
      <main className="flex-1 overflow-y-auto p-8">
        <Suspense fallback={<p className="text-sm text-faint">Loading…</p>}>
          <Outlet />
        </Suspense>
      </main>
    </div>
  )
}
