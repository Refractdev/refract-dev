import { AlertCircle, ArrowLeft, GitBranch, Github, Link, Loader2 } from 'lucide-react';
import { Modal, ModalHeader } from './Modal';
import type React from 'react';
import { useState, useEffect } from 'react';
import { useFiles } from '../context/FilesContext';
import { useAuth } from '../lib/AuthContext';
import { trackEvent } from '../lib/analytics';
import { RateLimitError, cloneGitHubRepo } from '../lib/api';
import { createProject } from '../lib/db';
import { canonicalizeEntries } from '../engine/path';
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
  const { session, profile, connectGitHub } = useAuth();
  const { setFileMap, setProjectId } = useFiles();

  const [step, setStep] = useState<'method' | 'git-url'>('method');
  const [error, setError] = useState<string | null>(null);
  const [importing, setImporting] = useState(false);
  const [gitUrl, setGitUrl] = useState('');
  const [gitBranch, setGitBranch] = useState('');

  const hasGitHubConnection = Boolean(
    profile?.github_token ||
    session?.provider_token
  );

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
      const { map: fileMap, collisions } = canonicalizeEntries(Object.entries(cloneResult.files));
      if (collisions.length > 0) {
        console.warn('[NewProjectModal] Collapsed duplicate canonical paths from clone:', collisions);
      }

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



  return (
    <Modal open onClose={onClose} maxWidth={560} className="p-8">
      <ModalHeader
        title="Import Project"
        subtitle="Choose a method to import your project repository and start analysis."
        onClose={onClose}
      />

      {error && (
        <div className="flex items-start gap-2.5 px-4 py-3 rounded-lg mb-5 bg-[var(--semantic-error)]/8 border border-[var(--semantic-error)]/20 text-[var(--semantic-error)]">
          <AlertCircle size={16} className="shrink-0 mt-0.5" />
          <span className="text-sm leading-relaxed">{error}</span>
        </div>
      )}

      {step === 'method' && (
        <div className="grid grid-cols-2 gap-4">
          <button
            type="button"
            className="card flex flex-col items-center justify-center p-6 text-center cursor-pointer border border-[var(--hairline)] gap-3 hover:border-[var(--ink)] hover:-translate-y-0.5 transition-all duration-200"
            onClick={async () => {
              if (hasGitHubConnection) {
                onNavigate?.('repos');
                onClose();
                return;
              }
              const { error: connectError } = await connectGitHub('/repos');
              if (connectError) {
                setError(connectError.message);
                return;
              }
              onClose();
            }}
          >
            <div className="w-12 h-12 rounded-lg bg-[var(--canvas-soft)] grid place-items-center text-[var(--ink)]">
              <Github size={24} />
            </div>
            <div className="text-left">
              <p className="text-[15px] font-semibold text-[var(--ink)] mb-1">
                {hasGitHubConnection ? 'Browse GitHub Repos' : 'Connect to GitHub'}
              </p>
              <p className="text-[13px] text-[var(--ink-muted)] leading-[1.4]">
                {hasGitHubConnection
                  ? 'Open your connected repositories and pick a branch to import'
                  : 'Connect your GitHub account to browse and import any repo'}
              </p>
            </div>
          </button>

          <button
            type="button"
            className="card flex flex-col items-center justify-center p-6 text-center cursor-pointer border border-[var(--hairline)] gap-3 hover:border-[var(--ink)] hover:-translate-y-0.5 transition-all duration-200"
            onClick={() => { setError(null); setStep('git-url'); }}
          >
            <div className="w-12 h-12 rounded-lg bg-[var(--canvas-soft)] grid place-items-center text-[var(--ink)]">
              <Link size={24} />
            </div>
            <div className="text-left">
              <p className="text-[15px] font-semibold text-[var(--ink)] mb-1">Git URL</p>
              <p className="text-[13px] text-[var(--ink-muted)] leading-[1.4]">
                Paste a public Git URL, or a private GitHub URL after connecting
              </p>
            </div>
          </button>
        </div>
      )}

      {step === 'git-url' && (
        <div>
          <button
            type="button"
            onClick={() => { setError(null); setStep('method'); }}
            className="btn btn-ghost btn-sm gap-1.5 mb-4"
            disabled={importing}
          >
            <ArrowLeft size={14} />
            Back
          </button>

          <div className="flex flex-col gap-4 mb-5">
            <div>
              <label className="block text-sm text-[var(--ink)] mb-2">Repository URL</label>
              <input
                className="input w-full"
                type="text"
                placeholder="https://github.com/user/repo"
                value={gitUrl}
                onChange={(e) => setGitUrl(e.target.value)}
                disabled={importing}
              />
            </div>

            <div>
              <label className="block text-sm text-[var(--ink)] mb-2">Branch <span className="text-[var(--ink-muted)]">(optional)</span></label>
              <input
                className="input w-full"
                type="text"
                placeholder="Leave blank to auto-detect"
                value={gitBranch}
                onChange={(e) => setGitBranch(e.target.value)}
                disabled={importing}
              />
            </div>
          </div>

          <div className="flex items-center justify-between gap-3">
            <p className="text-sm text-[var(--ink-muted)] leading-relaxed">
              {importing
                ? 'Importing repository into the analysis flow…'
                : 'Refract will clone the repo into memory and save it as a project.'}
            </p>
            <button
              type="button"
              onClick={handleImportFromUrl}
              className="btn btn-primary flex items-center gap-2"
              disabled={importing || !gitUrl.trim()}
              style={{ minWidth: 148, justifyContent: 'center' }}
            >
              {importing ? <Loader2 size={16} className="spin" /> : <GitBranch size={16} />}
              {importing ? 'Importing…' : 'Import & Analyse'}
            </button>
          </div>
        </div>
      )}
    </Modal>
  );
};
