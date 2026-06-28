import { waitForEvenAppBridge, OsEventTypeList } from '@evenrealities/even_hub_sdk'
import type { AppMode, AppSettings, LiveMetrics, Script, SessionStats } from './types'
import { createGlassesUi } from './glasses-ui'
import { createPhoneUi } from './phone-ui'
import { loadScripts, loadSettings, saveScripts, saveSettings, saveLastSession } from './storage'
import {
  createSpeechRecognition,
  createWpmTracker,
  paceFromWpm,
  pcmToRms,
  rmsToVu,
} from './speech-analyzer'
import {
  advanceLine,
  createTeleprompter,
  getCurrentLine,
  getNextLine,
  getProgress,
  msPerWordAtWpm,
  resetTeleprompter,
  reindexTeleprompter,
  wordsInLine,
  type TeleprompterState,
} from './teleprompter'

const bridge = await waitForEvenAppBridge()
const ui = createGlassesUi(bridge)

let settings: AppSettings = await loadSettings(bridge)
let scripts: Script[] = await loadScripts(bridge)
let teleprompter: TeleprompterState = createTeleprompter(getActiveScript().body)

let sessionActive = false
let sessionStartedAt = 0
let confirmPending = false
let autoAdvanceTimer: ReturnType<typeof setTimeout> | null = null

const wpmTracker = createWpmTracker()
let displayWpm = 0
let vuLevel = 0
let wordsSpokenTotal = 0
let wpmSamples: number[] = []
let peakWpm = 0
let perfectSamples = 0

const speechRecognition = createSpeechRecognition(
  () => {
    wpmTracker.pushWord()
    wordsSpokenTotal++
    const wpm = wpmTracker.getWpm()
    if (wpm > 0) {
      displayWpm = wpm
      wpmSamples.push(wpm)
      peakWpm = Math.max(peakWpm, wpm)
      if (paceFromWpm(wpm, settings.targetWpm) === 'perfect') perfectSamples++
    }
    maybeAutoAdvance()
    void syncAll()
  },
  () => {
    // Speech recognition unavailable in some WebViews — PCM fallback still works.
  },
)

function getActiveScript(): Script {
  return (
    scripts.find(s => s.id === settings.activeScriptId) ??
    scripts[0] ??
    ({
      id: 'fallback',
      title: 'Empty',
      body: 'Add a script on your phone to begin.',
      createdAt: Date.now(),
      updatedAt: Date.now(),
    } as Script)
  )
}

function formatElapsed(sec: number): string {
  const m = Math.floor(sec / 60)
  const s = sec % 60
  return `${m}:${String(s).padStart(2, '0')}`
}

function liveMetrics(): LiveMetrics {
  const elapsedSec = sessionActive
    ? Math.floor((Date.now() - sessionStartedAt) / 1000)
    : 0
  return {
    wpm: displayWpm,
    targetWpm: settings.targetWpm,
    paceStatus: sessionActive ? paceFromWpm(displayWpm, settings.targetWpm) : 'idle',
    vuLevel,
    wordsSpoken: wordsSpokenTotal,
    elapsedSec,
  }
}

function buildSettingsLabels(): string[] {
  return [
    `Target: ${settings.targetWpm} WPM`,
    `Auto-advance: ${settings.autoAdvance ? 'On' : 'Off'}`,
    `Next line: ${settings.showNextLine ? 'On' : 'Off'}`,
    'Target -10 WPM',
    'Target +10 WPM',
    'Back to Menu',
  ]
}

async function persistSettings(): Promise<void> {
  await saveSettings(bridge, settings)
}

async function persistScripts(): Promise<void> {
  await saveScripts(bridge, scripts)
}

function scheduleAutoAdvance(): void {
  if (autoAdvanceTimer) clearTimeout(autoAdvanceTimer)
  if (!sessionActive || !settings.autoAdvance || settings.mode === 'coach') return

  const line = getCurrentLine(teleprompter)
  const words = wordsInLine(line)
  const ms = msPerWordAtWpm(settings.targetWpm) * Math.max(words, 1)
  autoAdvanceTimer = setTimeout(() => {
    teleprompter = advanceLine(teleprompter)
    scheduleAutoAdvance()
    void syncAll()
  }, ms)
}

