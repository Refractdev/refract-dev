// src/lib/analyze.ts
// Shared AST analysis logic — works in both Web Workers and Node.js

import { parse as babelParse } from '@babel/parser';

// ─── Types ────────────────────────────────────────────────────────────────────
export interface Issue {
  id: string;
  file: string;
  filePath: string;
  category:
    | 'oversized-component'
    | 'any-type'
    | 'dead-state'
    | 'missing-docs'
    | 'console-log'
    | 'effect-no-deps'
    | 'prop-drilling'
    | 'generic-naming'
    | 'circular-dep'
    | 'state-explosion'
    | 'api-in-component'
    | 'missing-error-boundary'
    | 'memory-leak'
    | 'duplicate-logic'
    | 'unsafe-cast'
    | 'unused-import';
  problem: string;
  impact: 'High' | 'Medium' | 'Low';
  lineStart: number;
  lineEnd: number;
  lines: { before: string[]; after: string[] };
  patch?: { before: string; after: string };
  /** Advisory-only issues (no deterministic patch) — human-readable refactor hint */
  suggestion?: string;
  effort?: 'low' | 'medium' | 'high';
  blastRadius?: number;
  priority?: number;
}

export interface AnalysisResult {
  projectPath: string;
  scannedFiles: string[];
  issues: Issue[];
  truncated?: boolean;
  summary: { total: number; high: number; medium: number; low: number };
  dependencies: Record<string, string[]>;
}

export interface ParsedFile {
  ast: any;
  lines: string[];
  filePath: string;
  fileName: string;
  isTsx: boolean;
}

// ─── Constants ────────────────────────────────────────────────────────────────
const EFFORT_MAP: Record<string, 'low' | 'medium' | 'high'> = {
  'any-type': 'low',
  'console-log': 'low',
  'missing-docs': 'low',
  'generic-naming': 'low',
  'dead-state': 'medium',
  'effect-no-deps': 'medium',
  'prop-drilling': 'medium',
  'oversized-component': 'high',
  'circular-dep': 'high',
  'state-explosion': 'high',
  'api-in-component': 'high',
  'missing-error-boundary': 'medium',
  'memory-leak': 'high',
  'duplicate-logic': 'medium',
  'unsafe-cast': 'high',
  'unused-import': 'low',
};

// ─── Recursive AST walker ─────────────────────────────────────────────────────
const SKIP_KEYS = new Set([
  'type', 'start', 'end', 'loc', 'range', 'errors', 'comments',
  'leadingComments', 'trailingComments', 'innerComments', 'extra', 'parent',
]);

function visitNode(node: any, visitor: { enter: (n: any) => void }, parent: any = null) {
  if (!node || typeof node !== 'object') return;
  node.parent = parent;
  visitor.enter(node);
  for (const key of Object.keys(node)) {
    if (SKIP_KEYS.has(key)) continue;
    const child = node[key];
    if (Array.isArray(child)) {
      for (const item of child) {
        if (item && typeof item.type === 'string') {
          visitNode(item, visitor, node);
        }
      }
    } else if (child && typeof child.type === 'string') {
      visitNode(child, visitor, node);
    }
  }
}

export function walk(node: any, visitor: Record<string, (n: any, skip?: () => void) => void>) {
  const skipped = new WeakSet<object>()

  function visitNode(n: any) {
    if (!n || typeof n !== 'object') return
    if (skipped.has(n)) return

    const fn = visitor[n.type]
    if (fn) fn(n, () => skipped.add(n))

    for (const key of Object.keys(n)) {
      if (SKIP_KEYS.has(key)) continue
      const child = n[key]
      if (Array.isArray(child)) {
        for (const item of child) {
          if (item && typeof item.type === 'string') visitNode(item)
        }
      } else if (child && typeof child.type === 'string') {
        visitNode(child)
      }
    }
  }

  visitNode(node)
}

export function findAll(root: any, type: string): any[] {
  const skipped = new WeakSet<object>()
  const results: any[] = [];

  function visitNode(n: any) {
    if (!n || typeof n !== 'object') return;
    if (skipped.has(n)) return;
    if (n.type === type) results.push(n);

    for (const key of Object.keys(n)) {
      if (SKIP_KEYS.has(key)) continue;
      const child = n[key];
      if (Array.isArray(child)) {
        for (const item of child) {
          if (item && typeof item.type === 'string') {
            visitNode(item);
          }
        }
      } else if (child && typeof child.type === 'string') {
        visitNode(child);
      }
    }
  }

  visitNode(root);
  return results;
}

