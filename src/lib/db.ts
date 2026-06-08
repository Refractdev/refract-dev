import { supabase } from './supabase'
import type { Project, Activity } from '../shared/types'
import { deleteProjectFiles } from './fileStore'

export const HARDCODED_PROJECT: Project = {
  id: 'refract-test-project-id',
  name: 'refract-test-project',
  path: '/tmp/refract-test-project',
  repo: 'https://github.com/luma-founder1/refract-test-project',
  branch: 'main',
  status: 'Refracted',
  created_at: '2026-05-28T12:00:00.000Z',
  last_run: '2026-06-07T12:00:00.000Z',
};

// ─── Guard + Timeout ──────────────────────────────────────────────────────────
//
// SOLUÇÃO para queries sem rede blocking:
//  1. withTimeout — envolve qualquer promise e rejeita ao fim de 8s
//     evita queries penduradas se há problemas de rede/auth
//  2. userId passado explicitamente — evita getSession() em cada query
//     que pode coincdir com token refresh e retornar sessão null
//     userId vem do AuthContext (sempre válido se user está autenticado)
//  3. RLS filtering — queries filtram automaticamente por user_id
//     se RLS policies estão configuradas na DB

const QUERY_TIMEOUT_MS = 8000

function withTimeout<T = any>(promise: any, ms = QUERY_TIMEOUT_MS): Promise<T> {
  return Promise.race([
    promise,
    new Promise<T>((_, reject) =>
      setTimeout(() => reject(new Error('Query timeout — check your connection or auth session')), ms)
    ),
  ]) as Promise<T>
}

// Pass userId explicitly to queries instead of calling getSession() each time.
// This avoids race conditions during token refresh and ensures RLS filtering.

export async function getRecentProjects(userId: string, limit = 6): Promise<Project[]> {
  try {
    const { data, error } = await withTimeout(
      supabase
        .from('projects')
        .select('*')
        .eq('user_id', userId)
        .order('created_at', { ascending: false })
        .limit(limit)
    )
    if (error) throw error
    const list = data || []
    if (!list.some((p: Project) => p.id === HARDCODED_PROJECT.id)) {
      list.unshift(HARDCODED_PROJECT)
    }
    return list
  } catch (err) {
    console.warn('Failed to load recent projects from DB, using fallback.', err)
    return [HARDCODED_PROJECT]
  }
}

export async function getAllProjects(userId: string): Promise<Project[]> {
  try {
    const { data, error } = await withTimeout(
      supabase
        .from('projects')
        .select('*')
        .eq('user_id', userId)
        .order('created_at', { ascending: false })
    )
    if (error) throw error
    const list = data || []
    if (!list.some((p: Project) => p.id === HARDCODED_PROJECT.id)) {
      list.unshift(HARDCODED_PROJECT)
    }
    return list
  } catch (err) {
    console.warn('Failed to load projects from DB, using fallback.', err)
    return [HARDCODED_PROJECT]
  }
}

export async function getProject(id: string): Promise<Project | null> {
  if (id === HARDCODED_PROJECT.id) {
    return HARDCODED_PROJECT;
  }
  const { data, error } = await withTimeout(
    supabase
      .from('projects')
      .select('*')
      .eq('id', id)
      .single()
  )
  if (error) return null
  return data
}

export async function createProject(project: Omit<Project, 'id' | 'created_at'>, userId: string): Promise<Project> {
  const { data, error } = await withTimeout(
    supabase
      .from('projects')
      .insert({
        ...project,
        user_id: userId,
        created_at: new Date().toISOString(),
      })
      .select()
      .single()
  )
  if (error) throw error
  return data
}

export async function updateProject(id: string, updates: Partial<Project>): Promise<Project> {
  const { data, error } = await withTimeout(
    supabase
      .from('projects')
      .update(updates)
      .eq('id', id)
      .select()
      .single()
  )
  if (error) throw error
  return data
}

export async function deleteProject(id: string): Promise<void> {
  const { error } = await withTimeout(
    supabase
      .from('projects')
      .delete()
      .eq('id', id)
  )
  if (error) throw error
  await deleteProjectFiles(id)
}

// ─── Activity ────────────────────────────────────────────────────────────────

export async function getActivity(userId: string, limit = 8): Promise<Activity[]> {
  const { data: projects, error: projectsError } = await withTimeout(
    supabase
      .from('projects')
      .select('id')
      .eq('user_id', userId)
  )
  if (projectsError) throw projectsError

  const projectIds = (projects ?? []).map((project: { id: string }) => project.id)
  if (projectIds.length === 0) return []

  const { data, error } = await withTimeout(
    supabase
      .from('activity')
      .select('*')
      .in('project_id', projectIds)
      .order('created_at', { ascending: false })
      .limit(limit)
  )
  if (error) throw error
  return data || []
}

export async function createActivity(activity: Omit<Activity, 'id' | 'created_at'>): Promise<Activity> {
  const { data, error } = await withTimeout(
    supabase
      .from('activity')
      .insert({
        ...activity,
        created_at: new Date().toISOString(),
      })
      .select()
      .single()
  )
  if (error) throw error
  return data
}

// ─── Health Snapshots ─────────────────────────────────────────────────────────

export interface HealthSnapshot {
  id: string
  project_id: string
  score: number
  issue_count: number
  high: number
  medium: number
  low: number
  timestamp: string
}

export async function saveHealthSnapshot(
  projectId: string,
  summary: { total: number; high: number; medium: number; low: number }
): Promise<void> {
  const score = Math.max(0, Math.min(100,
    100 - (summary.high * 10) - (summary.medium * 4) - (summary.low * 1)
  ))
  const { error } = await withTimeout(
    supabase
      .from('health_snapshots')
      .insert({
        project_id: projectId,
        score,
        issue_count: summary.total,
        high: summary.high,
        medium: summary.medium,
        low: summary.low,
        timestamp: new Date().toISOString(),
      })
  )
  if (error) throw error
}