function maybeAutoAdvance(): void {
  if (!settings.autoAdvance || settings.mode === 'coach') return
  scheduleAutoAdvance()
}

function cycleMode(): AppMode {
  const order: AppMode[] = ['prompter', 'coach', 'rehearse']
  const idx = order.indexOf(settings.mode)
  return order[(idx + 1) % order.length]
}

async function syncGlasses(): Promise<void> {
  const script = getActiveScript()
  const metrics = liveMetrics()

  ui.patch({
    mode: settings.mode,
    scriptTitle: script.title,
    currentLine: settings.mode === 'coach' ? 'Pace coaching active' : getCurrentLine(teleprompter),
    nextLine: settings.showNextLine && settings.mode !== 'coach' ? getNextLine(teleprompter) : '',
    wpm: metrics.wpm,
    targetWpm: settings.targetWpm,
    paceStatus: metrics.paceStatus,
    vuLevel: metrics.vuLevel,
    progress: getProgress(teleprompter),
    sessionActive,
    elapsedLabel: formatElapsed(metrics.elapsedSec),
    scriptLabels: scripts.map(s => s.title),
    settingsLabels: buildSettingsLabels(),
  })

  if (ui.getState().screen === 'session') {
    await ui.updateSession()
  } else if (ui.getState().screen === 'menu') {
    await ui.render('menu')
  }
}

let lastSession: SessionStats | null = null

async function syncPhone(): Promise<void> {
  phone.refresh(
    settings,
    scripts,
    liveMetrics(),
    getCurrentLine(teleprompter),
    getProgress(teleprompter),
    lastSession,
  )
  phone.setSessionActive(sessionActive)
}

async function syncAll(): Promise<void> {
  await syncGlasses()
  syncPhone()
}

async function startSession(): Promise<void> {
  if (sessionActive) return
  sessionActive = true
  sessionStartedAt = Date.now()
  wordsSpokenTotal = 0
  wpmSamples = []
  peakWpm = 0
  perfectSamples = 0
  displayWpm = 0
  wpmTracker.reset()
  teleprompter = resetTeleprompter(teleprompter)

  await bridge.audioControl(true)
  if (speechRecognition.isSupported()) speechRecognition.start()
  scheduleAutoAdvance()

  phone.setSessionActive(true)
  ui.patch({ sessionActive: true })
  await ui.render('session')
  syncPhone()
}

async function stopSession(): Promise<void> {
  if (!sessionActive) return
  sessionActive = false
  if (autoAdvanceTimer) {
    clearTimeout(autoAdvanceTimer)
    autoAdvanceTimer = null
  }

  await bridge.audioControl(false)
  speechRecognition.stop()

  const durationSec = Math.max(1, Math.floor((Date.now() - sessionStartedAt) / 1000))
  const avgWpm =
    wpmSamples.length > 0
      ? Math.round(wpmSamples.reduce((a, b) => a + b, 0) / wpmSamples.length)
      : 0
  const paceScore =
    wpmSamples.length > 0 ? Math.round((perfectSamples / wpmSamples.length) * 100) : 0

  lastSession = {
    peakWpm,
    avgWpm,
    wordsSpoken: wordsSpokenTotal,
    durationSec,
    paceScore,
  }

  const summaryText = [
    'SESSION COMPLETE',
    '',
    `Peak: ${peakWpm} WPM`,
    `Average: ${avgWpm} WPM`,
    `Target: ${settings.targetWpm} WPM`,
    `Pace score: ${paceScore}%`,
    `Words: ${wordsSpokenTotal}`,
    `Time: ${formatElapsed(durationSec)}`,
    '',
    'Tap to return to menu.',
  ].join('\n')

  ui.patch({
    sessionActive: false,
    summaryText,
  })

  await saveLastSession(bridge, lastSession as unknown as Record<string, unknown>)
  phone.setSessionActive(false)
  await ui.render('summary')
  syncPhone()
}

