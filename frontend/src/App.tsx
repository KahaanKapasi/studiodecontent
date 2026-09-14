import { Navigate, Route, Routes } from 'react-router-dom'
import AppShell from './layout/AppShell'
import Discovery from './pages/Discovery'
import Articles from './pages/Articles'
import Video from './pages/Video'
import Posts from './pages/Posts'
import Dashboard from './pages/Dashboard'

export default function App() {
  return (
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
  )
}
