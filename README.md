# PitchBeam — Even G2 Teleprompter

Teleprompter and live speech pace coaching for Even Realities G2 glasses. Scroll scripts on the HUD, get WPM feedback from the phone mic, and review session summaries.

## Screenshots

| View | Preview |
|------|---------|
| [Cover](#) | ![Cover art](media/01-cover.png) |
| [Menu](#) | ![Glasses menu](media/02-glasses-menu.png) |
| [Prompter](#) | ![Teleprompter on glasses](media/03-glasses-prompter.png) |
| [Pace coach](#) | ![Live pace coaching](media/04-glasses-coach.png) |
| [Summary](#) | ![Session summary](media/05-glasses-summary.png) |
| [Phone companion](#) | ![Phone companion UI](media/06-phone-companion.png) |

![Teleprompter on glasses](media/03-glasses-prompter.png)

![Phone companion UI](media/06-phone-companion.png)

## Run

Requires **Node.js 20+**. Microphone permission is requested on the phone for pace coaching.

### Linux / macOS

```bash
git clone <your-repo-url>
cd pitchbeam
npm install
npm run dev
npm run simulate
npm run pack
```

### Windows

```powershell
git clone <your-repo-url>
cd pitchbeam
npm install
npm run dev
npm run simulate
npm run pack
```

## Controls

- **Scroll** scripts and menu items with temple touchpad or R1 ring
- **Tap** to select; double-tap to exit
