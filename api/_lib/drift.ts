// api/_lib/drift.ts
// Drift detection algorithms — trend analysis, anomaly detection, decay hotspots

// ─── Types ────────────────────────────────────────────────────────────────────

export interface SnapshotData {
  id: string
  created_at: string
  score: number
  issue_count: number
  high: number
  medium: number
  low: number
  issue_counts_by_category: Record<string, number> | null
  file_issue_counts: Record<string, number> | null
}

export interface CategoryTrend {
  category: string
  slope: number
  direction: 'improving' | 'stable' | 'worsening'
  currentCount: number
  averageCount: number
}

export interface Anomaly {
  category: string
  type: 'spike' | 'drop'
  currentCount: number
  expectedCount: number
  deviationPercent: number
  severity: 'info' | 'warning' | 'critical'
}

export interface DecayHotspot {
  filePath: string
  fileName: string
  appearances: number
  latestCount: number
  growthRate: number
  severity: 'warning' | 'critical'
}

export interface DriftReport {
  projectId: string
  totalSnapshots: number
  currentScore: number
  previousScore: number | null
  scoreDelta: number | null
  trends: CategoryTrend[]
  anomalies: Anomaly[]
  decayHotspots: DecayHotspot[]
  alerts: Array<{
    alert_type: 'score_drop' | 'category_spike' | 'anomaly' | 'decay_hotspot' | 'architectural_drift'
    severity: 'info' | 'warning' | 'critical'
    message: string
    metadata: Record<string, unknown>
  }>
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function linearRegression(values: number[]): { slope: number; intercept: number } {
  const n = values.length
  if (n < 2) return { slope: 0, intercept: values[0] ?? 0 }

  let sumX = 0, sumY = 0, sumXY = 0, sumX2 = 0
  for (let i = 0; i < n; i++) {
    sumX += i
    sumY += values[i]
    sumXY += i * values[i]
    sumX2 += i * i
  }

  const slope = (n * sumXY - sumX * sumY) / (n * sumX2 - sumX * sumX)
  const intercept = (sumY - slope * sumX) / n

  return { slope, intercept }
}

function mean(values: number[]): number {
  if (values.length === 0) return 0
  let sum = 0
  for (const v of values) sum += v
  return sum / values.length
}

function stddev(values: number[], m?: number): number {
  if (values.length < 2) return 0
  const avg = m ?? mean(values)
  let sumSq = 0
  for (const v of values) sumSq += (v - avg) ** 2
  return Math.sqrt(sumSq / (values.length - 1))
}

function fileNameFromPath(filePath: string): string {
  return filePath.replace(/\\\\/g, '/').split('/').pop() ?? filePath
}

// ─── Trend analysis per category ─────────────────────────────────────────────

function analyzeCategoryTrends(snapshots: SnapshotData[]): CategoryTrend[] {
  const allCategories = new Set<string>()
  for (const snap of snapshots) {
    if (snap.issue_counts_by_category) {
      for (const cat of Object.keys(snap.issue_counts_by_category)) {
        allCategories.add(cat)
      }
    }
  }

  const trends: CategoryTrend[] = []

  for (const category of allCategories) {
    const counts = snapshots.map((s) => s.issue_counts_by_category?.[category] ?? 0)
    const { slope } = linearRegression(counts)
    const currentCount = counts[counts.length - 1] ?? 0
    const avgCount = mean(counts)

    let direction: 'improving' | 'stable' | 'worsening'
    if (slope > 0.3) {
      direction = 'worsening'
    } else if (slope < -0.3) {
      direction = 'improving'
    } else {
      direction = 'stable'
    }

    trends.push({ category, slope, direction, currentCount, averageCount: Math.round(avgCount * 10) / 10 })
  }

  trends.sort((a, b) => b.slope - a.slope)
  return trends
}

// ─── Anomaly detection ──────────────────────────────────────────────────────

function detectAnomalies(snapshots: SnapshotData[]): Anomaly[] {
  if (snapshots.length < 3) return []

  const allCategories = new Set<string>()
  for (const snap of snapshots) {
    if (snap.issue_counts_by_category) {
      for (const cat of Object.keys(snap.issue_counts_by_category)) {
        allCategories.add(cat)
      }
    }
  }

  const anomalies: Anomaly[] = []
  const latest = snapshots[snapshots.length - 1]
  const past = snapshots.slice(0, -1)

  for (const category of allCategories) {
    const pastCounts = past.map((s) => s.issue_counts_by_category?.[category] ?? 0)
    if (pastCounts.length < 2) continue

    const avg = mean(pastCounts)
    const sd = stddev(pastCounts, avg)
    const currentCount = latest.issue_counts_by_category?.[category] ?? 0

    if (sd < 0.5) continue

    const deviation = (currentCount - avg) / sd

    if (deviation > 1.5) {
      const devPercent = avg > 0 ? Math.round(((currentCount - avg) / avg) * 100) : 999
      anomalies.push({
        category,
        type: 'spike',
        currentCount,
        expectedCount: Math.round(avg),
        deviationPercent: devPercent,
        severity: devPercent > 100 ? 'critical' : devPercent > 50 ? 'warning' : 'info',
      })
    } else if (deviation < -1.5) {
      const devPercent = avg > 0 ? Math.round(((avg - currentCount) / avg) * 100) : 0
      anomalies.push({
        category,
        type: 'drop',
        currentCount,
        expectedCount: Math.round(avg),
        deviationPercent: devPercent,
        severity: 'info',
      })
    }
  }

  anomalies.sort((a, b) => b.deviationPercent - a.deviationPercent)
  return anomalies
}

// ─── File-level decay hotspots ──────────────────────────────────────────────

function findDecayHotspots(snapshots: SnapshotData[]): DecayHotspot[] {
  if (snapshots.length < 2) return []

  const allFiles = new Map<string, number[]>()

  for (const snap of snapshots) {
    if (!snap.file_issue_counts) continue
    for (const [filePath, count] of Object.entries(snap.file_issue_counts)) {
      if (!allFiles.has(filePath)) {
        allFiles.set(filePath, [])
      }
    }
  }

  for (const [filePath, counts] of allFiles) {
    for (const snap of snapshots) {
      const count = snap.file_issue_counts?.[filePath] ?? 0
      counts.push(count)
    }
  }

  const totalCounts = snapshots.map((s) => s.issue_count)
  const { slope: projectSlope } = linearRegression(totalCounts)

  const hotspots: DecayHotspot[] = []

  for (const [filePath, counts] of allFiles) {
    const { slope: fileSlope } = linearRegression(counts)
    const latestCount = counts[counts.length - 1] ?? 0
    const appearances = counts.filter((c) => c > 0).length

    if (appearances < 2 || latestCount === 0) continue

    const relativeSlope = fileSlope - projectSlope
    let severity: 'warning' | 'critical'

    if (relativeSlope > 2) {
      severity = 'critical'
    } else if (relativeSlope > 0.5) {
      severity = 'warning'
    } else {
      continue
    }

    hotspots.push({
      filePath,
      fileName: fileNameFromPath(filePath),
      appearances,
      latestCount,
      growthRate: Math.round(fileSlope * 100) / 100,
      severity,
    })
  }

  hotspots.sort((a, b) => b.growthRate - a.growthRate)
  return hotspots
}

// ─── Main drift analysis ─────────────────────────────────────────────────────

export function analyzeDrift(
  snapshots: SnapshotData[],
  projectId: string,
): DriftReport {
  if (snapshots.length === 0) {
    return {
      projectId,
      totalSnapshots: 0,
      currentScore: 0,
      previousScore: null,
      scoreDelta: null,
      trends: [],
      anomalies: [],
      decayHotspots: [],
      alerts: [],
    }
  }

  const sorted = [...snapshots].sort(
    (a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime(),
  )

  const current = sorted[sorted.length - 1]
  const previous = sorted.length >= 2 ? sorted[sorted.length - 2] : null

  const scoreDelta = previous ? current.score - previous.score : null

  const trends = analyzeCategoryTrends(sorted)
  const anomalies = detectAnomalies(sorted)
  const hotspots = findDecayHotspots(sorted)

  const alerts: DriftReport['alerts'] = []

  if (scoreDelta !== null && scoreDelta < -5) {
    alerts.push({
      alert_type: 'score_drop',
      severity: scoreDelta < -15 ? 'critical' : 'warning',
      message: `Saúde do código desceu ${Math.abs(scoreDelta)} pontos (${previous!.score} → ${current.score}).`,
      metadata: { from: previous!.score, to: current.score, delta: scoreDelta },
    })
  }

  for (const trend of trends) {
    if (trend.direction === 'worsening' && trend.slope > 1) {
      alerts.push({
        alert_type: 'category_spike',
        severity: trend.slope > 3 ? 'critical' : 'warning',
        message: `Categoria "${trend.category}" em tendência de agravamento contínuo (média ${trend.averageCount} → atual ${trend.currentCount}).`,
        metadata: { category: trend.category, slope: trend.slope, current: trend.currentCount, average: trend.averageCount },
      })
    }
  }

  for (const anomaly of anomalies) {
    if (anomaly.severity !== 'info') {
      alerts.push({
        alert_type: 'anomaly',
        severity: anomaly.severity,
        message: anomaly.type === 'spike'
          ? `Pico anómalo em "${anomaly.category}": ${anomaly.currentCount} (esperado ~${anomaly.expectedCount}, +${anomaly.deviationPercent}%).`
          : `Queda anómala em "${anomaly.category}": ${anomaly.currentCount} (esperado ~${anomaly.expectedCount}).`,
        metadata: {
          category: anomaly.category,
          type: anomaly.type,
          current: anomaly.currentCount,
          expected: anomaly.expectedCount,
          deviation: anomaly.deviationPercent,
        },
      })
    }
  }

  for (const hotspot of hotspots) {
    alerts.push({
      alert_type: 'decay_hotspot',
      severity: hotspot.severity,
      message: `Ficheiro "${hotspot.fileName}" em degradação (+${hotspot.growthRate} issues/análise, ${hotspot.latestCount} issues atuais).`,
      metadata: {
        filePath: hotspot.filePath,
        growthRate: hotspot.growthRate,
        latestCount: hotspot.latestCount,
      },
    })
  }

  return {
    projectId,
    totalSnapshots: sorted.length,
    currentScore: current.score,
    previousScore: previous?.score ?? null,
    scoreDelta,
    trends,
    anomalies,
    decayHotspots: hotspots,
    alerts,
  }
}
