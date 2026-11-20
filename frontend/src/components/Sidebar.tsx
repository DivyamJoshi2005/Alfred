import { NavLink } from 'react-router-dom'
import { Video, CheckCircle, Calendar, Settings, Wifi, WifiOff } from 'lucide-react'
import { cn } from '../lib/utils'

const NAV_ITEMS = [
  { to: '/', icon: Video, label: 'Process' },
  { to: '/review', icon: CheckCircle, label: 'Review' },
  { to: '/calendar', icon: Calendar, label: 'Calendar' },
  { to: '/settings', icon: Settings, label: 'Settings' },
]

export function Sidebar({ connected }: { connected: boolean }) {
  return (
    <aside className="w-60 h-screen bg-surface border-r border-border flex flex-col shrink-0">
      {/* Logo */}
      <div className="px-5 py-5 border-b border-border">
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-lg bg-accent flex items-center justify-center">
            <span className="text-accent-text font-bold text-sm">A</span>
          </div>
          <div>
            <h1 className="text-base font-semibold text-text leading-tight">Alfred</h1>
            <p className="text-xs text-text-muted leading-tight">Content Studio</p>
          </div>
        </div>
      </div>

      {/* Navigation */}
      <nav className="flex-1 px-3 py-3 space-y-0.5">
        {NAV_ITEMS.map(({ to, icon: Icon, label }) => (
          <NavLink
            key={to}
            to={to}
            end={to === '/'}
            className={({ isActive }) =>
              cn(
                'flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors',
                isActive
                  ? 'bg-accent-light text-accent'
                  : 'text-text-secondary hover:bg-surface-hover hover:text-text'
              )
            }
          >
            <Icon size={18} strokeWidth={1.8} />
            {label}
          </NavLink>
        ))}
      </nav>

      {/* Connection status */}
      <div className="px-4 py-3 border-t border-border">
        <div className="flex items-center gap-2 text-xs">
          {connected ? (
            <>
              <Wifi size={14} className="text-success" />
              <span className="text-text-muted">Connected to backend</span>
            </>
          ) : (
            <>
              <WifiOff size={14} className="text-error" />
              <span className="text-text-muted">Reconnecting…</span>
            </>
          )}
        </div>
      </div>
    </aside>
  )
}
