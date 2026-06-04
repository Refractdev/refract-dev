import type { DriftReport, GitHubCommit } from './api'
import type { HealthSnapshot } from './health'

export const MOCK_PROJECT = {
  id: '__mock__',
  name: 'react-store',
  path: '~/dev/react-store',
  repo: 'https://github.com/acme/react-store',
  branch: 'main',
  status: 'Not analysed' as const,
  last_run: new Date(Date.now() - 86400000).toISOString(),
  created_at: new Date(Date.now() - 1209600000).toISOString(),
}

export const MOCK_SNAPSHOTS: HealthSnapshot[] = [
  { score: 94, timestamp: new Date(Date.now() - 1209600000).toISOString(), issueCount: 8, high: 0, medium: 2, low: 6 },
  { score: 91, timestamp: new Date(Date.now() - 1036800000).toISOString(), issueCount: 12, high: 0, medium: 4, low: 8 },
  { score: 85, timestamp: new Date(Date.now() - 864000000).toISOString(), issueCount: 18, high: 1, medium: 6, low: 11 },
  { score: 76, timestamp: new Date(Date.now() - 691200000).toISOString(), issueCount: 27, high: 2, medium: 9, low: 16 },
  { score: 64, timestamp: new Date(Date.now() - 518400000).toISOString(), issueCount: 39, high: 4, medium: 13, low: 22 },
  { score: 58, timestamp: new Date(Date.now() - 345600000).toISOString(), issueCount: 46, high: 6, medium: 15, low: 25 },
  { score: 69, timestamp: new Date(Date.now() - 172800000).toISOString(), issueCount: 34, high: 3, medium: 11, low: 20 },
  { score: 78, timestamp: new Date(Date.now() - 86400000).toISOString(), issueCount: 24, high: 2, medium: 8, low: 14 },
]

export const MOCK_DRIFT_REPORT: DriftReport = {
  projectId: '__mock__',
  totalSnapshots: 8,
  currentScore: 78,
  previousScore: 69,
  scoreDelta: 9,
  trends: [
    { category: 'any-type', slope: 2.4, direction: 'worsening', currentCount: 12, averageCount: 7.2 },
    { category: 'prop-drilling', slope: 1.8, direction: 'worsening', currentCount: 8, averageCount: 4.5 },
    { category: 'effect-no-deps', slope: -0.5, direction: 'improving', currentCount: 3, averageCount: 5.8 },
    { category: 'dead-state', slope: -1.2, direction: 'improving', currentCount: 1, averageCount: 3.4 },
    { category: 'oversized-component', slope: 0.3, direction: 'stable', currentCount: 4, averageCount: 3.6 },
    { category: 'console-log', slope: -0.8, direction: 'improving', currentCount: 2, averageCount: 4.1 },
    { category: 'missing-docs', slope: 2.1, direction: 'worsening', currentCount: 9, averageCount: 5.3 },
  ],
  anomalies: [
    { category: 'any-type', type: 'spike', currentCount: 12, expectedCount: 6, deviationPercent: 100, severity: 'critical' },
    { category: 'prop-drilling', type: 'spike', currentCount: 8, expectedCount: 4, deviationPercent: 87, severity: 'warning' },
    { category: 'console-log', type: 'drop', currentCount: 2, expectedCount: 5, deviationPercent: 60, severity: 'info' },
  ],
  decayHotspots: [
    {
      filePath: 'src/components/CheckoutForm.tsx',
      fileName: 'CheckoutForm.tsx',
      appearances: 6,
      latestCount: 14,
      growthRate: 2.1,
      severity: 'critical',
    },
    {
      filePath: 'src/hooks/useAuth.ts',
      fileName: 'useAuth.ts',
      appearances: 5,
      latestCount: 8,
      growthRate: 1.4,
      severity: 'warning',
    },
    {
      filePath: 'src/utils/validators.ts',
      fileName: 'validators.ts',
      appearances: 4,
      latestCount: 6,
      growthRate: 0.9,
      severity: 'warning',
    },
    {
      filePath: 'src/pages/admin/Dashboard.tsx',
      fileName: 'Dashboard.tsx',
      appearances: 3,
      latestCount: 11,
      growthRate: 2.8,
      severity: 'critical',
    },
  ],
  alerts: [
    {
      alert_type: 'score_drop',
      severity: 'warning',
      message: 'Saúde do código desceu 16 pontos (94 → 78) ao longo das últimas 8 análises.',
      metadata: { from: 94, to: 78, delta: -16 },
    },
    {
      alert_type: 'category_spike',
      severity: 'critical',
      message: 'Categoria "any-type" em tendência de agravamento contínuo (média 7.2 → atual 12).',
      metadata: { category: 'any-type', slope: 2.4, current: 12, average: 7.2 },
    },
    {
      alert_type: 'anomaly',
      severity: 'warning',
      message: 'Pico anómalo em "prop-drilling": 8 (esperado ~4, +87%).',
      metadata: { category: 'prop-drilling', type: 'spike', current: 8, expected: 4, deviation: 87 },
    },
    {
      alert_type: 'decay_hotspot',
      severity: 'critical',
      message: 'Ficheiro "CheckoutForm.tsx" em degradação (+2.1 issues/análise, 14 issues atuais).',
      metadata: { filePath: 'src/components/CheckoutForm.tsx', growthRate: 2.1, latestCount: 14 },
    },
    {
      alert_type: 'decay_hotspot',
      severity: 'warning',
      message: 'Ficheiro "Dashboard.tsx" em degradação (+2.8 issues/análise, 11 issues atuais).',
      metadata: { filePath: 'src/pages/admin/Dashboard.tsx', growthRate: 2.8, latestCount: 11 },
    },
  ],
}

