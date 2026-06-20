import React, { useEffect, useState, useCallback, useMemo } from 'react'
import {
  ReactFlow,
  Background,
  Controls,
  MiniMap,
  Node,
  Edge,
  Handle,
  Position,
  useNodesState,
  useEdgesState,
  BackgroundVariant,
  useReactFlow,
  ReactFlowProvider,
} from '@xyflow/react'
import '@xyflow/react/dist/style.css'
import dagre from 'dagre'
import { FileCode, FileText, Package, AlertTriangle, CheckCircle, AlertCircle, ExternalLink, Activity, Info, TrendingUp } from 'lucide-react'
import type { AnalysisIssue } from '../../shared/types'
import { useTranslation } from '../../hooks/useTranslation'
import type { Decision } from './types'

// ─── Constants ────────────────────────────────────────────────────────────────
// CodeMap is a dark visualization widget regardless of app theme — CSS vars resolve
// from the dark theme context injected on the wrapper element.
const C = {
  bg:      'var(--canvas)',
  surface: 'var(--card)',
  border:  'var(--hairline)',
  blue:    'var(--primary)',
  muted:   'var(--ink-muted)',
  text:    'var(--ink)',
  green:   'var(--semantic-success)',
  yellow:  'var(--semantic-warning)',
  red:     'var(--semantic-error)',
  subtle:  'var(--surface-strong)',
}

// ─── Layout ───────────────────────────────────────────────────────────────────
function applyDagreLayout(nodes: Node[], edges: Edge[]): Node[] {
  const g = new dagre.graphlib.Graph()
  g.setDefaultEdgeLabel(() => ({}))
  g.setGraph({ rankdir: 'TB', ranksep: 120, nodesep: 80 })

  nodes.forEach(n => g.setNode(n.id, { width: 220, height: 80 }))
  edges.forEach(e => g.setEdge(e.source, e.target))

  dagre.layout(g)

  return nodes.map(n => {
    const pos = g.node(n.id)
    return { 
      ...n, 
      position: { 
        x: pos?.x != null ? pos.x - 110 : 0, 
        y: pos?.y != null ? pos.y - 40 : 0 
      } 
    }
  })
}

// ─── Health helpers ───────────────────────────────────────────────────────────
type Health = 'good' | 'warning' | 'critical'

const path = {
  posix: {
    join: (...parts: string[]) => parts.join('/').replace(/\/+/g, '/'),
  },
  basename: (p: string) => p.replace(/\\/g, '/').split('/').pop() ?? p,
}

function issueMatchesFile(issue: AnalysisIssue, relativeNodePath: string, projectPath: string): boolean {
  const norm = (s: string) => s.replace(/\\/g, '/').toLowerCase()
  const absExpected = norm(path.posix.join(projectPath.replace(/\\/g, '/'), relativeNodePath))
  const absIssue = norm(issue.filePath.replace(/\\/g, '/'))
  return absExpected === absIssue || absIssue.endsWith('/' + norm(relativeNodePath))
}

function getHealth(relativeNodePath: string, issues: AnalysisIssue[], projectPath: string): Health {
  const fileIssues = issues.filter(i => issueMatchesFile(i, relativeNodePath, projectPath))
  if (fileIssues.length === 0) return 'good'
  if (fileIssues.some(i => i.impact === 'High')) return 'critical'
  return 'warning'
}

function getFileIssues(relativeNodePath: string, issues: AnalysisIssue[], projectPath: string): AnalysisIssue[] {
  return issues.filter(i => issueMatchesFile(i, relativeNodePath, projectPath))
}

const HEALTH_COLOR: Record<Health, string> = {
  good:     C.green,
  warning:  C.yellow,
  critical: C.red,
}

const HEALTH_BG: Record<Health, string> = {
  good:     'color-mix(in srgb, var(--semantic-success) 12%, transparent)',
  warning:  'color-mix(in srgb, var(--semantic-warning) 12%, transparent)',
  critical: 'color-mix(in srgb, var(--semantic-error) 12%, transparent)',
}

