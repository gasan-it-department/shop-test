// integration tests for the admin's people-and-community surface: the member
// list's filters and paging, the member detail page's data, and the
// cross-post comment queue.
//
//   npm run db:local
//   DATABASE_URL="postgresql://postgres:postgres@127.0.0.1:5433/postgres?pgbouncer=true&connection_limit=1"
//   SHOPPER_HASH_SECRET=test-secret
//   npm run test:db
//
// these go through the data layer rather than the routes: the routes are a
// loader that reshapes the result and a form that calls one function, and the
// part that can actually be wrong is the query — the scoping, the paging and
// the counts.

import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest"

const SHOP = "admin-test.myshopify.com"
const OTHER_SHOP = "admin-other.myshopify.com"

const { default: prisma } = await import("../../app/db.server")
const {
  anonymiseMemberById,
  getMember,
  listComments,
  listMembers,
  shopOverview,
  toggleLike,
} = await import("../../app/lib/forum.server")

async function cleanShops() {
  for (const domain of [SHOP, OTHER_SHOP]) {
    const shop = await prisma.shop.findUnique({ where: { domain } })
    if (shop) await prisma.shop.delete({ where: { id: shop.id } })
  }
}

/** A shop with one category, one post per member, and comments on it. */
async function seed(domain: string) {
  const shop = await prisma.shop.create({ data: { domain } })
  const category = await prisma.category.create({
    data: { shopId: shop.id, handle: "brewing", title: "Brewing" },
  })
  const ana = await prisma.member.create({
    data: { shopId: shop.id, shopperHash: `${domain}:ana`, displayName: "Ana Reyes" },
  })
  const bruno = await prisma.member.create({
    data: { shopId: shop.id, shopperHash: `${domain}:bruno`, displayName: "Bruno Tan" },
  })
  const post = await prisma.post.create({
    data: {
      shopId: shop.id,
      categoryId: category.id,
      authorId: ana.id,
      title: "V60 grind",
      body: "coarser",
    },
  })
  return { shop, category, ana, bruno, post }
}

beforeAll(cleanShops)
afterAll(async () => {
  await cleanShops()
  await prisma.$disconnect()
})
beforeEach(cleanShops)

describe("listMembers", () => {
  it("returns a total alongside the page, so the admin can paginate", async () => {
    const { shop } = await seed(SHOP)

    const { items, total } = await listMembers(shop.id, { take: 1 })
    expect(items).toHaveLength(1)
    expect(total).toBe(2)
  })

  it("pages without repeating or skipping a row", async () => {
    const { shop } = await seed(SHOP)

    const first = await listMembers(shop.id, { take: 1, skip: 0 })
    const second = await listMembers(shop.id, { take: 1, skip: 1 })
    expect(first.items[0].id).not.toBe(second.items[0].id)

    const all = await listMembers(shop.id)
    expect(new Set([first.items[0].id, second.items[0].id])).toEqual(
      new Set(all.items.map((m) => m.id)),
    )
  })

  it("searches display names case-insensitively", async () => {
    const { shop } = await seed(SHOP)

    const hit = await listMembers(shop.id, { search: "bruno" })
    expect(hit.items.map((m) => m.displayName)).toEqual(["Bruno Tan"])
    expect(hit.total).toBe(1)

    expect((await listMembers(shop.id, { search: "zzz" })).total).toBe(0)
  })

  it("filters to active or redacted members", async () => {
    const { shop, ana } = await seed(SHOP)
    await anonymiseMemberById(shop.id, ana.id)

    expect((await listMembers(shop.id, { anonymised: true })).total).toBe(1)
    const active = await listMembers(shop.id, { anonymised: false })
    expect(active.total).toBe(1)
    expect(active.items[0].displayName).toBe("Bruno Tan")
    // undefined means both, not neither
    expect((await listMembers(shop.id)).total).toBe(2)
  })

  it("counts likes given, separately from posts and comments", async () => {
    const { shop, ana, post } = await seed(SHOP)
    await toggleLike(shop.id, post.id, ana.id)

    const { items } = await listMembers(shop.id, { search: "Ana" })
    expect(items[0]._count).toMatchObject({ posts: 1, comments: 0, reactions: 1 })
  })

  it("never returns another shop's members", async () => {
    const mine = await seed(SHOP)
    await seed(OTHER_SHOP)

    const { items, total } = await listMembers(mine.shop.id)
    expect(total).toBe(2)
    expect(items.every((m) => m.shopId === mine.shop.id)).toBe(true)
  })
})

