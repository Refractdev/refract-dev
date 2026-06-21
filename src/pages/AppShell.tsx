import React, { useState } from 'react';
import { HomePage } from './HomePage';
import { ProjectsPage } from './ProjectsPage';
import { ReposPage } from './ReposPage';
import { SettingsPage } from './SettingsPage';
import { GuidelinesPage } from './GuidelinesPage';
import { ProjectView } from './projectView/ProjectView';
import { ProjectMonitor } from './ProjectMonitor';
import { PublicAuditPage } from './PublicAuditPage';
import { Sidebar } from '../components/Sidebar';
import { Topbar } from '../components/Topbar';
import { useAuth } from '../lib/AuthContext';
import { AuthPage } from './AuthPage';
import { SplashScreen } from '../components/SplashScreen';
import { OnboardingPage } from './OnboardingPage';
import { useTranslation } from '../hooks/useTranslation';

class ErrorBoundary extends React.Component<{ children?: React.ReactNode }, { hasError: boolean; error: string | null }> {
  constructor(props: any) {
    super(props);
    this.state = { hasError: false, error: null };
  }
  static getDerivedStateFromError(error: any) {
    return { hasError: true, error: (error && error.message) || String(error) };
  }
  componentDidCatch(error: any, info: any) {
    console.error('[ErrorBoundary] Caught:', error, info);
  }
  render() {
    if (this.state.hasError) {
      return (
        <div className="flex flex-col items-center justify-center min-h-[50vh] px-6 text-center bg-[var(--canvas-soft)]">
          <p className="text-[var(--semantic-error)] font-mono text-sm mb-2">Something went wrong</p>
          <p className="text-[var(--ink-muted)] text-sm mb-6 max-w-md">{this.state.error}</p>
          <button
            onClick={() => this.setState({ hasError: false, error: null })}
            className="btn btn-primary"
          >
            Try again
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}

export type Page = 'home' | 'projects' | 'repos' | 'guidelines' | 'settings' | 'projectView' | 'project-monitor';

function parseLocation(): { page: Page; projectId: string | null; monitorId: string | null; settingsTab: string } {
  const { pathname, search } = window.location;
  const params = new URLSearchParams(search);
  const tab = params.get('tab') ?? 'profile';
  const projectId = params.get('projectId');
  const monitorId = params.get('monitorId');

  let page: Page;
  switch (pathname) {
    case '/projects':        page = 'projects'; break;
    case '/repos':           page = 'repos'; break;
    case '/guidelines':      page = 'guidelines'; break;
    case '/settings':        page = 'settings'; break;
    case '/project-view':    page = 'projectView'; break;
    case '/project-monitor': page = 'project-monitor'; break;
    default:                 page = 'home'; break;
  }

  return { page, projectId, monitorId, settingsTab: tab };
}

function buildUrl(page: Page, extras: Record<string, string> = {}): string {
  const routeMap: Record<Page, string> = {
    home:              '/',
    projects:          '/projects',
    repos:             '/repos',
    guidelines:        '/guidelines',
    settings:          '/settings',
    projectView:       '/project-view',
    'project-monitor': '/project-monitor',
  };

  const base = routeMap[page] ?? '/';
  const params = new URLSearchParams(extras);
  const qs = params.toString();
  return qs ? `${base}?${qs}` : base;
}

function getPageTitle(page: Page, t: (key: string) => string): string {
  switch (page) {
    case 'home':            return t('sidebar.dashboard');
    case 'projects':        return t('sidebar.projects');
    case 'repos':           return t('sidebar.repos');
    case 'guidelines':      return t('sidebar.guidelines');
    case 'settings':        return t('settings.title');
    case 'projectView':     return t('sidebar.projects');
    case 'project-monitor': return t('sidebar.projects');
    default:                return 'Refract';
  }
}

function getPageSubtitle(page: Page): string | undefined {
  switch (page) {
    case 'projectView':     return 'Analysis';
    case 'project-monitor': return 'Monitor';
    default:                return undefined;
  }
}

export const AppShell: React.FC = () => {
  const { session, loading, profile, refreshProfile } = useAuth();
  const { t } = useTranslation();

  const init = parseLocation();
  const [activePage, setActivePage] = useState<Page>(init.page);
  const [activeSettingsTab, setActiveSettingsTab] = useState<string>(init.settingsTab);
  const [activeProjectId, setActiveProjectId] = useState<string | null>(init.projectId);
  const [monitorProjectId, setMonitorProjectId] = useState<string | null>(init.monitorId);
  const [monitorProjectData, setMonitorProjectData] = useState<any>(null);

  const [sidebarCollapsed, setSidebarCollapsed] = useState<boolean>(() => {
    try {
      return localStorage.getItem('sidebar-collapsed') === 'true';
    } catch {
      return false;
    }
  });

  const handleToggleCollapse = () => {
    setSidebarCollapsed((v) => {
      const next = !v;
      try { localStorage.setItem('sidebar-collapsed', String(next)); } catch {}
      return next;
    });
  };

  React.useEffect(() => {
    const syncPageFromLocation = () => {
      const parsed = parseLocation();
      setActivePage(parsed.page);
      setActiveSettingsTab(parsed.settingsTab);
      if (parsed.projectId) setActiveProjectId(parsed.projectId);
      if (parsed.monitorId) setMonitorProjectId(parsed.monitorId);
    };

    window.addEventListener('popstate', syncPageFromLocation);
    return () => window.removeEventListener('popstate', syncPageFromLocation);
  }, []);

  if (loading) return <SplashScreen />;

  // Public audit pages — accessible without authentication
  const auditSlug = window.location.pathname.startsWith('/audit/')
    ? window.location.pathname.replace('/audit/', '').split('/')[0]
    : null
  if (auditSlug) return <PublicAuditPage slug={auditSlug} />

  if (!session)  return <AuthPage />;
  if (!profile)  return <SplashScreen />;

  if (!profile.onboarding_completed) {
    return (
      <OnboardingPage
        onComplete={async () => {
          try {
            sessionStorage.removeItem('justSignedUp');
            await refreshProfile();
          } catch (err) {
            console.error('[AppShell] onboarding refreshProfile failed:', err);
          }
        }}
      />
    );
  }

  const handleNavigate = (page: Page | string, params?: any) => {
    const normalizedPage = page === 'project-view' ? 'projectView' : (page as Page);

    if (normalizedPage === 'guidelines') {
      setActivePage('guidelines');
      window.history.pushState({}, '', buildUrl('guidelines'));
      return;
    }

    const urlExtras: Record<string, string> = {};

    if (normalizedPage === 'projectView') {
      const id = params?.projectId ?? activeProjectId ?? '';
      setActiveProjectId(id);
      if (id) urlExtras.projectId = id;
    }

    if (normalizedPage === 'project-monitor') {
      const id = params?.projectId ?? monitorProjectId ?? '';
      setMonitorProjectId(id);
      if (params?.projectData) setMonitorProjectData(params.projectData);
      if (id) urlExtras.monitorId = id;
    }

    if (normalizedPage === 'settings') {
      const targetTab = params?.tab ?? 'profile';
      setActiveSettingsTab(targetTab);
      urlExtras.tab = targetTab;
    }

    setActivePage(normalizedPage);
    window.history.pushState({}, '', buildUrl(normalizedPage, urlExtras));
  };

  const handleSettingsTabChange = (tab: string) => {
    setActiveSettingsTab(tab);
    window.history.pushState({}, '', buildUrl('settings', { tab }));
  };

  const renderPage = () => {
    switch (activePage) {
      case 'home':
        return <HomePage onNavigate={handleNavigate} />;

      case 'projects':
        return (
          <ProjectsPage
            onOpenProject={(id) => handleNavigate('projectView', { projectId: id })}
            onOpenMonitor={(id, data) => handleNavigate('project-monitor', { projectId: id, projectData: data })}
            onNavigate={handleNavigate}
          />
        );

      case 'repos':
        return <ReposPage onNavigate={handleNavigate} />;

      case 'guidelines':
        return <GuidelinesPage />;

      case 'settings':
        return <SettingsPage activeTab={activeSettingsTab} onTabChange={handleSettingsTabChange} />;

      case 'projectView':
        return (
          <ProjectView
            projectId={activeProjectId}
            onBack={() => handleNavigate('projects')}
          />
        );

      case 'project-monitor':
        return (
          <ProjectMonitor
            projectId={monitorProjectId ?? ''}
            initialProjectData={monitorProjectData}
            onBack={() => handleNavigate('projects')}
            onOpenProject={(id) => handleNavigate('projectView', { projectId: id })}
          />
        );

      default:
        return <HomePage onNavigate={handleNavigate} />;
    }
  };

  const showSidebar = activePage !== 'projectView' && activePage !== 'project-monitor';
  const showTopbar = showSidebar;
  const pageTitle = getPageTitle(activePage, t);
  const pageSubtitle = getPageSubtitle(activePage);

  return (
    <div style={{ display: 'flex', height: '100vh', width: '100vw', overflow: 'hidden', background: 'var(--canvas)' }}>
      {showSidebar && (
        <Sidebar
          activePage={activePage}
          onNavigate={(p) => handleNavigate(p)}
          activeSettingsTab={activeSettingsTab}
          onSettingsTabChange={handleSettingsTabChange}
          collapsed={sidebarCollapsed}
          onToggleCollapse={handleToggleCollapse}
        />
      )}

      {/* Main area: topbar + page content */}
      <div
        className={showSidebar ? 'md:pt-0 pt-[48px]' : ''}
        style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden', minWidth: 0 }}
      >
        {showTopbar && (
          <Topbar
            pageTitle={pageTitle}
            pageSubtitle={pageSubtitle}
            onNavigate={(page, params) => handleNavigate(page as Page, params)}
          />
        )}
        <main style={{ flex: 1, overflow: 'hidden' }}>
          <ErrorBoundary>
            {renderPage()}
          </ErrorBoundary>
        </main>
      </div>
    </div>
  );
};
