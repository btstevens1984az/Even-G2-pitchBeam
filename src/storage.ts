import type { AppSettings, Script } from './types'
import { DEFAULT_SETTINGS, DEMO_SCRIPTS } from './types'

const KEYS = {
  scripts: 'pitchbeam_scripts',
  settings: 'pitchbeam_settings',
  lastSession: 'pitchbeam_last_session',
} as const

type StorageBridge = {
  getLocalStorage: (key: string) => Promise<string | null>
  setLocalStorage: (key: string, value: string) => Promise<boolean | void>
}

export async function loadScripts(bridge: StorageBridge): Promise<Script[]> {
  try {
    const raw = await bridge.getLocalStorage(KEYS.scripts)
    if (!raw) return [...DEMO_SCRIPTS]
    const parsed = JSON.parse(raw) as Script[]
    return parsed.length > 0 ? parsed : [...DEMO_SCRIPTS]
  } catch {
    return [...DEMO_SCRIPTS]
  }
}

export async function saveScripts(bridge: StorageBridge, scripts: Script[]): Promise<void> {
  await bridge.setLocalStorage(KEYS.scripts, JSON.stringify(scripts))
}

export async function loadSettings(bridge: StorageBridge): Promise<AppSettings> {
  try {
    const raw = await bridge.getLocalStorage(KEYS.settings)
    if (!raw) return { ...DEFAULT_SETTINGS, activeScriptId: DEMO_SCRIPTS[0].id }
    return { ...DEFAULT_SETTINGS, ...JSON.parse(raw) }
  } catch {
    return { ...DEFAULT_SETTINGS, activeScriptId: DEMO_SCRIPTS[0].id }
  }
}

export async function saveSettings(bridge: StorageBridge, settings: AppSettings): Promise<void> {
  await bridge.setLocalStorage(KEYS.settings, JSON.stringify(settings))
}

export async function saveLastSession(
  bridge: StorageBridge,
  stats: Record<string, unknown>,
): Promise<void> {
  await bridge.setLocalStorage(KEYS.lastSession, JSON.stringify(stats))
}

export async function loadLastSession(
  bridge: StorageBridge,
): Promise<Record<string, unknown> | null> {
  try {
    const raw = await bridge.getLocalStorage(KEYS.lastSession)
    return raw ? (JSON.parse(raw) as Record<string, unknown>) : null
  } catch {
    return null
  }
}
