import React, { useEffect, useMemo, useState } from 'react'
import {
  AlertCircle,
  Download,
  ExternalLink,
  Github,
  GitBranch,
  Globe,
  Loader2,
  Lock,
  Search,
  X,
} from 'lucide-react'
import { Modal, ModalHeader } from '../components/Modal'
import { createProject } from '../lib/db'
import {
  cloneGitHubRepo,
  getGitHubBranches,
  getGitHubRepos,
  RateLimitError,
  type GitHubBranch,
  type GitHubRepo,
} from '../lib/api'
import { useFiles } from '../context/FilesContext'
import { useAuth } from '../lib/AuthContext'
import { trackEvent } from '../lib/analytics'
import { supabase } from '../lib/supabase'
import type { Project } from '../shared/types'

const GitHubIcon: React.FC<{ size?: number }> = ({ size = 20 }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor">
    <path d="M12 0C5.37 0 0 5.37 0 12c0 5.31 3.435 9.795 8.205 11.385.6.105.825-.255.825-.57 0-.285-.015-1.23-.015-2.235-3.015.555-3.795-.735-4.035-1.41-.135-.345-.72-1.41-1.23-1.695-.42-.225-1.02-.78-.015-.795.945-.015 1.62.87 1.845 1.23 1.08 1.815 2.805 1.305 3.495.99.105-.78.42-1.305.765-1.605-2.67-.3-5.46-1.335-5.46-5.925 0-1.305.465-2.385 1.23-3.225-.12-.3-.54-1.53.12-3.18 0 0 1.005-.315 3.3 1.23.96-.27 1.98-.405 3-.405s2.04.135 3 .405c2.295-1.56 3.3-1.23 3.3-1.23.66 1.65.24 2.88.12 3.18.765.84 1.23 1.905 1.23 3.225 0 4.605-2.805 5.625-5.475 5.925.435.375.81 1.095.81 2.22 0 1.605-.015 2.895-.015 3.3 0 .315.225.69.825.57A12.02 12.02 0 0 0 24 12c0-6.63-5.37-12-12-12z" />
  </svg>
)

interface BranchModalState {
  repo: GitHubRepo
  branches: GitHubBranch[]
  selectedBranch: string
}