export const MOCK_COMMITS: GitHubCommit[] = [
  { sha: 'a1b2c3d4e5f6a7b8c9d0e1f2a3b4c5d6e7f8a9b0', message: 'fix: resolve cart total calculation with applied coupons edge case', author: 'Maria Santos', date: new Date(Date.now() - 3600000).toISOString(), url: '#' },
  { sha: 'b2c3d4e5f6a7b8c9d0e1f2a3b4c5d6e7f8a9b0c1', message: 'feat: add optimistic UI updates for wishlist toggle', author: 'João Pereira', date: new Date(Date.now() - 7200000).toISOString(), url: '#' },
  { sha: 'c3d4e5f6a7b8c9d0e1f2a3b4c5d6e7f8a9b0c1d2', message: 'refactor: extract address validation into shared utility', author: 'Ana Costa', date: new Date(Date.now() - 14400000).toISOString(), url: '#' },
  { sha: 'd4e5f6a7b8c9d0e1f2a3b4c5d6e7f8a9b0c1d2e3', message: 'fix: prevent double submission on payment form', author: 'Maria Santos', date: new Date(Date.now() - 28800000).toISOString(), url: '#' },
  { sha: 'e5f6a7b8c9d0e1f2a3b4c5d6e7f8a9b0c1d2e3f4', message: 'feat: implement shipping method selector with price breakdown', author: 'João Pereira', date: new Date(Date.now() - 57600000).toISOString(), url: '#' },
  { sha: 'f6a7b8c9d0e1f2a3b4c5d6e7f8a9b0c1d2e3f4a5', message: 'chore: update dependencies and fix type errors in checkout', author: 'Ana Costa', date: new Date(Date.now() - 115200000).toISOString(), url: '#' },
  { sha: 'a7b8c9d0e1f2a3b4c5d6e7f8a9b0c1d2e3f4a5b6', message: 'fix: handle empty cart state in CheckoutForm component', author: 'Maria Santos', date: new Date(Date.now() - 230400000).toISOString(), url: '#' },
  { sha: 'b8c9d0e1f2a3b4c5d6e7f8a9b0c1d2e3f4a5b6c7', message: 'feat: add order confirmation email template preview', author: 'João Pereira', date: new Date(Date.now() - 460800000).toISOString(), url: '#' },
  { sha: 'c9d0e1f2a3b4c5d6e7f8a9b0c1d2e3f4a5b6c7d8', message: 'refactor: split useAuth hook into smaller composable hooks', author: 'Ana Costa', date: new Date(Date.now() - 691200000).toISOString(), url: '#' },
  { sha: 'd0e1f2a3b4c5d6e7f8a9b0c1d2e3f4a5b6c7d8e9', message: 'feat: implement product search with debounced queries', author: 'Maria Santos', date: new Date(Date.now() - 864000000).toISOString(), url: '#' },
]

export const MOCK_LAST_SNAPSHOT: HealthSnapshot = MOCK_SNAPSHOTS[MOCK_SNAPSHOTS.length - 1]
export const MOCK_PREV_SNAPSHOT: HealthSnapshot = MOCK_SNAPSHOTS[MOCK_SNAPSHOTS.length - 2]

export function isMockMode(): boolean {
  if (typeof window === 'undefined') return false
  if (!import.meta.env.DEV) return false
  const params = new URLSearchParams(window.location.search)
  return params.get('mock') === 'true'
}
