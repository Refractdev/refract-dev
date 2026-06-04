import fs from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

process.env.VITE_SUPABASE_URL ??= 'https://example.com'
process.env.VITE_SUPABASE_ANON_KEY ??= 'dummy'

type AnalysisIssue = {
  category: string
}

type Proposal = {
  type: string
}

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
const repoRoot = path.resolve(__dirname, '..')
const targetFile = path.join(repoRoot, 'src/pages/test/RefractTestTarget.tsx')

const expectedDetectors = [
  'any-type',
  'unsafe-cast',
  'dead-state',
  'effect-no-deps',
  'oversized-component',
  'state-explosion',
  'api-in-component',
  'missing-error-boundary',
  'memory-leak',
  'duplicate-logic',
] as const

function printHeader(title: string) {
  console.log('')
  console.log(title)
}

function summarizeCounts<T extends string>(items: readonly T[]) {
  const counts = new Map<string, number>()
  for (const item of items) {
    counts.set(item, (counts.get(item) ?? 0) + 1)
  }
  return counts
}

function fail(messages: string[]): never {
  console.error('REGRESSION FAILED')
  for (const message of messages) {
    console.error(`- ${message}`)
  }
  process.exitCode = 1
  throw new Error('Refract regression test failed')
}

async function main() {
  const [
    { runAnalysis },
    { runComponentDecomposition },
    { runStateConsolidation },
    { runImportCleanup },
    { runApiCentralization },
    { runModuleRestructuring },
    { runSafetyGate },
  ] = await Promise.all([
    import('../src/lib/analyze.ts'),
    import('../src/engine/transforms/componentDecomposition.ts'),
    import('../src/engine/transforms/stateConsolidation.ts'),
    import('../src/engine/transforms/importCleanup.ts'),
    import('../src/engine/transforms/apiCentralization.ts'),
    import('../src/engine/transforms/moduleRestructuring.ts'),
    import('../src/engine/safety/gate.ts'),
  ])

  const source = await fs.readFile(targetFile, 'utf8')
  const fileMap = new Map<string, string>([[targetFile, source]])

  printHeader(`[1/3] Running analysis on ${path.relative(repoRoot, targetFile)}`)
  const analysis = await runAnalysis(fileMap)
  const issueCategories = analysis.issues.map((issue: AnalysisIssue) => issue.category)
  const categoryCounts = summarizeCounts(issueCategories)

  printHeader(`[2/3] Generating refactor proposals`)
  const rawProposals = [
    ...(await runComponentDecomposition(fileMap, undefined)),
    ...(await runStateConsolidation(fileMap, undefined)),
    ...(await runImportCleanup(fileMap)),
    ...(await runApiCentralization(fileMap, undefined)),
    ...(await runModuleRestructuring(fileMap)),
  ] as Proposal[]

  const gatedProposals = rawProposals.map((proposal) => runSafetyGate(proposal, fileMap))
  const passed = gatedProposals.filter((proposal) => proposal.safetyResult?.passed)
  const rejected = gatedProposals.filter((proposal) => !proposal.safetyResult?.passed)

  printHeader(`[3/3] Checking regression expectations`)
  const failures: string[] = []

  if (analysis.summary.total < 40) {
    failures.push(`Expected at least 40 issues, got ${analysis.summary.total}`)
  }

  if (categoryCounts.size < 10) {
    failures.push(`Expected at least 10 detector categories, got ${categoryCounts.size}`)
  }

  for (const detector of expectedDetectors) {
    if ((categoryCounts.get(detector) ?? 0) === 0) {
      failures.push(`Expected detector "${detector}" to fire`)
    }
  }

  if (rawProposals.length !== 4) {
    failures.push(`Expected 4 proposals, got ${rawProposals.length}`)
  }

  if (passed.length !== 0) {
    failures.push(`Expected 0 proposals to pass safety gate, got ${passed.length}`)
  }

  if (rejected.length !== 4) {
    failures.push(`Expected 4 proposals to be rejected by safety gate, got ${rejected.length}`)
  }

  console.log(`Issues: ${analysis.summary.total} (${analysis.summary.high} high / ${analysis.summary.medium} medium / ${analysis.summary.low} low)`)
  console.log(`Detector categories: ${categoryCounts.size}`)
  console.log(`Proposals: ${rawProposals.length} total, ${passed.length} passed, ${rejected.length} rejected`)
  console.log('Category breakdown:')
  for (const [category, count] of [...categoryCounts.entries()].sort(([a], [b]) => a.localeCompare(b))) {
    console.log(`- ${category}: ${count}`)
  }

  if (failures.length > 0) {
    fail(failures)
  }

  console.log('REGRESSION PASSED')
  console.log('Expected detectors fired and proposal/safety counts match the baseline.')
}

main().catch((error: unknown) => {
  if (error instanceof Error && error.message === 'Refract regression test failed') {
    return
  }
  console.error('REGRESSION FAILED')
  console.error(error)
  process.exitCode = 1
})
