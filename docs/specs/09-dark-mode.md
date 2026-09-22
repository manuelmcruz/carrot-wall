# Spec: Dark mode

**Covers:** `feature-ideas.md` dark mode · **Intent:** `docs/intents/09-dark-mode.md`

## Problem

The wall is ivory (`#faf9f5`) on every surface, and `styles.scss` pins `color-scheme: light` on
purpose — the app commits to one look rather than following the viewer's device. That decision
reads differently at 21:00: the course runs into the evening, the room lights are down for the
projector, and a phone showing a full-screen ivory page is uncomfortable to read and wrecks
whatever night vision the room has left. The instructor has the worst of it, staring at `/admin`
for an hour after the lights drop.

## In scope

- A theme toggle in the top-right corner of **every** surface — `/`, `/post`, `/admin`, `/tv` and
  `/materials` — with a transition animation on switch.
- The switch is live: the page recolours without a reload, and without interrupting the 5s poll or
  the `/tv` carousel mid-cycle.
- The choice persists across refreshes and across routes, and applies to every surface at once —
  one preference per browser, not one per page.
- **First visit follows the device**: a browser that has never used the toggle renders dark if the
  OS prefers dark, light otherwise. Once the toggle is used, that choice wins permanently.
- The dark palette is the one already defined in `DESIGN.md` and already shipping in the Day 1
  deck's dark slides, so the wall and the course materials agree:

  | token | light | dark |
  |---|---|---|
  | `--wall-bg` | `#faf9f5` | `#181715` |
  | `--wall-surface` | `#f0eee6` | `#252320` |
  | `--wall-ink` | `#141413` | `#faf9f5` |
  | `--wall-muted` | `#6b6a63` | `#a09d96` |
  | `--wall-hairline` | `#e2dfd6` | `#3a3733` |
  | `--wall-accent` | `#d97757` | `#e8a55a` |

  Coral becomes amber in dark mode because coral on near-black is around 4.7:1 — marginal for
  small text. This mirrors the deck's own `.slide.dark .coralword` rule.
- Tests ship with the slice: the recolour, the live switch without reload, persistence across a
  reload, and the allowlist rejection below.

## Out of scope

- The Day 1 deck and guides under `apps/web/public/course/`. They are standalone static files with
  their own `data-theme` attribute and their own dark handling; nothing in the Angular app renders
  them.
- Server-side or cross-device persistence. There are no accounts, and the theme never reaches the
  API.
- Per-surface themes (e.g. dark `/tv` with a light `/admin`). One choice, applied everywhere.
- Automatic switching by time of day or by sunset.
- Redesigning the light palette, or theming Angular Material components — Material is used only
  for the `mat.theme()` mixin in `styles.scss`; no component in `src/app/` imports one.

## Acceptance criteria

Each statement is true or false on the running app.

1. A theme toggle is visible in the top-right corner of `/`, `/post`, `/admin`, `/tv` and
   `/materials`.
2. Tapping the toggle recolours the current page without a reload and without losing scroll
   position.
3. After toggling to dark and reloading, the page is still dark.
4. After toggling on `/`, navigating to `/tv` shows `/tv` in the same theme.
5. On a browser with no stored preference and an OS set to dark, the first load of any route
   renders dark.
6. On a browser with no stored preference and an OS set to light, the first load renders light.
7. Once the toggle has been used, changing the OS preference does not change the app's theme.
8. Loading any route with a dark preference shows no light-coloured flash before the dark theme
   applies.
9. In dark mode, body text renders at `#faf9f5` on `#181715` and the accent renders at `#e8a55a`;
   both exceed 4.5:1 against their background.
10. Setting the stored theme value to anything other than `light` or `dark` (e.g. via devtools)
    causes the app to render the default theme, and the invalid value is not written into any DOM
    attribute, class or style.
11. The theme value is present in `localStorage` and absent from every request's `Cookie` header.
12. Appending a theme query parameter to any route (e.g. `/?theme=dark`) does not change the
    rendered theme.
13. No new API endpoint, `WallResponse` field or `@AdminOnly` change exists as a result of this
    slice.