export function lineOf(node: any): number { return node.loc?.start.line ?? 1; }
export function endLineOf(node: any): number { return node.loc?.end.line ?? 1; }

// ─── Parse helper ─────────────────────────────────────────────────────────────
export function parseFile(filePath: string, content: string): ParsedFile | null {
  const isTsx = /\.(tsx|jsx)$/.test(filePath);
  const isTs = /\.(ts|tsx|js|jsx)$/.test(filePath);
  if (!isTs) return null;

  try {
    const result = babelParse(content, {
      sourceType: 'module',
      plugins: [
        'typescript',
        'jsx',
        'decorators-legacy',
        'classProperties',
        'optionalChaining',
        'nullishCoalescingOperator',
      ],
      errorRecovery: true,
    });
    return {
      ast: result.program,
      lines: content.split('\n'),
      filePath,
      fileName: filePath.replace(/\\\\/g, '/').split('/').pop() ?? filePath,
      isTsx,
    };
  } catch {
    return null;
  }
}

// ─── Import map helpers (used for circular‑dep detection) ───────────────────
function buildImportMap(cache: Map<string, ParsedFile>): Map<string, string[]> {
  const map = new Map<string, string[]>();
  for (const [filePath, parsed] of cache.entries()) {
    const deps: string[] = [];
    for (const node of parsed.ast.body) {
      if (
        node.type !== 'ImportDeclaration' &&
        node.type !== 'ExportNamedDeclaration' &&
        node.type !== 'ExportAllDeclaration'
      )
        continue;
      const source = (node as any).source?.value;
      if (typeof source !== 'string' || !source.startsWith('.')) continue;
      const dir = filePath.replace(/\\\\/g, '/').split('/').slice(0, -1).join('/');
      const resolved = resolveRelative(dir, source, cache);
      if (resolved) deps.push(resolved);
    }
    map.set(filePath, deps);
  }
  return map;
}

function resolveRelative(dir: string, spec: string, cache: Map<string, ParsedFile>): string | null {
  const joined = dir ? `${dir}/${spec}` : spec;
  const normalized = normalizePath(joined);
  const exts = ['', '.ts', '.tsx', '.js', '.jsx', '/index.ts', '/index.tsx', '/index.js'];
  for (const ext of exts) if (cache.has(normalized + ext)) return normalized + ext;
  return null;
}

function normalizePath(p: string): string {
  const parts = p.replace(/\\\\/g, '/').split('/');
  const out: string[] = [];
  for (const part of parts) {
    if (part === '..') out.pop();
    else if (part !== '.') out.push(part);
  }
  return out.join('/');
}

// ─── Circular dependency detector ────────────────────────────────────────────
function detectCircularDeps(cache: Map<string, ParsedFile>): Issue[] {
  const importMap = buildImportMap(cache);
  const issues: Issue[] = [];
  const reported = new Set<string>();

  const colors = new Map<string, number>();

  function dfs(node: string, path: string[]) {
    colors.set(node, 1);
    path.push(node);

    for (const dep of importMap.get(node) ?? []) {
      const color = colors.get(dep) ?? 0;
      if (color === 1) {
        const cycleStartIndex = path.indexOf(dep);
        if (cycleStartIndex !== -1) {
          const cycle = path.slice(cycleStartIndex);
          const key = [...cycle].sort().join('|');
          if (!reported.has(key)) {
            reported.add(key);
            const short = cycle.map((f) => f.replace(/\\\\/g, '/').split('/').pop() ?? f);
            issues.push({
              id: `circular-${key.slice(0, 60)}`,
              file: dep.replace(/\\\\/g, '/').split('/').pop() ?? dep,
              filePath: dep,
              category: 'circular-dep',
              problem: `Dependência circular: ${short.join(' → ')} → ${short[0]}`,
              impact: 'High',
              lineStart: 1,
              lineEnd: 1,
              lines: { before: ['// Dependência circular'], after: [] },
            });
          }
        }
      } else if (color === 0) {
        dfs(dep, path);
      }
    }

    path.pop();
    colors.set(node, 2);
  }

  for (const file of importMap.keys()) {
    if ((colors.get(file) ?? 0) === 0) {
      dfs(file, []);
    }
  }
  return issues;
}

