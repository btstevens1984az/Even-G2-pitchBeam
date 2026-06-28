import {
  ListContainerProperty,
  ListItemContainerProperty,
  TextContainerProperty,
  CreateStartUpPageContainer,
  RebuildPageContainer,
  TextContainerUpgrade,
  type EvenAppBridge,
} from '@evenrealities/even_hub_sdk'
import type { AppMode, PaceStatus } from './types'
import { paceBar, paceLabel, wpmBar } from './speech-analyzer'

export type Screen =
  | 'menu'
  | 'session'
  | 'scripts'
  | 'settings'
  | 'summary'
  | 'alert'
  | 'confirm'

const TITLE_ID = 1
const BODY_ID = 2
const MENU_LIST_ID = 10
const SCRIPTS_LIST_ID = 11
const SETTINGS_LIST_ID = 12
const CONFIRM_LIST_ID = 13

export interface GlassesUiState {
  screen: Screen
  mode: AppMode
  scriptTitle: string
  currentLine: string
  nextLine: string
  wpm: number
  targetWpm: number
  paceStatus: PaceStatus
  vuLevel: number
  progress: number
  sessionActive: boolean
  elapsedLabel: string
  scriptLabels: string[]
  settingsLabels: string[]
  alertText: string
  confirmText: string
  summaryText: string
  previousScreen: Screen
}