describe("getMember", () => {
  it("returns the member with their posts, comments and counts", async () => {
    const { shop, ana, bruno, post } = await seed(SHOP)
    await prisma.comment.create({
      data: { shopId: shop.id, postId: post.id, authorId: ana.id, body: "my own thread" },
    })
    await toggleLike(shop.id, post.id, bruno.id)

    const member = await getMember(shop.id, ana.id)
    expect(member?.displayName).toBe("Ana Reyes")
    expect(member?._count).toMatchObject({ posts: 1, comments: 1, reactions: 0 })
    expect(member?.posts.map((p) => p.title)).toEqual(["V60 grind"])
    expect(member?.comments[0].post.title).toBe("V60 grind")
  })

  it("refuses a member id belonging to another shop", async () => {
    const mine = await seed(SHOP)
    const theirs = await seed(OTHER_SHOP)

    expect(await getMember(mine.shop.id, theirs.ana.id)).toBeNull()
  })

  it("returns null for an id that does not exist", async () => {
    const { shop } = await seed(SHOP)
    expect(await getMember(shop.id, "nope")).toBeNull()
  })
})

describe("listComments", () => {
  it("returns comments newest first, across every post", async () => {
    const { shop, category, ana, bruno, post } = await seed(SHOP)
    const other = await prisma.post.create({
      data: { shopId: shop.id, categoryId: category.id, authorId: bruno.id, title: "Beans", body: "b" },
    })

    await prisma.comment.create({
      data: {
        shopId: shop.id,
        postId: post.id,
        authorId: bruno.id,
        body: "older",
        createdAt: new Date("2026-01-01"),
      },
    })
    await prisma.comment.create({
      data: {
        shopId: shop.id,
        postId: other.id,
        authorId: ana.id,
        body: "newer",
        createdAt: new Date("2026-02-01"),
      },
    })

    const { items, total } = await listComments(shop.id)
    expect(total).toBe(2)
    expect(items.map((c) => c.body)).toEqual(["newer", "older"])
    // the post each one is on comes back, so the queue can link to it
    expect(items[0].post.title).toBe("Beans")
    expect(items[0].author?.displayName).toBe("Ana Reyes")
  })

  it("searches comment bodies case-insensitively", async () => {
    const { shop, ana, post } = await seed(SHOP)
    await prisma.comment.create({
      data: { shopId: shop.id, postId: post.id, authorId: ana.id, body: "Grind it COARSER" },
    })
    await prisma.comment.create({
      data: { shopId: shop.id, postId: post.id, authorId: ana.id, body: "unrelated" },
    })

    expect((await listComments(shop.id, { search: "coarser" })).total).toBe(1)
  })

  it("narrows to one post when asked", async () => {
    const { shop, category, ana, bruno, post } = await seed(SHOP)
    const other = await prisma.post.create({
      data: { shopId: shop.id, categoryId: category.id, authorId: bruno.id, title: "Beans", body: "b" },
    })
    await prisma.comment.create({
      data: { shopId: shop.id, postId: post.id, authorId: ana.id, body: "on first" },
    })
    await prisma.comment.create({
      data: { shopId: shop.id, postId: other.id, authorId: ana.id, body: "on second" },
    })

    const { items } = await listComments(shop.id, { postId: other.id })
    expect(items.map((c) => c.body)).toEqual(["on second"])
  })

  it("pages", async () => {
    const { shop, ana, post } = await seed(SHOP)
    for (const body of ["one", "two", "three"]) {
      await prisma.comment.create({
        data: { shopId: shop.id, postId: post.id, authorId: ana.id, body },
      })
    }

    const page = await listComments(shop.id, { take: 2 })
    expect(page.items).toHaveLength(2)
    expect(page.total).toBe(3)
  })

  it("never returns another shop's comments", async () => {
    const mine = await seed(SHOP)
    const theirs = await seed(OTHER_SHOP)
    await prisma.comment.create({
      data: {
        shopId: theirs.shop.id,
        postId: theirs.post.id,
        authorId: theirs.ana.id,
        body: "not yours",
      },
    })

    expect((await listComments(mine.shop.id)).total).toBe(0)
  })
})

describe("shopOverview", () => {
  it("counts likes for the shop and per recent post", async () => {
    const { shop, ana, bruno, post } = await seed(SHOP)
    await toggleLike(shop.id, post.id, ana.id)
    await toggleLike(shop.id, post.id, bruno.id)

    const overview = await shopOverview(shop.id)
    expect(overview.counts.likes).toBe(2)
    expect(overview.recent[0]._count.reactions).toBe(2)
  })

  it("does not count another shop's likes", async () => {
    const mine = await seed(SHOP)
    const theirs = await seed(OTHER_SHOP)
    await toggleLike(theirs.shop.id, theirs.post.id, theirs.ana.id)

    expect((await shopOverview(mine.shop.id)).counts.likes).toBe(0)
  })
})
