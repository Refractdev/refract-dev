import { analyzeForRefactoring } from '../engine'

self.onmessage = async (event: MessageEvent) => {
  const { files: filesObject, options } = event.data ?? {}
  const fileMap = new Map<string, string>(Object.entries(filesObject ?? {}))

  try {
    const proposals = await analyzeForRefactoring(fileMap, options)
    self.postMessage({ type: 'success', proposals })
  } catch (error) {
    self.postMessage({
      type: 'error',
      error: error instanceof Error ? error.message : String(error),
    })
  }
}
