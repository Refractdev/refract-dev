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
};

// ─── Recursive AST walker ─────────────────────────────────────────────────────
const SKIP_KEYS = new Set([
  'type', 'start', 'end', 'loc', 'range', 'errors', 'comments',
  'leadingComments', 'trailingComments', 'innerComments', 'extra',
]);

function visitNode(node: any, visitor: { enter: (n: any) => void }) {
  if (!node || typeof node !== 'object') return;
  if ((node as any)._skip) return;
  visitor.enter(node);
  for (const key of Object.keys(node)) {
    if (SKIP_KEYS.has(key)) continue;
    const child = node[key];
    if (Array.isArray(child)) {
      for (const item of child) {
        if (item && typeof item.type === 'string') {
          visitNode(item, visitor);
        }
      }
    } else if (child && typeof child.type === 'string') {
      visitNode(child, visitor);
    }
  }
}

export function walk(node: any, visitor: Record<string, (n: any) => void>) {
  visitNode(node, {
    enter(n: any) {
      const fn = (visitor as any)[n.type];
      if (fn) fn(n);
    },
  });
}

export function findAll(root: any, type: string): any[] {
  const results: any[] = [];
  visitNode(root, {
    enter(n: any) {
      if (n.type === type) results.push(n);
    },
  });
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
import { runAllDetectors, runCrossFileDetectors } from '../workers/detectors';

export async function runAnalysis(
  files: Map<string, string>,
  onProgress?: (file: string) => void,
): Promise<AnalysisResult> {
  const t0 = Date.now();
  console.log('[Analyze] runAnalysis starting for', files.size, 'files...');
  const issues: Issue[] = [];
  const scannedFiles: string[] = [];

  // 1. Pre-parsing files into AST cache first
  const parsedCache = new Map<string, ParsedFile>();
  console.log('[Analyze] Pre-parsing files into AST cache...');
  let parseErrors = 0;
  for (const [filePath, content] of files) {
    try {
      const pf = parseFile(filePath, content);
      if (pf) {
        parsedCache.set(filePath, pf);
      }
    } catch (err) {
      console.error('[Analyze] Failed to parse file:', filePath, err);
      parseErrors++;
    }
  }
  console.log('[Analyze] AST cache built with', parsedCache.size, 'files (parse errors:', parseErrors, ')');

  // 2. Building import map from the cache to avoid double parse
  const reverseMap = new Map<string, number>();
  let importMap: Map<string, string[]> | null = null;
  try {
    console.log('[Analyze] Building import map from cache...');
    importMap = buildImportMap(parsedCache);
    console.log('[Analyze] Import map built with', importMap.size, 'files.');
    for (const deps of importMap.values()) {
      for (const dep of deps) {
        reverseMap.set(dep, (reverseMap.get(dep) ?? 0) + 1);
      }
    }
  } catch (err) {
    console.error('[Analyze] Failed to build import map or reverse map:', err);
  }

  // 3. Running per-file detectors
  console.log('[Analyze] Running per-file detectors...');
  let detectorErrors = 0;
  let fileCount = 0;
  for (const [filePath, pf] of parsedCache) {
    fileCount++;
    onProgress?.(filePath);
    scannedFiles.push(filePath);
    try {
      const fileIssues = runAllDetectors(pf);
      issues.push(...fileIssues);
    } catch (e) {
      console.error('[Analyze] Detector error in', filePath, e);
      detectorErrors++;
    }
  }
  console.log('[Analyze] Per-file detectors finished. Processed', fileCount, 'files with', detectorErrors, 'errors. Found', issues.length, 'issues.', 'Elapsed:', (Date.now() - t0).toFixed(0), 'ms');

  // 4. Running circular dependency detector using cache
  try {
    const t1 = Date.now();
    console.log('[Analyze] Running circular dependency detector...');
    const circDeps = detectCircularDeps(parsedCache);
    console.log('[Analyze] Circular dependency detector finished. Found', circDeps.length, 'issues. Elapsed:', (Date.now() - t1).toFixed(0), 'ms');
    issues.push(...circDeps);
  } catch (e) {
    console.error('[Analyze] Circular dependency detector crashed:', e);
  }

  try {
    const t1 = Date.now();
    console.log('[Analyze] Running cross-file detectors (like duplicateLogic)...');
    const crossIssues = runCrossFileDetectors(parsedCache);
    console.log('[Analyze] Cross-file detectors finished. Found', crossIssues.length, 'issues. Elapsed:', (Date.now() - t1).toFixed(0), 'ms');
    issues.push(...crossIssues);
  } catch (e) {
    console.error('[Analyze] Cross-file detector crashed:', e);
  }

  console.log('[Analyze] Enriching issues...');
  let enriched = issues;
  try {
    enriched = enrichIssues(issues, reverseMap);
    console.log('[Analyze] Issue enrichment finished.');
  } catch (e) {
    console.error('[Analyze] Failed to enrich issues:', e);
  }

  console.log('[Analyze] runAnalysis complete. Total issues:', enriched.length, 'Elapsed:', (Date.now() - t0).toFixed(0), 'ms');

  const depsObj: Record<string, string[]> = {};
  if (importMap) {
    for (const [key, deps] of importMap) {
      depsObj[key] = deps;
    }
  }

  return {
    projectPath: '',
    scannedFiles,
    issues: enriched,
    dependencies: depsObj,
    summary: {
      total: enriched.length,
      high: enriched.filter((i) => i.impact === 'High').length,
      medium: enriched.filter((i) => i.impact === 'Medium').length,
      low: enriched.filter((i) => i.impact === 'Low').length,
    },
  };
}
