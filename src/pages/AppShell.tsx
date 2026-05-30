import React, { useState } from 'react';
import { HomePage } from './HomePage';
import { ProjectsPage } from './ProjectsPage';
import { ReposPage } from './ReposPage';
import { SettingsPage } from './SettingsPage';
import { ProjectView } from './projectView/ProjectView';
import { Sidebar } from '../components/Sidebar';
import { useAuth } from '../lib/AuthContext';
import { AuthPage } from './AuthPage';
import { SplashScreen } from '../components/SplashScreen';
import { OnboardingPage } from './OnboardingPage';

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
        <div style={{ padding: 40, color: 'var(--ink)', background: 'var(--canvas)', minHeight: '100vh' }}>
          <p style={{ color: 'var(--semantic-error)', fontFamily: 'var(--font-mono)', fontSize: 14 }}>
            {this.state.error}
          </p>
          <button
            onClick={() => this.setState({ hasError: false, error: null })}
            className="btn btn-primary"
            style={{ marginTop: 16 }}
          >
            Tentar novamente
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}

export type Page = 'home' | 'projects' | 'repos' | 'guidelines' | 'settings' | 'projectView';

function routeToPage(pathname: string): Page {
  switch (pathname) {
    case '/projects':
      return 'projects';
    case '/repos':
      return 'repos';
    case '/guidelines':
      return 'settings'; // guidelines redirects to settings
    case '/settings':
      return 'settings';
    case '/project-view':
      return 'projectView';
    default:
      return 'home';
  }
}

function pageToRoute(page: Page): string {
  switch (page) {
    case 'projects':
      return '/projects';
    case 'repos':
      return '/repos';
    case 'guidelines':
      return '/settings?tab=guidelines'; // redirect to settings guidelines
    case 'settings':
      return '/settings';
    case 'projectView':
      return '/project-view';
    default:
      return '/';
  }
}

export const AppShell: React.FC = () => {
  const { session, loading, profile, refreshProfile } = useAuth();
  const [activePage, setActivePage] = useState<Page>(() => routeToPage(window.location.pathname));
  const [activeSettingsTab, setActiveSettingsTab] = useState<string>(() => {
    const params = new URLSearchParams(window.location.search);
    const tab = params.get('tab');
    if (tab) return tab;
    if (window.location.pathname === '/guidelines') return 'guidelines';
    return 'profile';
  });
  const [activeProjectId, setActiveProjectId] = useState<string | null>(null);

  React.useEffect(() => {
    const syncPageFromLocation = () => {
      const page = routeToPage(window.location.pathname);
      setActivePage(page);
      
      const params = new URLSearchParams(window.location.search);
      const tab = params.get('tab');
      if (tab) {
        setActiveSettingsTab(tab);
      } else if (window.location.pathname === '/guidelines') {
        setActiveSettingsTab('guidelines');
      } else {
        setActiveSettingsTab('profile');
      }
    };

    window.addEventListener('popstate', syncPageFromLocation);
    return () => window.removeEventListener('popstate', syncPageFromLocation);
  }, []);

  // Auth gate: show splash screen while loading auth state
  if (loading) {
    return <SplashScreen />;
  }

  // Auth gate: show login page if not authenticated
  if (!session) {
    return <AuthPage />;
  }

  // Wait for profile to load after session is established
  if (session && !profile) {
    return <SplashScreen />;
  }

  // Onboarding gate: show onboarding if user hasn't completed it
  if (profile && !profile.onboarding_completed) {
    return (
      <OnboardingPage
        onComplete={async () => {
          try {
            sessionStorage.removeItem('justSignedUp')
            await refreshProfile()
          } catch (err) {
            console.error('onboarding onComplete refreshProfile failed', err)
          }
        }}
      />
    )
  }

  // User is authenticated and onboarding is complete, show app

  const handleNavigate = (page: Page | string, params?: any) => {
    if (params?.projectId) {
      setActiveProjectId(params.projectId);
    }
    const normalizedPage = page === 'project-view' ? 'projectView' : (page as Page);
    
    if (normalizedPage === 'guidelines') {
      setActivePage('settings');
      setActiveSettingsTab('guidelines');
      window.history.pushState({}, '', '/settings?tab=guidelines');
      return;
    }

    setActivePage(normalizedPage);

    if (normalizedPage === 'settings') {
      const targetTab = params?.tab || 'profile';
      setActiveSettingsTab(targetTab);
      window.history.pushState({}, '', `/settings?tab=${targetTab}`);
    } else {
      window.history.pushState({}, '', pageToRoute(normalizedPage));
    }
  };

  const handleSettingsTabChange = (tab: string) => {
    setActiveSettingsTab(tab);
    window.history.pushState({}, '', `/settings?tab=${tab}`);
  };

  const renderPage = () => {
    switch (activePage) {
      case 'home':        return <HomePage onNavigate={handleNavigate} />;
      case 'projects':    return <ProjectsPage onOpenProject={(id) => handleNavigate('projectView', { projectId: id })} onNavigate={handleNavigate} />;
      case 'repos':       return <ReposPage onNavigate={handleNavigate} />;
      case 'settings':    return <SettingsPage activeTab={activeSettingsTab} onTabChange={handleSettingsTabChange} />;
      case 'projectView': return <ProjectView projectId={activeProjectId} onBack={() => handleNavigate('home')} />;
      default:            return <HomePage onNavigate={handleNavigate} />;
    }
  };

  return (
    <div style={{ display: 'flex', height: '100vh', width: '100vw', overflow: 'hidden', background: 'var(--canvas)' }}>
      {activePage !== 'projectView' && (
        <Sidebar 
          activePage={activePage} 
          onNavigate={(p) => handleNavigate(p)} 
          activeSettingsTab={activeSettingsTab}
          onSettingsTabChange={handleSettingsTabChange}
        />
      )}
      <main style={{ flex: 1, overflow: 'hidden', height: '100vh' }}>
        <ErrorBoundary>
          {renderPage()}
        </ErrorBoundary>
      </main>
    </div>
  );
};
