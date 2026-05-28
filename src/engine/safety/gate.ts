import { AST_NODE_TYPES, simpleTraverse } from '@typescript-eslint/typescript-estree'
import { parseSource, tryParseSource } from '../ast'
import { resolveVirtualImport } from '../path'
import type { TransformProposal, SafetyResult } from '../types'

export function runSafetyGate(proposal: TransformProposal, fileMap: Map<string, string>): TransformProposal {
  const direct = validateProposal(proposal, fileMap)
  if (direct.passed) {
    return { ...proposal, safetyResult: direct }
  }

  const reducedProposal = createConservativeProposal(proposal)
  if (!reducedProposal) {
    return { ...proposal, safetyResult: direct }
  }

  const reduced = validateProposal(reducedProposal, fileMap)
  if (!reduced.passed || isNoopProposal(reducedProposal, proposal)) {
    return { ...proposal, safetyResult: direct }
  }

  return {
    ...reducedProposal,
    safetyResult: {
      ...reduced,
      warnings: [...reduced.warnings, 'Reduced to conservative version'],
    },
  }
}

function validateProposal(proposal: TransformProposal, fileMap: Map<string, string>): SafetyResult {
  const virtualMap = applyProposalToVirtualMap(proposal, fileMap)
  const targets = collectTouchedFiles(proposal)
  const errors: string[] = []
  const warnings: string[] = []
  let syntaxOk = true
  let importsResolved = true
  let propsOk = true

  for (const path of targets) {
    const source = virtualMap.get(path)
    if (!source) continue

    const parsed = tryParseSource(source, path)
    if (!parsed.ast) {
      syntaxOk = false
      errors.push(`${path}: ${parsed.error}`)
      continue
    }

    simpleTraverse(parsed.ast, {
      enter(node) {
        if (node.type !== AST_NODE_TYPES.ImportDeclaration) return
        const resolved = resolveVirtualImport(virtualMap, path, node.source.value)
        if (resolved === null) {
          importsResolved = false
          errors.push(`${path}: unresolved import "${node.source.value}"`)
        }
      },
    })

    const propsConsistency = validatePropsConsistency(source, path)
    if (!propsConsistency.ok) {
      propsOk = false
      warnings.push(...propsConsistency.warnings)
    }
  }

  return {
    passed: syntaxOk && importsResolved,
    syntaxOk,
    typecheck: syntaxOk && propsOk,
    errors,
    warnings,
  }
}

function applyProposalToVirtualMap(proposal: TransformProposal, fileMap: Map<string, string>): Map<string, string> {
  const virtualMap = new Map(fileMap)

  if (proposal.movedTo) {
    virtualMap.delete(proposal.filePath)
    virtualMap.set(proposal.movedTo, proposal.after)
  } else {
    virtualMap.set(proposal.filePath, proposal.after)
  }

  for (const file of proposal.newFiles ?? []) {
    virtualMap.set(file.path, file.content)
  }

  return virtualMap
}

function collectTouchedFiles(proposal: TransformProposal): string[] {
  const touched = [proposal.movedTo ?? proposal.filePath]
  for (const file of proposal.newFiles ?? []) {
    touched.push(file.path)
  }
  return [...new Set(touched)]
}

function validatePropsConsistency(source: string, filePath: string): { ok: boolean; warnings: string[] } {
  if (!/Props/.test(source) || !/function\s+[A-Z]/.test(source) || !/\.(tsx|jsx)$/.test(filePath)) {
    return { ok: true, warnings: [] }
  }

  try {
    const ast = parseSource(source, filePath)
    let ok = true
    const warnings: string[] = []

    simpleTraverse(ast, {
      enter(node) {
        if (node.type !== AST_NODE_TYPES.TSPropertySignature || node.key.type !== AST_NODE_TYPES.Identifier) return
        if ((node.typeAnnotation?.typeAnnotation.type ?? '') === AST_NODE_TYPES.TSAnyKeyword) {
          warnings.push(`${filePath}: ${node.key.name} uses an any-based prop contract.`)
        }
      },
    })

    if (warnings.length > 0) ok = false
    return { ok, warnings }
  } catch {
    return { ok: false, warnings: [`${filePath}: props consistency check could not parse the file.`] }
  }
}

function createConservativeProposal(proposal: TransformProposal): TransformProposal | null {
  if (proposal.after === proposal.before && !proposal.movedTo) return null
  return {
    ...proposal,
    after: proposal.before,
    movedTo: undefined,
    newFiles: [],
  }
}

function isNoopProposal(next: TransformProposal, original: TransformProposal): boolean {
  return next.after === original.before && !next.movedTo && (next.newFiles?.length ?? 0) === 0
}
