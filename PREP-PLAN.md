# Prep plan — Insider Club takeover

Notes to self, 15 Sep 2026. Four weeks of evenings, or two weeks if I go
full-time on it.

## What the role is

Not greenfield. A takeover of a live app with paying merchants: 21 Prisma
models, 38 modules, 56 test suites, 874 assertions, on Fly.io. So the bar isn't
"can I build a Shopify app", it's "can I change this one without breaking
merchants".

That changes what I should prepare. Platform knowledge is table stakes. What
I actually need to be able to talk about is operating a service: a backup I've
restored, a migration I've rehearsed, guardrails I've tested by breaking them.

## What carries over

- **React Router 7 + SSR** — the Shopify template is this stack. Same as
  gmitp003 / 2024project.
- **Prisma** — already using it in two projects.
- **Queue + sync semantics** — the offline sync queue in the inventory app is
  the same problem as the Instagram import: idempotency keys, backoff, cursor
  persistence, partial failure.
- **Zod + typed data layers** — reusable for third-party API responses.
- **Postgres/Supabase** — the migration target.

## Gaps, honestly

| Gap | How bad | Covered in |
|---|---|---|
| Shopify platform specifics | medium, lots of gotchas but few hard ideas | wk 1–2 |
| Liquid + surviving hostile themes | high, nothing in my work is like this | wk 2 |
| Running a service in production alone | worst one | wk 3, and past that |
| Meta Graph API / long-lived tokens | medium | wk 3 |
| A production DB migration | high, and it's one-shot | wk 4 |
| App Store submission, Level 2 data | slow, process-heavy | read now, do later |

---

## Week 0 — before committing

Cheap, and changes whether the rest is worth doing.

- [ ] Install the reference app, **collective-club-1**, on a dev store. Use the
      forum like a merchant. Post, comment, react, try to break it.
- [ ] Ask for **read access to the repo** and the 87 dev notes. Can't judge
      whether this job is pleasant or a swamp from a job description.
- [ ] Pin down the **engagement**. This reads full-time or long retainer, not
      fixed scope. Rate, hours, and who's on call when a restore fails at 2am.
- [ ] Ask what **"autonomy on running a service in production"** means here.
      Who's the second pair of eyes? Is there one?

If there's no second pair of eyes and no handover, that's the biggest risk in
the whole thing, bigger than any of the code.

## Week 1 — platform

Goal: my own app running in a real dev store.

- [ ] Partner account + development store (free).
- [ ] `shopify app dev` on this scaffold. Watch what the CLI rewrites in
      `shopify.app.toml`.
- [ ] Install on the dev store. Follow the OAuth flow in the network tab until
      I can explain every redirect.
- [ ] Session tokens vs access tokens: what `authenticate.admin` does on a cold
      load, what the bounce page is for, why an embedded app can't use cookies.
- [ ] Change `[access_scopes]`, reinstall, watch `scopes_update` fire. Then
      remove the handler on purpose and see what drifts.
- [ ] Read the Admin GraphQL cost model. Run a query past the bucket and read
      the throttle response.

Done when: I can explain why an embedded app needs SSR without notes.

## Week 2 — storefront

The part with no analogue in anything I've built.

- [ ] Start at `/dev`. The harness runs the real extension script with no
      Shopify account, so the edit/reload loop is seconds. First pass on the
      widget goes there.
- [ ] Toggle "Simulate a hostile theme" on `/dev`. Then break it: swap
      `attachShadow({ mode: "closed" })` for a plain div in `forum.js` and
      watch the merchant CSS eat the widget. Put it back.
- [ ] Deploy the theme app extension. Add the block from the theme editor.
- [ ] Install **three** themes, including a heavily customised one, and check
      the widget in each. The harness gets close; only a real theme finds the
      last bugs.
- [ ] Enough Liquid to read a theme: objects, filters, `{% schema %}`, app
      blocks vs app embed blocks, `asset_url`.
- [ ] Trace an App Proxy request end to end. Comment out
      `authenticate.public.appProxy` and curl the route to confirm the
      signature check is what rejects a forgery.
- [ ] Storefront identity: why `logged_in_customer_id` is trustworthy and a
      body field isn't.

Done when: the widget renders correctly on three themes and degrades sensibly
when the proxy 500s.

## Week 3 — integration and ops

The two things that get me paged.

- [ ] Meta developer app + business Instagram account. Do the consent flow.
- [ ] Import worker against `ImportJob`: claim, run, backoff, mark done. Reuse
      `app/lib/retry.ts`.
- [ ] Expire a token on purpose in a fixture. Confirm the UI says so before a
      merchant notices a dead feed.
- [ ] Deploy to Fly.io. Free tier, real deploy, real logs.
- [ ] Set up a backup, then **restore it into a fresh database**. A backup I
      haven't restored is a guess.
- [ ] Alerting: something that actually messages me when `/sante` fails.
- [ ] Kill the database while the app is running. See what the health endpoint
      does and what a merchant would see.

Done when: I've restored a backup, timed it, and written the procedure down.
That's the most useful thing I can bring to the interview.

## Week 4 — migration, compliance, submission

- [ ] Full rehearsal from `docs/sqlite-to-postgres.md`. Twice. Time the second.
- [ ] Write the cutover plan, including the minute after which rollback stops
      being possible.
- [ ] Fire all three compliance webhooks (`shopify app webhook trigger`).
      Confirm 200 within 5s.
- [ ] Read the Protected Customer Data requirements. Write the justification
      per field the app touches.
- [ ] Skim App Store listing requirements: screenshots, demo video, privacy
      policy served by the app.
- [ ] Add a test here that fails when I weaken a guardrail. Four of those
      already exist, copy the pattern.

Done when: a migration plan someone else could execute.

---

## Interview

Three things to bring:

1. **This repo**, with test output. More concrete than a CV line.
2. **The restore procedure** from week 3, with timings.
3. **The migration plan** from week 4, specifically the rollback boundary.

To ask them:

- What broke most recently in production, and how did you find out?
- Is there a staging environment with realistic merchant data?
- What's the restore procedure, and when was it last tested?
- Are the 87 dev notes decisions or TODOs?
- Why is the Resend email work on hold?
- How many merchants, and what's the biggest forum by post count? That decides
  whether the Postgres migration is an afternoon or a weekend.

## The gap, stated plainly

I'm OJT/intern level and this asks for solo ownership of a production service.
The coding I can do. The operational autonomy is a stretch and pretending
otherwise makes the first month bad.

Better version of the conversation: "Here's a practice app covering every
surface in your brief. Here's a backup I restored and timed. Here's my
migration plan and where its rollback boundary is. What I haven't done is carry
a pager for a live app — how do you want to handle the first month?"

Claiming ops experience I don't have is how the first incident becomes a
crisis.