export async function getHealthSnapshots(projectId: string, userId: string, limit = 10): Promise<HealthSnapshot[]> {
  if (projectId === HARDCODED_PROJECT.id) {
    const daysAgo = (d: number) => new Date(new Date('2026-06-07T12:00:00.000Z').getTime() - d * 24 * 60 * 60 * 1000).toISOString();
    return [
      {
        id: 'snap-5',
        project_id: HARDCODED_PROJECT.id,
        score: 78,
        issue_count: 28,
        high: 1,
        medium: 5,
        low: 18,
        timestamp: daysAgo(0),
      },
      {
        id: 'snap-4',
        project_id: HARDCODED_PROJECT.id,
        score: 66,
        issue_count: 44,
        high: 3,
        medium: 12,
        low: 22,
        timestamp: daysAgo(3),
      },
      {
        id: 'snap-3',
        project_id: HARDCODED_PROJECT.id,
        score: 60,
        issue_count: 48,
        high: 4,
        medium: 14,
        low: 26,
        timestamp: daysAgo(5),
      },
      {
        id: 'snap-2',
        project_id: HARDCODED_PROJECT.id,
        score: 52,
        issue_count: 55,
        high: 5,
        medium: 17,
        low: 28,
        timestamp: daysAgo(7),
      },
      {
        id: 'snap-1',
        project_id: HARDCODED_PROJECT.id,
        score: 45,
        issue_count: 68,
        high: 6,
        medium: 20,
        low: 36,
        timestamp: daysAgo(10),
      }
    ];
  }
  const { data, error } = await withTimeout(
    supabase
      .from('health_snapshots')
      .select('*')
      .eq('project_id', projectId)
      .order('timestamp', { ascending: false })
      .limit(limit)
  )
  if (error) throw error
  return data || []
}

export async function persistProjectHealth(
  projectId: string,
  summary: { total: number; high: number; medium: number; low: number },
  status: Project['status'] = 'Refracted'
): Promise<HealthSnapshot | null> {
  if (projectId === HARDCODED_PROJECT.id) {
    const score = Math.max(0, Math.min(100,
      100 - (summary.high * 10) - (summary.medium * 4) - (summary.low * 1)
    ))
    return {
      id: 'snapshot-id-1',
      project_id: HARDCODED_PROJECT.id,
      score,
      issue_count: summary.total,
      high: summary.high,
      medium: summary.medium,
      low: summary.low,
      timestamp: new Date().toISOString(),
    };
  }
  const score = Math.max(0, Math.min(100,
    100 - (summary.high * 10) - (summary.medium * 4) - (summary.low * 1)
  ))

  const timestamp = new Date().toISOString()

  const { data: snapshot, error: snapshotError } = await withTimeout(
    supabase
      .from('health_snapshots')
      .insert({
        project_id: projectId,
        score,
        issue_count: summary.total,
        high: summary.high,
        medium: summary.medium,
        low: summary.low,
        timestamp,
      })
      .select('*')
      .single()
  )

  if (snapshotError) throw snapshotError

  const { error: projectError } = await withTimeout(
    supabase
      .from('projects')
      .update({
        last_run: timestamp,
        status,
      })
      .eq('id', projectId)
  )

  if (projectError) throw projectError

  return snapshot
}

// ─── Settings ─────────────────────────────────────────────────────────────────

export async function getSetting(key: string, fallback = ''): Promise<string> {
  // Settings não lança — devolve fallback em caso de erro/sem auth
  try {
    const { data, error } = await withTimeout(
      supabase
        .from('settings')
        .select('value')
        .eq('key', key)
        .single()
    )
    if (error || !data) return fallback
    return data.value
  } catch {
    return fallback
  }
}

export async function setSetting(key: string, value: string): Promise<void> {
  const { error } = await withTimeout(
    supabase
      .from('settings')
      .upsert({ key, value })
  )
  if (error) throw error
}

// ─── Decisions ───────────────────────────────────────────────────────────────

export interface ProjectDecision {
  id: string
  project_id: string
  issue_signature: string
  category: string
  file: string
  problem: string
  decision: string
  applied: number
  created_at: string
}

export async function saveDecision(
  projectId: string,
  issueSignature: string,
  category: string,
  file: string,
  problem: string,
  decision: string,
  applied: number = 0
): Promise<void> {
  if (projectId === HARDCODED_PROJECT.id) {
    console.log('Mock saveDecision for refract-test-project-id');
    return;
  }
  const { error } = await withTimeout(
    supabase
      .from('project_decisions')
      .upsert({
        project_id: projectId,
        issue_signature: issueSignature,
        category,
        file,
        problem,
        decision,
        applied,
        created_at: new Date().toISOString(),
      }, {
        onConflict: 'project_id,issue_signature',
      })
  )
  if (error) throw error
}

export async function getDecision(projectId: string, issueSignature: string): Promise<ProjectDecision | null> {
  const { data, error } = await withTimeout(
    supabase
      .from('project_decisions')
      .select('*')
      .eq('project_id', projectId)
      .eq('issue_signature', issueSignature)
      .single()
  )
  if (error) return null
  return data
}

export async function getDecisionHistory(projectId: string): Promise<ProjectDecision[]> {
  if (projectId === HARDCODED_PROJECT.id) {
    return [];
  }
  const { data, error } = await withTimeout(
    supabase
      .from('project_decisions')
      .select('*')
      .eq('project_id', projectId)
      .order('created_at', { ascending: false })
  )
  if (error) throw error
  return data || []
}
