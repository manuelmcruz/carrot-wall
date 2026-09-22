---
paths:
  - "apps/web/**/*.spec.ts"
  - "apps/api/src/test/**/*.java"
---

# Testing conventions

## Running

- Web: `cd apps/web && npm test` (= `ng test`, builder `@angular/build:unit-test`, runner
  Vitest + jsdom). There is no `vite.config.ts` and no setup file — plain `npx vitest` will
  not start. One file: `npx ng test --include src/app/wall/wall.spec.ts`; one suite:
  `npx ng test --filter '^WallService'` (regex over the `describe` name).
- API: `cd apps/api && ./mvnw test`; a single test: `./mvnw test -Dtest=WallResourceTest#name`.
- E2E: `npm run e2e` — Playwright boots both the API and the web app itself
  (`reuseExistingServer`). E2E is not part of the normal loop; run it only when the change is
  real-browser behaviour.
- A change isn't done until `./mvnw test` **and** `npm test` both pass.
- A bug fix is not done until a test reproduces the bug first.
- Never weaken or delete an existing assertion to make a suite pass — say what you found
  instead.

## API (JUnit + RestAssured)

- Use `@QuarkusTest` only when you need HTTP or the DB. Entity logic is tested as a plain POJO
  with no context (see `PostTest`, `PromptTest`) — far faster.
- **The H2 database is shared across the whole run and there is no rollback between tests.**
  Never assume counts or "the list has N posts". Create a `marker-<UUID>` per test and find it
  in the response: `body("posts.find { it.message == '" + marker + "' }.pinned", ...)`.
- Write setup through a `@Transactional Post persistPost(...)` helper, not raw SQL and not
  chained HTTP calls.
- `RateLimiter` is an `@ApplicationScoped` singleton shared by every test: each test sends its
  own random `X-Client-Token`, otherwise execution order changes the result.
- The `%test` profile sets `wall.page-size=3` — the pagination tests depend on it, don't
  change it.
- Admin: the PIN in tests is `0000`. Always test both sides of `@AdminOnly` (401 without the
  cookie **and** the authorized path), and that `includeHidden=true` without a cookie returns
  no hidden posts.
- Error messages are in Portuguese; assert the actual text the client receives.

## Web (Vitest + TestBed)

- `provideHttpClient()` + `provideHttpClientTesting()` in providers, `httpMock.verify()` in
  `afterEach`. No test hits the network for real.
- A local `function post(overrides: Partial<Post> = {}): Post` factory at the top of the spec,
  with every field filled in and the overrides spread last. Repeating it per file is deliberate.
- Components with async state need the `settle(fixture)` helper: `await fixture.whenStable()`
  plus one macrotask tick plus `detectChanges()`. `whenStable()` alone does not wait for our
  own `.then()` layered on top of the HTTP call (see `admin.spec.ts`).
- Signal inputs: `fixture.componentRef.setInput('post', ...)`, never direct assignment.
- Assert against the rendered DOM (`el.querySelector`, visible PT text), not the component's
  private fields.
- Time: import `vi` from `'vitest'`. For relative timestamps ("há 5 min") use
  `vi.spyOn(Date, 'now')` — `vi.useFakeTimers()` breaks Angular's scheduling there. For
  polling and the carousel use `useFakeTimers()` + `advanceTimersByTime()` and restore with
  `useRealTimers()`.
- Tests sit beside what they test (`wall/wall.spec.ts`); E2E lives in `apps/web/e2e/`.
- A `PostToolUse` hook runs Prettier — don't hand-format.

## What is worth covering

The polling contract is the fragile part of this system: the `since` delta, the
`before`+`beforeId` cursor, `removedIds`, the hidden-post filter, and the id-keyed upsert in
`WallService`. Any `Post` mutation is tested by checking that `updated_at` moved — that is what
makes `since` answerable. Post text is never rendered with `[innerHTML]`; an XSS test guards it.
