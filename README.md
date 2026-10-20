# thisblock

One loop of focus that everyone shares. Frontend only, no backend.

```
npm install
npm run dev      # http://localhost:5173
npm test         # loop schedule tests
npm run build    # static site in dist/
```

## How the global loop works without a server

Every browser computes the same schedule from the clock (`src/loop.ts`).
A session is 5 to 10 focus blocks of 5 minutes, the last one being "wrap up",
then 1 or 2 break blocks. Session lengths come from a seeded random number
generator keyed by the session index, so two people who open the page at the
same moment see the same block. The strip only shows what is certain: the
first four focus blocks of a session, then hatched unknowns until the wrap up
block starts, which reveals the break length.

## Keys

| key | action |
| --- | --- |
| enter | join (first screen) |
| ? | how it works (replays the welcome screens) |
| l | leave |
| p | mini window (picture-in-picture) |
| n | enable notifications |
| i | install app (when the browser offers it) |
| t | toggle theme |
| esc | close |

## Where things live

- `src/loop.ts` the schedule and what is known ahead
- `src/onboarding.ts` the welcome conversation (new people) and the join screen (its last screen)
- `src/focus.ts` the main screen, `src/actions.ts` minutes today and the row of actions
- `src/style.css` tokens from the design system and component styles
- `src/pip.ts` the mini window
- `src/store.ts` localStorage (joined, theme, per day focus blocks)

Stats data is stored in the browser only. A block counts when you were here
for at least half of it. Notifications are used only when the tab is in the
background (or the window is not focused) and you enabled them on the focus screen: one when wrap up starts, one when the break starts, and an invite when a new session starts.

## Making state changes obvious

A web page cannot bring its window to the front, so the app uses what browsers allow:

- Wrap up, break and new session notifications stay on screen until you close or click them
  (Chrome and Edge). Clicking one brings the app forward. Coming back to the app clears them.
- The mini window is always on top. It takes the state's tint and pulses orange when the state changes.
- The installed app shows a dot on its dock or taskbar icon after a state change while you were away.

## Mini window (picture-in-picture)

Press `p` or use "mini window" in the row under the strip.
It is a small always-on-top window that shows the status word, the hint line and
the strip with the time ruler, and it keeps running while you work in other apps.
If a new session starts while it is open it turns into a join prompt (press enter
in it to join).

- Chrome and Edge on desktop (also the installed app) use Document Picture-in-Picture:
  a real window made of the same components as the app. It must be opened by a click or key press.
- Safari has no such window, so the same view is drawn on a canvas and shown as a
  video in picture-in-picture. It cannot take clicks, so joining happens in the app.
- Firefox has neither, so the command is hidden.
- Phones and tablets: not supported (Document PiP is desktop only).

## Install as an app (PWA)

`public/manifest.webmanifest`, `public/sw.js` and the icons in `public/icons` make it installable.
Serve the built `dist/` over https. All paths are relative, so it works at a domain root or under a sub-path.
After the first visit it also opens offline. In Chrome and Edge use the install icon in the address bar or the
"install app" command in the menu (ctrl or cmd + K). On iOS use Share, then Add to Home Screen.
The service worker only registers in the production build, not in `npm run dev`.

## Does a background tab count?

Yes. The page keeps time with a worker, so a hidden tab still moves through blocks and fires notifications.
If the computer sleeps or the browser freezes the tab for more than about two minutes, presence restarts
and the block you missed does not count.

## Joining at any moment

You always start on focus, and every stretch of focus is 20 to 50 minutes. Joining early in a
session simply follows the shared schedule. Joining near the end of a session (or during wrap up
or a break) gives you a short plan of your own (`src/plan.ts`): focus now, then a break of 5 or
10 minutes, after which you are back on the shared schedule, either right at the start of a new
session or while everyone is focusing with at least 20 minutes to go. The screen, tints,
notifications and sounds follow your plan, so it looks like a normal session.

## Joining is per session

You are in one session at a time. When a session ends (after its break) the next one starts without you,
the app returns to the join screen, and nothing runs for you until you join again. This is so a meeting or
a walk away from the computer never puts you into a session you are not in.

- If notifications are on and you did not press leave, the new session sends an invite with a **join** button.
  Pressing it opens or focuses the app and joins the session that is running. This button needs a Chromium
  browser (Chrome, Edge, Brave) with the service worker running, which means the built site and not `npm run dev`.
  Safari and Firefox show the invite without the button, and clicking it opens the app.
- Pressing leave yourself turns invites off until you join again.
- Wrap up and break notifications go only to people who are in the current session.
- Stats credit a block only while you were joined.

## Deploying to GitHub Pages

`.github/workflows/deploy.yml` tests, builds and deploys `dist/` on every push to `main`.

1. Repo Settings > Pages > Source: **GitHub Actions**.
2. Test at `https://<user>.github.io/thisblock/`.
3. Custom domain: add a `CNAME` DNS record `tb` pointing to `<user>.github.io`, then set
   `tb.sagar.im` under Settings > Pages > Custom domain and tick Enforce HTTPS.
