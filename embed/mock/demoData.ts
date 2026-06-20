import type { DemoIssue, DemoProject, HealthSnapshot, DriftReport, GitHubCommit } from '../shared/types'

const DAY = 24 * 60 * 60 * 1000
const now = Date.now()
const daysAgo = (days: number): string => new Date(now - days * DAY).toISOString()

export const DEMO_PROJECT: DemoProject = {
  id: 'mock-storefront-app',
  name: 'storefront-app',
  path: '~/code/storefront-app',
  repo: 'https://github.com/lovable-labs/storefront-app',
  branch: 'main',
  last_run: daysAgo(1),
}

export const DEMO_ISSUES: DemoIssue[] = [
  {
    id: 'issue-1',
    file: 'ProductCard.tsx',
    filePath: 'src/components/ProductCard.tsx',
    category: 'any-type',
    problem: 'Untyped props object bypasses TypeScript safety',
    impact: 'High',
    lineStart: 14,
    lineEnd: 18,
    lines: {
      before: [
        'function ProductCard(props: any) {',
        '  const { title, price, imageUrl } = props',
        '  return (',
        '    <div className="card">',
        '      <img src={imageUrl} alt={title} />',
      ],
      after: [
        'interface ProductCardProps {',
        '  title: string',
        '  price: number',
        '  imageUrl: string',
        '}',
        'function ProductCard({ title, price, imageUrl }: ProductCardProps) {',
        '  return (',
        '    <div className="card">',
        '      <img src={imageUrl} alt={title} />',
      ],
    },
    effort: 'low',
    blastRadius: 3,
    priority: 95,
    explanation: 'Using `any` for props disables type checking across the component tree. Any change to the parent can silently break ProductCard at runtime without compile-time warnings.',
  },
  {
    id: 'issue-2',
    file: 'CartPage.tsx',
    filePath: 'src/pages/CartPage.tsx',
    category: 'prop-drilling',
    problem: 'Cart state passed through 4 intermediate components',
    impact: 'Medium',
    lineStart: 42,
    lineEnd: 46,
    lines: {
      before: [
        '<Layout cart={cart} setCart={setCart}>',
        '  <Sidebar cart={cart} setCart={setCart} />',
        '  <Main cart={cart} setCart={setCart} />',
        '</Layout>',
      ],
      after: [
        '<CartProvider>',
        '  <Layout>',
        '    <Sidebar />',
        '    <Main />',
        '  </Layout>',
        '</CartProvider>',
      ],
    },
    effort: 'medium',
    blastRadius: 5,
    priority: 78,
    explanation: 'Prop drilling makes refactors brittle — every intermediate component must know about cart state even when it does not use it. A context provider colocates state with consumers.',
  },
  {
    id: 'issue-3',
    file: 'CheckoutForm.tsx',
    filePath: 'src/components/CheckoutForm.tsx',
    category: 'dead-state',
    problem: 'Unused useState hook adds unnecessary re-renders',
    impact: 'Medium',
    lineStart: 8,
    lineEnd: 9,
    lines: {
      before: [
        'const [promoCode, setPromoCode] = useState("")',
        'const [unusedFlag, setUnusedFlag] = useState(false)',
      ],
      after: [
        'const [promoCode, setPromoCode] = useState("")',
      ],
    },
    effort: 'low',
    priority: 62,
    explanation: 'Dead state triggers re-renders when set but is never read. Removing it reduces component update surface and simplifies mental model for future contributors.',
  },
  {
    id: 'issue-4',
    file: 'SearchBar.tsx',
    filePath: 'src/components/SearchBar.tsx',
    category: 'api-in-component',
    problem: 'Direct fetch() inside component bypasses data layer',
    impact: 'High',
    lineStart: 22,
    lineEnd: 26,
    lines: {
      before: [
        'useEffect(() => {',
        '  fetch("/api/products?q=" + query)',
        '    .then(r => r.json())',
        '    .then(setResults)',
        '}, [query])',
      ],
      after: [
        'const { data: results } = useProductSearch(query)',
      ],
    },
    effort: 'medium',
    blastRadius: 2,
    priority: 88,
    explanation: 'API calls embedded in UI components are hard to test, cache, and reuse. Centralising in a hook or data layer enables consistent error handling and request deduplication.',
  },
  {
    id: 'issue-5',
    file: 'Header.tsx',
    filePath: 'src/components/Header.tsx',
    category: 'unused-import',
    problem: 'Three unused imports increase bundle size',
    impact: 'Low',
    lineStart: 1,
    lineEnd: 3,
    lines: {
      before: [
        'import { useMemo, useCallback, useRef } from "react"',
        'import { Search, Filter, Settings } from "lucide-react"',
      ],
      after: [
        'import { Search } from "lucide-react"',
      ],
    },
    effort: 'low',
    priority: 40,
    explanation: 'Unused imports clutter the module graph and can prevent tree-shaking from eliminating dead code paths in production builds.',
  },
]

