export type AppMode = 'prompter' | 'coach' | 'rehearse'

export type PaceStatus = 'idle' | 'slow' | 'perfect' | 'fast' | 'silent'

export interface Script {
  id: string
  title: string
  body: string
  createdAt: number
  updatedAt: number
}

export interface AppSettings {
  targetWpm: number
  mode: AppMode
  activeScriptId: string | null
  autoAdvance: boolean
  showNextLine: boolean
}

export interface SessionStats {
  peakWpm: number
  avgWpm: number
  wordsSpoken: number
  durationSec: number
  paceScore: number
}

export interface LiveMetrics {
  wpm: number
  targetWpm: number
  paceStatus: PaceStatus
  vuLevel: number
  wordsSpoken: number
  elapsedSec: number
}

export const DEFAULT_SETTINGS: AppSettings = {
  targetWpm: 150,
  mode: 'prompter',
  activeScriptId: null,
  autoAdvance: true,
  showNextLine: true,
}

export const DEMO_SCRIPTS: Script[] = [
  {
    id: 'demo-founder',
    title: '60-Second Founder Pitch',
    body: `Good morning. I'm building PitchBeam because every great talk starts with confidence.

The problem is simple. Speakers look down at notes, lose their audience, and rush when nerves hit. Presenters need an invisible coach — not another teleprompter on a laptop.

PitchBeam lives on your Even G2 glasses. Your script scrolls in your lens. A live pace meter whispers when you're too fast or too slow. Nobody in the room knows you're reading.

We've tested with keynote speakers, podcast hosts, and sales teams. Average pace accuracy improved forty-two percent in the first session.

We're raising a seed round to launch on Even Hub and expand to enterprise training teams.

The future of public speaking is invisible. Let's build it together.`,
    createdAt: Date.now(),
    updatedAt: Date.now(),
  },
  {
    id: 'demo-toast',
    title: 'Wedding Toast Template',
    body: `For those who don't know me, I'm [your name], and I've had the privilege of knowing [name] for [years].

What I admire most is how they show up for the people they love — with humor, patience, and an unreasonable commitment to good coffee.

[Personal story — keep it under thirty seconds. Make it specific. Make it kind.]

So here's to [name] and [partner]: may your adventures be long, your arguments be short, and your glasses always find their way home.

To the happy couple!`,
    createdAt: Date.now(),
    updatedAt: Date.now(),
  },
  {
    id: 'demo-sales',
    title: 'Sales Discovery Opener',
    body: `Thanks for making time today. I'll keep this tight.

Before I share anything about our product, I'd love to understand your world.

What's the one workflow that costs your team the most time every week?

When that breaks, what does it cost you — in revenue, morale, or sleep?

If we could fix that in ninety days, what would success look like on your end?

Perfect. Let me show you exactly how teams like yours are solving that today.`,
    createdAt: Date.now(),
    updatedAt: Date.now(),
  },
]
