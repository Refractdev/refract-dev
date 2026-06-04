export function throwIfDbError(error: { message?: string } | null | undefined, context: string): void {
  if (!error) return
  throw new Error(`${context}: ${error.message ?? 'Unknown database error'}`)
}

