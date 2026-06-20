import React, { useEffect, useMemo, useRef, useState } from 'react'
import { Loader2, Layers, ArrowRight, ShieldCheck, AlertTriangle, Sparkles, GitBranch, X } from 'lucide-react'
import { useTranslation } from '../../hooks/useTranslation'
import { profileArchitecture } from '../../engine/architecture/profiler'
import { listBlueprints, recommendBlueprint, getBlueprint } from '../../engine/architecture/blueprints'
import { planArchitecture } from '../../engine/architecture/planner'
import type {
  ArchitecturePlan,
  ArchitectureProfile,
  ArchitectureTransformResult,
  BlueprintId,
} from '../../engine/types'
import type { ArchApplyStats } from './types'

const C = {
  bg: 'var(--background)',
  surface: 'var(--card)',
  border: 'var(--border)',
  text: 'var(--foreground)',
  muted: 'var(--muted-foreground)',
  blue: 'var(--ring)',
  green: 'var(--semantic-success)',
  amber: 'var(--semantic-warning)',
  red: 'var(--semantic-error)',
}

type Stage = 'blueprint' | 'planning' | 'planReview' | 'transforming' | 'validated'

const STRINGS = {
  en: {
    title: 'Enterprise Refactor',
    detected: 'Detected',
    structure: 'structure',
    targetArch: 'Target architecture',
    recommended: 'Recommended',
    generatePlan: 'Generate restructure plan',
    planning: 'Planning the new architecture...',
    planSummary: 'Restructure plan',
    before: 'Current',
    after: 'Proposed',
    filesMoved: 'files moved',
    newModules: 'new modules',
    layers: 'layers',
    applyFull: 'Run restructure',
    transforming: 'Refactoring the whole project...',
    validating: 'Validating with the type checker...',
    repairing: 'Repairing',
    validated: 'Refactor validated',
    filesValidated: 'files validated by tsc',
    manualReview: 'files need manual review',
    commit: 'Confirm & save to project',
    discard: 'Discard',
    passedAll: 'All files passed the type checker.',
    someFailed: 'Some files still have type errors and are flagged for manual review.',
    close: 'Close',
    noChanges: 'No structural changes proposed for this project.',
  },
  pt: {
    title: 'Refactor Enterprise',
    detected: 'Detetado',
    structure: 'estrutura',
    targetArch: 'Arquitetura alvo',
    recommended: 'Recomendado',
    generatePlan: 'Gerar plano de reestruturação',
    planning: 'A planear a nova arquitetura...',
    planSummary: 'Plano de reestruturação',
    before: 'Atual',
    after: 'Proposto',
    filesMoved: 'ficheiros movidos',
    newModules: 'novos módulos',
    layers: 'camadas',
    applyFull: 'Executar reestruturação',
    transforming: 'A refatorar o projeto inteiro...',
    validating: 'A validar com o type checker...',
    repairing: 'A reparar',
    validated: 'Refatoração validada',
    filesValidated: 'ficheiros validados por tsc',
    manualReview: 'ficheiros precisam de revisão manual',
    commit: 'Confirmar e guardar no projecto',
    discard: 'Descartar',
    passedAll: 'Todos os ficheiros passaram no type checker.',
    someFailed: 'Alguns ficheiros ainda têm erros de tipo e ficam marcados para revisão manual.',
    close: 'Fechar',
    noChanges: 'Sem mudanças estruturais propostas para este projeto.',
  },
}

interface Props {
  fileMap: Map<string, string>
  guidelines?: string
  projectPath?: string
  signals?: string
  onApply: (files: Record<string, string>, stats: ArchApplyStats) => void
  onClose: () => void
}

const ARCH_STAGES: Stage[] = ['blueprint', 'planning', 'planReview', 'transforming', 'validated']

const stageIndex = (stage: Stage) => ARCH_STAGES.indexOf(stage)

