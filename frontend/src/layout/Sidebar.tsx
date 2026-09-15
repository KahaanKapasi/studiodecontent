import { NavLink } from 'react-router-dom'
import ThemeSwitcher from '../components/ThemeSwitcher'

const NAV_ITEMS = [
  { to: '/discovery', label: 'Discovery' },
  { to: '/articles', label: 'Articles' },
  { to: '/video', label: 'Video' },
  { to: '/posts', label: 'Posts' },
  { to: '/dashboard', label: 'Dashboard' },
]

export default function Sidebar() {
  return (
    <nav className="flex w-56 shrink-0 flex-col border-r border-line bg-surface p-4">
      <div className="mb-8 px-2 text-lg font-semibold text-ink">Content Studio</div>
      <ul className="flex-1 space-y-1">
        {NAV_ITEMS.map((item) => (
          <li key={item.to}>
            <NavLink
              to={item.to}
              className={({ isActive }) =>
                `block rounded-md px-3 py-2 text-sm transition-colors ${
                  isActive
                    ? 'bg-accent/10 text-accent'
                    : 'text-muted hover:bg-surface-2 hover:text-ink'
                }`
              }
            >
              {item.label}
            </NavLink>
          </li>
        ))}
      </ul>
      <ThemeSwitcher />
    </nav>
  )
}
