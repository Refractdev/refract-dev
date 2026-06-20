import React, { useState, useEffect, useRef } from 'react';
import { cn } from '../lib/utils';
import {
  Home,
  Layers,
  GitFork,
  BookOpen,
  Settings2,
  LogOut,
  MessageSquare,
  ChevronLeft,
  ChevronRight,
  ArrowLeft,
  ShieldAlert,
  User,
  Users,
  Globe,
  Menu,
  X,
} from 'lucide-react';
import { LogoMark } from './Logo';
import { useAuth } from '../lib/AuthContext';
import { useTranslation } from '../hooks/useTranslation';
import { getAllProjects } from '../lib/db';

export type Page = 'home' | 'projects' | 'repos' | 'guidelines' | 'settings' | 'projectView';

interface SidebarProps {
  activePage: Page;
  onNavigate: (page: Page) => void;
  activeSettingsTab?: string;
  onSettingsTabChange?: (tab: string) => void;
  collapsed: boolean;
  onToggleCollapse: () => void;
}

const GitHubIcon: React.FC<{ size?: number; className?: string }> = ({ size = 14, className }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor" className={className}>
    <path d="M12 0C5.37 0 0 5.37 0 12c0 5.31 3.435 9.795 8.205 11.385.6.105.825-.255.825-.57 0-.285-.015-1.23-.015-2.235-3.015.555-3.795-.735-4.035-1.41-.135-.345-.72-1.41-1.23-1.695-.42-.225-1.02-.78-.015-.795.945-.015 1.62.87 1.845 1.23 1.08 1.815 2.805 1.305 3.495.99.105-.78.42-1.305.765-1.605-2.67-.3-5.46-1.335-5.46-5.925 0-1.305.465-2.385 1.23-3.225-.12-.3-.54-1.53.12-3.18 0 0 1.005-.315 3.3 1.23.96-.27 1.98-.405 3-.405s2.04.135 3 .405c2.295-1.56 3.3-1.23 3.3-1.23.66 1.65.24 2.88.12 3.18.765.84 1.23 1.905 1.23 3.225 0 4.605-2.805 5.625-5.475 5.925.435.375.81 1.095.81 2.22 0 1.605-.015 2.895-.015 3.3 0 .315.225.69.825.57A12.02 12.02 0 0 0 24 12c0-6.63-5.37-12-12-12z" />
  </svg>
);

interface TooltipProps {
  label: string;
  children: React.ReactNode;
  enabled: boolean;
}

const NavTooltip: React.FC<TooltipProps> = ({ label, children, enabled }) => {
  const [visible, setVisible] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  if (!enabled) return <>{children}</>;

  return (
    <div
      ref={ref}
      className="relative"
      onMouseEnter={() => setVisible(true)}
      onMouseLeave={() => setVisible(false)}
    >
      {children}
      {visible && (
        <div
          className="pointer-events-none fixed z-[200] ml-2 whitespace-nowrap rounded-md border border-[var(--hairline)] bg-[var(--surface-strong)] px-2.5 py-1 text-[12px] font-medium text-[var(--ink)] shadow-[var(--shadow-dropdown)]"
          style={{
            top: ref.current ? ref.current.getBoundingClientRect().top + ref.current.getBoundingClientRect().height / 2 - 14 : 0,
            left: ref.current ? ref.current.getBoundingClientRect().right + 8 : 0,
          }}
        >
          {label}
        </div>
      )}
    </div>
  );
};