export const ArchitectureRefactorPanel: React.FC<Props> = ({ fileMap, guidelines, projectPath, signals, onApply, onClose }) => {
  const { lang, t } = useTranslation()
  const s = STRINGS[(lang as 'en' | 'pt')] ?? STRINGS.en

  const profile = useMemo<ArchitectureProfile>(() => profileArchitecture(fileMap), [fileMap])
  const [blueprintId, setBlueprintId] = useState<BlueprintId>(() => recommendBlueprint(profile))
  const recommendedId = useMemo(() => recommendBlueprint(profile), [profile])

  const [stage, setStage] = useState<Stage>('blueprint')
  const [plan, setPlan] = useState<ArchitecturePlan | null>(null)
  const [transformResult, setTransformResult] = useState<ArchitectureTransformResult | null>(null)
  const [progress, setProgress] = useState<{ label: string; done: number; total: number } | null>(null)
  const [error, setError] = useState<string | null>(null)
  const runningRef = useRef(false)

  const handleGeneratePlan = async () => {
    setError(null)
    setStage('planning')
    try {
      const generated = await planArchitecture(fileMap, profile, getBlueprint(blueprintId), { signals })
      setPlan(generated)
      setStage('planReview')
    } catch (err: any) {
      setError(err?.message ?? 'Failed to generate plan')
      setStage('blueprint')
    }
  }

  const handleApplyFull = async () => {
    if (!plan || runningRef.current) return
    runningRef.current = true
    setError(null)
    setStage('transforming')
    try {
      const { executeArchitecturePlan } = await import('../../engine/architecture/executor')
      const result = await executeArchitecturePlan(fileMap, plan, getBlueprint(blueprintId), {
        guidelines,
        projectPath,
        onProgress: (e) => {
          const label =
            e.phase === 'validate' ? s.validating : e.phase === 'repair' ? `${s.repairing} ${e.file ?? ''}` : e.file ?? ''
          setProgress({ label, done: e.done, total: e.total })
        },
      })
      setTransformResult(result)
      setStage('validated')
    } catch (err: any) {
      setError(err?.message ?? 'Failed to refactor')
      setStage('planReview')
    } finally {
      runningRef.current = false
      setProgress(null)
    }
  }

  const currentPaths = useMemo(() => [...fileMap.keys()].sort(), [fileMap])
  const proposedPaths = useMemo(() => {
    if (!plan) return currentPaths
    const moved = new Map(plan.moves.map((m) => [m.from, m.to]))
    const next = currentPaths.map((p) => moved.get(p) ?? p)
    for (const nf of plan.newFiles) next.push(nf.path)
    return [...new Set(next)].sort()
  }, [plan, currentPaths])

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', zIndex: 50, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24 }}>
      <div style={{ background: C.bg, border: `1px solid ${C.border}`, borderRadius: 16, width: '100%', maxWidth: 900, maxHeight: '88vh', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '16px 20px', borderBottom: `1px solid ${C.border}` }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <Layers size={18} color={C.blue} />
            <span style={{ fontSize: 15, fontWeight: 600, color: C.text }}>{s.title}</span>
          </div>
          <button onClick={onClose} className="btn btn-ghost btn-sm" style={{ padding: 4 }} aria-label={s.close}>
            <X size={16} />
          </button>
        </div>

        <div style={{ padding: '12px 20px 0', display: 'flex', gap: 6, alignItems: 'center' }}>
          {ARCH_STAGES.map((st, idx) => {
            const current = stageIndex(stage)
            const done = idx < current
            const active = idx === current
            const labels = [s.targetArch, s.planSummary, s.planSummary, s.transforming, s.validated]
            return (
              <React.Fragment key={st}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ height: 3, borderRadius: 2, background: done || active ? C.blue : C.border, opacity: active ? 1 : done ? 0.7 : 0.35, transition: 'all 0.2s ease' }} />
                  <p style={{ fontSize: 9, color: active ? C.text : C.muted, marginTop: 4, textTransform: 'uppercase', letterSpacing: '0.06em', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {labels[idx]}
                  </p>
                </div>
              </React.Fragment>
            )
          })}
        </div>

        <div style={{ padding: 20, overflowY: 'auto', flex: 1 }}>
          {error && (
            <div style={{ marginBottom: 16, padding: '10px 14px', borderRadius: 10, background: 'color-mix(in srgb, var(--semantic-error) 10%, transparent)', border: `1px solid ${C.border}`, color: C.red, fontSize: 13 }}>
              {error}
            </div>
          )}

          {/* Blueprint selection */}
          {(stage === 'blueprint' || stage === 'planning') && (
            <div>
              <p style={{ fontSize: 13, color: C.muted, marginBottom: 16 }}>
                {s.detected}: <strong style={{ color: C.text }}>{profile.framework}</strong>
                {profile.buildTool ? ` + ${profile.buildTool}` : ''} · {profile.structure.kind} {s.structure} · {profile.structure.codeFileCount} files
              </p>

              <p style={{ fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.08em', color: C.muted, fontWeight: 600, marginBottom: 10 }}>{s.targetArch}</p>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 12, marginBottom: 20 }}>
                {listBlueprints().map((bp) => {
                  const active = bp.id === blueprintId
                  return (
                    <button
                      key={bp.id}
                      onClick={() => setBlueprintId(bp.id)}
                      disabled={stage === 'planning'}
                      style={{
                        textAlign: 'left',
                        padding: 14,
                        borderRadius: 12,
                        border: `1px solid ${active ? C.blue : C.border}`,
                        background: active ? 'color-mix(in srgb, var(--ring) 8%, transparent)' : C.surface,
                        cursor: 'pointer',
                      }}
                    >
                      <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 6 }}>
                        <span style={{ fontSize: 13, fontWeight: 600, color: C.text }}>{bp.name}</span>
                        {bp.id === recommendedId && (
                          <span style={{ fontSize: 9, color: C.green, border: `1px solid ${C.border}`, borderRadius: 9999, padding: '1px 6px' }}>{s.recommended}</span>
                        )}
                      </div>
                      <p style={{ fontSize: 11, color: C.muted, lineHeight: 1.5 }}>{bp.summary}</p>
                    </button>
                  )
                })}
              </div>

              <button onClick={handleGeneratePlan} disabled={stage === 'planning'} className="btn btn-primary" style={{ gap: 8 }}>
                {stage === 'planning' ? <Loader2 size={14} className="animate-spin" /> : <Sparkles size={14} />}
                {stage === 'planning' ? s.planning : s.generatePlan}
              </button>
            </div>
          )}

          {/* Plan review */}
          {stage === 'planReview' && plan && (
            <div>
              <p style={{ fontSize: 13, color: C.text, marginBottom: 4, fontWeight: 600 }}>{s.planSummary}</p>
              <p style={{ fontSize: 12, color: C.muted, marginBottom: 16, lineHeight: 1.6 }}>{plan.summary}</p>

              <div style={{ display: 'flex', gap: 10, marginBottom: 16, flexWrap: 'wrap' }}>
                <Metric value={plan.moves.length} label={s.filesMoved} />
                <Metric value={plan.newFiles.length} label={s.newModules} />
                <Metric value={getBlueprint(blueprintId).layers.length} label={s.layers} />
              </div>

              {plan.moves.length === 0 ? (
                <p style={{ fontSize: 13, color: C.muted }}>{s.noChanges}</p>
              ) : (
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginBottom: 20 }}>
                  <TreeColumn title={s.before} paths={currentPaths} tone={C.muted} />
                  <TreeColumn title={s.after} paths={proposedPaths} tone={C.green} />
                </div>
              )}

              {plan.warnings.length > 0 && (
                <div style={{ marginBottom: 16, fontSize: 11, color: C.amber }}>
                  {plan.warnings.map((w, i) => <div key={i}>· {w}</div>)}
                </div>
              )}

              <button onClick={handleApplyFull} disabled={plan.moves.length === 0} className="btn btn-primary" style={{ gap: 8 }}>
                <ArrowRight size={14} /> {t('projectView.archApplyFull')}
              </button>
            </div>
          )}

          {/* Transforming */}
          {stage === 'transforming' && (
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 14, padding: '40px 0' }}>
              <Loader2 size={26} color={C.blue} className="animate-spin" />
              <p style={{ fontSize: 14, color: C.text }}>{s.transforming}</p>
              {progress && (
                <p style={{ fontSize: 12, color: C.muted, fontFamily: 'var(--font-mono)' }}>
                  {progress.label} {progress.total > 1 ? `(${progress.done}/${progress.total})` : ''}
                </p>
              )}
            </div>
          )}

          {/* Validated */}
          {stage === 'validated' && transformResult && (
            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 16 }}>
                {transformResult.passed ? <ShieldCheck size={20} color={C.green} /> : <AlertTriangle size={20} color={C.amber} />}
                <span style={{ fontSize: 15, fontWeight: 600, color: C.text }}>{s.validated}</span>
              </div>

              <div style={{ display: 'flex', gap: 10, marginBottom: 16, flexWrap: 'wrap' }}>
                <Metric value={transformResult.stats.filesMoved + transformResult.stats.filesRewritten} label={s.filesMoved} />
                <Metric value={transformResult.stats.filesValidated} label={s.filesValidated} tone={C.green} />
                {transformResult.stats.filesManualReview > 0 && (
                  <Metric value={transformResult.stats.filesManualReview} label={s.manualReview} tone={C.amber} />
                )}
              </div>

              <p style={{ fontSize: 12, color: transformResult.passed ? C.green : C.amber, marginBottom: 16 }}>
                {transformResult.passed ? s.passedAll : s.someFailed}
              </p>

              {transformResult.manualReview.length > 0 && (
                <div style={{ marginBottom: 16, border: `1px solid ${C.border}`, borderRadius: 10, padding: 12, maxHeight: 160, overflowY: 'auto' }}>
                  {transformResult.manualReview.map((r) => (
                    <div key={r.path} style={{ fontSize: 11, fontFamily: 'var(--font-mono)', color: C.amber, marginBottom: 4 }}>{r.path}</div>
                  ))}
                </div>
              )}

              <div style={{ display: 'flex', gap: 10 }}>
                <button
                  onClick={() => onApply(transformResult.fileMap, {
                    filesMoved: transformResult.stats.filesMoved + transformResult.stats.filesRewritten,
                    filesValidated: transformResult.stats.filesValidated,
                    filesManualReview: transformResult.stats.filesManualReview,
                  })}
                  className="btn btn-primary"
                  style={{ gap: 8 }}
                >
                  <GitBranch size={14} /> {t('projectView.archCommit')}
                </button>
                <button onClick={onClose} className="btn btn-ghost">{s.discard}</button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

const Metric: React.FC<{ value: number; label: string; tone?: string }> = ({ value, label, tone }) => (
  <div style={{ border: `1px solid ${C.border}`, borderRadius: 10, padding: '10px 14px', minWidth: 90 }}>
    <div style={{ fontSize: 22, fontWeight: 600, color: tone ?? C.text, letterSpacing: '-0.04em' }}>{value}</div>
    <div style={{ fontSize: 10, textTransform: 'uppercase', letterSpacing: '0.06em', color: C.muted }}>{label}</div>
  </div>
)

const TreeColumn: React.FC<{ title: string; paths: string[]; tone: string }> = ({ title, paths, tone }) => (
  <div style={{ border: `1px solid ${C.border}`, borderRadius: 12, padding: 12, background: C.surface, maxHeight: 320, overflowY: 'auto' }}>
    <div style={{ fontSize: 10, textTransform: 'uppercase', letterSpacing: '0.08em', color: tone, fontWeight: 600, marginBottom: 8 }}>{title}</div>
    {paths.map((p) => (
      <div key={p} style={{ fontSize: 11, fontFamily: 'var(--font-mono)', color: 'var(--muted-foreground)', padding: '1px 0', wordBreak: 'break-all' }}>{p}</div>
    ))}
  </div>
)