const phone = createPhoneUi({
  onStartSession: () => void startSession(),
  onStopSession: () => void requestStopSession(),
  onModeChange: mode => {
    settings = { ...settings, mode }
    void persistSettings().then(syncAll)
  },
  onTargetWpmChange: wpm => {
    settings = { ...settings, targetWpm: wpm }
    void persistSettings().then(syncAll)
  },
  onScriptSelect: id => {
    settings = { ...settings, activeScriptId: id }
    teleprompter = createTeleprompter(getActiveScript().body)
    void persistSettings().then(syncAll)
  },
  onScriptSave: script => {
    scripts = scripts.map(s => (s.id === script.id ? script : s))
    teleprompter = reindexTeleprompter(script.body, teleprompter.currentIndex)
    void persistScripts().then(syncAll)
  },
  onScriptCreate: () => {
    const script: Script = {
      id: `script-${Date.now()}`,
      title: 'Untitled Talk',
      body: 'Start writing your script here.',
      createdAt: Date.now(),
      updatedAt: Date.now(),
    }
    scripts = [script, ...scripts]
    settings = { ...settings, activeScriptId: script.id }
    teleprompter = createTeleprompter(script.body)
    void persistScripts()
    void persistSettings().then(syncAll)
  },
  onAutoAdvanceChange: enabled => {
    settings = { ...settings, autoAdvance: enabled }
    if (enabled) scheduleAutoAdvance()
    void persistSettings()
  },
})

function isDoubleTap(eventType: OsEventTypeList | null | undefined): boolean {
  return eventType === OsEventTypeList.DOUBLE_CLICK_EVENT
}

function isScrollEvent(eventType: OsEventTypeList | null | undefined): boolean {
  return (
    eventType === OsEventTypeList.SCROLL_TOP_EVENT ||
    eventType === OsEventTypeList.SCROLL_BOTTOM_EVENT
  )
}

function isSelectTap(eventType: OsEventTypeList | null | undefined): boolean {
  return (
    eventType === OsEventTypeList.CLICK_EVENT ||
    eventType === undefined ||
    eventType === null
  )
}

async function requestStopSession(): Promise<void> {
  if (!sessionActive || confirmPending) return
  confirmPending = true
  await ui.showConfirm('End session?')
}

async function handleConfirmSelect(yes: boolean): Promise<void> {
  confirmPending = false
  if (yes) {
    await stopSession()
    return
  }
  if (sessionActive) await ui.render('session')
}

async function handleMenuSelect(index: number): Promise<void> {
  const action = ui.menuAction(index)
  switch (action) {
    case 'toggle-session':
      if (sessionActive) await requestStopSession()
      else await startSession()
      break
    case 'cycle-mode':
      settings = { ...settings, mode: cycleMode() }
      await persistSettings()
      await ui.showAlert(`Mode: ${ui.modeLabel(settings.mode)}`, 1_800)
      await syncAll()
      break
    case 'scripts':
      await ui.render('scripts')
      break
    case 'settings':
      ui.patch({ settingsLabels: buildSettingsLabels() })
      await ui.render('settings')
      break
    case 'exit':
      if (sessionActive) await stopSession()
      bridge.shutDownPageContainer(1)
      break
  }
}

async function handleScriptsSelect(index: number, itemName: string | undefined): Promise<void> {
  const total = scripts.length + 1
  if (ui.isScriptsBack(index, itemName, total)) {
    await ui.goToMenu()
    return
  }
  const script = scripts[index]
  if (!script) return
  settings = { ...settings, activeScriptId: script.id }
  teleprompter = createTeleprompter(script.body)
  await persistSettings()
  await ui.showAlert(`Loaded: ${script.title}`, 2_000)
  await ui.goToMenu()
  await syncAll()
}

async function handleSettingsSelect(index: number): Promise<void> {
  const labels = buildSettingsLabels()
  const label = labels[index]
  if (!label) return

  if (label === 'Back to Menu') {
    await ui.goToMenu()
    return
  }
  if (label === 'Target -10 WPM') {
    settings = { ...settings, targetWpm: Math.max(100, settings.targetWpm - 10) }
  } else if (label === 'Target +10 WPM') {
    settings = { ...settings, targetWpm: Math.min(200, settings.targetWpm + 10) }
  } else if (label.startsWith('Auto-advance')) {
    settings = { ...settings, autoAdvance: !settings.autoAdvance }
  } else if (label.startsWith('Next line')) {
    settings = { ...settings, showNextLine: !settings.showNextLine }
  }

  await persistSettings()
  ui.patch({ settingsLabels: buildSettingsLabels() })
  await ui.render('settings')
  syncPhone()
}

