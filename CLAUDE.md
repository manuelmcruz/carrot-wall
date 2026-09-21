# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

Carrot Wall — a live Q&A/feedback wall for a 5-day Claude Code masterclass. Attendees post from
their phones (`/post`), the instructor answers/pins/hides from `/admin`, a projector shows `/tv`.
Portuguese UI, no accounts.

`spec.md` is the source of truth (features F1–F8, acceptance criteria, design tokens).
**F1–F8 are all built** — entities, REST resources, all five Angular routes, JUnit + Vitest +
Playwright suites. `feature-ideas.md` is the challenge backlog; `setup-docs/` holds the course
guides; `docs/intents/` + `docs/specs/` hold the per-slice specs and plans.

## Commands

```bash
cd apps/api && ./mvnw quarkus:dev                            # API → :8080 (first run downloads a lot)
cd apps/web && npm start                                     # web → :4200
cd apps/api && ./mvnw test                                   # JUnit + RestAssured
cd apps/api && ./mvnw test -Dtest=WallResourceTest#methodName  # single test
cd apps/web && npm test                                      # Vitest + jsdom
cd apps/web && npx ng test --filter '^WallService'           # single suite (regex on test names)
cd apps/web && npx ng test --include src/app/wall/wall.spec.ts  # single file
cd apps/web && npm run e2e                                   # Playwright (boots both servers itself)
cd apps/web && npx prettier --check .                        # no eslint / `npm run lint` in this repo
```

Only env var: `ADMIN_PIN` (defaults to `0000`). Java 21, Node 20+.

A `PostToolUse` hook in `.claude/settings.json` runs Prettier on every `.ts/.html/.scss/.json`
you write — don't hand-format, and don't be surprised when the file changes after an edit.

## Architecture

### The polling contract — the one thing to understand first

There are no websockets. Every client (`/`, `/tv`, `/admin`) polls `GET /api/wall` every 5s.
Three files make that work and they must stay in agreement:

- **`WallResource.java`** — one endpoint, three modes, all returning the same `WallResponse`
  (prompt, posts, `removedIds`, `serverTime`): no params = first page, `before`+`beforeId` =
  load-more cursor, `since` = the poll delta. Separate endpoints per mode would be three places
  to forget the hidden-post filter.
- **`Post.java`** — `@PreUpdate touch()` moves `updated_at` on every mutation, which is what
  makes `since` answerable. Query methods (`firstPage`, `before`, `changedSince`, `hiddenSince`)
  all take an `includeHidden` flag and build the visibility clause from it.
- **`wall.service.ts`** — holds posts as an **id-keyed Map**, not an array, so a delta can upsert
  or remove without caring about position; the display order (pinned first, then newest) is a
  `computed()` derived fresh every time. `poll()` serializes overlapping calls through
  `pollInFlight` so an older response can't clobber a newer one after an admin save.

**Invariant: never mutate a `Post` via a bulk `update(...)` string.** Panache bulk updates bypass
`@PreUpdate`, leaving `updated_at` stale — the change then never reaches a single polling client.
Load the row, call `pin()` / `unpin()` / `hide()` / `unhide()` / `upvote()` / `answer(text)`.

### Admin auth

`POST /api/admin/login` trades the PIN for an httpOnly `admin_session` cookie; tokens live in
`AdminSessionStore` (in-memory, no expiry — one instructor, one laptop, five days). Endpoints opt
in by annotating `@AdminOnly`, and `AdminAuthFilter` enforces the 401 once for all of them.

`WallResource` is deliberately **not** `@AdminOnly` — attendees hit it every 5s. Instead it
silently downgrades `includeHidden` to `false` when the cookie is missing or invalid. Trusting the
query param alone would let anyone read hidden content with `?includeHidden=true`; don't
"simplify" that check away.

`/admin` reuses the public `<app-wall>` verbatim rather than duplicating it: `AdminComponent`
re-provides `WALL_INCLUDE_HIDDEN: true` **and** a fresh `WallService` in its own `providers`, so
the admin view sees hidden posts without touching the app-wide singleton that `/` uses.

### Browser-local state (no server-side identity)

- `client-token.ts` — a random per-browser id sent as `X-Client-Token`, which `RateLimiter` keys
  on (5 posts / 60s). Keyed per-browser, not per-IP, because the whole classroom sits behind one
  public IP. A missing token is never blocked: it's a friendly-room guard, not auth.
