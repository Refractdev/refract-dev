import React, { useState } from 'react';
import { cn } from '../lib/utils';
import { 
  LayoutDashboard, 
  FolderOpen, 
  GitBranch, 
  GraduationCap, 
  Settings, 
  LogOut,
  User,
  Globe,
  ArrowLeft,
  ShieldAlert,
  Mail,
  Menu,
  X,
} from 'lucide-react';
import { LogoMark } from './Logo';
import { useAuth } from '../lib/AuthContext';
import { useTranslation } from '../hooks/useTranslation';

export type Page = 'home' | 'projects' | 'repos' | 'guidelines' | 'settings' | 'projectView';

interface SidebarProps {
  activePage: Page;
  onNavigate: (page: Page) => void;
  activeSettingsTab?: string;
  onSettingsTabChange?: (tab: string) => void;
}

export const Sidebar: React.FC<SidebarProps> = ({ 
  activePage, 
  onNavigate, 
  activeSettingsTab = 'profile', 
  onSettingsTabChange 
}) => {
  const { profile, session, signOut } = useAuth();
  const { t } = useTranslation();
  const [mobileOpen, setMobileOpen] = useState(false);
  
  const userEmail = session?.user?.email ?? '';
  const userName  = profile?.name ?? userEmail.split('@')[0] ?? 'User';

  const navItems = [
    { id: 'home', label: t('sidebar.dashboard'), icon: LayoutDashboard },
    { id: 'projects', label: t('sidebar.projects'), icon: FolderOpen },
    { id: 'repos', label: t('sidebar.repos'), icon: GitBranch },
    { id: 'guidelines', label: t('sidebar.guidelines'), icon: GraduationCap },
  ];

  const settingsItems = [
    { id: 'profile', label: t('settings.tabs.profile'), icon: User },
    { id: 'preferences', label: t('settings.tabs.preferences'), icon: Globe },
    { id: 'guidelines', label: t('settings.tabs.guidelines'), icon: GraduationCap },
    { id: 'integrations', label: t('settings.tabs.integrations'), icon: FolderOpen },
    { id: 'danger', label: t('settings.tabs.danger'), icon: ShieldAlert },
  ];

  const handleNavigate = (page: Page) => {
    onNavigate(page);
    setMobileOpen(false);
  };

  const handleSettingsTabChange = (tab: string) => {
    onSettingsTabChange?.(tab);
    setMobileOpen(false);
  };

  const sidebarContent = (
    <div className="flex h-full flex-col bg-[var(--canvas)] border-r border-[var(--hairline)] select-none">
      {/* Header */}
      <div className="flex h-[64px] shrink-0 items-center gap-3 px-6 border-b border-[var(--hairline)]">
        <LogoMark size={20} className="text-[var(--ink)]" />
        <span className="font-normal tracking-tight text-[var(--ink)]" style={{ fontSize: '18px', letterSpacing: '-0.18px', fontFamily: 'var(--font-sans)' }}>
          Refract
        </span>
        <span className="font-mono text-[10px] tracking-wider text-[var(--ink-muted)] bg-[var(--canvas-soft-2)] border border-[var(--hairline)] rounded-sm px-1.5 py-0.5 leading-none">
          Beta
        </span>
        {/* Close button — mobile only */}
        <button
          className="ml-auto md:hidden p-1 rounded-sm text-[var(--ink-muted)] hover:text-[var(--ink)]"
          onClick={() => setMobileOpen(false)}
          aria-label="Close menu"
        >
          <X size={18} />
        </button>
      </div>
      
      {/* Main Navigation */}
      <nav className="flex-1 overflow-y-auto px-4 py-6 space-y-1">
        {activePage === 'settings' ? (
          <>
            <button
              onClick={() => handleNavigate('home')}
              className="flex w-full items-center gap-3 px-3 py-2.5 text-[14px] font-medium text-[var(--ink-muted)] hover:text-[var(--ink)] hover:bg-[var(--canvas-soft)] rounded-[8px] outline-none mb-4 border border-transparent hover:border-[var(--hairline)]"
            >
              <ArrowLeft size={16} />
              <span>{t('sidebar.backToWorkspace')}</span>
            </button>
            
            <div className="section-label px-2 mb-4">
              {t('settings.title')}
            </div>
            
            {settingsItems.map((item) => {
              const Icon = item.icon;
              const isActive = activeSettingsTab === item.id;
              
              return (
                <button
                  key={item.id}
                  onClick={() => handleSettingsTabChange(item.id)}
                  className={cn(
                    "relative flex w-full items-center gap-3 px-4 py-2 text-[14px] outline-none rounded-sm font-sans",
                    isActive 
                      ? "bg-[var(--canvas-soft-2)] text-[var(--ink)] font-medium border border-[var(--hairline)] shadow-sm" 
                      : "text-[var(--ink-muted)] hover:bg-[var(--canvas-soft-2)] hover:text-[var(--ink)] border border-transparent"
                  )}
                >
                  {isActive && (
                    <span className="absolute left-0 top-1.5 bottom-1.5 w-[3px] rounded-r-full bg-[var(--primary)]" />
                  )}
                  <Icon size={16} className={isActive ? "text-[var(--ink)]" : "text-[var(--ink-muted)]"} />
                  <span>{item.label}</span>
                </button>
              );
            })}
          </>
        ) : (
          <>
            <div className="section-label px-2 mb-4 font-mono text-[10px] tracking-wider text-[var(--ink-muted-soft)]">
              {t('sidebar.workspace')}
            </div>
            
            {navItems.map((item) => {
              const Icon = item.icon;
              const isActive = activePage === item.id;
              
              return (
                <button
                  key={item.id}
                  onClick={() => handleNavigate(item.id as Page)}
                  className={cn(
                    "relative flex w-full items-center gap-3 px-4 py-2 text-[14px] outline-none rounded-sm font-sans",
                    isActive 
                      ? "bg-[var(--canvas-soft-2)] text-[var(--ink)] font-medium border border-[var(--hairline)] shadow-sm" 
                      : "text-[var(--ink-muted)] hover:bg-[var(--canvas-soft-2)] hover:text-[var(--ink)] border border-transparent"
                  )}
                >
                  {isActive && (
                    <span className="absolute left-0 top-1.5 bottom-1.5 w-[3px] rounded-r-full bg-[var(--primary)]" />
                  )}
                  <Icon size={16} className={isActive ? "text-[var(--ink)]" : "text-[var(--ink-muted)]"} />
                  <span>{item.label}</span>
                </button>
              );
            })}
          </>
        )}
      </nav>
      
      {/* Footer (User & Settings) */}
      <div className="shrink-0 p-4 space-y-2 border-t border-[var(--hairline)]">
        {activePage !== 'settings' && (
          <button
            onClick={() => handleNavigate('settings')}
            className="flex w-full items-center gap-3 px-3 py-2 text-[14px] outline-none rounded-sm text-[var(--ink-muted)] hover:bg-[var(--canvas-soft-2)] hover:text-[var(--ink)]"
          >
            <Settings size={16} />
            <span>{t('sidebar.settings')}</span>
          </button>
        )}
        
        <div className="flex items-center gap-3 px-3 py-2 mt-2 rounded-sm bg-[var(--surface-card)] border border-[var(--hairline)] shadow-sm">
          {profile?.avatar_url ? (
            profile.avatar_url.startsWith('linear-gradient') ? (
              <div 
                style={{ background: profile.avatar_url }} 
                className="h-7 w-7 rounded-full border border-[var(--hairline)] shrink-0" 
              />
            ) : (
              <img 
                src={profile.avatar_url} 
                alt={userName} 
                className="h-7 w-7 rounded-full object-cover border border-[var(--hairline)] shrink-0"
              />
            )
          ) : (
            <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-[var(--canvas-soft-2)] text-[var(--ink)] border border-[var(--hairline)] font-medium text-[10px]">
              {userName.slice(0, 2).toUpperCase()}
            </div>
          )}
          <div className="flex flex-col min-w-0 flex-1 overflow-hidden">
            <span className="truncate text-[12px] font-medium text-[var(--ink)]">{userName}</span>
            <span className="truncate text-[10px] text-[var(--ink-muted)]">{userEmail}</span>
          </div>
        </div>
        
        <a
          href="mailto:refractcode@gmail.com?subject=Feedback%20Refract"
          className="flex w-full items-center gap-3 px-3 py-2 text-[14px] font-medium text-[var(--ink-muted)] hover:text-[var(--primary)] hover:bg-[var(--primary)]/10 rounded-sm outline-none"
        >
          <Mail size={16} />
          <span>{t('sidebar.feedback')}</span>
        </a>

        <button
          onClick={signOut}
          className="flex w-full items-center gap-3 px-3 py-2 text-[14px] font-medium text-[var(--ink-muted)] hover:text-[var(--semantic-error)] hover:bg-[var(--semantic-error)]/10 rounded-sm outline-none"
        >
          <LogOut size={16} />
          <span>{t('sidebar.signOut')}</span>
        </button>
      </div>
    </div>
  );

  return (
    <>
      {/* Desktop sidebar — always visible ≥768px */}
      <aside className="hidden md:flex h-screen w-[240px] shrink-0 flex-col">
        {sidebarContent}
      </aside>

      {/* Mobile hamburger top bar */}
      <div className="md:hidden fixed top-0 left-0 right-0 z-40 flex items-center h-[56px] px-4 bg-[var(--canvas)] border-b border-[var(--hairline)]">
        <button
          onClick={() => setMobileOpen(true)}
          className="p-2 rounded-sm text-[var(--ink-muted)] hover:text-[var(--ink)] hover:bg-[var(--canvas-soft)]"
          aria-label="Open menu"
        >
          <Menu size={20} />
        </button>
        <div className="flex items-center gap-2 ml-3">
          <LogoMark size={18} className="text-[var(--ink)]" />
          <span className="font-normal text-[17px] tracking-tight text-[var(--ink)]">Refract</span>
        </div>
      </div>

      {/* Mobile sidebar drawer */}
      {mobileOpen && (
        <>
          {/* Backdrop */}
          <div
            className="md:hidden fixed inset-0 z-40 bg-black/40"
            onClick={() => setMobileOpen(false)}
          />
          {/* Drawer */}
          <aside
            className="md:hidden fixed top-0 left-0 h-full w-[280px] z-50 flex flex-col shadow-xl"
          >
            {sidebarContent}
          </aside>
        </>
      )}
    </>
  );
};
