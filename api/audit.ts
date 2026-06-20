// api/audit.ts
// POST /api/audit — create a public shareable audit link (authenticated)
// GET  /api/audit?slug=xxx — read audit data (public, no auth required)

import type { VercelRequest, VercelResponse } from '@vercel/node'
import { getAdminSupabaseClient } from './_lib/supabase'
import { getAuthenticatedUser } from './_lib/auth'

// ─── Nano-id replacement (no extra dep) ──────────────────────────────────────

const SLUG_CHARS = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789'

function generateSlug(length = 8): string {
  let result = ''
  for (let i = 0; i < length; i++) {
    result += SLUG_CHARS[Math.floor(Math.random() * SLUG_CHARS.length)]
  }
  return result
}

// ─── POST /api/audit — create audit link ────────────────────────────────────

async function handlePost(req: VercelRequest, res: VercelResponse) {
  let userId: string
  try {
    const auth = await getAuthenticatedUser(req.headers.authorization)
    userId = auth.user.id
  } catch {
    return res.status(401).json({ error: 'Authentication required' })
  }

  const {
    projectId,
    projectName,
    score,
    summary,
    topIssues = [],
    categoryCounts = {},
    scannedFiles = 0,
  } = req.body ?? {}

  if (!projectId || score === undefined || !summary) {
    return res.status(400).json({ error: 'Missing required fields: projectId, score, summary' })
  }

  const supabase = getAdminSupabaseClient()

  // Verify the project belongs to this user
  const { data: project, error: projectError } = await supabase
    .from('projects')
    .select('id, name')
    .eq('id', projectId)
    .eq('user_id', userId)
    .maybeSingle()

  if (projectError || !project) {
    return res.status(403).json({ error: 'Project not found or access denied' })
  }

  // Sanitise topIssues — strip any code snippets, keep only safe fields
  const safeTopIssues = (Array.isArray(topIssues) ? topIssues : [])
    .slice(0, 10)
    .map((issue: any) => ({
      category: String(issue.category ?? ''),
      problem:  String(issue.problem ?? ''),
      filePath: String(issue.filePath ?? ''),
      impact:   String(issue.impact ?? ''),
    }))

  // Try generating a unique slug (retry up to 5 times on collision)
  let slug = ''
  for (let attempt = 0; attempt < 5; attempt++) {
    const candidate = generateSlug(8)
    const { data: existing } = await supabase
      .from('audit_links')
      .select('id')
      .eq('slug', candidate)
      .maybeSingle()
    if (!existing) { slug = candidate; break }
  }

  if (!slug) {
    return res.status(500).json({ error: 'Failed to generate unique slug — try again' })
  }

  const { error: insertError } = await supabase.from('audit_links').insert({
    slug,
    project_id:    projectId,
    user_id:       userId,
    project_name:  projectName ?? project.name,
    score:         Number(score),
    issue_count:   Number(summary.total ?? 0),
    high:          Number(summary.high ?? 0),
    medium:        Number(summary.medium ?? 0),
    low:           Number(summary.low ?? 0),
    scanned_files: Number(scannedFiles),
    category_counts: categoryCounts,
    top_issues:    safeTopIssues,
  })

  if (insertError) {
    console.error('[audit] Failed to insert audit_link:', insertError.message)
    return res.status(500).json({ error: 'Failed to create audit link' })
  }

  const appUrl = process.env.VITE_APP_URL?.trim() || 'https://refract.app'
  return res.status(201).json({ slug, url: `${appUrl}/audit/${slug}` })
}

// ─── GET /api/audit?slug=xxx — read audit link (public) ─────────────────────

async function handleGet(req: VercelRequest, res: VercelResponse) {
  const slug = req.query.slug as string | undefined

  if (!slug) {
    return res.status(400).json({ error: 'Missing slug parameter' })
  }

  const supabase = getAdminSupabaseClient()
  const { data, error } = await supabase
    .from('audit_links')
    .select('*')
    .eq('slug', slug)
    .maybeSingle()

  if (error) {
    console.error('[audit] DB error reading audit link:', error.message)
    return res.status(500).json({ error: 'Failed to load audit' })
  }

  if (!data) {
    return res.status(404).json({ error: 'Audit link not found or expired' })
  }

  // Set cache headers — audit pages are public and rarely change
  res.setHeader('Cache-Control', 's-maxage=60, stale-while-revalidate=300')

  return res.status(200).json(data)
}

// ─── Handler ─────────────────────────────────────────────────────────────────

export default async function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization')

  if (req.method === 'OPTIONS') return res.status(204).end()
  if (req.method === 'GET')  return handleGet(req, res)
  if (req.method === 'POST') return handlePost(req, res)
  return res.status(405).json({ error: 'Method not allowed' })
}
