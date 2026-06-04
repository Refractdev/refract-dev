import type { VercelRequest, VercelResponse } from '@vercel/node'
import { getAdminSupabaseClient } from '../_lib/supabase'
import { getAuthenticatedUser } from '../_lib/auth'
import { analyzeDrift, type SnapshotData } from '../_lib/drift'

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' })
  }

  try {
    // Authenticate
    try {
      await getAuthenticatedUser(req.headers.authorization)
    } catch {
      return res.status(401).json({ error: 'Autenticação necessária' })
    }

    const projectId = req.query.projectId as string
    if (!projectId) {
      return res.status(400).json({ error: 'Missing projectId query param' })
    }

    const supabase = getAdminSupabaseClient()

    // Load recent analysis results (max 20)
    const { data: results, error } = await supabase
      .from('analysis_results')
      .select('*')
      .eq('project_id', projectId)
      .order('created_at', { ascending: false })
      .limit(20)

    if (error) {
      return res.status(500).json({ error: error.message })
    }

    const snapshots = (results ?? []) as SnapshotData[]
    const report = analyzeDrift(snapshots, projectId)

    return res.status(200).json(report)
  } catch (error: any) {
    console.error('[analysis/drift] Error:', error)
    return res.status(500).json({ error: error.message ?? 'Drift analysis failed' })
  }
}