// ─── Custom Node ──────────────────────────────────────────────────────────────
const FileNode = ({ data }: { data: any }) => {
  const { label, health, issueCount, selected, isolated } = data
  const fileName = path.basename(label)
  const isComponent = /\.(tsx|jsx)$/.test(fileName)
  const isType = /\.ts$/.test(fileName) && !isComponent
  const color = HEALTH_COLOR[health as Health]
  const bg = HEALTH_BG[health as Health]

  return (
    <div style={{
      background: selected ? bg : C.surface,
      border: `1px solid ${selected ? color : health === 'good' ? C.border : color}`,
      borderRadius: 8,
      padding: '10px 14px',
      minWidth: 200,
      maxWidth: 240,
      display: 'flex',
      alignItems: 'center',
      gap: 10,
      boxShadow: health !== 'good' ? `0 0 15px ${color}15` : 'none',
      opacity: isolated ? 0.4 : 1,
      transition: 'all 0.2s cubic-bezier(0.4, 0, 0.2, 1)',
      cursor: 'pointer',
    }}>
      <Handle type="target" position={Position.Top} style={{ background: 'var(--hairline)', border: 'none', width: 6, height: 6 }} />

      <div style={{ width: 32, height: 32, borderRadius: 8, background: 'var(--surface-strong)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
        {isComponent
          ? <FileCode size={16} color={color} />
          : isType
          ? <Package size={16} color={C.blue} />
          : <FileText size={16} color={C.muted} />
        }
      </div>

      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 12, fontWeight: 500, color: C.text, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {fileName}
        </div>
        <div style={{ fontSize: 10, color: C.muted, fontFamily: 'monospace', opacity: 0.6, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {label}
        </div>
      </div>

      {health !== 'good' && (
        <div style={{ flexShrink: 0, display: 'flex', alignItems: 'center', gap: 4, background: `${color}15`, padding: '2px 6px', borderRadius: 4 }}>
          {health === 'critical'
            ? <AlertTriangle size={12} color={C.red} />
            : <AlertCircle size={12} color={C.yellow} />
          }
          <span style={{ fontSize: 10, color, fontWeight: 700 }}>{issueCount}</span>
        </div>
      )}

      <Handle type="source" position={Position.Bottom} style={{ background: 'var(--hairline)', border: 'none', width: 6, height: 6 }} />
    </div>
  )
}

interface BlastRadiusInfo {
  level1: number
  level2: number
  total: number
}

// ─── Internal Component ───────────────────────────────────────────────────────
const CodeMapInner: React.FC<CodeMapProps & {
  decisions?: Record<string, Decision>
  onAcceptIssue?: (issue: AnalysisIssue) => void
  onRejectIssue?: (issue: AnalysisIssue) => void
}> = ({ projectPath, issues, dependencies, onNavigateToIssue, decisions = {}, onAcceptIssue, onRejectIssue }) => {
  const { t } = useTranslation()
  const { fitView } = useReactFlow()
  const [nodes, setNodes, onNodesChange] = useNodesState<Node>([])
  const [edges, setEdges, onEdgesChange] = useEdgesState<Edge>([])
  const [selectedFile, setSelectedFile] = useState<string | null>(null)
  const [selectedIssues, setSelectedIssues] = useState<AnalysisIssue[]>([])
  const [blastRadiusInfo, setBlastRadiusInfo] = useState<BlastRadiusInfo | null>(null)
  const [unresolvedCount, setUnresolvedCount] = useState(0)
  const [truncated, setTruncated] = useState(false)

  const nodeTypes = useMemo(() => ({ file: FileNode }), [])

  // Build Chronological Snapshots layout
  useEffect(() => {
    if (!dependencies || Object.keys(dependencies).length === 0) return

    const nodeList: Node[] = []
    const edgeList: Edge[] = []
    const seen = new Set<string>()
    let unresolved = 0

    for (const [source, targets] of Object.entries(dependencies)) {
      if (!seen.has(source)) {
        const health = getHealth(source, issues, projectPath || '')
        const fileIssues = getFileIssues(source, issues, projectPath || '')
        seen.add(source)
        nodeList.push({
          id: source,
          type: 'file',
          position: { x: 0, y: 0 },
          data: { label: source, health, issueCount: fileIssues.length, selected: false, isolated: false },
        })
      }
      for (const target of targets) {
        if (!target) { unresolved++; continue }
        if (!seen.has(target)) {
          const health = getHealth(target, issues, projectPath || '')
          const fileIssues = getFileIssues(target, issues, projectPath || '')
          seen.add(target)
          nodeList.push({
            id: target,
            type: 'file',
            position: { x: 0, y: 0 },
            data: { label: target, health, issueCount: fileIssues.length, selected: false, isolated: false },
          })
        }
        edgeList.push({
          id: `${source}->${target}`,
          source,
          target,
          style: { stroke: 'var(--hairline)', strokeWidth: 1, opacity: 0.8 },
        })
      }
    }

    const laidOut = applyDagreLayout(nodeList, edgeList)
    setNodes(laidOut)
    setEdges(edgeList)
    setUnresolvedCount(unresolved)
    if (seen.size > 200) setTruncated(true)
  }, [dependencies, issues, projectPath])

  const buildReverseMap = useCallback((deps: Record<string, string[]>): Map<string, string[]> => {
    const rev = new Map<string, string[]>()
    for (const [src, targets] of Object.entries(deps)) {
      for (const t of targets) {
        if (!rev.has(t)) rev.set(t, [])
        rev.get(t)!.push(src)
      }
    }
    return rev
  }, [])

  // Programmatic select node + Blast Radius flow highlighting + Focus viewport
  const selectFileNode = useCallback((fileId: string) => {
    const fileIssues = projectPath ? getFileIssues(fileId, issues, projectPath) : []
    setSelectedFile(fileId)
    setSelectedIssues(fileIssues)

    if (dependencies) {
      const reverseDeps = buildReverseMap(dependencies)
      const level1 = reverseDeps.get(fileId) ?? []
      const level2 = level1.flatMap(f => reverseDeps.get(f) ?? [])
      const affected = new Set([fileId, ...level1, ...level2])

      setBlastRadiusInfo({
        level1: level1.length,
        level2: level2.length,
        total: affected.size,
      })

      // Dim isolated nodes
      setNodes((ns) => ns.map((n) => ({
        ...n,
        data: { ...n.data, selected: n.id === fileId, isolated: !affected.has(n.id) },
      })))

      // Map dynamic visual flow along active blast radius path with flow animations
      const activeEdges = new Set<string>()
      for (const l1 of level1) {
        activeEdges.add(`${l1}->${fileId}`)
      }
      for (const l1 of level1) {
        const l2s = reverseDeps.get(l1) ?? []
        for (const l2 of l2s) {
          activeEdges.add(`${l2}->${l1}`)
        }
      }

      setEdges((es) => es.map((e) => {
        const isActive = activeEdges.has(e.id)
        const isImpactCritical = fileIssues.some(i => i.impact === 'High')
        const glowColor = isImpactCritical ? C.red : C.yellow
        return {
          ...e,
          style: {
            ...e.style,
            stroke: isActive ? glowColor : '#333',
            strokeWidth: isActive ? 2.5 : 1,
            opacity: isActive ? 1 : 0.15,
          },
          animated: isActive,
        }
      }))
    } else {
      setBlastRadiusInfo(null)
      setNodes((ns) => ns.map((n) => ({
        ...n,
        data: { ...n.data, selected: n.id === fileId, isolated: false },
      })))
      setEdges((es) => es.map((e) => ({
        ...e,
        style: { ...e.style, stroke: 'var(--hairline)', strokeWidth: 1, opacity: 0.8 },
        animated: false,
      })))
    }

    // Centering with animation using React Flow fitView
    setTimeout(() => {
      fitView({ nodes: [{ id: fileId } as Node], duration: 800, maxZoom: 1 })
    }, 50)
  }, [issues, projectPath, setNodes, setEdges, dependencies, buildReverseMap, fitView])

  const onNodeClick = useCallback((_: any, node: Node) => {
    selectFileNode(node.id)
  }, [selectFileNode])

  // Reset graph selection
  const clearSelection = useCallback(() => {
    setSelectedFile(null)
    setSelectedIssues([])
    setBlastRadiusInfo(null)
    setNodes((ns) => ns.map((n) => ({
      ...n,
      data: { ...n.data, selected: false, isolated: false },
    })))
    setEdges((es) => es.map((e) => ({
      ...e,
      style: { ...e.style, stroke: 'var(--hairline)', strokeWidth: 1, opacity: 0.8 },
      animated: false,
    })))
    fitView({ duration: 800 })
  }, [setNodes, setEdges, fitView])

  // Calculate Architectural Hotspots when selectedFile === null
  const hotspots = useMemo(() => {
    if (nodes.length === 0) return []
    const list = nodes.map(node => {
      const fileIssues = projectPath ? getFileIssues(node.id, issues, projectPath) : []
      const high = fileIssues.filter(i => i.impact === 'High').length
      const medium = fileIssues.filter(i => i.impact === 'Medium').length
      const low = fileIssues.filter(i => i.impact === 'Low').length
      const score = (high * 3) + (medium * 2) + (low * 1)
      return {
        id: node.id,
        label: String(node.data?.label || ''),
        issues: fileIssues,
        score,
        high,
        medium,
        low,
      }
    })
    return list.filter(h => h.score > 0).sort((a, b) => b.score - a.score).slice(0, 5)
  }, [nodes, issues, projectPath])

  const isEmpty = !dependencies || Object.keys(dependencies).length === 0

  if (isEmpty) return (
    <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', background: C.bg, color: C.muted, fontSize: 12 }}>
      {t('projectView.noGraph')}
    </div>
  )

  return (
    <div style={{ flex: 1, height: '100%', background: C.bg, position: 'relative' }}>
      {(truncated || unresolvedCount > 0) && (
        <div style={{ position: 'absolute', top: 16, left: 16, zIndex: 100, background: C.surface, border: `1px solid ${C.border}`, borderRadius: 8, padding: '8px 10px', color: C.muted, fontSize: 11 }}>
          {truncated && <div>Partial map: file limit reached.</div>}
          {unresolvedCount > 0 && <div>{unresolvedCount} unresolved import(s).</div>}
        </div>
      )}
      <ReactFlow
        nodes={nodes}
        edges={edges}
        nodeTypes={nodeTypes}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        onNodeClick={onNodeClick}
        minZoom={0.05}
        maxZoom={2}
        proOptions={{ hideAttribution: true }}
      >
        <Background color="var(--hairline)" gap={24} variant={BackgroundVariant.Dots} />
        <Controls showInteractive={false} style={{ background: C.surface, border: `1px solid ${C.border}` }} />
        <MiniMap style={{ background: C.surface, border: `1px solid ${C.border}` }} nodeColor={(n: any) => HEALTH_COLOR[n.data.health as Health]} />
      </ReactFlow>

      {/* Selected Node Sidebar Panel */}
      {selectedFile ? (
        <div style={{ position: 'absolute', top: 16, right: 16, background: C.surface, border: `1px solid ${C.border}`, borderRadius: 8, padding: 16, width: 300, zIndex: 100, boxShadow: '0 10px 30px rgba(0,0,0,0.5)', display: 'flex', flexDirection: 'column', maxHeight: 'calc(100% - 32px)', overflowY: 'auto' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
            <span style={{ fontSize: 10, color: C.muted, textTransform: 'uppercase', letterSpacing: 1 }}>Selected File</span>
            <button 
              onClick={clearSelection}
              style={{ background: 'none', border: 'none', color: C.blue, fontSize: 11, cursor: 'pointer', padding: 0 }}
            >
              Clear
            </button>
          </div>
          <p style={{ fontSize: 12, color: C.text, fontWeight: 600, marginBottom: 12, wordBreak: 'break-all', fontFamily: 'monospace' }}>{selectedFile}</p>

          {/* Blast Radius Info */}
          {blastRadiusInfo && (
            <div style={{ borderTop: `1px solid ${C.border}`, paddingTop: 12, marginBottom: 12 }}>
              <p style={{ fontSize: 10, color: C.muted, textTransform: 'uppercase', letterSpacing: 1, marginBottom: 8 }}>Blast Radius</p>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                <div style={{ background: 'var(--surface-strong)', borderRadius: 6, padding: '8px 10px', textAlign: 'center' }}>
                  <span style={{ fontSize: 16, fontWeight: 700, color: C.text }}>{blastRadiusInfo.level1}</span>
                  <p style={{ fontSize: 9, color: C.muted, margin: 0 }}>Level 1 (direct)</p>
                </div>
                <div style={{ background: 'var(--surface-strong)', borderRadius: 6, padding: '8px 10px', textAlign: 'center' }}>
                  <span style={{ fontSize: 16, fontWeight: 700, color: C.text }}>{blastRadiusInfo.level2}</span>
                  <p style={{ fontSize: 9, color: C.muted, margin: 0 }}>Level 2 (indirect)</p>
                </div>
              </div>
              <p style={{ fontSize: 11, color: C.muted, textAlign: 'center', marginTop: 6 }}>
                {blastRadiusInfo.total} file(s) affected
              </p>
            </div>
          )}
          
          {/* Real Workspace Actions & Issues List */}
          <div style={{ borderTop: `1px solid ${C.border}`, paddingTop: 12 }}>
            <p style={{ fontSize: 10, color: C.muted, textTransform: 'uppercase', letterSpacing: 1, marginBottom: 8 }}>File Issues</p>
            
            {selectedIssues.length === 0 ? (
              <div style={{ background: 'color-mix(in srgb, var(--semantic-success) 8%, transparent)', border: `1px solid color-mix(in srgb, var(--semantic-success) 25%, transparent)`, borderRadius: 6, padding: 12, display: 'flex', alignItems: 'center', gap: 8 }}>
                <CheckCircle size={14} color={C.green} />
                <span style={{ fontSize: 11, color: C.green, fontWeight: 500 }}>No issues in this file</span>
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {selectedIssues.map(i => {
                  const decision = decisions[i.id]
                  return (
                    <div key={i.id} style={{ display: 'flex', flexDirection: 'column', gap: 6, background: 'var(--surface-strong)', border: `1px solid ${C.border}`, borderRadius: 6, padding: 10 }}>
                      <div style={{ display: 'flex', gap: 6, alignItems: 'flex-start' }}>
                        <div style={{ width: 6, height: 6, borderRadius: '50%', background: i.impact === 'High' ? C.red : C.yellow, marginTop: 4, flexShrink: 0 }} />
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <p style={{ fontSize: 11, color: 'var(--ink-muted)', lineHeight: 1.4, margin: 0 }}>{i.problem}</p>
                          <p style={{ fontSize: 9, color: C.muted, fontFamily: 'monospace', margin: '2px 0 0 0' }}>L{i.lineStart}–{i.lineEnd} · {i.impact}</p>
                        </div>
                      </div>
                      
                      {/* Real decisions accept/reject buttons */}
                      <div style={{ display: 'flex', gap: 6, alignItems: 'center', marginTop: 4, borderTop: `1px solid ${C.border}`, paddingTop: 6 }}>
                        {decision ? (
                          <span style={{ 
                            fontSize: 10, 
                            fontWeight: 600, 
                            color: decision === 'accepted' ? C.green : C.red,
                            background: decision === 'accepted' ? 'rgba(74,222,128,0.1)' : 'rgba(239,68,68,0.1)',
                            padding: '2px 6px',
                            borderRadius: 4,
                          }}>
                            {decision === 'accepted' ? '✓ Accepted' : '✗ Rejected'}
                          </span>
                        ) : (
                          <>
                            {onAcceptIssue && (
                              <button
                                onClick={(e) => { e.stopPropagation(); onAcceptIssue(i) }}
                                style={{ 
                                  background: 'color-mix(in srgb, var(--semantic-success) 12%, transparent)', 
                                  border: '1px solid color-mix(in srgb, var(--semantic-success) 30%, transparent)', 
                                  color: C.green,
                                  borderRadius: 4, 
                                  padding: '2px 8px', 
                                  cursor: 'pointer', 
                                  fontSize: 10,
                                  fontWeight: 600,
                                  transition: 'all 0.12s ease'
                                }}
                              >
                                Accept
                              </button>
                            )}
                            {onRejectIssue && (
                              <button
                                onClick={(e) => { e.stopPropagation(); onRejectIssue(i) }}
                                style={{ 
                                  background: 'color-mix(in srgb, var(--semantic-error) 12%, transparent)', 
                                  border: '1px solid color-mix(in srgb, var(--semantic-error) 30%, transparent)', 
                                  color: C.red,
                                  borderRadius: 4, 
                                  padding: '2px 8px', 
                                  cursor: 'pointer', 
                                  fontSize: 10,
                                  fontWeight: 600,
                                  transition: 'all 0.12s ease'
                                }}
                              >
                                Reject
                              </button>
                            )}
                          </>
                        )}
                        
                        {onNavigateToIssue && (
                          <button
                            onClick={(e) => { e.stopPropagation(); onNavigateToIssue(i.id) }}
                            className="btn btn-ghost"
                            style={{ marginLeft: 'auto', padding: '2px 6px', display: 'flex', alignItems: 'center', gap: 3, fontSize: 9, height: 'auto' }}
                          >
                            <ExternalLink size={9} />
                            View
                          </button>
                        )}
                      </div>
                    </div>
                  )
                })}
              </div>
            )}
          </div>
        </div>
      ) : (
        /* Architectural Risk Dashboard Sidebar (overview initial state) */
        <div style={{ position: 'absolute', top: 16, right: 16, background: C.surface, border: `1px solid ${C.border}`, borderRadius: 8, padding: 16, width: 300, zIndex: 100, boxShadow: '0 10px 30px rgba(0,0,0,0.5)', display: 'flex', flexDirection: 'column', maxHeight: 'calc(100% - 32px)', overflowY: 'auto' }}>
          <p style={{ fontSize: 10, color: C.muted, textTransform: 'uppercase', letterSpacing: 1, marginBottom: 12 }}>Architecture Overview</p>
          
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginBottom: 16 }}>
            <div style={{ background: 'var(--surface-strong)', borderRadius: 6, padding: '8px 10px', textAlign: 'center' }}>
              <span style={{ fontSize: 16, fontWeight: 700, color: C.text }}>{nodes.length}</span>
              <p style={{ fontSize: 9, color: C.muted, margin: 0 }}>Files</p>
            </div>
            <div style={{ background: 'var(--surface-strong)', borderRadius: 6, padding: '8px 10px', textAlign: 'center' }}>
              <span style={{ fontSize: 16, fontWeight: 700, color: C.text }}>{edges.length}</span>
              <p style={{ fontSize: 9, color: C.muted, margin: 0 }}>Relations</p>
            </div>
          </div>

          <div style={{ borderTop: `1px solid ${C.border}`, paddingTop: 12, marginBottom: 12 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
              <p style={{ fontSize: 10, color: C.muted, textTransform: 'uppercase', letterSpacing: 1, margin: 0 }}>Active Issues</p>
              <Activity size={12} color={issues.length > 0 ? C.yellow : C.green} />
            </div>
            <div style={{ background: 'var(--surface-strong)', borderRadius: 6, padding: '8px 10px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span style={{ fontSize: 16, fontWeight: 700, color: issues.length > 0 ? C.yellow : C.green }}>{issues.length}</span>
              <span style={{ fontSize: 10, color: C.muted }}>active issues</span>
            </div>
          </div>

          {hotspots.length > 0 && (
            <div style={{ borderTop: `1px solid ${C.border}`, paddingTop: 12 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                <p style={{ fontSize: 10, color: C.muted, textTransform: 'uppercase', letterSpacing: 1, margin: 0 }}>Risk Hotspots</p>
                <TrendingUp size={12} color={C.red} />
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                {hotspots.map(h => {
                  const fileName = path.basename(h.label)
                  return (
                    <div key={h.id} 
                      onClick={() => selectFileNode(h.id)}
                      style={{ background: 'var(--surface-strong)', border: `1px solid ${C.border}`, borderRadius: 6, padding: '8px 10px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', cursor: 'pointer', transition: 'all 0.12s ease' }}
                      onMouseEnter={e => {
                        e.currentTarget.style.borderColor = 'var(--primary)'
                        e.currentTarget.style.background = 'var(--canvas-soft)'
                      }}
                      onMouseLeave={e => {
                        e.currentTarget.style.borderColor = 'var(--hairline)'
                        e.currentTarget.style.background = 'var(--surface-strong)'
                      }}
                    >
                      <div style={{ minWidth: 0, flex: 1, marginRight: 8 }}>
                        <p style={{ fontSize: 11, color: C.text, margin: 0, fontWeight: 500, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{fileName}</p>
                        <p style={{ fontSize: 9, color: C.muted, margin: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontFamily: 'monospace' }}>{h.label}</p>
                      </div>
                      <span style={{ fontSize: 10, color: h.high > 0 ? C.red : C.yellow, fontWeight: 700, background: 'var(--hairline-soft)', padding: '2px 6px', borderRadius: 4, flexShrink: 0 }}>
                        {h.issues.length}
                      </span>
                    </div>
                  )
                })}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

// ─── Main Export with Provider ────────────────────────────────────────────────
interface CodeMapProps {
  projectPath?: string
  issues: AnalysisIssue[]
  dependencies?: Record<string, string[]>
  onNavigateToIssue?: (issueId: string) => void
}

export const CodeMap: React.FC<CodeMapProps & {
  decisions?: Record<string, Decision>
  onAcceptIssue?: (issue: AnalysisIssue) => void
  onRejectIssue?: (issue: AnalysisIssue) => void
}> = (props) => (
  <div data-theme="dark" style={{ flex: 1, height: '100%', display: 'flex', flexDirection: 'column' }}>
    <ReactFlowProvider>
      <CodeMapInner {...props} />
    </ReactFlowProvider>
  </div>
)
