# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

Carrot Wall — a live Q&A/feedback wall for a 5-day Claude Code masterclass. Attendees post
from their phones, the instructor answers/pins from `/admin`, a projector shows `/tv`.
Portuguese UI. **The spec is the source of truth: `spec.md`**
(features F1–F8, acceptance criteria, design tokens). `feature-ideas.md` is the
challenge backlog. `setup-docs/` holds the course guides that drive the build.

**The plumbing is in, the features are not.** Config, the three Flyway migrations with seed
data, the dev proxy, the Dockerfile and the harness script all work. What is missing is the app
itself: no entities, no REST resources, no Angular routes (`app.routes.ts` is `[]`), no tests
beyond the scaffold's `app.spec.ts`. F1–F8 in `spec.md` are what gets built next.

## Commands

```bash
cd apps/api && ./mvnw quarkus:dev          # API, port 8080 (first run downloads a lot)
cd apps/web && npm start                   # web, port 4200
cd apps/api && ./mvnw test                 # JUnit (no tests written yet)
cd apps/api && ./mvnw test -Dtest=ClassName#methodName      # single test
cd apps/web && npm test                    # vitest + jsdom (only app.spec.ts exists so far)
cd apps/web && npx ng test --filter '^App' # single test/suite (regex on test names)
cd apps/web && npx ng test --include src/app/app.spec.ts         # single file
cd apps/web && npx prettier --check .      # no eslint / `npm run lint` in this repo
```

Only env var: `ADMIN_PIN`. Node 20+ required (Node 25 works, warns).

## Target shape

- `apps/web` — Angular 22 standalone components + Angular Material, TS 6. Routes to build:
  `/` wall, `/post` submit, `/tv` projector, `/admin`. Polls the API every 5s; no websockets.
  `npm start` proxies `/api` to port 8080 via `proxy.conf.json` (already wired into
  `angular.json` → `serve.options.proxyConfig`), so there is no CORS layer in dev either.
- `apps/api` — Quarkus 3.39 / Java 21. REST resources + Bean Validation + Panache entities.
  H2 **file** DB in PostgreSQL mode; **Flyway owns the schema**
  (`quarkus.hibernate-orm.schema-management.strategy=none`), `%test` profile uses in-memory H2
  so `./mvnw test` never collides with a running dev server.
- Production is **one container** (root `Dockerfile`): the Angular build lands in the Quarkus
  jar's `META-INF/resources`, both served on port 8080. `SpaRoutes.java` reroutes `/post`,
  `/tv` and `/admin` to `index.html` so a refresh does not 404 — add any new route there too.

## Conventions

- **Never edit an existing Flyway migration** — add a new versioned file. Migrations live in
  `apps/api/src/main/resources/db/migration/` and are deliberately split into a story
  (V1 posts → V2 answers/moderation → V3 prompts + seed), because Day 1's exercise is
  "explain the migrations"; a hook in `.claude/settings.json` blocks edits to existing ones.
  Keep the SQL portable across H2-PG mode and real Postgres: no `JSONB`, no arrays.
- **Never mutate a `Post` via a bulk `update(...)` string** (e.g. Panache's
  `Post.update("upvotes = upvotes + 1 where id = ?1")`). Bulk updates bypass the entity's
  `@PreUpdate`, leaving `updated_at` stale and making the change invisible to every polling
  client. Use the entity's mutation methods (`pin()`, `hide()`, `upvote()`, `answer(text)`) —
  load the row, call the method, let the flush happen.
- **Post messages render as text, never HTML.** Angular interpolation only, no `[innerHTML]`
  anywhere — acceptance criterion 12 is an XSS check.
- Hidden posts are a soft delete: excluded from every public response, never deleted from the DB.
- Admin routes and admin API endpoints return 401 without the PIN session cookie.
- `docs/intents/` holds `spec.md` cut into eight buildable slices, in dependency order — start
  there, not at the spec, when picking up work. New feature specs go in `docs/specs/`, named
  `<NN>-<feature-name>.md` matching the intent's number and slug (`docs/intents/02-submit-a-post.md`
  → `docs/specs/02-submit-a-post.md`); a plan for that slice is the same name with `-plan`
  appended (`02-submit-a-post-plan.md`). Tests: JUnit beside the resource, Angular unit tests
  beside the component, Playwright e2e in `apps/web/e2e/` (convention not created yet).
- Design tokens (ivory `#FAF9F5`, ink `#141413`, coral `#D97757`, hairline borders, no drop
  shadows, serif headings + Inter) are in spec §4 — follow `DESIGN.md` if it appears at the root.
