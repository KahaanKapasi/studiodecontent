import { NavLink } from 'react-router-dom'

const NAV_ITEMS = [
  { to: '/discovery', label: 'Discovery' },
  { to: '/articles', label: 'Articles' },
  { to: '/video', label: 'Video' },
  { to: '/posts', label: 'Posts' },
  { to: '/dashboard', label: 'Dashboard' },
]

export default function Sidebar() {
  return (
    <nav className="w-56 shrink-0 border-r border-neutral-800 bg-neutral-950 p-4">
      <div className="mb-8 px-2 text-lg font-semibold text-neutral-100">Content Studio</div>
      <ul className="space-y-1">
        {NAV_ITEMS.map((item) => (
          <li key={item.to}>
            <NavLink
              to={item.to}
              className={({ isActive }) =>
                `block rounded-md px-3 py-2 text-sm transition-colors ${
                  isActive
                    ? 'bg-amber-500/10 text-amber-400'
                    : 'text-neutral-400 hover:bg-neutral-900 hover:text-neutral-100'
                }`
              }
            >
              {item.label}
            </NavLink>
          </li>
        ))}
      </ul>
    </nav>
  )
}
