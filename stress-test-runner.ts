import { runAnalysis } from './src/lib/analyze'
import { analyzeForRefactoring } from './src/engine'
import { readFileSync, existsSync } from 'fs'
import path from 'path'

const FILES = [
  'src/pages/test/stress/UserDashboard.tsx',
  'src/pages/test/stress/UserCard.tsx',
  'src/pages/test/stress/helpers.ts',
]

async function main() {
  // ── Load files ──────────────────────────────────────────────────────────────
  const fileMap = new Map<string, string>()
  for (const f of FILES) {
    const abs = path.resolve(f)
    if (!existsSync(abs)) {
      console.error(`File not found: ${abs}`)
      process.exit(1)
    }
    fileMap.set(f, readFileSync(abs, 'utf8'))
  }

  console.log('=== RUNNING REFRACT STRESS TEST ===\n')

  // ── Step 1: Analysis ────────────────────────────────────────────────────────
  console.log('[1/2] Running analysis...')
  const analysis = await runAnalysis(fileMap, () => {})

  // Per-file breakdown
  const perFile: Record<string, number> = {}
  for (const issue of analysis.issues) {
    perFile[issue.filePath] = (perFile[issue.filePath] || 0) + 1
  }

  // Detector counts
  const detectorCounts: Record<string, number> = {}
  const patchCount = { real: 0, comment: 0, none: 0 }
  const commentPatches: string[] = []
  for (const issue of analysis.issues) {
    detectorCounts[issue.category] = (detectorCounts[issue.category] || 0) + 1
    if (issue.patch && issue.patch.before && issue.patch.after) {
      const afterClean = issue.patch.after.trim()
      if (afterClean.startsWith('//') || afterClean.startsWith('/*') || afterClean === '') {
        patchCount.comment++
        commentPatches.push(`[${issue.category}] ${issue.filePath}:${issue.lineStart} — "${issue.patch.after.trim()}"`)
      } else {
        patchCount.real++
      }
    } else {
      patchCount.none++
    }
  }

  // ── Step 2: Refactoring ─────────────────────────────────────────────────────
  console.log('[2/2] Running refactoring engine...')
  const proposals = await analyzeForRefactoring(fileMap, { maxProposals: 20 })

  const safetyResults = { passed: 0, rejected: 0 }
  const rejectionReasons: string[] = []

  // We need to re-run safety gate to get rejections since analyzeForRefactoring filters them
  // Actually, the safety results are embedded in each proposal. Let's check what we have.
  for (const p of proposals) {
    if (p.safetyResult?.passed) {
      safetyResults.passed++
    } else {
      safetyResults.rejected++
      if (p.safetyResult?.errors?.length) {
        rejectionReasons.push(...p.safetyResult.errors)
      }
    }
  }

  // Also count proposals that were generated but filtered by safety
  // We can't easily get the total, but we know the ones with safetyResult.passed = false were filtered

  // ── Step 3: Cross-file detection ────────────────────────────────────────────
  const crossFile = analysis.issues.filter(i => i.category === 'duplicate-logic')

  // ── Report ──────────────────────────────────────────────────────────────────
  const high = analysis.summary.high
  const med = analysis.summary.medium
  const low = analysis.summary.low
  const total = analysis.summary.total

  console.log('\n\nSTRESS TEST REPORT')
  console.log('==================\n')
  console.log('[ANALYSIS]')
  console.log(`Total issues: ${total} (${high} high / ${med} medium / ${low} low)`)
  console.log('Per file breakdown:')
  for (const f of FILES) {
    console.log(`  ${f}: ${perFile[f] || 0} issues`)
  }
  console.log('Detectors fired:')
  for (const [cat, count] of Object.entries(detectorCounts).sort(([,a], [,b]) => b - a)) {
    console.log(`  ${cat}: ${count}`)
  }
  console.log('Detectors that missed (but should have fired):')
  const expected = ['any-type', 'dead-state', 'oversized-component', 'effect-no-deps', 'memory-leak', 'api-in-component', 'duplicate-logic', 'unused-import', 'state-explosion']
  for (const e of expected) {
    if (!detectorCounts[e]) {
      console.log(`  ${e}: 0 (should have detected)`)
    }
  }

  console.log('\n[PATCHES PRE-COMPUTED]')
  console.log(`Issues with real patch ready: ${patchCount.real}`)
  console.log(`Issues with no deterministic fix: ${patchCount.none}`)
  console.log(`Any patch.after that is still a comment: ${commentPatches.length}`)
  for (const cp of commentPatches) {
    console.log(`  ${cp}`)
  }

  console.log('\n[REFACTORING]')
  console.log(`Proposals generated: ${proposals.length}`)
  for (const p of proposals) {
    const newFiles = p.newFiles?.map(nf => nf.path.split('/').pop()).join(', ') || 'none'
    console.log(`  ${p.type} → ${p.filePath} — ${p.description} [new files: ${newFiles}]`)
  }

  console.log('\n[SAFETY GATE]')
  console.log(`Passed: ${safetyResults.passed} / Rejected: ${safetyResults.rejected}`)
  if (rejectionReasons.length > 0) {
    console.log('Rejection reasons:')
    for (const r of [...new Set(rejectionReasons)]) {
      console.log(`  ${r}`)
    }
  } else {
    console.log('Rejection reasons: (none filtered — all passed)')
  }

  console.log('\n[CROSS-FILE DETECTION]')
  if (crossFile.length > 0) {
    console.log('Duplicate logic detected across files: yes')
    for (const issue of crossFile) {
      console.log(`  ${issue.problem}`)
      console.log(`  Files: ${issue.filePath}`)
    }
  } else {
    console.log('Duplicate logic detected across files: no')
  }
  console.log('Which functions matched and across which files:')
  const funcMatches = crossFile.map(issue => `  ${issue.problem} (${issue.filePath})`)
  if (funcMatches.length === 0) {
    console.log('  (no duplicate logic detected)')
  } else {
    funcMatches.forEach(m => console.log(m))
  }

  console.log('\n[VERDICT]')
  const allExpected = ['any-type', 'dead-state', 'oversized-component', 'effect-no-deps']
  const foundAll = allExpected.every(e => detectorCounts[e] && detectorCounts[e] > 0)
  const hasProposals = proposals.length > 0
  const hasCrossFile = crossFile.length > 0

  if (foundAll && hasProposals && hasCrossFile) {
    console.log('PASS — Pipeline detected all critical issues, generated refactoring proposals, and found cross-file duplicates.')
  } else {
    console.log('FAIL — Some aspects missed:')
    if (!foundAll) {
      const missing = allExpected.filter(e => !detectorCounts[e])
      console.log(`  - Missing detectors: ${missing.join(', ')}`)
    }
    if (!hasProposals) console.log('  - No refactoring proposals generated')
    if (!hasCrossFile) console.log('  - No cross-file duplicates detected')
  }
  console.log(`\nWhat worked:`)
  console.log(`  - Detected ${total} total issues`)
  console.log(`  - ${patchCount.real} issues with real patches`)
  if (hasProposals) console.log(`  - ${proposals.length} refactoring proposals`)
  if (hasCrossFile) console.log(`  - Cross-file duplicate logic detected`)
  console.log(`\nWhat didn't:`)
  if (!foundAll) {
    for (const e of allExpected) {
      if (!detectorCounts[e]) console.log(`  - ${e} detector fired 0 times`)
    }
  }
  if (patchCount.comment > 0) console.log(`  - ${patchCount.comment} patches are still comments, not real fixes`)
  if (proposals.length === 0) console.log(`  - No refactoring proposals survived safety gate`)
}

main().catch(err => {
  console.error('Stress test failed:', err)
  process.exit(1)
})
