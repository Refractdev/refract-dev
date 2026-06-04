// RefractPatchTest.tsx — testa se os patches estão pre-computados

import React, { useState, useEffect, useRef } from 'react'
import { runAnalysis } from '../../lib/analyze'

const TEST_CODE = `
import React, { useState, useEffect } from 'react'
import axios from 'axios'
import { UnusedImport } from './unused'

export default function TestComponent({ userId, theme, config }: any) {
  const [data, setData] = useState<any>(null)
  const [loading, setLoading] = useState<any>(false)
  const [error, setError] = useState<any>(null)
  const [count, setCount] = useState<any>(0)
  const [filter, setFilter] = useState<any>('')
  const [deadValue, setDeadValue] = useState<any>('never used')

  useEffect(() => {
    fetch('/api/data').then(r => r.json()).then(setData)
  })

  useEffect(() => {
    console.log(filter)
  }, [])

  useEffect(() => {
    window.addEventListener('resize', () => setCount((c: any) => c + 1))
  }, [])

  return (
    <div>
      {loading && <span>Loading...</span>}
      {data?.items?.map((item: any) => <div key={item.id}>{item.name as string}</div>)}
    </div>
  )
}
`.trim()

export default function RefractPatchTest() {
  const [results, setResults] = useState<any>(null)
  const [running, setRunning] = useState(false)

  const run = async () => {
    setRunning(true)
    const fileMap = new Map([['src/TestComponent.tsx', TEST_CODE]])
    const result = await runAnalysis(fileMap)
    setResults(result)
    setRunning(false)
  }

  if (!results) {
    return (
      <div style={{ padding: 32, fontFamily: 'monospace' }}>
        <button onClick={run} disabled={running}>
          {running ? 'Running...' : 'Run Patch Test'}
        </button>
      </div>
    )
  }

  const issues = results.issues
  const withPatch = issues.filter((i: any) => i.patch?.after && !i.patch.after.trim().startsWith('//'))
  const withoutPatch = issues.filter((i: any) => !i.patch?.after || i.patch.after.trim().startsWith('//'))

  return (
    <div style={{ padding: 32, fontFamily: 'monospace', fontSize: 12 }}>
      <h2>Patch Pre-computation Test</h2>
      <p>Total issues: {issues.length}</p>
      <p style={{ color: 'green' }}>✓ With real patch: {withPatch.length}</p>
      <p style={{ color: 'orange' }}>○ No deterministic fix: {withoutPatch.length}</p>

      <h3 style={{ marginTop: 24 }}>Issues WITH patch (should have real code in after):</h3>
      {withPatch.map((i: any) => (
        <div key={i.id} style={{ marginBottom: 16, border: '1px solid #333', padding: 12 }}>
          <p style={{ color: 'green' }}>✓ [{i.category}] {i.file}:{i.lineStart}</p>
          <p style={{ color: '#aaa' }}>{i.problem}</p>
          <pre style={{ background: '#111', padding: 8, color: '#4ade80', whiteSpace: 'pre-wrap' }}>
            AFTER: {i.patch.after}
          </pre>
        </div>
      ))}

      <h3 style={{ marginTop: 24 }}>Issues WITHOUT patch (expected — no auto-fix possible):</h3>
      {withoutPatch.map((i: any) => (
        <div key={i.id} style={{ marginBottom: 8, padding: '6px 12px', background: '#111' }}>
          <span style={{ color: '#888' }}>○ [{i.category}] {i.file}:{i.lineStart} — {i.problem.slice(0, 80)}</span>
        </div>
      ))}
    </div>
  )
}