// ─── Enrich issues ───────────────────────────────────────────────────────────
function enrichIssues(issues: Issue[], reverseMap: Map<string, number>): Issue[] {
  return issues.map((issue) => {
    const effort = EFFORT_MAP[issue.category] ?? 'medium';
    const blast = reverseMap.get(issue.filePath) ?? 0;
    const impactScore = { High: 3, Medium: 2, Low: 1 }[issue.impact];
    const effortScore = { low: 1, medium: 2, high: 3 }[effort];
    const priority = (impactScore * 10 + blast) / effortScore;
    return { ...issue, effort, blastRadius: blast, priority };
  });
}

// ─── Detector orchestrator ─────────────────────────────────────────────────
import { runAllDetectors, runCrossFileDetectors } from '../workers/detectors'
import { preComputePatches } from './patchComputer'

export async function runAnalysis(

  files: Map<string, string>,
  onProgress?: (file: string) => void,
): Promise<AnalysisResult> {
  const t0 = Date.now();
  const issues: Issue[] = [];
  const scannedFiles: string[] = [];

  // 1. Pre-parse files into AST cache
  const parsedCache = new Map<string, ParsedFile>();
  let parseErrors = 0;
  for (const [filePath, content] of files) {
    try {
      const pf = parseFile(filePath, content);
      if (pf) parsedCache.set(filePath, pf);
    } catch (err) {
      console.error('[Analyze] Failed to parse file:', filePath, err);
      parseErrors++;
    }
  }
  if (parseErrors > 0) {
    console.warn(`[Analyze] ${parseErrors} file(s) could not be parsed`);
  }

  // 2. Build import map from AST cache
  const reverseMap = new Map<string, number>();
  let importMap: Map<string, string[]> | null = null;
  try {
    importMap = buildImportMap(parsedCache);
    for (const deps of importMap.values()) {
      for (const dep of deps) {
        reverseMap.set(dep, (reverseMap.get(dep) ?? 0) + 1);
      }
    }
  } catch (err) {
    console.error('[Analyze] Failed to build import map:', err);
  }

  // 3. Per-file detectors
  let detectorErrors = 0;
  for (const [filePath, pf] of parsedCache) {
    onProgress?.(filePath);
    scannedFiles.push(filePath);
    try {
      issues.push(...runAllDetectors(pf));
    } catch (e) {
      console.error('[Analyze] Detector error in', filePath, e);
      detectorErrors++;
    }
  }
  if (detectorErrors > 0) {
    console.warn(`[Analyze] ${detectorErrors} file(s) had detector errors`);
  }

  // 4. Cross-file detectors
  try {
    issues.push(...detectCircularDeps(parsedCache));
  } catch (e) {
    console.error('[Analyze] Circular dependency detector crashed:', e);
  }
  try {
    issues.push(...runCrossFileDetectors(parsedCache));
  } catch (e) {
    console.error('[Analyze] Cross-file detector crashed:', e);
  }

  // 5. Enrich
  let enriched = issues;
  try {
    enriched = enrichIssues(issues, reverseMap);
  } catch (e) {
    console.error('[Analyze] Failed to enrich issues:', e);
  }

  // Emit a single summary timing log (not on every file)
  const elapsed = Date.now() - t0;
  if (elapsed > 2000) {
    console.warn(`[Analyze] Completed in ${elapsed}ms (${parsedCache.size} files, ${enriched.length} issues)`);
  }

  const depsObj: Record<string, string[]> = {};
  if (importMap) {
    for (const [key, deps] of importMap) {
      depsObj[key] = deps;
    }
  }

  const withPatches = preComputePatches(enriched)

  return {
    projectPath: '',
    scannedFiles,
    issues: withPatches,
    dependencies: depsObj,
    summary: {
      total: withPatches.length,
      high: withPatches.filter((i) => i.impact === 'High').length,
      medium: withPatches.filter((i) => i.impact === 'Medium').length,
      low: withPatches.filter((i) => i.impact === 'Low').length,
    },
  };
}