async function handleSessionTap(): Promise<void> {
  if (settings.mode === 'coach') return
  teleprompter = advanceLine(teleprompter)
  scheduleAutoAdvance()
  await syncAll()
}

async function handleListTap(itemName: string | undefined, index: number): Promise<void> {
  const screen = ui.getState().screen

  if (screen === 'confirm') {
    if (ui.isConfirmYes(index, itemName)) await handleConfirmSelect(true)
    else if (ui.isConfirmNo(index, itemName)) await handleConfirmSelect(false)
    return
  }

  if (screen === 'menu') {
    await handleMenuSelect(index)
    return
  }

  if (screen === 'scripts') {
    await handleScriptsSelect(index, itemName)
    return
  }

  if (screen === 'settings') {
    await handleSettingsSelect(index)
    return
  }

  if (screen === 'summary') {
    await ui.goToMenu()
    return
  }
}

function handlePcm(pcm: Uint8Array): void {
  if (!sessionActive) return
  const rms = pcmToRms(pcm)
  vuLevel = rmsToVu(rms)

  if (!speechRecognition.isSupported() && rms > 0.02) {
    const estimated = Math.round(settings.targetWpm * (0.85 + rms * 1.5))
    if (estimated > 0) {
      displayWpm = Math.min(220, estimated)
      wpmSamples.push(displayWpm)
      peakWpm = Math.max(peakWpm, displayWpm)
    }
  }

  void syncGlasses()
  syncPhone()
}

const unsubscribe = bridge.onEvenHubEvent(event => {
  const listType = event.listEvent?.eventType ?? null
  const textType = event.textEvent?.eventType ?? null
  const sysType = event.sysEvent?.eventType ?? null

  if (event.audioEvent?.audioPcm) {
    handlePcm(event.audioEvent.audioPcm)
  }

  if (ui.getState().screen === 'confirm') {
    if (isScrollEvent(listType)) return
    if (event.listEvent && isSelectTap(listType)) {
      void handleListTap(
        event.listEvent.currentSelectItemName,
        event.listEvent.currentSelectItemIndex ?? 0,
      )
    }
    return
  }

  if (sessionActive && ui.getState().screen === 'session') {
    if (isDoubleTap(sysType) || isDoubleTap(textType)) {
      void requestStopSession()
      return
    }
    if (isSelectTap(sysType) || isSelectTap(textType)) {
      void handleSessionTap()
    }
  }

  if (isDoubleTap(listType) || isDoubleTap(textType) || isDoubleTap(sysType)) {
    if (sessionActive) void requestStopSession()
    else bridge.shutDownPageContainer(1)
    return
  }

  if (
    sysType === OsEventTypeList.SYSTEM_EXIT_EVENT ||
    sysType === OsEventTypeList.ABNORMAL_EXIT_EVENT
  ) {
    unsubscribe()
    if (sessionActive) void stopSession()
    return
  }

  if (event.listEvent) {
    if (isScrollEvent(listType)) return
    if (!isSelectTap(listType)) return
    void handleListTap(
      event.listEvent.currentSelectItemName,
      event.listEvent.currentSelectItemIndex ?? 0,
    )
  }

  if (event.textEvent && ui.getState().screen === 'summary' && isSelectTap(textType)) {
    void ui.goToMenu()
  }
})

await ui.init()
if (!settings.activeScriptId && scripts[0]) {
  settings = { ...settings, activeScriptId: scripts[0].id }
  await persistSettings()
}
teleprompter = createTeleprompter(getActiveScript().body)
ui.patch({
  scriptLabels: scripts.map(s => s.title),
  settingsLabels: buildSettingsLabels(),
  scriptTitle: getActiveScript().title,
})
await ui.render('menu')
syncPhone()

// Session tick for elapsed time display
setInterval(() => {
  if (!sessionActive) return
  void syncAll()
}, 1000)
