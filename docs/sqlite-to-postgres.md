# SQLite → PostgreSQL runbook

One of the named responsibilities: *"Carry out the migration from SQLite to
PostgreSQL, currently planned but not started."*

**Done in this repo** — the schema is `provider = "postgresql"` and
`prisma/migrations/0_init` is a Postgres baseline. That was the easy version:
no data to preserve, so it was a datasource swap plus a regenerated migration.

The rest of this is the plan for the real app, where there *is* data and it
belongs to paying merchants. One-shot, no undo that doesn't involve telling
them the forum lost a day.

---

## Why it isn't just a datasource swap

| | SQLite | PostgreSQL |
|---|---|---|
| Types | dynamic, everything is TEXT/INTEGER/REAL/BLOB | strict, a wrong Prisma type is a runtime error not a coercion |
| `DateTime` | ms integer or ISO text | real `timestamp(3)`, timezone handling starts mattering |
| Booleans | 0/1 | real `boolean` |
| `BigInt` | 64-bit int | `bigint` — `Session.userId` is one |
| Case | `LIKE` is case-insensitive for ASCII | case-sensitive, want `ILIKE` or `citext` |
| Writes | one writer, `SQLITE_BUSY` under load | MVCC, so code that serialised itself by accident now races |
| `@@unique` on nullables | one NULL row per combination | NULLs are distinct, so many NULL rows |

The last row is subtle. `Post.@@unique([shopId, source, externalId])` with a
nullable `externalId` behaves differently on the two engines — on Postgres
every forum-authored post has NULL and none collide, which is what I want, but
I shouldn't find that out by accident.

The concurrency row is the dangerous one. SQLite's single-writer lock hides
races. On Postgres the `ImportJob` claim has to actually be atomic:

```sql
UPDATE "ImportJob" SET status = 'running', "claimedAt" = now()
WHERE id = (
  SELECT id FROM "ImportJob"
  WHERE status = 'pending' AND "runAfter" <= now()
  ORDER BY "runAfter"
  FOR UPDATE SKIP LOCKED
  LIMIT 1
)
RETURNING *;
```

`FOR UPDATE SKIP LOCKED` has no SQLite equivalent, so that path is untested
until the move.

---

## Rehearsal

**1. Postgres.**

```bash
docker run --name shopify-pg -e POSTGRES_PASSWORD=dev -p 5432:5432 -d postgres:17
```

**2. Branch the schema.** Change the datasource, keep the rest:

```prisma
datasource db {
  provider = "postgresql"
  url      = env("DATABASE_URL")
}
```

**3. Regenerate migrations from scratch** into a separate folder. Don't replay
the SQLite migrations against Postgres, the DDL is dialect-specific and won't
apply.

```bash
npx prisma migrate diff --from-empty --to-schema-datamodel prisma/schema.prisma --script > pg-init.sql
```

**4. Copy the data.** At this size a script reading with the SQLite client and
writing with the Postgres client beats a CSV round trip — simpler, auditable,
and it can assert row counts per table as it goes.

**5. Verify.** Per table: row count, min/max of every DateTime column, and a
spot check that a BigInt (`Session.userId`) round-tripped.

---

## Cutover, for real

The rehearsal is the easy half. Write this down and get it reviewed before
touching production.

1. **Freeze writes.** Maintenance mode on the proxy routes, admin can stay
   read-only. Read-only for 20 minutes is fine; a split brain where some posts
   landed in SQLite after the copy is not.
2. **Take the backup I'll actually restore from.** Not "there's a nightly" —
   take one, copy it off-box, restore it somewhere to prove it works.
3. **Copy, with counts.** Row count per table on both sides. Mismatch aborts.
4. **Point the app at Postgres** and deploy. Sessions come across too — lose
   the `Session` table and every merchant is silently logged out and the next
   request re-runs OAuth.
5. **Smoke test in order:** `/sante` → admin loads for one shop → proxy returns
   posts on a real storefront → a webhook delivers → billing check.
6. **Unfreeze.**
7. **Keep the SQLite file** a month, read-only, off-box.

### Rollback

Only possible while nothing has been written to Postgres. Once a merchant has
posted, rolling back loses that post. So the decision point is step 5 — if the
smoke test fails, revert the datasource and unfreeze, costs nothing. After
unfreeze there's no rollback, only forward fixes.

Say that out loud to whoever owns the app first. "We can roll back" stops being
true at a specific minute.

---

## App changes that go with it

- [ ] `ImportJob` claim rewritten with `FOR UPDATE SKIP LOCKED`
- [ ] `LIKE` search switched to `ILIKE` or a proper index
- [ ] Pool sized against the host's `max_connections` — Prisma's default times
      the instance count will exhaust a small Postgres fast
- [ ] `Session` indexed on `shop` (it is here, confirm on the real app)
- [ ] Backups move from an SQLite file copy to `pg_dump`, and the **restore**
      gets rehearsed, not just the dump