- `upvoted-posts.ts` — the "one upvote per post per browser" rule (F5) lives entirely in
  `localStorage`; the server accepts any upvote. Includes `unmarkUpvoted` to roll back when the
  request fails.

Both wrap `localStorage` in try/catch with an in-memory fallback for private browsing.

### Production

One container (root `Dockerfile`, three stages): the Angular build is copied into the Quarkus
jar's `META-INF/resources`, both served on :8080. **`SpaRoutes.java` lists the SPA paths
explicitly** (`/post`, `/tv`, `/admin`, `/materials`) and reroutes them to `index.html` so a
refresh doesn't 404 — **add any new route there too**, or it will work in dev and break in prod.
`docker-compose.yml` is a separate dev-only two-container setup on ports 3010/8010.

### Frontend notes

- Angular 22 standalone components, `ChangeDetectionStrategy.OnPush`, signals throughout. No
  NgModules, no RxJS beyond `firstValueFrom`.
- **Angular Material is theme-only.** It's imported in `src/styles.scss` for the `mat.theme()`
  mixin; no component in `src/app/` imports a Material component. The wall's look is built from
  `--wall-*` custom properties, because M3 palettes can't reproduce the ivory/coral pair.
- Live design tokens are the `:root` block in `src/styles.scss` (`--wall-bg: #faf9f5`,
  `--wall-ink: #141413`, `--wall-accent: #d97757`, hairline borders, no drop shadows, serif
  headings + Inter). Root `DESIGN.md` is a broader Anthropic-brand reference and its `primary`
  (`#cc785c`) does **not** match what the app ships — `styles.scss` wins.
- `/materials` is a static index: `materials.ts` holds a hardcoded array of links to pre-built
  HTML files under `apps/web/public/course/` (the Day 1 deck, the guides), opened via plain
  `<a target="_blank">`. The deck is a self-contained keyboard-driven presentation — nothing in
  the Angular app renders it.

## Conventions

- **Never edit an existing Flyway migration** — add a new versioned file. A `PreToolUse` hook in
  `.claude/settings.json` hard-blocks edits to existing `V*` files. The V1→V6 split is deliberate
  (it's Day 1's "explain the migrations" exercise). Use the `/migration` command.
- Keep migration SQL portable across H2-in-PG-mode and real Postgres: no `JSONB`, no arrays.
  Give every `NOT NULL` column a DB-level default — V5 exists because V4 didn't, and V3's raw
  seed inserts broke.
- Flyway owns the schema (`quarkus.hibernate-orm.schema-management.strategy=none`). Entities
  extend `PanacheEntityBase` with an explicit `IDENTITY` id, not `PanacheEntity`, to match
  `BIGSERIAL`.
- **Post text renders via interpolation, never `[innerHTML]`** — acceptance criterion 12 is an
  XSS check. This is why `qr.ts` builds SVG cells as data instead of using `qrcode-generator`'s
  HTML-string helpers.
- Hidden is a soft delete: excluded from every public response, never `DELETE`d.
- Validation in resources is written by hand, not Bean Validation annotations, because the
  message must be **trimmed before** its length is checked (`@NotBlank`/`@Size` don't do that).
  Error messages returned to the client are in Portuguese.
- `%test` profile uses in-memory H2 and `wall.page-size=3`, so `./mvnw test` never collides with
  a running dev server and pagination tests don't need dozens of inserts.
- Tests: JUnit beside the resource, Angular unit tests beside the component, Playwright in
  `apps/web/e2e/`. A change isn't done until `./mvnw test` and `npm test` both pass.
- Work is picked up from `docs/intents/` (the spec cut into 8 dependency-ordered slices), not
  from `spec.md` directly. New specs go to `docs/specs/<NN>-<slug>.md` matching the intent's
  number and slug; its plan is the same name with `-plan` appended.

## Note on accuracy

Everything above was verified against the source in this repo. Two things worth re-checking if
they matter to you: `DESIGN.md`'s relationship to `spec.md` §4 (they disagree on the accent
colour, and I inferred `styles.scss` is authoritative because it's what actually renders), and
whether the `/materials` page is meant to stay hardcoded or eventually be data-driven.
