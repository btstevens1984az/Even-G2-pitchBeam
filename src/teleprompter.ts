export interface TeleprompterLine {
  index: number
  text: string
}

export interface TeleprompterState {
  lines: TeleprompterLine[]
  currentIndex: number
  totalLines: number
}

function normalizeScript(body: string): string[] {
  return body
    .split(/\n+/)
    .map(line => line.trim())
    .filter(Boolean)
}

function wrapLine(line: string, maxChars = 52): string[] {
  if (line.length <= maxChars) return [line]
  const words = line.split(/\s+/)
  const wrapped: string[] = []
  let current = ''

  for (const word of words) {
    const candidate = current ? `${current} ${word}` : word
    if (candidate.length <= maxChars) {
      current = candidate
    } else {
      if (current) wrapped.push(current)
      current = word.length > maxChars ? word.slice(0, maxChars) : word
    }
  }
  if (current) wrapped.push(current)
  return wrapped
}

export function createTeleprompter(body: string): TeleprompterState {
  const rawLines = normalizeScript(body)
  const lines: TeleprompterLine[] = []
  let index = 0

  for (const raw of rawLines) {
    for (const wrapped of wrapLine(raw)) {
      lines.push({ index, text: wrapped })
      index++
    }
  }

  return {
    lines,
    currentIndex: 0,
    totalLines: lines.length,
  }
}

export function getCurrentLine(state: TeleprompterState): string {
  return state.lines[state.currentIndex]?.text ?? ''
}

export function getNextLine(state: TeleprompterState): string {
  return state.lines[state.currentIndex + 1]?.text ?? ''
}

export function getProgress(state: TeleprompterState): number {
  if (state.totalLines === 0) return 0
  return Math.round(((state.currentIndex + 1) / state.totalLines) * 100)
}

export function advanceLine(state: TeleprompterState): TeleprompterState {
  if (state.currentIndex >= state.totalLines - 1) return state
  return { ...state, currentIndex: state.currentIndex + 1 }
}

export function retreatLine(state: TeleprompterState): TeleprompterState {
  if (state.currentIndex <= 0) return state
  return { ...state, currentIndex: state.currentIndex - 1 }
}

export function resetTeleprompter(state: TeleprompterState): TeleprompterState {
  return { ...state, currentIndex: 0 }
}

export function reindexTeleprompter(body: string, previousIndex: number): TeleprompterState {
  const next = createTeleprompter(body)
  return {
    ...next,
    currentIndex: Math.min(previousIndex, Math.max(0, next.totalLines - 1)),
  }
}

export function wordsInLine(line: string): number {
  return line.split(/\s+/).filter(Boolean).length
}

export function msPerWordAtWpm(wpm: number): number {
  if (wpm <= 0) return 400
  return Math.round(60_000 / wpm)
}
