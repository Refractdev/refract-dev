import type { DriftReport, GitHubCommit } from './api'
import type { HealthSnapshot } from './health'
import type { Project } from '../shared/types'

type MockSnapshot = HealthSnapshot & {
  issue_counts_by_category?: Record<string, number>
}

type MockProject = Project & {
  stack: string
  files: number
  healthScore: number
}

const DAY = 24 * 60 * 60 * 1000
const now = Date.now()

const daysAgo = (days: number): string => new Date(now - (days * DAY)).toISOString()

export const MOCK_PROJECT = {
  id: 'mock-storefront-app',
  name: 'storefront-app',
  path: '~/code/storefront-app',
  repo: 'https://github.com/lovable-labs/storefront-app',
  branch: 'main',
  status: 'Refracted' as const,
  last_run: daysAgo(1),
  created_at: daysAgo(30),
  stack: 'React + TypeScript + Tailwind',
  files: 847,
  healthScore: 61,
} as MockProject

export const MOCK_SNAPSHOTS: MockSnapshot[] = [
  {
    score: 48,
    timestamp: daysAgo(30),
    issueCount: 52,
    high: 0,
    medium: 0,
    low: 52,
  },
  {
    score: 50,
    timestamp: daysAgo(26),
    issueCount: 50,
    high: 0,
    medium: 0,
    low: 50,
  },
  {
    score: 57,
    timestamp: daysAgo(22),
    issueCount: 43,
    high: 0,
    medium: 0,
    low: 43,
  },
  {
    score: 66,
    timestamp: daysAgo(18),
    issueCount: 34,
    high: 0,
    medium: 0,
    low: 34,
  },
  {
    score: 74,
    timestamp: daysAgo(14),
    issueCount: 26,
    high: 0,
    medium: 0,
    low: 26,
  },
  {
    score: 58,
    timestamp: daysAgo(10),
    issueCount: 42,
    high: 0,
    medium: 0,
    low: 42,
  },
  {
    score: 54,
    timestamp: daysAgo(5),
    issueCount: 46,
    high: 0,
    medium: 0,
    low: 46,
    issue_counts_by_category: {
      'any-type': 19,
      'dead-state': 9,
      'prop-drilling': 12,
      'api-in-component': 6,
      'unused-import': 20,
    },
  },
  {
    score: 61,
    timestamp: daysAgo(1),
    issueCount: 39,
    high: 0,
    medium: 0,
    low: 39,
    issue_counts_by_category: {
      'any-type': 23,
      'dead-state': 8,
      'prop-drilling': 11,
      'api-in-component': 7,
      'unused-import': 19,
    },
  },
]

export const MOCK_DRIFT_REPORT: DriftReport = {
  projectId: 'mock-storefront-app',
  totalSnapshots: 8,
  currentScore: 61,
  previousScore: 54,
  scoreDelta: 7,
  trends: [
    { category: 'any-type', slope: 2.8, direction: 'worsening', currentCount: 23, averageCount: 15.6 },
    { category: 'dead-state', slope: -1.1, direction: 'improving', currentCount: 8, averageCount: 10.2 },
    { category: 'prop-drilling', slope: 0.4, direction: 'stable', currentCount: 11, averageCount: 10.4 },
    { category: 'api-in-component', slope: 1.3, direction: 'worsening', currentCount: 7, averageCount: 4.8 },
    { category: 'unused-import', slope: 0.6, direction: 'worsening', currentCount: 19, averageCount: 17.2 },
  ],
  anomalies: [
    {
      category: 'any-type',
      type: 'spike',
      currentCount: 23,
      expectedCount: 9,
      deviationPercent: 156,
      severity: 'critical',
    },
    {
      category: 'api-in-component',
      type: 'spike',
      currentCount: 7,
      expectedCount: 2,
      deviationPercent: 250,
      severity: 'warning',
    },
  ],
  decayHotspots: [
    {
      filePath: 'src/components/ProductCard.tsx',
      fileName: 'ProductCard.tsx',
      appearances: 8,
      latestCount: 847,
      growthRate: 6.2,
      severity: 'critical',
    },
  ],
  alerts: [
    {
      alert_type: 'category_spike',
      severity: 'critical',
      message: 'any-type spiked by 14 occurrences in the latest commit burst (9 -> 23).',
      metadata: { category: 'any-type', delta: 14, before: 9, after: 23 },
    },
    {
      alert_type: 'decay_hotspot',
      severity: 'critical',
      message: 'ProductCard.tsx has grown to 847 lines and is now a maintenance hotspot.',
      metadata: { filePath: 'src/components/ProductCard.tsx', lines: 847 },
    },
    {
      alert_type: 'anomaly',
      severity: 'warning',
      message: '5 direct fetch() calls were detected inside components during the latest scan.',
      metadata: { category: 'api-in-component', current: 5, expected: 1 },
    },
  ],
}

