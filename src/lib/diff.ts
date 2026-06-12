/**
 * Implementação Myers Diff Algorithm
 * 
 * Compara 'before' vs 'after' line-by-line e produz um array de operações.
 * Usa o algoritmo O(ND) de Eugene W. Myers ("An O(ND) Difference Algorithm").
 */

export type DiffOp = { type: 'equal'; value: string } | { type: 'insert'; value: string } | { type: 'delete'; value: string }

function equals(a: string, b: string): boolean {
    return a === b
}

interface MiddleSnake {
    x: number
    y: number
    u: number
    v: number
    deleteCount: number
    insertCount: number
}

function shortestEditScript(
    oldArr: string[],
    newArr: string[],
    oldLo: number,
    oldHi: number,
    newLo: number,
    newHi: number,
): MiddleSnake | null {
    const oldLen = oldHi - oldLo
    const newLen = newHi - newLo
    const maxD = oldLen + newLen

    if (oldLen === 0 && newLen === 0) return null
    if (oldLen === 0) return { x: oldLo, y: newLo, u: oldLo, v: newHi, deleteCount: 0, insertCount: newLen }
    if (newLen === 0) return { x: oldLo, y: newLo, u: oldHi, v: newLo, deleteCount: oldLen, insertCount: 0 }

    const delta = oldLen - newLen
    const size = maxD + 1
    const fp: number[] = new Array(2 * size + 2).fill(-1)
    const offset = size

    for (let d = 0; d <= maxD; d++) {
        for (let k = -d; k <= d; k += 2) {
            let x: number
            const km1 = k - 1
            const kp1 = k + 1
            const pkm1 = fp[offset + km1] ?? -1
            const pkp1 = fp[offset + kp1] ?? -1

            if (k === -d || (k !== d && pkm1 < pkp1)) {
                x = pkp1
            } else {
                x = pkm1 + 1
            }

            let y = x - k
            let x0 = x
            let y0 = y

            while (x < oldHi && y < newHi && equals(oldArr[x], newArr[y])) {
                x++
                y++
            }

            fp[offset + k] = x

            if (delta % 2 === 1 && k >= delta - (d - 1) && k <= delta + (d - 1)) {
                if (x >= oldHi && y >= newHi) {
                    return { x: x0, y: y0, u: x, v: y, deleteCount: 0, insertCount: 0 }
                }
                const pk = fp[offset + k]
                const pDelta = fp[offset + delta]
                if (pk !== undefined && pDelta !== undefined && pk >= pDelta) {
                    return { x: x0, y: y0, u: x, v: y, deleteCount: 0, insertCount: 0 }
                }
            }
        }
    }

    return null
}

function myersDiffInternal(
    oldArr: string[],
    newArr: string[],
    oldLo: number,
    oldHi: number,
    newLo: number,
    newHi: number,
    ops: DiffOp[],
): void {
    while (oldLo < oldHi && newLo < newHi && equals(oldArr[oldLo], newArr[newLo])) {
        ops.push({ type: 'equal', value: oldArr[oldLo] })
        oldLo++
        newLo++
    }

    while (oldLo < oldHi && newLo < newHi && equals(oldArr[oldHi - 1], newArr[newHi - 1])) {
        oldHi--
        newHi--
    }

    if (oldLo === oldHi) {
        while (newLo < newHi) {
            ops.push({ type: 'insert', value: newArr[newLo] })
            newLo++
        }
        return
    }

    if (newLo === newHi) {
        while (oldLo < oldHi) {
            ops.push({ type: 'delete', value: oldArr[oldLo] })
            oldLo++
        }
        return
    }

    const snake = shortestEditScript(oldArr, newArr, oldLo, oldHi, newLo, newHi)

    if (!snake) {
        // fallback: delete + insert
        for (let i = oldLo; i < oldHi; i++) ops.push({ type: 'delete', value: oldArr[i] })
        for (let i = newLo; i < newHi; i++) ops.push({ type: 'insert', value: newArr[i] })
        return
    }

    myersDiffInternal(oldArr, newArr, oldLo, snake.x, newLo, snake.y, ops)
    myersDiffInternal(oldArr, newArr, snake.u, oldHi, snake.v, newHi, ops)
}

