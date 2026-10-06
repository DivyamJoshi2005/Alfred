import { NavLink } from 'react-router-dom';
import {
  DashboardIcon,
  ProcessIcon,
  ReviewIcon,
  CalendarIcon,
  SettingsIcon,
  ChevronLeftIcon,
  ChevronRightIcon,
} from './Icons';

const navItems = [
  { path: '/',         label: 'Dashboard',  code: '01', icon: DashboardIcon, section: 'workspace' },
  { path: '/process',  label: 'Ingest Bay', code: '02', icon: ProcessIcon,   section: 'workspace' },
  { path: '/review',   label: 'Review Suite',code: '03', icon: ReviewIcon,    section: 'workspace' },
  { path: '/calendar', label: 'Broadcast',  code: '04', icon: CalendarIcon,  section: 'distribution' },
  { path: '/settings', label: 'Hardware',   code: '05', icon: SettingsIcon,  section: 'system' },
];

interface SidebarProps {
  collapsed: boolean;
  onToggleCollapse: () => void;
}

export default function Sidebar({ collapsed, onToggleCollapse }: SidebarProps) {
  const workspaceItems = navItems.filter(i => i.section === 'workspace');
  const distributionItems = navItems.filter(i => i.section === 'distribution');
  const systemItems = navItems.filter(i => i.section === 'system');

  return (
    <aside className={`sidebar ${collapsed ? 'collapsed' : ''}`}>
      {/* Masthead */}
      <div className="sidebar-masthead">
        <div className="sidebar-emblem">A</div>
        <div className="sidebar-title-group">
          <div className="sidebar-title">Alfred</div>
          <div className="sidebar-badge">Studio Edition · Offline</div>
        </div>
      </div>

      {/* Navigation Groups */}
      <nav className="sidebar-nav">
        <div className="sidebar-section-divider">// 01 Studio Workspace</div>
        {workspaceItems.map(item => {
          const Icon = item.icon;
          return (
            <NavLink
              key={item.path}
              to={item.path}
              className={({ isActive }) => `nav-link ${isActive ? 'active' : ''}`}
              end={item.path === '/'}
              title={collapsed ? item.label : undefined}
            >
              <span className="nav-link-icon">
                <Icon size={18} />
              </span>
              <span className="nav-link-label">{item.label}</span>
              {!collapsed && (
                <span style={{
                  marginLeft: 'auto',
                  fontFamily: 'var(--font-mono)',
                  fontSize: '10px',
                  color: 'var(--text-tertiary)',
                  letterSpacing: '0.05em'
                }}>
                  [{item.code}]
                </span>
              )}
            </NavLink>
          );
        })}

        <div className="sidebar-section-divider">// 02 Distribution</div>
        {distributionItems.map(item => {
          const Icon = item.icon;
          return (
            <NavLink
              key={item.path}
              to={item.path}
              className={({ isActive }) => `nav-link ${isActive ? 'active' : ''}`}
              title={collapsed ? item.label : undefined}
            >
              <span className="nav-link-icon">
                <Icon size={18} />
              </span>
              <span className="nav-link-label">{item.label}</span>
              {!collapsed && (
                <span style={{
                  marginLeft: 'auto',
                  fontFamily: 'var(--font-mono)',
                  fontSize: '10px',
                  color: 'var(--text-tertiary)',
                  letterSpacing: '0.05em'
                }}>
                  [{item.code}]
                </span>
              )}
            </NavLink>
          );
        })}

        <div className="sidebar-section-divider">// 03 Calibration</div>
        {systemItems.map(item => {
          const Icon = item.icon;
          return (
            <NavLink
              key={item.path}
              to={item.path}
              className={({ isActive }) => `nav-link ${isActive ? 'active' : ''}`}
              title={collapsed ? item.label : undefined}
            >
              <span className="nav-link-icon">
                <Icon size={18} />
              </span>
              <span className="nav-link-label">{item.label}</span>
              {!collapsed && (
                <span style={{
                  marginLeft: 'auto',
                  fontFamily: 'var(--font-mono)',
                  fontSize: '10px',
                  color: 'var(--text-tertiary)',
                  letterSpacing: '0.05em'
                }}>
                  [{item.code}]
                </span>
              )}
            </NavLink>
          );
        })}
      </nav>

      {/* Sidebar Footer */}
      <div className="sidebar-footer">
        <button
          className="collapse-button"
          onClick={onToggleCollapse}
          title={collapsed ? 'Expand Workspace' : 'Collapse Workspace'}
        >
          {collapsed ? <ChevronRightIcon size={16} /> : <ChevronLeftIcon size={16} />}
          {!collapsed && <span>Collapse Studio Rail</span>}
        </button>
      </div>
    </aside>
  );
}
