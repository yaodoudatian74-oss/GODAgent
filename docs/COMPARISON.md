# Reference comparison & verification

Two reference inputs were provided: a **UI screenshot** (desktop app) and an
**avatar line‑up**. This document maps them to the implementation, records the
20‑point visual check, and states clearly what is faithful vs re‑implemented.

> Avatars here are **original abstract shapes** built from the "simple shape +
> expressive eyes" idea. No proprietary characters, logos, fonts or copy are
> reproduced.

## Source extraction

- `docs/reference/ui-reference.jpg` — the provided UI screenshot.
- `docs/reference/avatars-reference.jpg` — the provided avatar line‑up.
- `docs/reference/traced-avatars.json` — silhouettes, pill‑eye geometry and
  colours traced from the line‑up (used only to calibrate original shapes).

Sampled UI colours (from the reference): background `#FFFFFF`, selected row
`#F1F1F1`, search field `#F2F2F2`, bot bubble `#EAEAEA`, user bubble `#0F0F0F`,
card `#F6F6F4`, "Done" pill green. These became the light‑theme tokens in
`web/src/styles.css`.

## Side‑by‑side

| Reference | Implementation | Screenshot |
|---|---|---|
| Three‑pane desktop: bot list / chat / optional computer preview | Same, `grid-template-columns` driven | `docs/screens/01-desktop-light.png`, `04-computer-preview.png` |
| Traffic‑light window buttons, "+" new‑bot, search field, pinned + bots sections, user footer | Reproduced | `01-desktop-light.png` |
| Bot rows: avatar, name, time, last line | Reproduced | `01-desktop-light.png` |
| Chat: time separators, grey bot bubbles, **black** user bubble | Reproduced | `03-chat-cards.png` |
| "Computer" card with "• Done" pill + browser image | Reproduced with a **real** screenshot | `03-chat-cards.png` |
| Avatar line‑up: distinct shapes + colours, two pill eyes | 12 original shapes, per‑bot colour, pill eyes | `06-avatar-states.png` |
| Composer: round "+", placeholder "Message <Bot>", send | Reproduced | `01-desktop-light.png` |

## 20‑point visual check

| # | Item | Status |
|---|---|---|
| 1 | Overall layout / pane arrangement | ✅ matches |
| 2 | Sidebar width (~300px) | ✅ `--sidebar-w: 300px` |
| 3 | Text sizes (14px rows, 14.5px bubbles) | ✅ |
| 4 | Font (system UI stack) | ✅ |
| 5 | Card corner radius (14px) | ✅ |
| 6 | Background colours (light + dark) | ✅ sampled |
| 7 | Text colours | ✅ |
| 8 | Icons (search, +, gear, ⋯, 🖥) | ✅ |
| 9 | Composer field (pill, shadow, round buttons) | ✅ |
| 10 | Avatar silhouettes | ✅ original shapes |
| 11 | Eye shape (pill) | ✅ |
| 12 | Expressions per state | ✅ 6 states |
| 13 | Animation speed | ✅ tuned per state (rAF) |
| 14 | Modal dialogs | ✅ create/edit/settings/… |
| 15 | Menus (row context menu) | ✅ |
| 16 | Screen transitions (mobile list↔chat) | ✅ |
| 17 | Mobile padding/layout | ✅ `08/09-mobile-*.png` |
| 18 | Dark mode | ✅ `02-desktop-dark.png` |
| 19 | Light mode | ✅ `01-desktop-light.png` |
| 20 | Per‑bot accent colours | ✅ |

Numeric values that can't be measured from a screenshot (exact paddings,
durations, easing) are **provisional** and tuned by eye; they are easy to adjust
in `styles.css` / `AvatarEngine.ts`.

## Avatar states (feature chapter 4–5)

All six states are implemented and the avatar alone carries the state (no extra
indicator), matching the design intent:

- **idle** — calm, slight breathing bob, periodic blink, gaze drifts / follows pointer.
- **thinking** — looks up, slow sway, slightly narrowed eyes.
- **working** — quick bob, darting eyes, micro‑pulses.
- **waiting** — leans to one side, eyes flatten to slits, occasional sigh squash.
- **blocked** — worried flat/angled eyes, small shake bursts.
- **done** — happy arc eyes, a celebratory pop, then settles back to idle.

See `docs/screens/06-avatar-states.png`.

## Faithful vs re‑implemented (honesty)

**Real / functional**
- Persistent bots, memory, routines, skills, approvals, groups, settings.
- Streaming responses over SSE.
- The computer is a **real** headless Chromium taking real screenshots and
  performing real clicks/scrolls on locally‑served web apps.
- Offline PWA; app state survives restarts.

**Re‑implemented (equivalent behaviour, not identical internals)**
- The agent "brain": a simulation planner by default; a real Claude tool‑use
  loop when `ANTHROPIC_API_KEY` is set. The proprietary Grok Bot model/servers
  are not used.
- Avatars are original shapes calibrated from — not copied out of — the line‑up.

**Deliberately not faked / not included**
- Real external OAuth, real email send, real public web browsing (sandboxed).
- Avatar image generation (shape+colour chosen from the prompt, labelled as such).
- When the computer can't launch, the panel says it's unavailable instead of
  showing a fabricated screen.

## Unverified against the live product

Fine details of the real app's exact spacing, font, easing curves and the newest
UI revisions could not be fetched in this environment (the x.ai / docs.x.ai hosts
are outside the session's allowed network). Those areas are built from the
provided screenshot + public descriptions and marked provisional above. If
`x.ai` and `docs.x.ai` are allowed in the session network settings, the trace and
tokens can be re‑calibrated against live pages.
