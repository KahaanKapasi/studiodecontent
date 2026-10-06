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
    <nav className="order-last flex w-full shrink-0 items-center border-t border-line bg-surface p-2 md:order-none md:w-56 md:flex-col md:items-stretch md:border-r md:border-t-0 md:p-4">
      <div className="mb-8 hidden px-2 text-lg font-semibold text-ink md:block">Content Studio</div>
      <ul className="flex flex-1 gap-1 md:block md:space-y-1">
        {NAV_ITEMS.map((item) => (
          <li key={item.to} className="flex-1 md:flex-none">
            <NavLink
              to={item.to}
              className={({ isActive }) =>
                `block rounded-md px-1 py-2.5 text-center text-sm transition-colors md:px-3 md:text-left ${
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
      <div className="hidden md:block">
        <ThemeSwitcher />
      </div>
    </nav>
  )
}