export const ReposPage: React.FC<{ onNavigate: (page: string, params?: any) => void }> = ({ onNavigate }) => {
  const { session, profile, connectGitHub } = useAuth()
  const { setFileMap, setProjectId } = useFiles()
  const [repos, setRepos] = useState<GitHubRepo[]>([])
  const [loading, setLoading] = useState(false)
  const [search, setSearch] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [loadingBranchesFor, setLoadingBranchesFor] = useState<number | null>(null)
  const [cloningRepoId, setCloningRepoId] = useState<number | null>(null)
  const [branchModal, setBranchModal] = useState<BranchModalState | null>(null)

  const hasGitHubConnection = Boolean(
    profile?.github_token ||
    session?.provider_token
  )

  useEffect(() => {
    if (!hasGitHubConnection) {
      setRepos([])
      setLoading(false)
      return
    }

    let cancelled = false

    const loadRepos = async () => {
      setLoading(true)
      setError(null)

      const attemptLoad = async () => {
        const maxAttempts = session?.provider_token && !profile?.github_token ? 4 : 1

        for (let attempt = 0; attempt < maxAttempts; attempt++) {
          if (attempt > 0) {
            await new Promise((resolve) => setTimeout(resolve, 400))
          }

          try {
            const nextRepos = await getGitHubRepos()
            if (!cancelled) setRepos(nextRepos)
            return true
          } catch (err) {
            if (cancelled) return false

            const message = err instanceof Error ? err.message : ''
            const isNotConnected = message.includes('401') || message.toLowerCase().includes('not connected')
            if (isNotConnected && attempt < maxAttempts - 1) continue

            if (err instanceof RateLimitError) {
              setError(err.message)
            } else {
              setError(err instanceof Error ? err.message : 'Failed to load GitHub repositories.')
            }
            return false
          }
        }

        return false
      }

      try {
        await attemptLoad()
      } finally {
        if (!cancelled) setLoading(false)
      }
    }

    loadRepos()
    return () => {
      cancelled = true
    }
  }, [hasGitHubConnection, profile?.github_token, session?.provider_token])

  const filteredRepos = useMemo(() => {
    const needle = search.trim().toLowerCase()
    if (!needle) return repos

    return repos.filter((repo) => {
      return [
        repo.name,
        repo.full_name,
        repo.description ?? '',
        repo.language ?? '',
      ].some((value) => value.toLowerCase().includes(needle))
    })
  }, [repos, search])

  const handleConnectGitHub = () => {
    setError(null)
    connectGitHub('/repos')
  }

  const handleOpenBranchModal = async (repo: GitHubRepo) => {
    setError(null)
    setLoadingBranchesFor(repo.id)

    try {
      const { branches } = await getGitHubBranches(repo.html_url)
      const defaultBranch = branches.find((branch) => branch.isDefault)?.name ?? repo.default_branch

      setBranchModal({
        repo,
        branches,
        selectedBranch: defaultBranch,
      })
    } catch (err) {
      if (err instanceof RateLimitError) {
        setError(err.message)
      } else if (err instanceof Error) {
        setError(err.message)
      } else {
        setError('Failed to load repository branches.')
      }
    } finally {
      setLoadingBranchesFor(null)
    }
  }

  const handleCloneAndAnalyse = async () => {
    if (!branchModal || !profile?.id) return

    setCloningRepoId(branchModal.repo.id)
    setError(null)

    try {
      const cloneResult = await cloneGitHubRepo(branchModal.repo.html_url, branchModal.selectedBranch)
      const files = Object.entries(cloneResult.files)
      const fileMap = new Map<string, string>(files)

      let project: Project
      try {
        project = await createProject({
          name: branchModal.repo.name,
          path: 'uploaded',
          repo: branchModal.repo.html_url,
          branch: cloneResult.branch,
          status: 'Not analysed',
          last_run: null,
        }, profile.id)
      } catch (err) {
        console.warn('Failed to persist cloned project in Supabase, using local fallback', err)
        project = {
          id: `local-${Date.now()}`,
          name: branchModal.repo.name,
          path: 'uploaded',
          repo: branchModal.repo.html_url,
          branch: cloneResult.branch,
          status: 'Not analysed',
          last_run: null,
        }
      }

      setProjectId(project.id)
      setFileMap(fileMap)
      void trackEvent('project_connected', {
        project_id: project.id,
        repo_url: branchModal.repo.html_url,
        branch: cloneResult.branch,
        source: 'github_repos',
      })
      setBranchModal(null)
      onNavigate('project-view', { projectId: project.id })
    } catch (err) {
      if (err instanceof RateLimitError) {
        setError(err.message)
      } else if (err instanceof Error) {
        setError(err.message)
      } else {
        setError('Failed to clone repository.')
      }
    } finally {
      setCloningRepoId(null)
    }
  }

  return (
    <div style={{ padding: '32px 36px', height: '100%', overflowY: 'auto', background: 'var(--canvas)' }}>

      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 24, gap: 16 }}>
        <div>
          <h1 className="page-title" style={{ marginBottom: 6 }}>Repositories</h1>
          <p style={{ fontSize: 14, color: 'var(--ink-muted)' }}>
            Browse your GitHub repositories and clone one directly into Refract for analysis.
          </p>
        </div>
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
            background: 'color-mix(in srgb, var(--semantic-error) 8%, transparent)',
            border: '1px solid color-mix(in srgb, var(--semantic-error) 20%, transparent)',
            color: 'var(--semantic-error)',
          }}
        >
          <AlertCircle size={16} style={{ flexShrink: 0, marginTop: 1 }} />
          <span style={{ fontSize: 14, lineHeight: 1.5 }}>{error}</span>
        </div>
      )}

      {!hasGitHubConnection ? (
        <div
          className="card"
          style={{
            maxWidth: 680,
            padding: 28,
            display: 'flex',
            flexDirection: 'column',
            gap: 16,
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <div style={{ width: 44, height: 44, borderRadius: '8px', background: 'var(--canvas-soft)', display: 'grid', placeItems: 'center' }}>
              <GitHubIcon size={22} />
            </div>
            <div>
              <p style={{ fontSize: 18, fontWeight: 600, color: 'var(--ink)', marginBottom: 4 }}>
                Connect to GitHub
              </p>
              <p style={{ fontSize: 14, color: 'var(--ink-muted)', lineHeight: 1.5 }}>
                Connect your GitHub account to list public and private repositories, pick a branch, and clone projects straight into the analysis flow.
              </p>
            </div>
          </div>

          <button
            onClick={handleConnectGitHub}
            className="btn btn-primary"
            style={{ alignSelf: 'flex-start', gap: 8 }}
          >
            <Github size={16} />
            Connect to GitHub
          </button>
        </div>
      ) : (
        <>
          <div style={{ position: 'relative', marginBottom: 20 }}>
            <Search size={16} style={{ position: 'absolute', left: 14, top: '50%', transform: 'translateY(-50%)', color: 'var(--ink-muted)' }} />
            <input
              className="input"
              style={{ width: '100%', height: 44, paddingLeft: 40 }}
              placeholder="Search repositories, descriptions, or languages..."
              value={search}
              onChange={(event) => setSearch(event.target.value)}
            />
          </div>

          <div style={{ display: 'flex', padding: '0 16px', marginBottom: 8 }}>
            {(['Name', 'Visibility', 'Updated', 'Actions'] as const).map((column, index) => (
              <span
                key={column}
                className="section-label"
                style={{ width: ['40%', '16%', '19%', '25%'][index], fontSize: 11 }}
              >
                {column}
              </span>
            ))}
          </div>

          <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
            {loading ? (
              Array.from({ length: 5 }).map((_, index) => (
                <div
                  key={index}
                  style={{ height: 62, display: 'flex', alignItems: 'center', padding: '0 16px', borderBottom: index === 4 ? 'none' : '1px solid var(--hairline)' }}
                >
                  <div style={{ width: '40%' }}><div className="skeleton" style={{ width: '70%', height: 12 }} /></div>
                  <div style={{ width: '16%' }}><div className="skeleton" style={{ width: 60, height: 12 }} /></div>
                  <div style={{ width: '19%' }}><div className="skeleton" style={{ width: 90, height: 12 }} /></div>
                  <div style={{ width: '25%', display: 'flex', justifyContent: 'flex-end' }}><div className="skeleton" style={{ width: 130, height: 34 }} /></div>
                </div>
              ))
            ) : filteredRepos.length === 0 ? (
              <div style={{ padding: '44px 24px', textAlign: 'center' }}>
                <p style={{ fontSize: 16, color: 'var(--ink)', marginBottom: 6 }}>No repositories found.</p>
                <p style={{ fontSize: 14, color: 'var(--ink-muted)' }}>
                  Try another search term or reconnect GitHub if the list looks incomplete.
                </p>
              </div>
            ) : (
              filteredRepos.map((repo, index) => (
                <div
                  key={repo.id}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    minHeight: 62,
                    padding: '10px 16px',
                    borderBottom: index === filteredRepos.length - 1 ? 'none' : '1px solid var(--hairline)',
                  }}
                >
                  <div style={{ width: '40%', display: 'flex', alignItems: 'flex-start', gap: 10, minWidth: 0 }}>
                    <GitHubIcon size={16} />
                    <div style={{ minWidth: 0 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                        <span style={{ fontSize: 16, color: 'var(--ink)', fontWeight: 500, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                          {repo.full_name}
                        </span>
                        {repo.language && (
                          <span className="badge badge-muted" style={{ padding: '2px 8px', fontSize: 11 }}>
                            {repo.language}
                          </span>
                        )}
                      </div>
                      <p style={{ fontSize: 14, color: 'var(--ink-muted)', lineHeight: 1.5 }}>
                        {repo.description || 'No description provided.'}
                      </p>
                    </div>
                  </div>

                  <div style={{ width: '16%' }}>
                    <span className={repo.private ? 'badge badge-muted' : 'badge badge-success'} style={{ padding: '2px 8px', fontSize: 11, textTransform: 'uppercase' }}>
                      {repo.private ? <Lock size={10} style={{ marginRight: 4 }} /> : <Globe size={10} style={{ marginRight: 4 }} />}
                      {repo.private ? 'Private' : 'Public'}
                    </span>
                  </div>

                  <div style={{ width: '19%', fontSize: 14, color: 'var(--ink-muted)' }}>
                    {new Date(repo.updated_at).toLocaleDateString('en-US')}
                  </div>

                  <div style={{ width: '25%', display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
                    <a
                      href={repo.html_url}
                      target="_blank"
                      rel="noreferrer"
                      className="btn btn-ghost btn-sm"
                      style={{ gap: 6 }}
                    >
                      <ExternalLink size={14} /> Open
                    </a>
                    <button
                      onClick={() => handleOpenBranchModal(repo)}
                      className="btn btn-secondary btn-sm"
                      disabled={loadingBranchesFor === repo.id || cloningRepoId === repo.id}
                      style={{ gap: 6, minWidth: 126, justifyContent: 'center' }}
                    >
                      {loadingBranchesFor === repo.id ? <Loader2 size={14} className="spin" /> : <Download size={14} />}
                      Clone & Analyse
                    </button>
                  </div>
                </div>
              ))
            )}
          </div>
        </>
      )}

      <Modal
        open={!!branchModal}
        onClose={() => !cloningRepoId && setBranchModal(null)}
        locked={!!cloningRepoId}
        maxWidth={460}
        className="p-7"
      >
        {branchModal && (
          <>
            <ModalHeader
              title="Clone & Analyse"
              subtitle={<>Choose the branch to load from <strong>{branchModal.repo.full_name}</strong>.</>}
              onClose={cloningRepoId ? undefined : () => setBranchModal(null)}
            />

            <label className="block text-sm text-[var(--ink)] mb-2">Branch</label>
            <div className="relative mb-6">
              <GitBranch size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-[var(--ink-muted)] pointer-events-none" />
              <select
                className="input w-full pl-9"
                value={branchModal.selectedBranch}
                onChange={(event) => setBranchModal((prev) => prev ? { ...prev, selectedBranch: event.target.value } : prev)}
                disabled={cloningRepoId === branchModal.repo.id}
              >
                {branchModal.branches.map((branch) => (
                  <option key={branch.name} value={branch.name}>
                    {branch.name}{branch.isDefault ? ' (default)' : ''}
                  </option>
                ))}
              </select>
            </div>

            <div className="flex items-center justify-between gap-3">
              <p className="text-sm text-[var(--ink-muted)]">
                {cloningRepoId === branchModal.repo.id ? 'Cloning repository…' : 'The repository will be loaded into the in-app analysis flow.'}
              </p>
              <button
                type="button"
                onClick={handleCloneAndAnalyse}
                className="btn btn-primary flex items-center gap-2"
                disabled={cloningRepoId === branchModal.repo.id}
                style={{ minWidth: 152, justifyContent: 'center' }}
              >
                {cloningRepoId === branchModal.repo.id ? <Loader2 size={16} className="spin" /> : <Download size={16} />}
                {cloningRepoId === branchModal.repo.id ? 'Cloning…' : 'Clone & Analyse'}
              </button>
            </div>
          </>
        )}
      </Modal>
    </div>
  )
}
