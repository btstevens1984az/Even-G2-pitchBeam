import type { PaceStatus } from './types'

const SAMPLE_RATE = 16_000

export function pcmToRms(pcm: Uint8Array): number {
  if (pcm.length < 2) return 0
  const view = new DataView(pcm.buffer, pcm.byteOffset, pcm.byteLength)
  const sampleCount = Math.floor(pcm.byteLength / 2)
  if (sampleCount === 0) return 0

  let sum = 0
  for (let i = 0; i < sampleCount; i++) {
    const sample = view.getInt16(i * 2, true) / 32_768
    sum += sample * sample
  }
  return Math.sqrt(sum / sampleCount)
}

export function rmsToVu(rms: number): number {
  const normalized = Math.min(1, rms * 12)
  return Math.round(normalized * 100)
}

export function paceFromWpm(wpm: number, targetWpm: number): PaceStatus {
  if (wpm <= 0) return 'silent'
  const ratio = wpm / targetWpm
  if (ratio < 0.82) return 'slow'
  if (ratio > 1.18) return 'fast'
  return 'perfect'
}

export function paceLabel(status: PaceStatus): string {
  switch (status) {
    case 'slow':
      return 'SLOW DOWN'
    case 'fast':
      return 'SPEED UP'
    case 'perfect':
      return 'ON PACE'
    case 'silent':
      return 'SPEAK UP'
    default:
      return 'READY'
  }
}

export function paceBar(vu: number, segments = 5): string {
  const filled = Math.round((vu / 100) * segments)
  return '●'.repeat(filled) + '○'.repeat(Math.max(0, segments - filled))
}

export function wpmBar(wpm: number, targetWpm: number, width = 20): string {
  const max = Math.max(targetWpm * 1.6, wpm, 1)
  const pos = Math.min(width - 1, Math.round((wpm / max) * (width - 1)))
  const targetPos = Math.min(width - 1, Math.round((targetWpm / max) * (width - 1)))
  const chars = Array.from({ length: width }, () => '─')
  chars[targetPos] = '│'
  chars[pos] = '◆'
  return chars.join('')
}

export interface WpmTracker {
  pushWord: () => void
  getWpm: () => number
  getWordCount: () => number
  reset: () => void
}

export function createWpmTracker(windowMs = 8_000): WpmTracker {
  const timestamps: number[] = []

  function prune(now: number): void {
    while (timestamps.length > 0 && now - timestamps[0] > windowMs) {
      timestamps.shift()
    }
  }

  return {
    pushWord() {
      timestamps.push(Date.now())
    },
    getWpm() {
      const now = Date.now()
      prune(now)
      if (timestamps.length < 2) return 0
      const spanMs = now - timestamps[0]
      if (spanMs <= 0) return 0
      return Math.round((timestamps.length / spanMs) * 60_000)
    },
    getWordCount() {
      return timestamps.length
    },
    reset() {
      timestamps.length = 0
    },
  }
}

export interface SpeechRecognitionHandle {
  start: () => void
  stop: () => void
  isSupported: () => boolean
}

interface BrowserSpeechRecognition extends EventTarget {
  continuous: boolean
  interimResults: boolean
  lang: string
  onresult: ((event: SpeechRecognitionEventLike) => void) | null
  onerror: ((event: { error?: string }) => void) | null
  onend: (() => void) | null
  start: () => void
  stop: () => void
}

interface SpeechRecognitionEventLike {
  resultIndex: number
  results: ArrayLike<{
    isFinal: boolean
    0?: { transcript?: string }
  }>
}

export function createSpeechRecognition(
  onWord: (word: string) => void,
  onError?: (message: string) => void,
): SpeechRecognitionHandle {
  const SpeechRecognitionCtor =
    (window as unknown as { SpeechRecognition?: new () => BrowserSpeechRecognition })
      .SpeechRecognition ??
    (window as unknown as { webkitSpeechRecognition?: new () => BrowserSpeechRecognition })
      .webkitSpeechRecognition

  let recognition: BrowserSpeechRecognition | null = null
  let running = false

  function ensureRecognition(): BrowserSpeechRecognition | null {
    if (!SpeechRecognitionCtor) return null
    if (!recognition) {
      recognition = new SpeechRecognitionCtor()
      recognition.continuous = true
      recognition.interimResults = true
      recognition.lang = 'en-US'

      recognition.onresult = event => {
        for (let i = event.resultIndex; i < event.results.length; i++) {
          const result = event.results[i]
          if (!result.isFinal) continue
          const text = result[0]?.transcript?.trim()
          if (!text) continue
          for (const word of text.split(/\s+/)) {
            if (word) onWord(word)
          }
        }
      }

      recognition.onerror = event => {
        onError?.(event.error ?? 'speech recognition error')
      }

      recognition.onend = () => {
        if (running && recognition) {
          try {
            recognition.start()
          } catch {
            // Ignore restart races when stopping.
          }
        }
      }
    }
    return recognition
  }

  return {
    isSupported() {
      return Boolean(SpeechRecognitionCtor)
    },
    start() {
      const rec = ensureRecognition()
      if (!rec) return
      running = true
      try {
        rec.start()
      } catch {
        // Already started.
      }
    },
    stop() {
      running = false
      if (!recognition) return
      try {
        recognition.stop()
      } catch {
        // Ignore.
      }
    },
  }
}

export function estimateWpmFromVoiceActivity(
  _rms: number,
  wasSpeaking: boolean,
  syllablesThisBurst: number,
  burstDurationMs: number,
): number {
  if (!wasSpeaking || burstDurationMs < 400 || syllablesThisBurst < 2) return 0
  const syllablesPerMin = (syllablesThisBurst / burstDurationMs) * 60_000
  return Math.round(syllablesPerMin / 1.3)
}

export { SAMPLE_RATE }
