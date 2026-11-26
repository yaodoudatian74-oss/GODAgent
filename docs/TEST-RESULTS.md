# Test results

Run on the recreation build (simulation engine; real Playwright computer).

## Server API tests — `npm --prefix server test`

9 / 9 passing:

```
ok 1 - bootstrap returns seeded bots and catalog
ok 2 - create, edit, and delete a bot
ok 3 - a turn produces a streamed reply and persists messages
ok 4 - approval flow: card is raised and resolves
ok 5 - memory can be added and removed
ok 6 - routine create and manual run
ok 7 - connections connect/disconnect
ok 8 - avatar generate is deterministic from prompt
ok 9 - computer status endpoint reports availability honestly
# tests 9  # pass 9  # fail 0
```

## Web type-check + build — `npm --prefix web run build`

Passes (`tsc -b` clean, Vite build ~0.7s, ~196 kB JS / 61 kB gzip).

## End-to-end tests — `npm --prefix web run test:e2e`

6 / 6 passing (Playwright, against the server serving the built SPA):

```
✓ loads the app with sidebar bots and a chat
✓ sending a message streams a bot reply
✓ computer + approval flow renders cards and resolves
✓ creating a bot adds it to the sidebar
✓ avatar states preview shows six states
✓ dark mode applies
6 passed
```

## Manual / visual verification

Screenshots captured headlessly with **0 console errors** on every screen:

| File | Shows |
|---|---|
| `docs/screens/01-desktop-light.png` | Full desktop, light |
| `docs/screens/02-desktop-dark.png` | Dark mode |
| `docs/screens/03-chat-cards.png` | Streaming reply + user bubble + Computer card |
| `docs/screens/04-computer-preview.png` | Three‑pane with live computer preview |
| `docs/screens/05-settings.png` | Settings (tabs) |
| `docs/screens/06-avatar-states.png` | All six avatar states |
| `docs/screens/07-create-bot.png` | New‑Bot dialog |
| `docs/screens/08-mobile-list.png` | Mobile bot list |
| `docs/screens/09-mobile-chat.png` | Mobile chat |

## Feature coverage (chapter 26 checklist)

| Feature | State |
|---|---|
| Bot create / edit / delete | ✅ |
| Avatar edit (shape / colour / generate / upload) | ✅ |
| Shape change + colour change | ✅ |
| All six state animations | ✅ |
| Send message / streaming response | ✅ |
| File attach (25 MB limit) | ✅ |
| Memory persistence | ✅ |
| Group chat + bot‑to‑bot handoff | ✅ |
| Routine create / run / schedule | ✅ |
| Skill create / use | ✅ |
| Connect apps | ✅ |
| Computer operate (real browser) | ✅ |
| Takeover | ✅ |
| Approve / Deny / Always allow | ✅ |
| Notifications | ⚠️ local only |
| Voice | ❌ not implemented in this build |
| App restart → state persists | ✅ (JSON store) |
| Work continues (routines/background turns) | ✅ |

Known gaps are listed honestly in the README ("Not included / re‑implemented")
and `docs/COMPARISON.md`. Voice chat/voice memo is the main unbuilt chapter.
