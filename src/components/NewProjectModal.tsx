import { AlertCircle, ArrowLeft, FolderOpen, GitBranch, Github, Link, Loader2, X } from 'lucide-react';
import type React from 'react';
import { useState, useEffect } from 'react';
import { useFiles } from '../context/FilesContext';
import { useAuth } from '../lib/AuthContext';
import { trackEvent } from '../lib/analytics';
import { RateLimitError, cloneGitHubRepo } from '../lib/api';
import { createProject } from '../lib/db';
import type { Project } from '../shared/types';

interface Props {
  onClose: () => void;
  onProjectCreated: (project: Project) => void;
  onNavigate?: (page: string, params?: any) => void;
}

function getInlineError(error: unknown, fallback: string): string {
  if (error instanceof RateLimitError) {
    return `GitHub rate limit reached. ${error.message}`;
  }

  if (error instanceof Error) {
    return error.message;
  }

  return fallback;
}

function getRepoNameFromUrl(url: string): string {
  try {
    const trimmed = url.trim().replace(/\/$/, '');
    const parts = trimmed.split('/');
    let last = parts[parts.length - 1] || 'project';
    if (last.endsWith('.git')) {
      last = last.substring(0, last.length - 4);
    }
    return last;
  } catch {
    return 'project';
  }
}

