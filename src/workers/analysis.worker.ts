// src/workers/analysis.worker.ts
// This worker now acts only as an orchestrator. The heavy‑lifting detectors live in ./detectors/.

import { parse, simpleTraverse, TSESTree } from '@typescript-eslint/typescript-estree';

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
    | 'unsafe-cast';
  problem: string;
  impact: 'High' | 'Medium' | 'Low';
  lineStart: number;
  lineEnd: number;
  lines: { before: string[]; after: string[] };
  patch?: { before: string; after: string };
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
}

// ─── Constants ────────────────────────────────────────────────────────────────
const GENERIC_NAMES = new Set([
  'data', 'item', 'items', 'list', 'temp', 'tmp', 'foo', 'bar', 'baz',
  'obj', 'object', 'val', 'value', 'res', 'result', 'response',
  'handleClick', 'handleChange', 'handleSubmit', 'onClick', 'onChange',
  'Component', 'Page', 'Container', 'Wrapper', 'Inner', 'Outer',
]);

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
  // new categories
  'state-explosion': 'high',
  'api-in-component': 'high',
  'missing-error-boundary': 'medium',
  'memory-leak': 'high',
  'duplicate-logic': 'medium',
  'unsafe-cast': 'high',
};

// ─── Parse helper ─────────────────────────────────────────────────────────────
export interface ParsedFile {
  ast: TSESTree.Program;
  lines: string[];
  filePath: string;
  fileName: string;
  isTsx: boolean;
}

export function parseFile(filePath: string, content: string): ParsedFile | null {
  const isTsx = /\.(tsx|jsx)$/.test(filePath);
  const isTs = /\.(ts|tsx|js|jsx)$/.test(filePath);
  if (!isTs) return null;

  try {
    const ast = parse(content, {
      jsx: isTsx,
      tolerant: true,
      loc: true,
    });
    return {
      ast,
      lines: content.split('\n'),
      filePath,
      fileName: filePath.replace(/\\\\/g, '/').split('/').pop() ?? filePath,
      isTsx,
    };
  } catch {
    return null;
  }
}

// ─── Traversal helpers ───────────────────────────────────────────────────────
export function walk(node: any, visitor: Record<string, (n: any) => void>) {
  simpleTraverse(node as any, {
    enter(n: any) {
      const fn = (visitor as any)[n.type];
      if (fn) fn(n);
    },
  });
}

export function findAll(root: any, type: string): any[] {
  const results: any[] = [];
  simpleTraverse(root as any, {
    enter(n: any) {
      if (n.type === type) results.push(n);
    },
  });
  return results;
}

export function lineOf(node: TSESTree.Node): number { return node.loc?.start.line ?? 1; }
export function endLineOf(node: TSESTree.Node): number { return node.loc?.end.line ?? 1; }

// ─── Import map helpers (used for circular‑dep detection) ───────────────────
function buildImportMap(files: Map<string, string>): Map<string, string[]> {
  const map = new Map<string, string[]>();
  for (const [filePath, content] of files) {
    if (!/\.(ts|tsx|js|jsx)$/.test(filePath)) continue;
    const parsed = parseFile(filePath, content);
    if (!parsed) continue;
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
      const resolved = resolveRelative(dir, source, files);
      if (resolved) deps.push(resolved);
    }
    map.set(filePath, deps);
  }
  return map;
}

function resolveRelative(dir: string, spec: string, files: Map<string, string>): string | null {
  const joined = dir ? `${dir}/${spec}` : spec;
  const normalized = normalizePath(joined);
  const exts = ['', '.ts', '.tsx', '.js', '.jsx', '/index.ts', '/index.tsx', '/index.js'];
  for (const ext of exts) if (files.has(normalized + ext)) return normalized + ext;
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

// ─── Circular dependency detector (kept here) ────────────────────────────────
function detectCircularDeps(files: Map<string, string>): Issue[] {
  const importMap = buildImportMap(files);
  const issues: Issue[] = [];
  const reported = new Set<string>();

  function findCycle(start: string, cur: string, visited: Set<string>): string[] | null {
    if (cur === start && visited.size > 0) return [cur];
    if (visited.has(cur)) return null;
    const next = new Set(visited);
    next.add(cur);
    for (const dep of importMap.get(cur) ?? []) {
      const cycle = findCycle(start, dep, next);
      if (cycle) return [cur, ...cycle];
    }
    return null;
  }

  for (const file of importMap.keys()) {
    const cycle = findCycle(file, file, new Set());
    if (!cycle) continue;
    const key = [...cycle].sort().join('|');
    if (reported.has(key)) continue;
    reported.add(key);
    const short = cycle.map((f) => f.replace(/\\\\/g, '/').split('/').pop() ?? f);
    issues.push({
      id: `circular-${key.slice(0, 60)}`,
      file: file.replace(/\\\\/g, '/').split('/').pop() ?? file,
      filePath: file,
      category: 'circular-dep',
      problem: `Dependência circular: ${short.join(' → ')}`,
      impact: 'High',
      lineStart: 1,
      lineEnd: 1,
      lines: { before: ['// Dependência circular'], after: [] },
    });
  }
  return issues;
}

// ─── Enrich issues (adds effort, blastRadius, priority) ─────────────────────
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

// ─── Run all detectors for a single file ───────────────────────────────────
import { runAllDetectors } from './detectors';

export async function runAnalysis(
  files: Map<string, string>,
  onProgress?: (file: string) => void,
): Promise<AnalysisResult> {
  const issues: Issue[] = [];
  const scannedFiles: string[] = [];

  // Build import map once for circular detection later.
  const importMap = buildImportMap(files);
  const reverseMap = new Map<string, number>();
  for (const deps of importMap.values()) {
    for (const dep of deps) {
      reverseMap.set(dep, (reverseMap.get(dep) ?? 0) + 1);
    }
  }

  for (const [filePath, content] of files) {
    const pf = parseFile(filePath, content);
    if (!pf) continue;
    onProgress?.(filePath);
    scannedFiles.push(filePath);
    try {
      const fileIssues = runAllDetectors(pf, files);
      issues.push(...fileIssues);
    } catch (e) {
      console.error('Detector error in', filePath, e);
    }
  }

  // circular deps are project‑wide, so add after per‑file analysis
  issues.push(...detectCircularDeps(files));

  const enriched = enrichIssues(issues, reverseMap);

  return {
    projectPath: '',
    scannedFiles,
    issues: enriched,
    summary: {
      total: enriched.length,
      high: enriched.filter((i) => i.impact === 'High').length,
      medium: enriched.filter((i) => i.impact === 'Medium').length,
      low: enriched.filter((i) => i.impact === 'Low').length,
    },
  };
}

// ─── Worker message handler ────────────────────────────────────────────────
self.onmessage = async (e: MessageEvent) => {
  const { files: filesObj } = e.data;
  const filesMap = new Map<string, string>(Object.entries(filesObj ?? {}));
  try {
    const result = await runAnalysis(filesMap, (file) => self.postMessage({ type: 'progress', file }));
    self.postMessage({ type: 'success', result });
  } catch (error) {
    self.postMessage({ type: 'error', error: String(error) });
  }
};
