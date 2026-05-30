// src/workers/analysis.worker.ts
// Thin shell — delegates to the shared analyze module

import { runAnalysis } from '../lib/analyze';

self.onmessage = async (e: MessageEvent) => {
  try {
    const { files: filesObj } = e.data;
    if (!filesObj) {
      self.postMessage({ type: 'error', error: 'Nenhum ficheiro recebido para análise.' });
      return;
    }
    const filesMap = new Map<string, string>(Object.entries(filesObj));
    const result = await runAnalysis(filesMap, (file) => {
      self.postMessage({ type: 'progress', file });
    });
    self.postMessage({ type: 'success', result });
  } catch (error) {
    self.postMessage({ type: 'error', error: String(error) });
  }
};