export function createGlassesUi(bridge: EvenAppBridge) {
  let state: GlassesUiState = {
    screen: 'menu',
    mode: 'prompter',
    scriptTitle: 'PitchBeam',
    currentLine: '',
    nextLine: '',
    wpm: 0,
    targetWpm: 150,
    paceStatus: 'idle',
    vuLevel: 0,
    progress: 0,
    sessionActive: false,
    elapsedLabel: '0:00',
    scriptLabels: [],
    settingsLabels: [],
    alertText: '',
    confirmText: 'End session?',
    summaryText: '',
    previousScreen: 'menu',
  }

  let renderChain: Promise<void> = Promise.resolve()
  let renderGeneration = 0

  function modeLabel(mode: AppMode): string {
    switch (mode) {
      case 'prompter':
        return 'Prompter'
      case 'coach':
        return 'Coach'
      case 'rehearse':
        return 'Rehearse'
    }
  }

  function menuItems(): string[] {
    const sessionLabel = state.sessionActive ? 'Stop Session' : 'Start Session'
    return [
      sessionLabel,
      `Mode: ${modeLabel(state.mode)}`,
      `Script: ${state.scriptTitle.slice(0, 28)}`,
      'Choose Script',
      'Settings',
      'Exit',
    ].map(s => s.slice(0, 64))
  }

  function formatSessionBody(): string {
    const pace = paceLabel(state.paceStatus)
    const meter = paceBar(state.vuLevel)
    const track = wpmBar(state.wpm, state.targetWpm)
    const lines = [
      `${state.wpm} WPM  target ${state.targetWpm}  ${meter}`,
      track,
      '',
      state.currentLine || '(waiting for script)',
      '',
      `▲ ${pace}`,
    ]

    if (state.nextLine) {
      lines.push('', `Next: ${state.nextLine}`)
    }

    lines.push(
      '',
      `Progress ${state.progress}%  ${state.elapsedLabel}`,
      state.mode === 'prompter' ? 'Tap = next line' : 'Speak naturally',
      'Double-tap = exit',
    )

    return lines.join('\n').slice(0, 2000)
  }

  function formatSummary(): string {
    return state.summaryText.slice(0, 2000)
  }

  function titleBar(text: string, capture = 0): TextContainerProperty {
    return new TextContainerProperty({
      xPosition: 4,
      yPosition: 2,
      width: 568,
      height: 32,
      borderWidth: 0,
      borderColor: 5,
      paddingLength: 2,
      containerID: TITLE_ID,
      containerName: 'title',
      content: text.slice(0, 2000),
      isEventCapture: capture,
    })
  }

  function bodyText(content: string, capture = 1): TextContainerProperty {
    return new TextContainerProperty({
      xPosition: 0,
      yPosition: 0,
      width: 576,
      height: 288,
      borderWidth: 0,
      borderColor: 5,
      paddingLength: 2,
      containerID: BODY_ID,
      containerName: 'body',
      content: content.slice(0, 2000),
      isEventCapture: capture,
    })
  }

  function buildList(
    items: string[],
    containerID: number,
    containerName: string,
  ): ListContainerProperty {
    return new ListContainerProperty({
      xPosition: 4,
      yPosition: 36,
      width: 568,
      height: 248,
      borderWidth: 0,
      borderColor: 5,
      paddingLength: 2,
      containerID,
      containerName,
      itemContainer: new ListItemContainerProperty({
        itemCount: items.length,
        itemWidth: 0,
        isItemSelectBorderEn: 1,
        itemName: items.map(item => item.slice(0, 64)),
      }),
      isEventCapture: 1,
    })
  }

  function pageConfig(screen: Screen) {
    switch (screen) {
      case 'menu':
        return {
          total: 2,
          texts: [titleBar('PITCHBEAM — tap to select')],
          lists: [buildList(menuItems(), MENU_LIST_ID, 'menu-list')],
        }
      case 'session':
        return {
          total: 2,
          texts: [
            titleBar(
              `${modeLabel(state.mode).toUpperCase()} — ${state.scriptTitle}`.slice(0, 80),
            ),
            bodyText(formatSessionBody(), 1),
          ],
          lists: [],
        }
      case 'scripts':
        return {
          total: 2,
          texts: [titleBar('Scripts — tap to load')],
          lists: [
            buildList(
              [...state.scriptLabels, 'Back to Menu'],
              SCRIPTS_LIST_ID,
              'scripts-list',
            ),
          ],
        }
      case 'settings':
        return {
          total: 2,
          texts: [titleBar('Settings')],
          lists: [buildList(state.settingsLabels, SETTINGS_LIST_ID, 'settings-list')],
        }
      case 'summary':
        return {
          total: 2,
          texts: [titleBar('Session Complete'), bodyText(formatSummary(), 1)],
          lists: [],
        }
      case 'alert':
        return {
          total: 1,
          texts: [bodyText(state.alertText, 0)],
          lists: [],
        }
      case 'confirm':
        return {
          total: 2,
          texts: [titleBar(state.confirmText)],
          lists: [buildList(['Yes', 'No'], CONFIRM_LIST_ID, 'confirm-list')],
        }
    }
  }

  function enqueueRender(screen: Screen): Promise<void> {
    const generation = ++renderGeneration
    renderChain = renderChain
      .then(async () => {
        if (generation !== renderGeneration) return
        state.screen = screen
        const page = pageConfig(screen)
        await bridge.rebuildPageContainer(
          new RebuildPageContainer({
            containerTotalNum: page.total,
            textObject: page.texts,
            listObject: page.lists,
          }),
        )
      })
      .catch(() => {
        // Keep queue alive on rebuild failure.
      })
    return renderChain
  }

  async function init(): Promise<void> {
    const page = pageConfig('menu')
    const result = await bridge.createStartUpPageContainer(
      new CreateStartUpPageContainer({
        containerTotalNum: page.total,
        textObject: page.texts,
        listObject: page.lists,
      }),
    )
    state.screen = 'menu'
    if (result !== 0) await render('menu')
  }

  async function render(screen: Screen = state.screen): Promise<void> {
    await enqueueRender(screen)
  }

  async function goToMenu(): Promise<void> {
    renderGeneration++
    state.previousScreen = 'menu'
    const generation = renderGeneration
    renderChain = renderChain
      .then(async () => {
        if (generation !== renderGeneration) return
        state.screen = 'menu'
        const page = pageConfig('menu')
        await bridge.rebuildPageContainer(
          new RebuildPageContainer({
            containerTotalNum: page.total,
            textObject: page.texts,
            listObject: page.lists,
          }),
        )
      })
      .catch(() => {})
    return renderChain
  }

  async function updateSession(): Promise<void> {
    if (state.screen !== 'session') return
    await bridge.textContainerUpgrade(
      new TextContainerUpgrade({
        containerID: BODY_ID,
        content: formatSessionBody(),
      }),
    )
    await bridge.textContainerUpgrade(
      new TextContainerUpgrade({
        containerID: TITLE_ID,
        content: `${modeLabel(state.mode).toUpperCase()} — ${state.scriptTitle}`.slice(0, 80),
      }),
    )
  }

  async function showAlert(text: string, durationMs = 2_500): Promise<void> {
    state.previousScreen = state.screen === 'alert' ? state.previousScreen : state.screen
    state.alertText = text
    await render('alert')
    setTimeout(() => {
      void (state.previousScreen === 'menu' ? goToMenu() : render(state.previousScreen))
    }, durationMs)
  }

  async function showConfirm(text = 'End session?'): Promise<void> {
    state.previousScreen = state.screen
    state.confirmText = text
    await render('confirm')
  }

  function patch(partial: Partial<GlassesUiState>): void {
    state = { ...state, ...partial }
  }

  function getState(): GlassesUiState {
    return state
  }

  function menuAction(
    index: number,
  ): 'toggle-session' | 'cycle-mode' | 'scripts' | 'settings' | 'exit' | null {
    switch (index) {
      case 0:
        return 'toggle-session'
      case 1:
        return 'cycle-mode'
      case 2:
        return null
      case 3:
        return 'scripts'
      case 4:
        return 'settings'
      case 5:
        return 'exit'
      default:
        return null
    }
  }

  function isConfirmYes(index: number, itemName: string | undefined): boolean {
    return index === 0 || itemName === 'Yes'
  }

  function isConfirmNo(index: number, itemName: string | undefined): boolean {
    return index === 1 || itemName === 'No'
  }

  function isScriptsBack(index: number, itemName: string | undefined, total: number): boolean {
    return index === total - 1 || itemName === 'Back to Menu'
  }

  return {
    init,
    render,
    goToMenu,
    updateSession,
    showAlert,
    showConfirm,
    patch,
    getState,
    menuAction,
    isConfirmYes,
    isConfirmNo,
    isScriptsBack,
    modeLabel,
  }
}