14. Toggling the theme on `/tv` does not reset or skip the carousel's current page.
15. The existing XSS check (post text renders as text, never HTML) still passes in both themes.
16. `./mvnw test` and `npm test` both pass.

**Deliberately not automated**, recorded here so their absence reads as a decision rather than an
oversight. Both are true by construction and a test for either would assert the absence of code
that was never written:

- *Criterion 2's scroll position.* `ThemeService.toggle()` flips one attribute on `<html>`; no
  view is remounted and no navigation occurs, so there is no mechanism by which scroll could be
  lost. Verify by hand if the toggle ever grows a second responsibility.
- *Criterion 11's `Cookie` header.* No cookie is ever written, so there is no request to inspect —
  a passing assertion would only prove that code absent from the diff is still absent. The
  `localStorage`-not-cookie choice is enforced by review, and by criterion 13's no-server-surface
  check.
- *Criterion 8's paint timing.* Covered structurally rather than observationally — see the
  docblock in `e2e/dark-mode.spec.ts`. Asserting "no light frame was painted" needs screenshot
  diffing at first paint, which is flakier than the bug it would catch.
- *Criterion 8 in a production build.* The e2e suite runs against the dev server, so it cannot
  see Angular's critical-CSS inlining. That optimization breaks AC8 outright — it inlines the
  light `:root` block into `index.html` and leaves `:root[data-theme='dark']` in the async
  stylesheet, so a dark browser paints light first and flips. `angular.json` therefore sets
  `optimization.styles.inlineCritical: false`, and `styles.scss` carries the warning. Re-enabling
  it silently reintroduces the flash with every test still green; check the built `index.html`
  by hand if that setting is ever touched.

## Constraints

- **This supersedes two earlier decisions; both need amending, not ignoring.** Intent 08 states
  `/tv` has "no admin controls, no hover states, no interactivity at all" — criterion 1 breaks
  that deliberately. Intent 09 states "the default mode is whitemode" — criterion 5 overrides it
  with device preference. The pinned `color-scheme: light` in `styles.scss` and its comment must
  be updated rather than silently deleted.
- **Security — stored value is untrusted input.** The persisted theme is editable by anyone with
  devtools or any script on the origin, and it feeds a DOM sink. Accept only the exact strings
  `light` or `dark`; anything else falls back to the default and is overwritten. Never pass the
  raw stored value into an attribute, class name or style string.
- **Security — `localStorage`, never a cookie.** A cookie would ride along on every `/api` request
  beside `admin_session` and would need SameSite and path reasoning. Wrap reads and writes in
  try/catch so a browser that refuses storage (Safari private mode throws on `setItem`) cannot
  break the toggle. Unlike `client-token.ts` and `upvoted-posts.ts`, this does **not** need an
  in-memory fallback value: those read storage repeatedly across a session, whereas the theme is
  read once at construction and then held in a signal, so a fallback variable could never be read
  back before the page reload that resets it anyway.
- **Security — no `[innerHTML]` and no server surface.** The toggle's icon is inline SVG in the
  template, not an injected HTML string — the same trap `qr.ts` already avoided. The theme never
  leaves the browser.
- **Security — the URL is not an input.** The toggle and the stored preference are the only ways
  to set the theme; no query parameter is parsed.
- Colours stay CSS custom properties. No component hardcodes a hex value or carries a
  per-component dark variant — **with one documented exception: `/tv`**. `tv.scss` already
  redeclared every `--wall-*` token on its own `:host` with its own light values before this
  slice, so it cannot inherit `:root`'s dark block and needs its own, reached via
  `:host-context([data-theme='dark'])`. Collapsing `/tv` onto the root palette would change how a
  shipped surface looks today and is explicitly out of scope here (see
  `09-dark-mode-plan.md`'s Risks). Every other component reads the tokens and defines none.
- The toggle is reachable by keyboard and usable at 360px alongside the existing controls.
- Tests follow `.claude/rules/TESTING.md`: assert against the rendered DOM rather than component
  fields, and use `vi.useFakeTimers()` for the carousel interaction in criterion 14.