export const NewProjectModal: React.FC<Props> = ({ onClose, onProjectCreated, onNavigate }) => {
  const { profile, installGitHubApp } = useAuth();
  const { setFileMap, setProjectId } = useFiles();

  const [step, setStep] = useState<'method' | 'git-url'>('method');
  const [error, setError] = useState<string | null>(null);
  const [importing, setImporting] = useState(false);
  const [importingLocal, setImportingLocal] = useState(false);
  const [gitUrl, setGitUrl] = useState('');
  const [gitBranch, setGitBranch] = useState('');

  const hasGitHubApp = Boolean(profile?.github_installation_id);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [onClose]);

  const handleImportFromUrl = async () => {
    if (!gitUrl.trim()) {
      setError('Please enter a Git URL.');
      return;
    }

    if (!profile?.id) {
      setError('You must be logged in to import a project.');
      return;
    }

    setImporting(true);
    setError(null);

    try {
      const url = gitUrl.trim();
      const branch = gitBranch.trim() || undefined;
      const repoName = getRepoNameFromUrl(url);

      const cloneResult = await cloneGitHubRepo(url, branch);
      const fileMap = new Map(Object.entries(cloneResult.files));

      let project: Project;

      try {
        project = await createProject(
          {
            name: repoName,
            path: 'uploaded',
            repo: url,
            branch: cloneResult.branch,
            status: 'Not analysed',
            last_run: null,
          },
          profile.id
        );
      } catch (persistError) {
        console.warn(
          'Failed to persist cloned project in Supabase, using local fallback.',
          persistError
        );
        project = {
          id: `local-${Date.now()}`,
          name: repoName,
          path: 'uploaded',
          repo: url,
          branch: cloneResult.branch,
          status: 'Not analysed',
          last_run: null,
        };
      }

      setProjectId(project.id);
      setFileMap(fileMap);
      void trackEvent('project_connected', {
        project_id: project.id,
        repo_url: url,
        branch: cloneResult.branch,
        source: 'new_project_modal',
      })
      onProjectCreated(project);
    } catch (err) {
      setError(getInlineError(err, 'Failed to import repository.'));
    } finally {
      setImporting(false);
    }
  };

  const handleImportLocalSmokeTest = async () => {
    if (!profile?.id) {
      setError('You must be logged in to import a project.');
      return;
    }

    setImportingLocal(true);
    setError(null);

    try {
      const response = await fetch('/api/local/load-project')
      if (!response.ok) {
        const payload = await response.json().catch(() => ({}))
        throw new Error(payload.error || 'Failed to load local smoke test project.')
      }

      const payload = await response.json() as {
        path: string
        name: string
        files: Record<string, string>
      }

      const fileMap = new Map(Object.entries(payload.files))
      const projectName = payload.name || 'refract-test-project'

      let project: Project
      try {
        project = await createProject(
          {
            name: projectName,
            path: payload.path,
            repo: null,
            branch: 'main',
            status: 'Not analysed',
            last_run: null,
          },
          profile.id
        )
      } catch (persistError) {
        console.warn('Failed to persist local smoke test project in Supabase, using local fallback.', persistError)
        project = {
          id: `local-${Date.now()}`,
          name: projectName,
          path: payload.path,
          repo: null,
          branch: 'main',
          status: 'Not analysed',
          last_run: null,
        }
      }

      setProjectId(project.id)
      setFileMap(fileMap)
      void trackEvent('project_connected', {
        project_id: project.id,
        source: 'local_smoke_test',
        project_path: payload.path,
      })

      onProjectCreated(project)
    } catch (err) {
      setError(getInlineError(err, 'Failed to load local smoke test project.'))
    } finally {
      setImportingLocal(false)
    }
  }

  const isBusy = importing;

  return (
    <>
      <style>{`
        @keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
        .spin { animation: spin 1s cubic-bezier(0.4, 0, 0.2, 1) infinite; }
        @keyframes pulse { 0% { opacity: 0.3 } 50% { opacity: 0.6 } 100% { opacity: 0.3 } }
        .skeleton { background: var(--surface-strong); border-radius: 8px; animation: pulse 1.5s infinite ease-in-out; }
        @keyframes fadeUp { from { opacity: 0; transform: translateY(12px) } to { opacity: 1; transform: translateY(0) } }
        @keyframes modalIn { from { opacity: 0; transform: scale(0.96) translateY(8px) } to { opacity: 1; transform: scale(1) translateY(0) } }
      `}</style>

      <div
        onClick={onClose}
        style={{
          position: 'fixed',
          inset: 0,
          zIndex: 1000,
          background: 'rgba(0,0,0,0.85)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          backdropFilter: 'blur(4px)',
          padding: 24,
        }}
      >
        <div
          onClick={(event) => event.stopPropagation()}
          className="card"
          style={{
            background: 'var(--canvas)',
            width: '100%',
            maxWidth: 560,
            padding: 32,
            position: 'relative',
            animation: 'modalIn 0.35s cubic-bezier(0.16, 1, 0.3, 1) both',
          }}
        >
          <div
            role="button"
            tabIndex={0}
            onClick={(e) => {
              e.stopPropagation();
              onClose();
            }}
            style={{
              position: 'absolute',
              top: 20,
              right: 20,
              width: 32,
              height: 32,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              cursor: 'pointer',
              color: 'var(--ink-muted)',
              borderRadius: '8px',
              transition: 'background-color 0.15s, color 0.15s',
              zIndex: 50,
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.backgroundColor = 'var(--canvas-soft)';
              e.currentTarget.style.color = 'var(--ink)';
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.backgroundColor = 'transparent';
              e.currentTarget.style.color = 'var(--ink-muted)';
            }}
            onKeyDown={(e) => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.stopPropagation();
                onClose();
              }
            }}
          >
            <X size={16} />
          </div>

          <div style={{ marginBottom: 24, paddingRight: 36 }}>
            <h2
              className="page-title"
              style={{
                fontSize: '22px',
                fontWeight: 400,
                letterSpacing: '-0.11px',
                marginBottom: 8,
              }}
            >
              Import Project
            </h2>
            <p style={{ fontSize: 14, color: 'var(--ink-muted)', lineHeight: 1.5 }}>
              Choose a method to import your project repository and start analysis.
            </p>
          </div>

          {error && (
            <div
              style={{
                display: 'flex',
                alignItems: 'flex-start',
                gap: 10,
                padding: '12px 16px',
                borderRadius: '8px',
                marginBottom: 20,
                background: 'rgba(207, 45, 86, 0.08)',
                border: '1px solid rgba(207, 45, 86, 0.18)',
                color: 'var(--semantic-error)',
              }}
            >
              <AlertCircle size={16} style={{ flexShrink: 0, marginTop: 1 }} />
              <span style={{ fontSize: 14, lineHeight: 1.5 }}>{error}</span>
            </div>
          )}

          {step === 'method' && (
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 16 }}>
              <div
                role="button"
                tabIndex={0}
                onClick={() => {
                  if (hasGitHubApp) {
                    onNavigate?.('repos');
                  } else {
                    installGitHubApp();
                  }
                  onClose();
                }}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    if (hasGitHubApp) {
                      onNavigate?.('repos');
                    } else {
                      installGitHubApp();
                    }
                    onClose();
                  }
                }}
                className="card"
                style={{
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'center',
                  justifyContent: 'center',
                  padding: 24,
                  textAlign: 'center',
                  cursor: 'pointer',
                  background: 'var(--surface-card)',
                  border: '1px solid var(--hairline)',
                  borderRadius: '12px',
                  gap: 12,
                  transition: 'transform 0.2s, border-color 0.2s',
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.borderColor = 'var(--ink)';
                  e.currentTarget.style.transform = 'translateY(-2px)';
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.borderColor = 'var(--hairline)';
                  e.currentTarget.style.transform = 'translateY(0)';
                }}
              >
                <div
                  style={{
                    width: 48,
                    height: 48,
                    borderRadius: '8px',
                    background: 'var(--canvas-soft)',
                    display: 'grid',
                    placeItems: 'center',
                    color: 'var(--ink)',
                  }}
                >
                  <Github size={24} />
                </div>
                <div>
                  <p
                    style={{ fontSize: 16, fontWeight: 600, color: 'var(--ink)', marginBottom: 4 }}
                  >
                    {hasGitHubApp ? 'Browse GitHub Repos' : 'GitHub App'}
                  </p>
                  <p style={{ fontSize: 13, color: 'var(--ink-muted)', lineHeight: 1.4 }}>
                    {hasGitHubApp
                      ? 'Open your connected repositories and pick a branch to import'
                      : 'Install the GitHub App to browse private repos and choose branches'}
                  </p>
                </div>
              </div>

              <div
                role="button"
                tabIndex={0}
                onClick={() => {
                  setError(null);
                  setStep('git-url');
                }}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    setError(null);
                    setStep('git-url');
                  }
                }}
                className="card"
                style={{
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'center',
                  justifyContent: 'center',
                  padding: 24,
                  textAlign: 'center',
                  cursor: 'pointer',
                  background: 'var(--surface-card)',
                  border: '1px solid var(--hairline)',
                  borderRadius: '12px',
                  gap: 12,
                  transition: 'transform 0.2s, border-color 0.2s',
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.borderColor = 'var(--ink)';
                  e.currentTarget.style.transform = 'translateY(-2px)';
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.borderColor = 'var(--hairline)';
                  e.currentTarget.style.transform = 'translateY(0)';
                }}
              >
                <div
                  style={{
                    width: 48,
                    height: 48,
                    borderRadius: '8px',
                    background: 'var(--canvas-soft)',
                    display: 'grid',
                    placeItems: 'center',
                    color: 'var(--ink)',
                  }}
                >
                  <Link size={24} />
                </div>
                <div>
                  <p
                    style={{ fontSize: 16, fontWeight: 600, color: 'var(--ink)', marginBottom: 4 }}
                  >
                    Git URL
                  </p>
                  <p style={{ fontSize: 13, color: 'var(--ink-muted)', lineHeight: 1.4 }}>
                    Paste a public Git URL, or a private GitHub URL after connecting the app
                  </p>
                </div>
              </div>

              <div
                role="button"
                tabIndex={0}
                onClick={handleImportLocalSmokeTest}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    handleImportLocalSmokeTest();
                  }
                }}
                className="card"
                style={{
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'center',
                  justifyContent: 'center',
                  padding: 24,
                  textAlign: 'center',
                  cursor: 'pointer',
                  background: 'var(--surface-card)',
                  border: '1px solid var(--hairline)',
                  borderRadius: '12px',
                  gap: 12,
                  transition: 'transform 0.2s, border-color 0.2s',
                  opacity: importing || importingLocal ? 0.7 : 1,
                  pointerEvents: importing || importingLocal ? 'none' : 'auto',
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.borderColor = 'var(--ink)';
                  e.currentTarget.style.transform = 'translateY(-2px)';
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.borderColor = 'var(--hairline)';
                  e.currentTarget.style.transform = 'translateY(0)';
                }}
              >
                <div
                  style={{
                    width: 48,
                    height: 48,
                    borderRadius: '8px',
                    background: 'var(--canvas-soft)',
                    display: 'grid',
                    placeItems: 'center',
                    color: 'var(--ink)',
                  }}
                >
                  {importingLocal ? <Loader2 size={24} className="spin" /> : <FolderOpen size={24} />}
                </div>
                <div>
                  <p
                    style={{ fontSize: 16, fontWeight: 600, color: 'var(--ink)', marginBottom: 4 }}
                  >
                    Local smoke test
                  </p>
                  <p style={{ fontSize: 13, color: 'var(--ink-muted)', lineHeight: 1.4 }}>
                    Load /tmp/refract-test-project and run the analyzer without GitHub
                  </p>
                </div>
              </div>
            </div>
          )}

          {step === 'git-url' && (
            <div>
              <button
                type="button"
                onClick={() => {
                  setError(null);
                  setStep('method');
                }}
                className="btn btn-ghost btn-sm"
                disabled={importing}
                style={{ gap: 6, marginBottom: 16 }}
              >
                <ArrowLeft size={14} />
                Back
              </button>

              <div style={{ display: 'flex', flexDirection: 'column', gap: 16, marginBottom: 20 }}>
                <div>
                  <label
                    style={{ display: 'block', fontSize: 14, color: 'var(--ink)', marginBottom: 8 }}
                  >
                    Repository URL
                  </label>
                  <input
                    className="input"
                    type="text"
                    placeholder="https://github.com/user/repo"
                    value={gitUrl}
                    onChange={(e) => setGitUrl(e.target.value)}
                    style={{ width: '100%', height: 44 }}
                    disabled={importing}
                  />
                </div>

                <div>
                  <label
                    style={{ display: 'block', fontSize: 14, color: 'var(--ink)', marginBottom: 8 }}
                  >
                    Branch (optional)
                  </label>
                  <input
                    className="input"
                    type="text"
                    placeholder="Leave blank to auto-detect"
                    value={gitBranch}
                    onChange={(e) => setGitBranch(e.target.value)}
                    style={{ width: '100%', height: 44 }}
                    disabled={importing}
                  />
                </div>
              </div>

              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  gap: 12,
                }}
              >
                <p style={{ fontSize: 14, color: 'var(--ink-muted)', lineHeight: 1.5 }}>
                  {importing
                    ? 'Importing repository into the analysis flow...'
                    : 'Refract will clone the repository into memory, auto-detect the default branch when needed, and save it as a project.'}
                </p>
                <button
                  type="button"
                  onClick={handleImportFromUrl}
                  className="btn btn-primary"
                  disabled={importing || !gitUrl.trim()}
                  style={{ gap: 8, minWidth: 148, justifyContent: 'center' }}
                >
                  {importing ? <Loader2 size={16} className="spin" /> : <GitBranch size={16} />}
                  {importing ? 'Importing...' : 'Import & Analyse'}
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </>
  );
};
