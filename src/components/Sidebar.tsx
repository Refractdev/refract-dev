import React from 'react';
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
  CreditCard,
  ShieldAlert
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

  return (
    <div className="flex h-screen w-[240px] shrink-0 flex-col bg-[var(--canvas)] border-r border-[var(--hairline)] select-none">
      {/* Header */}
      <div className="flex h-[64px] shrink-0 items-center gap-3 px-6 border-b border-[var(--hairline)]">
        <LogoMark size={20} className="text-[var(--ink)]" />
        <span className="font-normal tracking-tight text-[var(--ink)]" style={{ fontSize: '18px', letterSpacing: '-0.18px', fontFamily: 'var(--font-sans)' }}>
          Refract
        </span>
      </div>
      
      {/* Main Navigation */}
      <nav className="flex-1 overflow-y-auto px-4 py-6 space-y-1">
        {activePage === 'settings' ? (
          <>
            <button
              onClick={() => onNavigate('home')}
              className="flex w-full items-center gap-3 px-3 py-2.5 text-[14px] font-medium text-[var(--ink-muted)] transition-all duration-200 hover:text-[var(--ink)] hover:bg-[var(--canvas-soft)] rounded-[8px] outline-none mb-4 border border-transparent hover:border-[var(--hairline)]"
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
                  onClick={() => onSettingsTabChange?.(item.id)}
                  className={cn(
                    "flex w-full items-center gap-3 px-3 py-2.5 text-[14px] transition-all duration-200 outline-none rounded-[8px]",
                    isActive 
                      ? "bg-[var(--canvas-soft)] text-[var(--ink)] font-medium border border-[var(--hairline)]" 
                      : "text-[var(--ink-muted)] hover:bg-[var(--canvas-soft)] hover:text-[var(--ink)] border border-transparent"
                  )}
                >
                  <Icon size={18} className={isActive ? "text-[var(--ink)]" : "text-[var(--ink-muted)]"} />
                  <span>{item.label}</span>
                </button>
              );
            })}
          </>
        ) : (
          <>
            <div className="section-label px-2 mb-4">
              {t('sidebar.workspace')}
            </div>
            
            {navItems.map((item) => {
              const Icon = item.icon;
              const isActive = activePage === item.id;
              
              return (
                <button
                  key={item.id}
                  onClick={() => onNavigate(item.id as Page)}
                  className={cn(
                    "flex w-full items-center gap-3 px-3 py-2.5 text-[14px] transition-all duration-200 outline-none rounded-[8px]",
                    isActive 
                      ? "bg-[var(--canvas-soft)] text-[var(--ink)] font-medium border border-[var(--hairline)]" 
                      : "text-[var(--ink-muted)] hover:bg-[var(--canvas-soft)] hover:text-[var(--ink)] border border-transparent"
                  )}
                >
                  <Icon size={18} className={isActive ? "text-[var(--ink)]" : "text-[var(--ink-muted)]"} />
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
            onClick={() => onNavigate('settings')}
            className="flex w-full items-center gap-3 px-3 py-2.5 text-[14px] transition-all duration-200 outline-none rounded-[8px] text-[var(--ink-muted)] hover:bg-[var(--canvas-soft)] hover:text-[var(--ink)]"
          >
            <Settings size={18} />
            <span>{t('sidebar.settings')}</span>
          </button>
        )}
        
        <div className="flex items-center gap-3 px-3 py-3 mt-2 rounded-[8px] bg-[var(--surface-card)] border border-[var(--hairline)]">
          {profile?.avatar_url ? (
            profile.avatar_url.startsWith('linear-gradient') ? (
              <div 
                style={{ background: profile.avatar_url }} 
                className="h-8 w-8 rounded-full border border-[var(--hairline)] shrink-0" 
              />
            ) : (
              <img 
                src={profile.avatar_url} 
                alt={userName} 
                className="h-8 w-8 rounded-full object-cover border border-[var(--hairline)] shrink-0"
              />
            )
          ) : (
            <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-[var(--canvas-soft)] text-[var(--ink)] border border-[var(--hairline)] font-medium text-[11px]">
              {userName.slice(0, 2).toUpperCase()}
            </div>
          )}
          <div className="flex flex-col min-w-0 flex-1 overflow-hidden">
            <span className="truncate text-[13px] font-medium text-[var(--ink)]">{userName}</span>
            <span className="truncate text-[11px] text-[var(--ink-muted)]">{userEmail}</span>
          </div>
        </div>
        
        <button
          onClick={signOut}
          className="flex w-full items-center gap-3 px-3 py-2.5 text-[14px] font-medium text-[var(--ink-muted)] transition-all duration-200 hover:text-[var(--semantic-error)] hover:bg-[var(--semantic-error)]/10 rounded-[8px] outline-none"
        >
          <LogOut size={16} />
          <span>{t('sidebar.signOut')}</span>
        </button>
      </div>
    </div>
  );
};
