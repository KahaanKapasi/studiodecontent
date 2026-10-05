import { lazy } from 'react'
import { Navigate, Route, Routes } from 'react-router-dom'
import AppShell from './layout/AppShell'
import AccessGate from './components/AccessGate'

const Discovery = lazy(() => import('./pages/Discovery'))
const Articles = lazy(() => import('./pages/Articles'))
const Video = lazy(() => import('./pages/Video'))
const Posts = lazy(() => import('./pages/Posts'))
const Dashboard = lazy(() => import('./pages/Dashboard'))

export default function App() {
  return (
    <AccessGate>
      <Routes>
        <Route element={<AppShell />}>
          <Route index element={<Navigate to="/discovery" replace />} />
          <Route path="/discovery" element={<Discovery />} />
          <Route path="/articles" element={<Articles />} />
          <Route path="/video" element={<Video />} />
          <Route path="/posts" element={<Posts />} />
          <Route path="/dashboard" element={<Dashboard />} />
          <Route path="*" element={<Navigate to="/discovery" replace />} />
        </Route>
      </Routes>
    </AccessGate>
  )
}
