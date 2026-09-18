// integration tests for the heart toggle against a real postgres.
//
//   npm run db:local        # embedded postgres on 5433, no docker needed
//   DATABASE_URL="postgresql://postgres:postgres@127.0.0.1:5433/postgres?pgbouncer=true&connection_limit=1"
//   SHOPPER_HASH_SECRET=test-secret
//   npm run test:db
//
// these exercise toggleLike and likeSummary directly rather than through the
// proxy route, because the route needs a signed app proxy request and the
// signature is shopify's to make. the route's own logic above these — the
// signature check, logged_in_customer_id, the member upsert — is thin enough
// to read; the part worth a real database is the toggle itself.

import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest"

const SHOP = "likes-test.myshopify.com"
const OTHER_SHOP = "likes-other.myshopify.com"

const { default: prisma } = await import("../../app/db.server")
const { HEART, likeSummary, toggleLike } = await import("../../app/lib/forum.server")

async function cleanShops() {
  for (const domain of [SHOP, OTHER_SHOP]) {
    const shop = await prisma.shop.findUnique({ where: { domain } })
    if (shop) await prisma.shop.delete({ where: { id: shop.id } })
  }
}

/** A shop with one public post, one private post, and two members. */
async function seed(domain: string) {
  const shop = await prisma.shop.create({ data: { domain } })
  const [open, secret] = await Promise.all([
    prisma.category.create({
      data: { shopId: shop.id, handle: "brewing", title: "Brewing" },
    }),
    prisma.category.create({
      data: { shopId: shop.id, handle: "vip", title: "VIP", isPrivate: true },
    }),
  ])
  const [post, privatePost, ana, bruno] = await Promise.all([
    prisma.post.create({
      data: { shopId: shop.id, categoryId: open.id, title: "V60", body: "grind" },
    }),
    prisma.post.create({
      data: { shopId: shop.id, categoryId: secret.id, title: "VIP", body: "hush" },
    }),
    prisma.member.create({
      data: { shopId: shop.id, shopperHash: `${domain}:ana`, displayName: "Ana" },
    }),
    prisma.member.create({
      data: { shopId: shop.id, shopperHash: `${domain}:bruno`, displayName: "Bruno" },
    }),
  ])
  return { shop, post, privatePost, ana, bruno }
}

beforeAll(cleanShops)
afterAll(async () => {
  await cleanShops()
  await prisma.$disconnect()
})
beforeEach(cleanShops)

describe("toggleLike", () => {
  it("adds a heart, then removes the same one", async () => {
    const { shop, post, ana } = await seed(SHOP)

    expect(await toggleLike(shop.id, post.id, ana.id)).toEqual({ count: 1, liked: true })
    expect(await toggleLike(shop.id, post.id, ana.id)).toEqual({ count: 0, liked: false })

    expect(await prisma.reaction.count({ where: { postId: post.id } })).toBe(0)
  })

  it("counts two members separately", async () => {
    const { shop, post, ana, bruno } = await seed(SHOP)

    await toggleLike(shop.id, post.id, ana.id)
    expect(await toggleLike(shop.id, post.id, bruno.id)).toEqual({ count: 2, liked: true })

    // and one unliking does not touch the other's
    expect(await toggleLike(shop.id, post.id, ana.id)).toEqual({ count: 1, liked: false })
    const left = await prisma.reaction.findMany({ where: { postId: post.id } })
    expect(left.map((row) => row.memberId)).toEqual([bruno.id])
  })

  it("stores the token, never an emoji character", async () => {
    // "❤" and "❤️" differ by U+FE0F, and two code paths disagreeing about
    // which to write would both satisfy the unique constraint
    const { shop, post, ana } = await seed(SHOP)
    await toggleLike(shop.id, post.id, ana.id)

    const row = await prisma.reaction.findFirstOrThrow({ where: { postId: post.id } })
    expect(row.emoji).toBe(HEART)
    expect(row.emoji).toBe("heart")
  })

  it("stamps the shop on the row, so likes are scoped like everything else", async () => {
    const { shop, post, ana } = await seed(SHOP)
    await toggleLike(shop.id, post.id, ana.id)

    const row = await prisma.reaction.findFirstOrThrow({ where: { postId: post.id } })
    expect(row.shopId).toBe(shop.id)
  })

  it("refuses a post in a private category", async () => {
    const { shop, privatePost, ana } = await seed(SHOP)

    expect(await toggleLike(shop.id, privatePost.id, ana.id)).toBeNull()
    expect(await prisma.reaction.count({ where: { postId: privatePost.id } })).toBe(0)
  })

  it("refuses another shop's post even with a real post id", async () => {
    const mine = await seed(SHOP)
    const theirs = await seed(OTHER_SHOP)

    expect(await toggleLike(mine.shop.id, theirs.post.id, mine.ana.id)).toBeNull()
    expect(await prisma.reaction.count({ where: { postId: theirs.post.id } })).toBe(0)
  })

  it("refuses an id that does not exist", async () => {
    const { shop, ana } = await seed(SHOP)
    expect(await toggleLike(shop.id, "nope", ana.id)).toBeNull()
  })

  it("loses the heart when the post goes", async () => {
    const { shop, post, ana } = await seed(SHOP)
    await toggleLike(shop.id, post.id, ana.id)

    await prisma.post.delete({ where: { id: post.id } })
    expect(await prisma.reaction.count({ where: { postId: post.id } })).toBe(0)
  })

  it("loses the heart when the member goes", async () => {
    // without the member foreign key added in 4_post_likes these rows would
    // survive as likes nobody could attribute
    const { shop, post, ana } = await seed(SHOP)
    await toggleLike(shop.id, post.id, ana.id)

    await prisma.member.delete({ where: { id: ana.id } })
    expect(await prisma.reaction.count({ where: { postId: post.id } })).toBe(0)
  })
})

describe("likeSummary", () => {
  it("reports zero and unliked for a post nobody has touched", async () => {
    const { post, ana } = await seed(SHOP)

    const summary = await likeSummary([post.id], ana.id)
    expect(summary.get(post.id)).toEqual({ count: 0, liked: false })
  })

  it("separates the count from whether this member is in it", async () => {
    const { shop, post, ana, bruno } = await seed(SHOP)
    await toggleLike(shop.id, post.id, bruno.id)

    expect((await likeSummary([post.id], ana.id))?.get(post.id)).toEqual({
      count: 1,
      liked: false,
    })
    expect((await likeSummary([post.id], bruno.id))?.get(post.id)).toEqual({
      count: 1,
      liked: true,
    })
  })

  it("still counts for an anonymous visitor, who has liked nothing", async () => {
    const { shop, post, ana } = await seed(SHOP)
    await toggleLike(shop.id, post.id, ana.id)

    expect((await likeSummary([post.id], null)).get(post.id)).toEqual({
      count: 1,
      liked: false,
    })
  })

  it("has an entry for every id asked for, including ones with no likes", async () => {
    const { shop, post, privatePost, ana } = await seed(SHOP)
    await toggleLike(shop.id, post.id, ana.id)

    const summary = await likeSummary([post.id, privatePost.id], ana.id)
    expect(summary.size).toBe(2)
    expect(summary.get(privatePost.id)).toEqual({ count: 0, liked: false })
  })

  it("returns an empty map for an empty feed without querying", async () => {
    expect((await likeSummary([], null)).size).toBe(0)
  })
})