/**
 * Produz um diff linha-a-linha entre duas strings.
 * Retorna um array de operações (equal, insert, delete).
 */
export function computeLineDiff(before: string, after: string): DiffOp[] {
    const oldLines = before.split('\n')
    const newLines = after.split('\n')
    const ops: DiffOp[] = []
    myersDiffInternal(oldLines, newLines, 0, oldLines.length, 0, newLines.length, ops)
    return ops
}

/**
 * Agrupa o diff em chunks (hunks) para renderização.
 * Cada hunk tem linhas de contexto + mudanças.
 */
export interface DiffHunk {
    oldStart: number
    oldLines: number
    newStart: number
    newLines: number
    lines: Array<{
        type: 'equal' | 'insert' | 'delete'
        content: string
        oldLineNo: number | null
        newLineNo: number | null
    }>
}

export function buildDiffHunks(before: string, after: string, contextLines = 3): DiffHunk[] {
    const ops = computeLineDiff(before, after)
    const hunks: DiffHunk[] = []
    let current: DiffHunk['lines'] = []
    let oldLineNo = 1
    let newLineNo = 1
    let pendingContext: Array<{ content: string; oldLineNo: number; newLineNo: number }> = []

    function flushPending() {
        if (pendingContext.length > 0) {
            const ctx = pendingContext.slice(-contextLines)
            for (const c of ctx) {
                current.push({ type: 'equal', content: c.content, oldLineNo: c.oldLineNo, newLineNo: c.newLineNo })
            }
            pendingContext = []
        }
    }

    function finishHunk() {
        if (current.length === 0) return

        const firstChange = current.find(l => l.type !== 'equal')
        const lastChange = [...current].reverse().find(l => l.type !== 'equal')

        if (!firstChange || !lastChange) {
            current = []
            return
        }

        // Trim leading equal lines beyond context
        while (current.length > 0 && current[0].type === 'equal') {
            current.shift()
        }

        // Trim trailing equal lines beyond context
        while (current.length > 0 && current[current.length - 1].type === 'equal') {
            current.pop()
        }

        const hunkOldStart = current[0]?.oldLineNo ?? oldLineNo
        const hunkNewStart = current[0]?.newLineNo ?? newLineNo
        const hunkOldCount = current.filter(l => l.type === 'delete' || l.type === 'equal').length
        const hunkNewCount = current.filter(l => l.type === 'insert' || l.type === 'equal').length

        // Re-add context lines before first change
        const trimmedBefore: typeof current = []
        let foundChange = false
        for (const line of current) {
            if (line.type !== 'equal') foundChange = true
            if (foundChange) trimmedBefore.push(line)
        }
        // Re-add context lines after last change
        foundChange = false
        const trimmedAfter: typeof current = []
        for (const line of [...current].reverse()) {
            if (line.type !== 'equal') foundChange = true
            if (foundChange) trimmedAfter.unshift(line)
        }

        // Just use current as-is after trimming
        hunks.push({
            oldStart: hunkOldStart,
            oldLines: hunkOldCount,
            newStart: hunkNewStart,
            newLines: hunkNewCount,
            lines: current,
        })

        current = []
    }

    for (const op of ops) {
        if (op.type === 'equal') {
            pendingContext.push({ content: op.value, oldLineNo, newLineNo })
            oldLineNo++
            newLineNo++

            if (pendingContext.length > contextLines * 2) {
                pendingContext.shift()
            }

            current.push({ type: 'equal', content: op.value, oldLineNo: oldLineNo - 1, newLineNo: newLineNo - 1 })
        } else {
            flushPending()
            if (op.type === 'delete') {
                current.push({ type: 'delete', content: op.value, oldLineNo, newLineNo: null })
                oldLineNo++
            } else {
                current.push({ type: 'insert', content: op.value, oldLineNo: null, newLineNo })
                newLineNo++
            }
        }
    }

    finishHunk()
    return hunks
}