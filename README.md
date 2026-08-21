# Focus — Pomodoro Timer + Draggable Checklist + Ambience

A single-page focus app: a drift-free Pomodoro timer, a drag-to-reorder daily
checklist, and a mixable set of ambient background sounds that are **synthesised
in the browser** (no audio files at all).

No build step. No `npm install`. Open `index.html` and it works — locally or on
GitHub Pages.

---

## Features

### Timer
- Focus / short break / long break, all durations configurable.
- Circular SVG progress ring, big monospace countdown, per-mode color themes
  (indigo → focus, teal → short break, amber → long break).
- **Drift-free**: remaining time is computed from wall-clock (`Date.now`) on every
  animation frame, so throttled/background tabs can't desync it.
- Auto-cycling with pips showing how many pomodoros remain until the long break.
- Optional auto-start for breaks and/or the next focus session.
- Countdown mirrored into the tab title, optional desktop notification, and a
  synthesised end-of-session chime.
- **Zen mode** hides everything but the dial.

### Checklist
- Add tasks with an estimated pomodoro count.
- **Drag to reorder** via the grip handle (SortableJS, touch friendly).
- Double-click any task to rename it inline; Enter saves, Escape cancels.
- Pick one task as the *focus target* — completed focus sessions are credited to
  it and shown as filled pips (`◍◍◌ 2/3`).
- Progress bar + `done / total` counter, clear-completed and clear-all.
- **Daily rollover**: on a new calendar day, completed tasks are cleared, per-task
  pomodoro counters reset, and unfinished tasks carry over (toggleable).

### Ambience
- Eight independent textures you can layer: Rain, Ocean, Brown noise, White noise,
  Fireplace, Café hum, Wind, Night.
- Each has its own on/off state and volume, plus a master volume and mute-all.
- Optional ticking clock that only runs during focus sessions.
- Everything is generated with the Web Audio API — noise buffers, biquad filters
  and LFOs — so there are **zero audio assets** to host, nothing to 404, and it
  works completely offline. Gains fade in/out so there are no clicks.

### Misc
- Dark / light theme (follows your OS until you pick one).
- Everything persists to `localStorage` under a single versioned key.
- Fully responsive, keyboard accessible, respects `prefers-reduced-motion`.

---

## Keyboard shortcuts

| Key | Action |
| --- | --- |
| `Space` | Start / pause |
| `R` | Reset current session |
| `S` | Skip to next session |
| `1` `2` `3` | Focus / short break / long break |
| `N` | Jump to the new-task field |
| `M` | Mute / unmute ambience |
| `Z` | Zen mode |
| `T` | Switch theme |
| `?` | Shortcut list |
| `Esc` | Close dialog / leave zen mode |

---

## Run it locally

Just double-click `index.html`. That's it.

If you'd rather serve it (recommended, so notifications and the CDN behave
exactly like production):

```bash
python -m http.server 8000
```

then open <http://localhost:8000>.

---

## Deploy to GitHub Pages

```bash
git init
git add .
git commit -m "Focus: pomodoro + checklist + ambience"
git branch -M main
git remote add origin https://github.com/<your-username>/<your-repo>.git
git push -u origin main
```

Then in the repo: **Settings → Pages → Build and deployment**
- **Source:** `Deploy from a branch`
- **Branch:** `main` / `/ (root)` → **Save**

Your app goes live at `https://<your-username>.github.io/<your-repo>/` in a minute
or two.

Notes:
- `.nojekyll` is included so Pages serves every file verbatim (no Jekyll pass).
- All asset paths are relative (`./css/…`, `./js/…`), so it works from a
  subdirectory URL without any config.
- For a user/organisation site, name the repo `<your-username>.github.io` and it
  will be served from the root instead.

---

## Project layout

```
index.html          markup + CDN links
.nojekyll           tells GitHub Pages to skip Jekyll
css/styles.css      design tokens, layout, themes, animations
js/storage.js       localStorage persistence + daily rollover
js/audio.js         procedural Web Audio ambience engine + chime
js/timer.js         drift-free Pomodoro state machine
js/tasks.js         checklist rendering, editing, drag-reorder
js/app.js           DOM wiring, shortcuts, settings, toasts
```

## External dependencies

| Library | Why | Fallback if blocked |
| --- | --- | --- |
| [SortableJS 1.15.2](https://sortablejs.github.io/Sortable/) (jsDelivr) | drag-to-reorder | list still fully usable, a toast tells you reordering is off |
| Inter + JetBrains Mono (Google Fonts) | typography | system font stack |

Both are optional at runtime — the app degrades gracefully offline.

---

## Privacy

Nothing leaves your device. There is no backend, no analytics, no account. Tasks,
settings and your sound mix live in this browser's `localStorage`; "Reset
everything" in Settings wipes them.

## Browser support

Any modern browser (Chrome/Edge/Firefox/Safari, desktop or mobile). Audio starts
only after your first click/keypress, per browser autoplay policy — so your saved
sound mix resumes the moment you interact with the page.
