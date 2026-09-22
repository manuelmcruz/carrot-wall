# Plan: Dark mode

**Spec:** `docs/specs/09-dark-mode.md` · **Intent:** `docs/intents/09-dark-mode.md`

## What the code already looks like

Two discoveries shape everything below.

**1. `/tv` will not inherit a root-level theme.** `tv.scss` redeclares every `--wall-*` token on
its own `:host`, with a deliberate comment explaining that this recolours everything under `/tv`
without touching `:root`. A `:root[data-theme='dark']` block cannot beat a `:host` declaration on
an ancestor of those elements, so `/tv` would silently stay light and spec criterion 4 would fail.
`tv.scss` has to be part of this slice, not an afterthought.

**2. `/tv`'s light palette is already a different light palette.** It uses `#cc785c` accent,
`#efe9de` surface, `#6c6a64` muted — DESIGN.md's values — while `:root` uses `#d97757`, `#f0eee6`,
`#6b6a63` from spec §4. The two surfaces have been quietly diverging. This slice has to decide
whether to preserve that divergence in dark mode or collapse it.

Everything else is well-positioned: every component stylesheet already consumes `var(--wall-*)`
(the hardcoded hexes in them are inert fallbacks), `app.html` is a bare `<router-outlet />`, and
`app.scss` is empty.

## Files to change, and why

| File | Change | Why |
|---|---|---|
| `src/styles.scss` | Add a dark token block keyed on a `data-theme` attribute; replace `body { color-scheme: light }` with a theme-aware value; update the comment that documents the old single-look decision | The root palette. The spec requires amending that comment rather than deleting it |
| `src/app/tv/tv.scss` | Make the `:host` token block theme-aware, or drop it in favour of root tokens | Without this, `/tv` ignores dark mode entirely (finding 1) |
| `src/index.html` | Small inline script in `<head>`: read stored preference, validate against the allowlist, else fall back to `prefers-color-scheme`, set the attribute on `<html>` | Criterion 8 (no flash) is unachievable from Angular — it boots after first paint |
| `src/app/theme.ts` *(new)* | Theme state as a signal; validated read/write to `localStorage` with try/catch and in-memory fallback | Single source of truth. Mirrors `client-token.ts` / `upvoted-posts.ts` exactly |
| `src/app/theme-toggle.ts/.html/.scss` *(new)* | The control: inline SVG icon, `aria-label`, keyboard reachable, animated | Criterion 1, 2. Inline SVG in the template — never `innerHTML` |
| `src/app/app.html` + `app.scss` | Mount `<app-theme-toggle />` beside the router outlet; position it fixed top-right | Puts the toggle on all five routes in one change rather than editing five components |
| `src/app/theme.spec.ts`, `theme-toggle.spec.ts` *(new)* | Unit coverage | See verification below |
| `src/app/tv/tv.spec.ts` | Add the carousel-continuity assertion | Criterion 14 |
| `e2e/dark-mode.spec.ts` *(new)* | First-visit OS preference, no-flash, persistence across reload | Criteria 5, 6, 8 are real-browser behaviour that jsdom cannot judge |

## Order of work

1. **Tokens first, no UI.** Add the dark block to `styles.scss`. Verify by setting the attribute by
   hand in devtools across `/`, `/post`, `/admin`, `/materials`. This proves the palette before any
   wiring exists, and it is where the visual work actually is.
2. **Reconcile `tv.scss`.** The riskiest change and the one most likely to need a decision — do it
   while nothing depends on it yet. Same devtools check on `/tv`.
3. **Theme service.** Storage key, allowlist validation, signal, attribute application. Fully unit
   testable with no UI.
4. **Boot script.** Must agree with the service on both the storage key and the allowlist.
5. **Toggle component, mounted in the shell.** First point where the feature is usable.
6. **Visual pass:** five routes × two themes at 360px, plus `/tv` from projector distance.
7. **Tests**, then `npm test` + `./mvnw test`.

Steps 1–2 are the slice's real content. If time runs short, stopping after 2 leaves a themeable app
with no switch, which is a coherent place to stop.

## Risks and open questions

- **Which light palette is correct for `/tv`?** It uses DESIGN.md values, the rest of the app uses
  spec §4 values. Collapsing them is the right long-term call but changes how a shipped surface
  looks today, which is beyond this spec. **Recommend:** preserve the divergence — give `/tv` its
  own dark tokens — and raise the reconciliation separately. Needs your call before step 2.
- **"Toggle wins afterwards" needs three states, not two.** Criterion 7 requires distinguishing
  *never toggled* from *explicitly chose light* — otherwise a user who picks light on a dark-OS
  device gets flipped back to dark on next load. Storage must hold `light` / `dark` / absent, and
  absent is the only state that consults the OS. Easy to get wrong and easy to miss in review.
- **The boot script duplicates the allowlist and storage key outside TypeScript.** It cannot import
  from `theme.ts`, so the two can drift silently. Mitigation: keep it to a few lines and let the
  e2e test be the thing that catches drift.
- **`color-scheme` affects native form controls.** The `/post` textarea and the `/admin` PIN input
  will recolour with the browser's own dark styling. Intended, but the Portuguese placeholder text
  needs a legibility check — this is the most likely source of an ugly result.
- **Material is configured light-only.** `mat.theme()` gets no dark config. No component in
  `src/app/` uses Material today so nothing breaks, but `index.html` loads the Material Icons font
  — confirm nothing depends on it before assuming zero impact.
- **Criterion 14 (carousel continuity)** assumes the carousel's timer lives in `ngOnInit` and is not
  restarted by a re-render. Likely true, but it is the one behavioural coupling between this slice
  and an existing feature, so it gets a test rather than an assumption.

## Verification

**Unit (Vitest), covering the security criteria:**
- A stored value of `"' onload='alert(1)"`, `null`, `""` and `"DARK"` each yield the default theme,
  and the raw value never reaches the DOM attribute — criterion 10.
- `localStorage.setItem` throwing does not break the toggle; the choice survives in memory for the
  session — matches the `client-token.ts` contract.
- Toggling flips the attribute on `documentElement` and flips it back; assert against the rendered
  DOM, not service fields, per `.claude/rules/TESTING.md`.
- Appending `?theme=dark` changes nothing — criterion 12.
- `/tv` toggle with `vi.useFakeTimers()` + `advanceTimersByTime()`: the carousel's page index is
  unchanged across a theme switch — criterion 14.

**E2E (Playwright), for what jsdom cannot see:**
- `colorScheme: 'dark'` emulation, fresh context → first load is dark (criterion 5); `'light'` →
  light (criterion 6).
- No-flash: assert the computed background at first paint is already dark — criterion 8.
- Toggle, reload, still dark — criterion 3.

**Manual, because no test will catch it:**
- Five routes × two themes at 360px.
- `/tv` from across a room with the lights down — the actual point of the feature.
- Contrast spot-check on the amber accent against `#181715` (expected ≈8.5:1).

**Not covered by any test:** criterion 11 (theme absent from the `Cookie` header) is verified by
code review — there is no cookie write to inspect.

`./mvnw test` should be unaffected; no API change is in this slice. Run it anyway per convention.
