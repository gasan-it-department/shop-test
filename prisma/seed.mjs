// npm run seed
// plain .mjs so it runs on node with no extra toolchain.
// re-runnable, everything is keyed on a natural unique.

import { createHmac } from "node:crypto"

import { PrismaClient } from "@prisma/client"

const prisma = new PrismaClient()

const SHOP = "practice-store.myshopify.com"
const SECRET = process.env.SHOPPER_HASH_SECRET || "seed-only-secret"

// keep in sync with app/lib/privacy.server.ts
function shopperHash(shopDomain, customerId) {
  const id = String(customerId)
  return createHmac("sha256", SECRET)
    .update(`${shopDomain.length}:${shopDomain}${id.length}:${id}`)
    .digest("hex")
}

const CATEGORIES = [
  { handle: "brewing", title: "Brewing", position: 0, isPrivate: false },
  { handle: "gear", title: "Gear", position: 1, isPrivate: false },
  { handle: "vip", title: "VIP lounge", position: 2, isPrivate: true },
]

const MEMBERS = [
  { customerId: 1001, displayName: "Ana" },
  { customerId: 1002, displayName: "Bruno" },
  // must render as literal text on the storefront
  { customerId: 1003, displayName: `<script>alert("xss")</script>` },
]

const POSTS = [
  {
    category: "brewing",
    author: 1001,
    title: "Which grind size for a V60?",
    body: "Going finer than table salt tastes bitter on my setup. What works for you?",
    comments: ["Try one notch coarser and a 3:30 total brew.", "Water temp matters more than grind here."],
  },
  {
    category: "brewing",
    author: 1002,
    title: "Anyone else brewing with hard water?",
    body: "Our tap water is very hard and every light roast tastes flat.",
    comments: ["A cheap filter jug fixed this for me."],
  },
  {
    category: "gear",
    author: 1002,
    title: "Hand grinder recommendations under $150",
    body: "Looking to replace a blade grinder. Burr, obviously.",
    comments: [],
  },
  {
    // stored raw, escaped at render, never the other way round
    category: "gear",
    author: 1003,
    title: `</h3><img src=x onerror=alert(1)>`,
    body: `Body with a "quote", an <em>element</em>, and a javascript:alert(1) link.`,
    comments: ["Rendered as text, or the app has a stored XSS."],
  },
  {
    category: "vip",
    author: 1001,
    title: "Private: early access to the new subscription",
    body: "Private category. Must not appear on the public endpoint.",
    comments: [],
  },
]

async function main() {
  const shop = await prisma.shop.upsert({
    where:  { domain: SHOP },
    update: { installed: true, timezone: "Asia/Manila" },
    create: { domain: SHOP, timezone: "Asia/Manila", locale: "en" },
  })

  const categories = new Map()
  for (const category of CATEGORIES) {
    const row = await prisma.category.upsert({
      where:  { shopId_handle: { shopId: shop.id, handle: category.handle } },
      update: { title: category.title, isPrivate: category.isPrivate, position: category.position },
      create: { shopId: shop.id, ...category },
    })
    categories.set(category.handle, row)
  }

  const members = new Map()
  for (const member of MEMBERS) {
    const hash = shopperHash(SHOP, member.customerId)
    const row = await prisma.member.upsert({
      where:  { shopId_shopperHash: { shopId: shop.id, shopperHash: hash } },
      update: { displayName: member.displayName },
      create: { shopId: shop.id, shopperHash: hash, displayName: member.displayName },
    })
    members.set(member.customerId, row)
  }

  for (const [index, entry] of POSTS.entries()) {
    const category = categories.get(entry.category)
    const author = members.get(entry.author)

    const post = await prisma.post.upsert({
      where: {
        shopId_source_externalId: { shopId: shop.id, source: "seed", externalId: `seed-${index}` },
      },
      update: { title: entry.title, body: entry.body },
      create: {
        shopId: shop.id,
        categoryId: category.id,
        authorId: author.id,
        source: "seed",
        externalId: `seed-${index}`,
        title: entry.title,
        body: entry.body,
        publishedAt: new Date(Date.now() - index * 86_400_000),
      },
    })

    await prisma.comment.deleteMany({ where: { postId: post.id } })
    for (const body of entry.comments) {
      await prisma.comment.create({
        data: { shopId: shop.id, postId: post.id, authorId: author.id, body },
      })
    }
  }

  const counts = {
    categories: await prisma.category.count({ where: { shopId: shop.id } }),
    members:    await prisma.member.count({ where: { shopId: shop.id } }),
    posts:      await prisma.post.count({ where: { shopId: shop.id } }),
    comments:   await prisma.comment.count({ where: { shopId: shop.id } }),
  }

  console.log(`[seed] ${SHOP}`, counts)
  console.log("[seed] open http://localhost:5182/dev")
}

main()
  .catch((error) => {
    console.error(error)
    process.exitCode = 1
  })
  .finally(() => prisma.$disconnect())
