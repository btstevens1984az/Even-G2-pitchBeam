import type { AppMode, AppSettings, LiveMetrics, Script, SessionStats } from './types'
import { paceLabel } from './speech-analyzer'

export interface PhoneUiCallbacks {
  onStartSession: () => void
  onStopSession: () => void
  onModeChange: (mode: AppMode) => void
  onTargetWpmChange: (wpm: number) => void
  onScriptSelect: (id: string) => void
  onScriptSave: (script: Script) => void
  onScriptCreate: () => void
  onAutoAdvanceChange: (enabled: boolean) => void
}

export function createPhoneUi(callbacks: PhoneUiCallbacks) {
  const root = document.getElementById('phone-app')
  if (!root) return { refresh: () => {}, setSessionActive: () => {} }

  root.innerHTML = `
    <div class="pb-shell">
      <header class="pb-header">
        <div class="pb-brand">
          <span class="pb-logo">◆</span>
          <div>
            <h1>PitchBeam</h1>
            <p>Invisible speech coach for Even G2</p>
          </div>
        </div>
        <div class="pb-badge">PRO</div>
      </header>

      <section class="pb-hero">
        <div class="pb-hero-copy">
          <h2>Speak with confidence.<br/>Nobody sees the script.</h2>
          <p>Live pace coaching and teleprompter lines projected on your lens. Built for keynotes, pitches, podcasts, and sales calls.</p>
        </div>
        <div class="pb-live-card" id="pb-live-card">
          <div class="pb-live-top">
            <span id="pb-pace-label">READY</span>
            <span id="pb-wpm">0 WPM</span>
          </div>
          <div class="pb-vu-track"><div class="pb-vu-fill" id="pb-vu-fill"></div></div>
          <p class="pb-line-preview" id="pb-line-preview">Load a script and tap Start on your glasses.</p>
          <div class="pb-live-meta">
            <span id="pb-target">Target 150 WPM</span>
            <span id="pb-progress">0%</span>
          </div>
        </div>
      </section>

      <section class="pb-controls">
        <div class="pb-control-row">
          <label for="pb-mode">Mode</label>
          <select id="pb-mode">
            <option value="prompter">Prompter — script + pace</option>
            <option value="coach">Coach — pace only</option>
            <option value="rehearse">Rehearse — timed practice</option>
          </select>
        </div>
        <div class="pb-control-row">
          <label for="pb-target-wpm">Target pace <span id="pb-target-value">150</span> WPM</label>
          <input id="pb-target-wpm" type="range" min="100" max="200" step="5" value="150" />
        </div>
        <div class="pb-control-row pb-toggle-row">
          <label for="pb-auto-advance">Auto-advance lines</label>
          <input id="pb-auto-advance" type="checkbox" checked />
        </div>
      </section>

      <section class="pb-scripts">
        <div class="pb-section-head">
          <h3>Scripts</h3>
          <button type="button" class="pb-btn ghost" id="pb-new-script">+ New</button>
        </div>
        <div class="pb-script-list" id="pb-script-list"></div>
      </section>

      <section class="pb-editor">
        <div class="pb-section-head">
          <h3 id="pb-editor-title">Editor</h3>
          <button type="button" class="pb-btn" id="pb-save-script">Save</button>
        </div>
        <textarea id="pb-script-body" rows="10" placeholder="Write your talk here. One paragraph per beat. PitchBeam wraps lines for the G2 display automatically."></textarea>
      </section>

      <section class="pb-session-bar">
        <button type="button" class="pb-btn primary" id="pb-session-btn">Start Session</button>
        <div class="pb-stats" id="pb-stats">
          <div><strong id="pb-stat-peak">—</strong><span>Peak WPM</span></div>
          <div><strong id="pb-stat-avg">—</strong><span>Avg WPM</span></div>
          <div><strong id="pb-stat-score">—</strong><span>Pace score</span></div>
        </div>
      </section>

      <footer class="pb-footer">
        <p>Use your G2 temple tap to advance lines. Double-tap to exit. Mic streams from glasses for live coaching.</p>
      </footer>
    </div>
  `

  const modeSelect = root.querySelector<HTMLSelectElement>('#pb-mode')!
  const targetSlider = root.querySelector<HTMLInputElement>('#pb-target-wpm')!
  const targetValue = root.querySelector<HTMLSpanElement>('#pb-target-value')!
  const autoAdvance = root.querySelector<HTMLInputElement>('#pb-auto-advance')!
  const scriptList = root.querySelector<HTMLDivElement>('#pb-script-list')!
  const editorTitle = root.querySelector<HTMLElement>('#pb-editor-title')!
  const scriptBody = root.querySelector<HTMLTextAreaElement>('#pb-script-body')!
  const sessionBtn = root.querySelector<HTMLButtonElement>('#pb-session-btn')!
  const paceLabelEl = root.querySelector<HTMLSpanElement>('#pb-pace-label')!
  const wpmEl = root.querySelector<HTMLSpanElement>('#pb-wpm')!
  const vuFill = root.querySelector<HTMLDivElement>('#pb-vu-fill')!
  const linePreview = root.querySelector<HTMLParagraphElement>('#pb-line-preview')!
  const targetEl = root.querySelector<HTMLSpanElement>('#pb-target')!
  const progressEl = root.querySelector<HTMLSpanElement>('#pb-progress')!
  const statPeak = root.querySelector<HTMLSpanElement>('#pb-stat-peak')!
  const statAvg = root.querySelector<HTMLSpanElement>('#pb-stat-avg')!
  const statScore = root.querySelector<HTMLSpanElement>('#pb-stat-score')!

  let scripts: Script[] = []
  let activeScriptId: string | null = null
  let sessionActive = false

  modeSelect.addEventListener('change', () => {
    callbacks.onModeChange(modeSelect.value as AppMode)
  })

  targetSlider.addEventListener('input', () => {
    const wpm = Number(targetSlider.value)
    targetValue.textContent = String(wpm)
    callbacks.onTargetWpmChange(wpm)
  })

  autoAdvance.addEventListener('change', () => {
    callbacks.onAutoAdvanceChange(autoAdvance.checked)
  })

  sessionBtn.addEventListener('click', () => {
    if (sessionActive) callbacks.onStopSession()
    else callbacks.onStartSession()
  })

  root.querySelector('#pb-save-script')!.addEventListener('click', () => {
    const script = scripts.find(s => s.id === activeScriptId)
    if (!script) return
    const updated: Script = {
      ...script,
      body: scriptBody.value,
      updatedAt: Date.now(),
    }
    callbacks.onScriptSave(updated)
  })

  root.querySelector('#pb-new-script')!.addEventListener('click', () => {
    callbacks.onScriptCreate()
  })

  function renderScriptList(): void {
    scriptList.innerHTML = scripts
      .map(
        script => `
      <button type="button" class="pb-script-item ${script.id === activeScriptId ? 'active' : ''}" data-id="${script.id}">
        <strong>${escapeHtml(script.title)}</strong>
        <span>${script.body.split(/\s+/).filter(Boolean).length} words</span>
      </button>
    `,
      )
      .join('')

    scriptList.querySelectorAll<HTMLButtonElement>('.pb-script-item').forEach(btn => {
      btn.addEventListener('click', () => {
        const id = btn.dataset.id
        if (id) callbacks.onScriptSelect(id)
      })
    })
  }

  function escapeHtml(text: string): string {
    return text
      .replaceAll('&', '&amp;')
      .replaceAll('<', '&lt;')
      .replaceAll('>', '&gt;')
      .replaceAll('"', '&quot;')
  }

  function setSessionActive(active: boolean): void {
    sessionActive = active
    sessionBtn.textContent = active ? 'Stop Session' : 'Start Session'
    sessionBtn.classList.toggle('danger', active)
    root?.querySelector('.pb-live-card')?.classList.toggle('live', active)
  }

  function refresh(
    settings: AppSettings,
    nextScripts: Script[],
    metrics: LiveMetrics,
    currentLine: string,
    progress: number,
    lastSession: SessionStats | null,
  ): void {
    scripts = nextScripts
    activeScriptId = settings.activeScriptId
    modeSelect.value = settings.mode
    targetSlider.value = String(settings.targetWpm)
    targetValue.textContent = String(settings.targetWpm)
    autoAdvance.checked = settings.autoAdvance

    renderScriptList()

    const active = scripts.find(s => s.id === settings.activeScriptId) ?? scripts[0]
    if (active) {
      editorTitle.textContent = active.title
      if (document.activeElement !== scriptBody) {
        scriptBody.value = active.body
      }
    }

    paceLabelEl.textContent = paceLabel(metrics.paceStatus)
    paceLabelEl.dataset.status = metrics.paceStatus
    wpmEl.textContent = `${metrics.wpm} WPM`
    vuFill.style.width = `${metrics.vuLevel}%`
    linePreview.textContent = currentLine || 'Your current line appears here during a session.'
    targetEl.textContent = `Target ${settings.targetWpm} WPM`
    progressEl.textContent = `${progress}%`

    if (lastSession) {
      statPeak.textContent = String(lastSession.peakWpm)
      statAvg.textContent = String(lastSession.avgWpm)
      statScore.textContent = `${lastSession.paceScore}%`
    }
  }

  return { refresh, setSessionActive }
}
