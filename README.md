# thisblock

Your day as focus and break blocks that you can reshape. Frontend only, no backend.

```
npm install
npm run dev      # http://localhost:5173
npm test         # plan and format tests
npm run build    # static ## How it looks

There are two screens. The join screen is just how much you focused today and a join button;
when you leave, the minutes you just added count up into the day. While you are in, the page
takes on the colour of your state (focus orange, wrap up amber, break green), with a small
illustration made of blocks, the state's name and a big countdown: focus counts down to your
break, a break to its end. Under it is your day.

## Your day

Joining starts your day: a plan of focus and break blocks, end to end, beginning with focus
(`src/day.ts`). Focus blocks are 25 to 50 minutes and breaks 5 or 10. The plan has no end:
more is made as time goes on, so it simply carries on into tomorrow. If you leave and join again
the same day, you carry on with the same plan; a new day starts a new one.

The day shows as two lanes, focus on top and breaks below, from a little before you started to
a few hours ahead. What you were in is solid, what you missed is hatched, what is ahead is lighter.

You can reshape what is ahead by dragging. Hover an edge: the cursor turns into a resize arrow
and the block turns solid. Dragging snaps to 5 minutes and shows the block's length inside it.

- A block's right edge changes its length and moves everything after it.
- A focus block's left edge trades time with the break before it. A break has no left edge of its own.
- Focus is 15 minutes to an hour; a break is at least 5 minutes, with no upper limit.
- Nothing before now can change. Esc while dragging puts it back.

Double-click a focus block (the running one or one ahead) to name it. The running block's name
shows under the countdown, with an e key beside it (or press e) to change it; in a break you see what is next. Named
blocks have a small dot on the day and show their name on hover. A name stays with its block when
edges move, and it shows in the tab title, the mini window and the notification when focus starts.

ur minutes today.

## Keys

| key | action |
| --- | --- |
| enter | join |
| l | leave |
| e | name the running focus block (in a break, the next one) |
| p | mini window (picture-in-picture) |
| n | notifications on or off |
| s | sound on or off |
| i | install app (when the browser offers it) |
| t | toggle theme |
| esc | close the settings menu |

## Where things live

- `src/day.ts` the plan: making it, what a moment is, and the edits; `src/me.ts` your plan in the browser
- `src/stage.ts` the one stage, with the join screen and your day as its two modes
- `src/timeline.ts` the day you can drag, `src/scene.ts` the illustration for each state, `src/odometer.ts` the rolling countdown
- `src/copy.ts` the state labels, `src/actions.ts` minutes today, leave and the settings menu
- `src/notify.ts` notifications and the app badge, `src/sound.ts` the cues
- `src/pip.ts` the mini window
- `src/style.css` tokens from the design system and component styles
- `src/store.ts` localStorage (joined, your plan, theme, per day focus blocks)

Stats data is stored in the browser only. Focus counts minute by minute while you are in,
and the number is the same on every screen. Notifications are used only when the tab is in the
background (or the window is not focused) and you enabled them in settings: one when wrap up starts, one when the break starts, and one when it is time to focus again.

## Making state changes obvious

A web page cannot bring its window to the front, so the app uses what browsers allow:

- Wrap up, break and focus notifications stay on screen until you close or click them
  (Chrome and Edge). Clicking one brings the app forward. Coming back to the app clears them.
- The mini window is always on top. It takes the state's tint and pulses orange when the state changes.
- The installed app shows a dot on its dock or taskbar icon after a state change while you were away.

## Mini window (picture-in-picture)

Press `p` or use "show mini window" in settings.
It is a small, portrait, always-on-top window with the same screen as the app: the join screen,
or your day with its illustration, countdown, plan and leave button. It keeps running
while you work in other apps. Press enter in it to join, l to leave, and esc to close it.

- Chrome and Edge on desktop (also the installed app) use Document Picture-in-Picture:
  a real window made of the same components as the app. It must be opened by a click or key press.
- Safari has no such window, so the state and the countdown are drawn on a canvas and shown as a
  video in picture-in-picture. It cannot take clicks, so joining happens in the app.
- Firefox has neither, so the command is hidden.
- Phones and tablets: not supported (Document PiP is desktop only).

## Install as an app (PWA)

`public/manifest.webmanifest`, `public/sw.js` and the icons in `public/icons` make it installable.
Serve the built `dist/` over https. All paths are relative, so it works at a domain root or under a sub-path.
After the first visit it also opens offline. In Chrome and Edge use the install icon in the address bar or the
"install app" item in settings. On iOS use Share, then Add to Home Screen.
The service worker only registers in the production build, not in `npm run dev`.

## Does a background tab count?

Yes. The page keeps time with a worker, so a hidden tab still moves through blocks and fires notifications.
If the computer sleeps or the browser freezes the tab for more than about two minutes, that time
does not count.

## Joining and leaving

You are in until you press leave, or until a break ends: then you are taken back to the join
screen ("break's over"), with a notification and a sound, and nothing counts until you join
again. So a meeting or a walk that runs past a break never counts as focus. Your plan keeps going
either way, so joining again puts you wherever it is; time you were away shows hatched. Focus
counts only while you are in.

## Deploying to GitHub Pages

`.github/workflows/deploy.yml` tests, builds and deploys `dist/` on every push to `main`.

1. Repo Settings > Pages > Source: **GitHub Actions**.
2. Test at `https://<user>.github.io/thisblock/`.
3. Custom domain: add a `CNAME` DNS record `tb` pointing to `<user>.github.io`, then set
   `tb.sagar.im` under Settings > Pages > Custom domain and tick Enforce HTTPS.