export const Sidebar: React.FC<SidebarProps> = ({
  activePage,
  onNavigate,
  activeSettingsTab = 'profile',
  onSettingsTabChange,
  collapsed,
  onToggleCollapse,
}) => {
  const { profile, session, signOut } = useAuth();
  const { t } = useTranslation();
  const [mobileOpen, setMobileOpen] = useState(false);
  const [projectCount, setProjectCount] = useState<number | null>(null);

  const userEmail = session?.user?.email ?? '';
  const userName = profile?.name ?? userEmail.split('@')[0] ?? 'User';
  const hasGitHub = Boolean(
    session?.user?.identities?.some((id: any) => id.provider === 'github') ||
    (session?.user?.app_metadata?.providers as string[] | undefined)?.includes('github')
  );

  useEffect(() => {
    if (!profile?.id) return;
    getAllProjects(profile.id)
      .then((p) => setProjectCount(p?.length ?? 0))
      .catch(() => setProjectCount(null));
  }, [profile?.id]);

  const navItems = [
    { id: 'home',       label: t('sidebar.dashboard'),   icon: Home },
    { id: 'projects',   label: t('sidebar.projects'),    icon: Layers,   badge: projectCount },
    { id: 'repos',      label: t('sidebar.repos'),       icon: GitFork },
    { id: 'guidelines', label: t('sidebar.guidelines'),  icon: BookOpen },
  ];

  const settingsItems = [
    { id: 'profile',      label: t('settings.tabs.profile'),      icon: User },
    { id: 'preferences',  label: t('settings.tabs.preferences'),  icon: Globe },
    { id: 'guidelines',   label: t('settings.tabs.guidelines'),   icon: BookOpen },
    { id: 'integrations', label: t('settings.tabs.integrations'), icon: GitFork },
    { id: 'team',         label: t('settings.tabs.team'),         icon: Users },
    { id: 'danger',       label: t('settings.tabs.danger'),       icon: ShieldAlert },
  ];

  const handleNavigate = (page: Page) => {
    onNavigate(page);
    setMobileOpen(false);
  };

  const handleSettingsTabChange = (tab: string) => {
    onSettingsTabChange?.(tab);
    setMobileOpen(false);
  };

  const avatarEl = profile?.avatar_url ? (
    profile.avatar_url.startsWith('linear-gradient') ? (
      <div
        style={{ background: profile.avatar_url, width: 26, height: 26 }}
        className="shrink-0 rounded-full border border-[var(--hairline)]"
      />
    ) : (
      <img
        src={profile.avatar_url}
        alt={userName}
        className="shrink-0 rounded-full border border-[var(--hairline)] object-cover"
        style={{ width: 26, height: 26 }}
      />
    )
  ) : (
    <div
      className="flex shrink-0 items-center justify-center rounded-full bg-[var(--canvas-soft-2)] text-[var(--ink)] border border-[var(--hairline)] font-medium"
      style={{ width: 26, height: 26, fontSize: 10 }}
    >
      {userName.slice(0, 2).toUpperCase()}
    </div>
  );

  const sidebarContent = (
    <div
      className={cn(
        'flex h-full flex-col bg-[var(--canvas)] border-r border-[var(--hairline)] select-none transition-[width] duration-200',
        collapsed ? 'w-[52px]' : 'w-[220px]'
      )}
    >
      {/* Header */}
      <div className={cn(
        'flex h-[48px] shrink-0 items-center border-b border-[var(--hairline)]',
        collapsed ? 'justify-center px-0' : 'gap-2.5 px-4'
      )}>
        <LogoMark size={18} className="shrink-0 text-[var(--ink)]" />
        {!collapsed && (
          <>
            <span
              className="font-semibold tracking-tight text-[var(--ink)] truncate"
              style={{ fontSize: '15px', letterSpacing: '-0.2px' }}
            >
              Refract
            </span>
            <span className="ml-auto font-mono text-[9px] tracking-wider text-[var(--ink-muted-soft)] bg-[var(--canvas-soft-2)] border border-[var(--hairline)] rounded px-1.5 py-0.5 leading-none shrink-0">
              BETA
            </span>
          </>
        )}
        {/* Mobile close */}
        <button
          className="ml-auto md:hidden p-1 rounded text-[var(--ink-muted)] hover:text-[var(--ink)]"
          onClick={() => setMobileOpen(false)}
          aria-label="Close menu"
        >
          <X size={16} />
        </button>
      </div>

      {/* Navigation */}
      <nav className="flex-1 overflow-y-auto py-3 space-y-0.5 px-2">
        {activePage === 'settings' ? (
          <>
            <NavTooltip label={t('sidebar.backToWorkspace')} enabled={collapsed}>
              <button
                onClick={() => handleNavigate('home')}
                className={cn(
                  'flex w-full items-center gap-2.5 rounded-[6px] text-[13px] font-medium text-[var(--ink-muted)] hover:text-[var(--ink)] hover:bg-[var(--canvas-soft-2)] outline-none mb-2',
                  collapsed ? 'justify-center h-8 w-8 mx-auto p-0' : 'px-2.5 py-1.5'
                )}
              >
                <ArrowLeft size={15} className="shrink-0" />
                {!collapsed && <span>{t('sidebar.backToWorkspace')}</span>}
              </button>
            </NavTooltip>

            {!collapsed && (
              <div className="section-label px-2.5 pt-1 pb-2">
                {t('settings.title')}
              </div>
            )}

            {settingsItems.map((item) => {
              const Icon = item.icon;
              const isActive = activeSettingsTab === item.id;
              return (
                <NavTooltip key={item.id} label={item.label} enabled={collapsed}>
                  <button
                    onClick={() => handleSettingsTabChange(item.id)}
                    className={cn(
                      'relative flex w-full items-center gap-2.5 rounded-[6px] text-[13px] outline-none',
                      collapsed ? 'justify-center h-8 w-8 mx-auto p-0' : 'px-2.5 py-1.5',
                      isActive
                        ? 'bg-[var(--canvas-soft-2)] text-[var(--ink)] font-medium'
                        : 'text-[var(--ink-muted)] hover:bg-[var(--canvas-soft-2)] hover:text-[var(--ink)]'
                    )}
                  >
                    {isActive && !collapsed && (
                      <span className="absolute left-0 top-1 bottom-1 w-[2px] rounded-r-full bg-[var(--primary)]" />
                    )}
                    <Icon size={15} className="shrink-0" />
                    {!collapsed && <span>{item.label}</span>}
                  </button>
                </NavTooltip>
              );
            })}
          </>
        ) : (
          <>
            {!collapsed && (
              <div className="section-label px-2.5 pb-2">
                {t('sidebar.workspace')}
              </div>
            )}

            {navItems.map((item) => {
              const Icon = item.icon;
              const isActive = activePage === item.id;
              return (
                <NavTooltip key={item.id} label={item.label} enabled={collapsed}>
                  <button
                    onClick={() => handleNavigate(item.id as Page)}
                    className={cn(
                      'relative flex w-full items-center gap-2.5 rounded-[6px] text-[13px] outline-none',
                      collapsed ? 'justify-center h-8 w-8 mx-auto p-0' : 'px-2.5 py-1.5',
                      isActive
                        ? 'bg-[var(--canvas-soft-2)] text-[var(--ink)] font-medium'
                        : 'text-[var(--ink-muted)] hover:bg-[var(--canvas-soft-2)] hover:text-[var(--ink)]'
                    )}
                  >
                    {isActive && !collapsed && (
                      <span className="absolute left-0 top-1 bottom-1 w-[2px] rounded-r-full bg-[var(--primary)]" />
                    )}
                    <Icon size={15} className="shrink-0" />
                    {!collapsed && (
                      <>
                        <span className="flex-1 text-left">{item.label}</span>
                        {item.badge != null && item.badge > 0 && (
                          <span className="ml-auto font-mono text-[10px] font-medium bg-[var(--surface-strong)] text-[var(--ink-muted)] border border-[var(--hairline)] rounded px-1.5 py-0 leading-5 min-w-[20px] text-center">
                            {item.badge}
                          </span>
                        )}
                      </>
                    )}
                  </button>
                </NavTooltip>
              );
            })}
          </>
        )}
      </nav>

      {/* Footer */}
      <div className={cn(
        'shrink-0 border-t border-[var(--hairline)] py-2 space-y-0.5',
        collapsed ? 'px-2' : 'px-2'
      )}>
        {/* GitHub status */}
        {!collapsed && (
          <div className="flex items-center gap-2 px-2.5 py-1.5 mb-1">
            <GitHubIcon size={13} className="text-[var(--ink-muted-soft)] shrink-0" />
            {hasGitHub ? (
              <>
                <span className="text-[12px] text-[var(--ink-muted)] truncate flex-1">GitHub</span>
                <span className="flex items-center gap-1 text-[11px] font-mono text-[var(--semantic-success)]">
                  <span className="inline-block w-1.5 h-1.5 rounded-full bg-[var(--semantic-success)]" />
                  connected
                </span>
              </>
            ) : (
              <span className="text-[12px] text-[var(--ink-muted-soft)]">Not connected</span>
            )}
          </div>
        )}

        {/* Settings */}
        {activePage !== 'settings' && (
          <NavTooltip label={t('sidebar.settings')} enabled={collapsed}>
            <button
              onClick={() => handleNavigate('settings')}
              className={cn(
                'flex w-full items-center gap-2.5 rounded-[6px] text-[13px] text-[var(--ink-muted)] hover:bg-[var(--canvas-soft-2)] hover:text-[var(--ink)] outline-none',
                collapsed ? 'justify-center h-8 w-8 mx-auto p-0' : 'px-2.5 py-1.5'
              )}
            >
              <Settings2 size={15} className="shrink-0" />
              {!collapsed && <span>{t('sidebar.settings')}</span>}
            </button>
          </NavTooltip>
        )}

        {/* Feedback */}
        <NavTooltip label={t('sidebar.feedback')} enabled={collapsed}>
          <a
            href="mailto:refractcode@gmail.com?subject=Feedback%20Refract"
            className={cn(
              'flex w-full items-center gap-2.5 rounded-[6px] text-[13px] text-[var(--ink-muted)] hover:bg-[var(--canvas-soft-2)] hover:text-[var(--ink)] outline-none',
              collapsed ? 'justify-center h-8 w-8 mx-auto p-0' : 'px-2.5 py-1.5'
            )}
          >
            <MessageSquare size={15} className="shrink-0" />
            {!collapsed && <span>{t('sidebar.feedback')}</span>}
          </a>
        </NavTooltip>

        {/* Sign out */}
        <NavTooltip label={t('sidebar.signOut')} enabled={collapsed}>
          <button
            onClick={signOut}
            className={cn(
              'flex w-full items-center gap-2.5 rounded-[6px] text-[13px] text-[var(--ink-muted)] hover:bg-[color-mix(in_srgb,var(--semantic-error)_10%,transparent)] hover:text-[var(--semantic-error)] outline-none',
              collapsed ? 'justify-center h-8 w-8 mx-auto p-0' : 'px-2.5 py-1.5'
            )}
          >
            <LogOut size={15} className="shrink-0" />
            {!collapsed && <span>{t('sidebar.signOut')}</span>}
          </button>
        </NavTooltip>

        {/* Divider */}
        <div className="h-px bg-[var(--hairline)] my-1" />

        {/* User card */}
        {collapsed ? (
          <NavTooltip label={`${userName} · ${userEmail}`} enabled>
            <div className="flex justify-center py-1">
              {avatarEl}
            </div>
          </NavTooltip>
        ) : (
          <div className="flex items-center gap-2.5 px-2.5 py-1.5 rounded-[6px]">
            {avatarEl}
            <div className="flex flex-col min-w-0 flex-1 overflow-hidden">
              <span className="truncate text-[12px] font-medium text-[var(--ink)]">{userName}</span>
              <span className="truncate text-[11px] text-[var(--ink-muted-soft)]">{userEmail}</span>
            </div>
          </div>
        )}

        {/* Collapse toggle — desktop only */}
        <div className="hidden md:flex pt-1 justify-end">
          <button
            onClick={onToggleCollapse}
            className="flex items-center justify-center h-6 w-6 rounded text-[var(--ink-muted-soft)] hover:text-[var(--ink)] hover:bg-[var(--canvas-soft-2)] outline-none"
            aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
          >
            {collapsed ? <ChevronRight size={14} /> : <ChevronLeft size={14} />}
          </button>
        </div>
      </div>
    </div>
  );

  return (
    <>
      {/* Desktop sidebar */}
      <aside
        className={cn(
          'hidden md:flex h-screen shrink-0 flex-col',
          'transition-[width] duration-200',
          collapsed ? 'w-[52px]' : 'w-[220px]'
        )}
      >
        {sidebarContent}
      </aside>

      {/* Mobile top bar */}
      <div className="md:hidden fixed top-0 left-0 right-0 z-40 flex items-center h-[48px] px-4 bg-[var(--canvas)] border-b border-[var(--hairline)]">
        <button
          onClick={() => setMobileOpen(true)}
          className="p-1.5 rounded text-[var(--ink-muted)] hover:text-[var(--ink)] hover:bg-[var(--canvas-soft-2)]"
          aria-label="Open menu"
        >
          <Menu size={18} />
        </button>
        <div className="flex items-center gap-2 ml-3">
          <LogoMark size={16} className="text-[var(--ink)]" />
          <span className="font-semibold text-[15px] tracking-tight text-[var(--ink)]">Refract</span>
        </div>
      </div>

      {/* Mobile drawer */}
      {mobileOpen && (
        <>
          <div
            className="md:hidden fixed inset-0 z-40 bg-black/50"
            onClick={() => setMobileOpen(false)}
          />
          <aside className="md:hidden fixed top-0 left-0 h-full w-[240px] z-50 flex flex-col shadow-[var(--shadow-modal)]">
            {sidebarContent}
          </aside>
        </>
      )}
    </>
  );
};
