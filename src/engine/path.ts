export function normalizePath(input: string): string {
  return input.replace(/\\/g, '/').replace(/\/+/g, '/').replace(/^\.\//, '').replace(/\/$/, '')
}

export function dirname(filePath: string): string {
  const normalized = normalizePath(filePath)
  const idx = normalized.lastIndexOf('/')
  return idx === -1 ? '' : normalized.slice(0, idx)
}

export function basename(filePath: string): string {
  const normalized = normalizePath(filePath)
  const idx = normalized.lastIndexOf('/')
  return idx === -1 ? normalized : normalized.slice(idx + 1)
}

export function extname(filePath: string): string {
  const name = basename(filePath)
  const idx = name.lastIndexOf('.')
  return idx === -1 ? '' : name.slice(idx)
}

export function stripExtension(filePath: string): string {
  const extension = extname(filePath)
  return extension ? filePath.slice(0, -extension.length) : filePath
}

export function joinPath(...parts: string[]): string {
  const stack: string[] = []
  for (const part of parts.map(normalizePath).filter(Boolean)) {
    for (const segment of part.split('/')) {
      if (!segment || segment === '.') continue
      if (segment === '..') stack.pop()
      else stack.push(segment)
    }
  }
  return stack.join('/')
}

export function toRelativeImport(fromFile: string, toFile: string): string {
  const fromParts = dirname(fromFile).split('/').filter(Boolean)
  const toParts = stripExtension(normalizePath(toFile)).split('/').filter(Boolean)

  while (fromParts.length && toParts.length && fromParts[0] === toParts[0]) {
    fromParts.shift()
    toParts.shift()
  }

  const prefix = fromParts.map(() => '..')
  const relative = [...prefix, ...toParts].join('/')
  return relative.startsWith('.') ? relative : `./${relative || basename(stripExtension(toFile))}`
}

export function fileExists(fileMap: Map<string, string>, filePath: string): boolean {
  return fileMap.has(normalizePath(filePath))
}

export function resolveVirtualImport(
  fileMap: Map<string, string>,
  fromFile: string,
  specifier: string,
): string | null {
  if (!specifier) return null
  if (!specifier.startsWith('.') && !specifier.startsWith('/') && !specifier.startsWith('@/')) {
    return specifier
  }

  const baseTarget = specifier.startsWith('@/') ? joinPath('src', specifier.slice(2)) : joinPath(dirname(fromFile), specifier)
  const candidates = [
    baseTarget,
    `${baseTarget}.ts`,
    `${baseTarget}.tsx`,
    `${baseTarget}.js`,
    `${baseTarget}.jsx`,
    joinPath(baseTarget, 'index.ts'),
    joinPath(baseTarget, 'index.tsx'),
    joinPath(baseTarget, 'index.js'),
    joinPath(baseTarget, 'index.jsx'),
  ]

  for (const candidate of candidates.map(normalizePath)) {
    if (fileExists(fileMap, candidate)) return candidate
  }

  return null
}

export function replaceExtension(filePath: string, nextExtension: string): string {
  return `${stripExtension(filePath)}${nextExtension.startsWith('.') ? nextExtension : `.${nextExtension}`}`
}

export function isTsLikeFile(filePath: string): boolean {
  return /\.(tsx?|jsx?)$/.test(filePath)
}

export function isTsxFile(filePath: string): boolean {
  return /\.(tsx|jsx)$/.test(filePath)
}