export const MOCK_COMMITS: GitHubCommit[] = [
  {
    sha: 'a1c9f1d8b2e4a6c7d9e0f1a2b3c4d5e6f7a8b901',
    message: 'feat: add checkout flow',
    author: 'Lovable',
    date: daysAgo(1),
    url: 'https://github.com/lovable-labs/storefront-app/commit/a1c9f1d8b2e4a6c7d9e0f1a2b3c4d5e6f7a8b901',
  },
  {
    sha: 'b2d0e2f9c3a5b7d8e0f1a2b3c4d5e6f7a8b9c012',
    message: 'fix: cart state not updating',
    author: 'Bolt',
    date: daysAgo(3),
    url: 'https://github.com/lovable-labs/storefront-app/commit/b2d0e2f9c3a5b7d8e0f1a2b3c4d5e6f7a8b9c012',
  },
  {
    sha: 'c3e1f3a0d4b6c8e9f1a2b3c4d5e6f7a8b9c0d123',
    message: 'refactor: split ProductCard',
    author: 'Marta',
    date: daysAgo(5),
    url: 'https://github.com/lovable-labs/storefront-app/commit/c3e1f3a0d4b6c8e9f1a2b3c4d5e6f7a8b9c0d123',
  },
  {
    sha: 'd4f2a4b1e5c7d9f0a1b2c3d4e5f6a7b8c9d0e234',
    message: 'feat: wire product filters to search',
    author: 'Tiago',
    date: daysAgo(7),
    url: 'https://github.com/lovable-labs/storefront-app/commit/d4f2a4b1e5c7d9f0a1b2c3d4e5f6a7b8c9d0e234',
  },
  {
    sha: 'e5a3b5c2f6d8e0a1b2c3d4e5f6a7b8c9d0e1f345',
    message: 'fix: preserve session after refresh',
    author: 'Ana',
    date: daysAgo(10),
    url: 'https://github.com/lovable-labs/storefront-app/commit/e5a3b5c2f6d8e0a1b2c3d4e5f6a7b8c9d0e1f345',
  },
  {
    sha: 'f6b4c6d3a7e9f1b2c3d4e5f6a7b8c9d0e1f2a456',
    message: 'chore: tighten Tailwind classes in header',
    author: 'João',
    date: daysAgo(13),
    url: 'https://github.com/lovable-labs/storefront-app/commit/f6b4c6d3a7e9f1b2c3d4e5f6a7b8c9d0e1f2a456',
  },
]

export const MOCK_LAST_SNAPSHOT: MockSnapshot = MOCK_SNAPSHOTS[MOCK_SNAPSHOTS.length - 1]
export const MOCK_PREV_SNAPSHOT: MockSnapshot = MOCK_SNAPSHOTS[MOCK_SNAPSHOTS.length - 2]

export function isMockMode(): boolean {
  if (typeof window === 'undefined') return false
  if (!import.meta.env.DEV) return false
  const params = new URLSearchParams(window.location.search)
  return params.get('mock') === 'true'
}
