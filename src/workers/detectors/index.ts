// src/workers/detectors/index.ts
import { Issue, ParsedFile } from '../../lib/analyze';
import { detectAnyTypes } from './anyTypes';
import { detectDeadState } from './deadState';
import { detectEffectNoDeps } from './effectNoDeps';
import { detectOversized } from './oversized';
import { detectPropDrilling } from './propDrilling';
import { detectStateExplosion } from './stateExplosion';
import { detectApiInComponent } from './apiInComponent';
import { detectMissingErrorBoundary } from './missingErrorBoundary';
import { detectMemoryLeaks } from './memoryLeaks';
import { detectDuplicateLogic } from './duplicateLogic';

export function runAllDetectors(pf: ParsedFile): Issue[] {
  const issues: Issue[] = [];

  const perFileDetectors = [
    { name: 'anyTypes', run: () => detectAnyTypes(pf) },
    { name: 'deadState', run: () => detectDeadState(pf) },
    { name: 'effectNoDeps', run: () => detectEffectNoDeps(pf) },
    { name: 'oversized', run: () => detectOversized(pf) },
    { name: 'propDrilling', run: () => detectPropDrilling(pf) },
    { name: 'stateExplosion', run: () => detectStateExplosion(pf) },
    { name: 'apiInComponent', run: () => detectApiInComponent(pf) },
    { name: 'missingErrorBoundary', run: () => detectMissingErrorBoundary(pf) },
    { name: 'memoryLeaks', run: () => detectMemoryLeaks(pf) },
  ];

  for (const detector of perFileDetectors) {
    try {
      const detected = detector.run();
      issues.push(...detected);
    } catch (error) {
      console.error(`Error in detector ${detector.name} for file ${pf.filePath}:`, error);
    }
  }

  return issues;
}

export function runCrossFileDetectors(parsedCache: Map<string, ParsedFile>): Issue[] {
  const issues: Issue[] = [];

  const crossFileDetectors = [
    { name: 'duplicateLogic', run: () => detectDuplicateLogic(parsedCache) },
  ];

  for (const detector of crossFileDetectors) {
    try {
      const detected = detector.run();
      issues.push(...detected);
    } catch (error) {
      console.error(`Error in cross-file detector ${detector.name}:`, error);
    }
  }

  return issues;
}
