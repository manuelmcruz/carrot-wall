# Spec: Emoji reactions

**Covers:** new (beyond spec.md F1–F8) · **Intent:** none — no `docs/intents/09-*.md` exists yet

## Problem

▲ (F5) asks one question: "should this be answered?" It's a queue signal, and the instructor reads
it that way. But most of what crosses the wall isn't a question — it's a frustration someone
recognises, or a joke, or a "same here". Those get no response at all, because upvoting a
frustration to the top of the answer queue is the wrong move. The room ends up with fifteen people
silently agreeing and no trace of it, and the poster can't tell whether anyone read their card.

## In scope

- Three reactions on every visible post card, server-validated against a fixed allowlist:
  **👍 ❤️ 🤯**. No picker, no custom emoji.
- **One reaction per browser per post**, switchable and removable: tapping a lit emoji clears it,
  tapping a different one moves it. Counts go down as well as up.
- New table `post_reactions` (V7), `UNIQUE (post_id, client_token)`. Counts are **derived**
  (`GROUP BY emoji`), never stored as columns, so they cannot drift or go negative.
- Identity is the existing `X-Client-Token` header (see `client-token.ts`). The server therefore
  knows which emoji *this* browser picked, and returns it — so the lit state comes from the API,
  not `localStorage`, and survives a cleared browser or a second device.
- `PUT /api/posts/{id}/reaction` `{ "emoji": "👍" }` — sets or switches (upsert on the unique key).
  `DELETE /api/posts/{id}/reaction` — removes this browser's reaction.
- Both endpoints call a `Post` mutation method so `@PreUpdate` fires and `updated_at` moves —
  otherwise the reaction is invisible to every polling client.
- `PostDto` gains `reactions: { "👍": 3, "❤️": 1 }` (zero-count emoji omitted) and
  `myReaction: "👍" | null`.
- **Zero-state: the reaction row is hidden** on a post with no reactions, behind a small reveal
  affordance, so the default wall stays calm (spec §4).
- `/tv`: counts render as **plain text, no tap targets** (F7 — nobody stands at the projector).
- `/admin`: a sort control offering *recentes* (default) / *mais reações* / *mais ▲*. Implemented
  as a client-side `computed()` over the already-loaded posts — **no API change**, since every
  count already rides along on each `PostDto`.
- Tests per `.claude/rules/TESTING.md`: JUnit for set/switch/remove/allowlist/404 and the
  `updated_at` bump; Vitest for tap-to-react, tap-to-clear, tap-to-switch, and the hidden
  zero-state.

## Out of scope

- Custom or instructor-configurable emoji sets. The allowlist is a server-side constant this
  slice; making it data-driven is a later slice (it would mirror F6's `prompt_presets`).
- Reactions on the *answer* text, threads, or reaction notifications.
- Reordering the **public** wall by reaction count — position stays pinned + `createdAt`. Only
  `/admin` gets a sort control, and it never changes what `/` or `/tv` show.
- Showing *who* reacted. `client_token` is a rate-limiting id, not a person; surfacing it would
  turn an anonymous wall into a named one.
- Migrating existing `upvotes` into reactions. ▲ keeps its own column, its own endpoint and its
  own meaning.
- Animation on reaction change, and the §8 confetti stretch goal.

## Acceptance criteria

1. Tapping 👍 on a post with no reactions reveals the row, shows `👍 1`, and renders 👍 lit.
2. Tapping the lit 👍 again clears it: count returns to 0 and the row hides again.
3. Tapping ❤️ while 👍 is lit moves the reaction — `👍 0 → hidden`, `❤️ 1`, ❤️ lit, 👍 unlit. The
   totals across all three emoji never exceed one per browser per post.
4. After a hard reload **with `localStorage` cleared**, a previously-reacted post still shows the
   correct emoji lit (state comes from the server via `X-Client-Token`, not the browser).
5. A reaction made on one client is visible on another within one poll cycle (≤5s) — i.e.
   `posts.updated_at` moved and the post came back in `changedSince`.
6. `PUT /reaction` with an emoji outside the allowlist returns 400 with a Portuguese message; with
   no `X-Client-Token` header returns 400 (there is no identity to key the reaction on).
7. `PUT`/`DELETE /reaction` on a hidden or nonexistent post id returns 404.
8. Two different browsers reacting 👍 to the same post produce `👍 2`, and either one removing
   theirs produces `👍 1` — never 0, and never negative.
9. Reacting never changes a post's position on `/` or `/tv`.
10. `/tv` shows the counts with no clickable element in the reaction row.
11. On `/admin`, switching the sort to *mais reações* reorders the grid without a network request.
12. `./mvnw test` and `npm test` both pass.

## Constraints

- **New migration `V7__post_reactions.sql`** — never edit V1–V6 (hook-enforced). Portable SQL: no
  `JSONB`, no arrays. Give every `NOT NULL` column a DB-level default (see why V5 exists). Emoji
  are 4-byte UTF-8 — store as `VARCHAR(16)` and confirm the column round-trips 🤯 on both H2-in-PG
  mode and real Postgres before relying on it.
- **Never mutate `Post` via a bulk `update(...)` string.** Load the row, call the mutation method,
  let the flush happen — this is what moves `updated_at` and keeps polling honest.
- Emoji render via interpolation, never `[innerHTML]`.
- Reaction endpoints are **not** `@AdminOnly` — attendees call them. The admin sort control is
  client-side only, so it needs no new authorization surface.
- Tests: each test sends its own random `X-Client-Token` (it's both the rate-limit key *and* the
  reaction identity here, so a shared token makes results order-dependent); find rows by a
  `marker-<UUID>` message rather than asserting counts, since the H2 DB is shared across the run.
- Tap targets must work at 360px with three emoji plus ▲ on one row.

## Risks

- **The `/admin` sort is the least certain piece.** It's cheap as specified (a `computed()` over
  loaded posts), but the admin wall only holds the pages it has fetched — so "mais reações" sorts
  what's loaded, not the whole table. If the instructor expects a true global ranking, this needs
  an API-side sort and becomes its own slice. Worth deciding before building.
- Reactions bump `updated_at`, so an actively-reacted post appears in every poll delta. With ~15
  clients that's fine; it's called out because it makes reactions cost more polling bandwidth than
  their payload suggests.