export const DEMO_FILES = [
  { path: 'src/components/ProductCard.tsx', name: 'ProductCard.tsx', isDirectory: false },
  { path: 'src/pages/CartPage.tsx', name: 'CartPage.tsx', isDirectory: false },
  { path: 'src/components/CheckoutForm.tsx', name: 'CheckoutForm.tsx', isDirectory: false },
  { path: 'src/components/SearchBar.tsx', name: 'SearchBar.tsx', isDirectory: false },
  { path: 'src/components/Header.tsx', name: 'Header.tsx', isDirectory: false },
  { path: 'src/components', name: 'components', isDirectory: true },
  { path: 'src/pages', name: 'pages', isDirectory: true },
]

export const DEMO_SNAPSHOTS: HealthSnapshot[] = [
  { score: 48, timestamp: daysAgo(30), issueCount: 52, high: 0, medium: 0, low: 52 },
  { score: 50, timestamp: daysAgo(26), issueCount: 50, high: 0, medium: 0, low: 50 },
  { score: 57, timestamp: daysAgo(22), issueCount: 43, high: 0, medium: 0, low: 43 },
  { score: 66, timestamp: daysAgo(18), issueCount: 34, high: 0, medium: 0, low: 34 },
  { score: 74, timestamp: daysAgo(14), issueCount: 26, high: 0, medium: 0, low: 26 },
  { score: 58, timestamp: daysAgo(10), issueCount: 42, high: 0, medium: 0, low: 42 },
  { score: 54, timestamp: daysAgo(5), issueCount: 46, high: 0, medium: 0, low: 46 },
  { score: 61, timestamp: daysAgo(1), issueCount: 39, high: 0, medium: 0, low: 39 },
]

export const DEMO_LAST_SNAPSHOT = DEMO_SNAPSHOTS[DEMO_SNAPSHOTS.length - 1]
export const DEMO_PREV_SNAPSHOT = DEMO_SNAPSHOTS[DEMO_SNAPSHOTS.length - 2]

export const DEMO_DRIFT_REPORT: DriftReport = {
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
      message: 'any-type spiked by 14 occurrences in the latest commit burst (9 → 23).',
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

export const DEMO_COMMITS: GitHubCommit[] = [
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
]

export function getScoreColor(score: number): string {
  if (score >= 80) return 'var(--semantic-success)'
  if (score >= 55) return 'var(--timeline-done)'
  return 'var(--semantic-error)'
}

export function getDelta(current?: HealthSnapshot, prev?: HealthSnapshot): number | null {
  if (!current || !prev) return null
  return current.score - prev.score
}

export function relativeDate(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime()
  const day = Math.floor(diff / (24 * 60 * 60 * 1000))
  if (day < 1) return 'just now'
  if (day === 1) return '1 day ago'
  if (day < 7) return `${day} days ago`
  const week = Math.floor(day / 7)
  return week === 1 ? '1 week ago' : `${week} weeks ago`
}

export function formatDate(dateStr: string): string {
  return new Date(dateStr).toLocaleDateString('en-US')
}
