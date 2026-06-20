import React, { useState, useRef, useEffect } from 'react';
import { Sun, Moon, Settings2, LogOut, User, ChevronDown } from 'lucide-react';
import { useAuth } from '../lib/AuthContext';
import { useTheme } from '../lib/ThemeContext';
import { useTranslation } from '../hooks/useTranslation';
import { cn } from '../lib/utils';

interface TopbarProps {
  pageTitle: string;
  pageSubtitle?: string;
  onNavigate?: (page: string, params?: Record<string, string>) => void;
}

export const Topbar: React.FC<TopbarProps> = ({ pageTitle, pageSubtitle, onNavigate }) => {
  const { profile, session, signOut } = useAuth();
  const { theme, setTheme } = useTheme();
  const { t } = useTranslation();
  const [avatarMenuOpen, setAvatarMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  const userEmail = session?.user?.email ?? '';
  const userName = profile?.name ?? userEmail.split('@')[0] ?? 'User';

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setAvatarMenuOpen(false);
      }
    };
    if (avatarMenuOpen) {
      document.addEventListener('mousedown', handleClickOutside);
    }
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [avatarMenuOpen]);

  const avatarContent = profile?.avatar_url ? (
    profile.avatar_url.startsWith('linear-gradient') ? (
      <div
        style={{ background: profile.avatar_url, width: 24, height: 24 }}
        className="rounded-full border border-[var(--hairline)] shrink-0"
      />
    ) : (
      <img
        src={profile.avatar_url}
        alt={userName}
        className="rounded-full border border-[var(--hairline)] object-cover shrink-0"
        style={{ width: 24, height: 24 }}
      />
    )
  ) : (
    <div
      className="flex items-center justify-center rounded-full bg-[var(--canvas-soft-2)] text-[var(--ink)] border border-[var(--hairline)] font-medium shrink-0"
      style={{ width: 24, height: 24, fontSize: 9 }}
    >
      {userName.slice(0, 2).toUpperCase()}
    </div>
  );

  return (
    <header className="sticky top-0 z-30 flex h-[48px] shrink-0 items-center gap-4 border-b border-[var(--hairline)] bg-[var(--canvas)] px-4">
      <div className="flex items-baseline gap-2 min-w-0">
        <h1 className="text-[14px] font-medium text-[var(--ink)] leading-none truncate">
          {pageTitle}
        </h1>
        {pageSubtitle && (
          <>
            <span className="text-[var(--hairline-strong)] text-[12px]">/</span>
            <span className="text-[13px] text-[var(--ink-muted)] truncate">{pageSubtitle}</span>
          </>
        )}
      </div>

      <div className="flex-1" />

      <div className="flex items-center gap-1">
        <button
          onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}
          className="flex h-7 w-7 items-center justify-center rounded-[var(--radius)] text-[var(--ink-muted)] hover:bg-[var(--canvas-soft-2)] hover:text-[var(--ink)] transition-colors"
          aria-label="Toggle theme"
        >
          {theme === 'dark' ? <Sun size={14} /> : <Moon size={14} />}
        </button>

        <div className="relative" ref={menuRef}>
          <button
            onClick={() => setAvatarMenuOpen((v) => !v)}
            className={cn(
              'flex items-center gap-1.5 h-7 rounded-[var(--radius)] px-1.5 text-[var(--ink-muted)] hover:bg-[var(--canvas-soft-2)] hover:text-[var(--ink)] transition-colors',
              avatarMenuOpen && 'bg-[var(--canvas-soft-2)] text-[var(--ink)]'
            )}
            aria-label="User menu"
          >
            {avatarContent}
            <ChevronDown
              size={12}
              className={cn('transition-transform duration-150', avatarMenuOpen && 'rotate-180')}
            />
          </button>

          {avatarMenuOpen && (
            <div className="absolute right-0 top-[calc(100%+6px)] w-[200px] rounded-[8px] border border-[var(--hairline)] bg-[var(--surface-strong)] shadow-[var(--shadow-dropdown)] py-1 z-50">
              <div className="px-3 py-2 border-b border-[var(--hairline)] mb-1">
                <p className="text-[12px] font-medium text-[var(--ink)] truncate">{userName}</p>
                <p className="text-[11px] text-[var(--ink-muted-soft)] truncate">{userEmail}</p>
              </div>

              <button
                onClick={() => {
                  setAvatarMenuOpen(false);
                  onNavigate?.('settings', { tab: 'profile' });
                }}
                className="flex w-full items-center gap-2.5 px-3 py-1.5 text-[13px] text-[var(--ink-muted)] hover:bg-[var(--canvas-soft-2)] hover:text-[var(--ink)] transition-colors"
              >
                <User size={13} />
                <span>{t('settings.tabs.profile')}</span>
              </button>

              <button
                onClick={() => {
                  setAvatarMenuOpen(false);
                  onNavigate?.('settings', { tab: 'preferences' });
                }}
                className="flex w-full items-center gap-2.5 px-3 py-1.5 text-[13px] text-[var(--ink-muted)] hover:bg-[var(--canvas-soft-2)] hover:text-[var(--ink)] transition-colors"
              >
                <Settings2 size={13} />
                <span>{t('sidebar.settings')}</span>
              </button>

              <div className="h-px bg-[var(--hairline)] my-1" />

              <button
                onClick={() => { setAvatarMenuOpen(false); signOut(); }}
                className="flex w-full items-center gap-2.5 px-3 py-1.5 text-[13px] text-[var(--ink-muted)] hover:bg-[color-mix(in_srgb,var(--semantic-error)_8%,transparent)] hover:text-[var(--semantic-error)] transition-colors"
              >
                <LogOut size={13} />
                <span>{t('sidebar.signOut')}</span>
              </button>
            </div>
          )}
        </div>
      </div>
    </header>
  );
};
