// import worker against a real database with a fake Meta. see the header of
// categories.db.test.ts for how to run these.

import { afterAll, beforeEach, describe, expect, it, vi } from "vitest"

import prisma from "../../app/db.server"
import { syncAccount } from "../../app/lib/instagram-import.server"

const SHOP = "instagram-test.myshopify.com"

function media(id: string, caption = `Caption ${id}`) {
  return {
    id,
    caption,
    media_type: "IMAGE",
    media_url: `https://cdn.example/${id}.jpg`,
    permalink: `https://instagram.com/p/${id}/`,
    timestamp: "2026-02-01T10:00:00+0000",
  }
}

/** a fake graph api: one page per entry, cursors chained automatically */
function fakeGraph(pages: Array<{ data: unknown[]; last?: boolean }>) {
  let call = 0
  return vi.fn(async () => {
    const page = pages[Math.min(call, pages.length - 1)]
    call++
    return Response.json({
      data: page.data,
      paging: page.last
        ? { cursors: { after: `cursor-${call}` } }
        : { cursors: { after: `cursor-${call}` }, next: "https://graph.instagram.com/next" },
    })
  })
}

async function seedAccount(expiresInDays = 45) {
  const shop = await prisma.shop.upsert({
    where: { domain: SHOP },
    update: {},
    create: { domain: SHOP },
  })
  return prisma.instagramAccount.create({
    data: {
      shopId: shop.id,
      igUserId: "ig-1",
      username: "thatone",
      accessToken: "long-token",
      tokenExpiresAt: new Date(Date.now() + expiresInDays * 24 * 60 * 60 * 1000),
    },
  })
}

beforeEach(async () => {
  const shop = await prisma.shop.findUnique({ where: { domain: SHOP } })
  if (shop) await prisma.shop.delete({ where: { id: shop.id } })
})

afterAll(async () => {
  const shop = await prisma.shop.findUnique({ where: { domain: SHOP } })
  if (shop) await prisma.shop.delete({ where: { id: shop.id } })
  await prisma.$disconnect()
})

describe("syncAccount", () => {
  it("imports media as posts", async () => {
    const account = await seedAccount()
    const fetchImpl = fakeGraph([{ data: [media("m1"), media("m2")], last: true }])

    const result = await syncAccount(account.id, { fetchImpl: fetchImpl as never })

    expect(result.imported).toBe(2)
    expect(await prisma.post.count({ where: { source: "instagram" } })).toBe(2)
  })

  it("puts imported posts in a private Instagram category", async () => {
    const account = await seedAccount()
    await syncAccount(account.id, {
      fetchImpl: fakeGraph([{ data: [media("m1")], last: true }]) as never,
    })

    const category = await prisma.category.findFirstOrThrow({ where: { handle: "instagram" } })
    // a year of back-catalogue should not appear on the storefront on connect
    expect(category.isPrivate).toBe(true)
  })

  it("updates rather than duplicating when the same media comes back", async () => {
    const account = await seedAccount()

    await syncAccount(account.id, {
      fetchImpl: fakeGraph([{ data: [media("m1", "First")], last: true }]) as never,
    })
    // a second run over an overlapping page is the normal case, not an edge one
    const second = await syncAccount(account.id, {
      fetchImpl: fakeGraph([{ data: [media("m1", "Edited caption")], last: true }]) as never,
    })

    expect(second.imported).toBe(0)
    expect(second.updated).toBe(1)
    expect(await prisma.post.count({ where: { source: "instagram" } })).toBe(1)

    const post = await prisma.post.findFirstOrThrow({ where: { externalId: "m1" } })
    expect(post.body).toBe("Edited caption")
  })

  it("stops after maxPages so a long history can't hang the request", async () => {
    const account = await seedAccount()
    const fetchImpl = fakeGraph([{ data: [media("m1")] }]) // never signals last

    const result = await syncAccount(account.id, { fetchImpl: fetchImpl as never, maxPages: 3 })

    expect(result.pages).toBe(3)
    expect(fetchImpl).toHaveBeenCalledTimes(3)
    expect(result.cursor).not.toBeNull()
  })

  it("clears the cursor on the last page so the next sync starts fresh", async () => {
    const account = await seedAccount()
    await syncAccount(account.id, {
      fetchImpl: fakeGraph([{ data: [media("m1")], last: true }]) as never,
    })

    const updated = await prisma.instagramAccount.findUniqueOrThrow({ where: { id: account.id } })
    expect(updated.lastCursor).toBeNull()
    expect(updated.lastSyncedAt).not.toBeNull()
  })

  it("records a successful job", async () => {
    const account = await seedAccount()
    await syncAccount(account.id, {
      fetchImpl: fakeGraph([{ data: [media("m1")], last: true }]) as never,
    })

    const job = await prisma.importJob.findFirstOrThrow({ where: { accountId: account.id } })
    expect(job.status).toBe("done")
    expect(JSON.parse(job.payload)).toMatchObject({ imported: 1 })
  })

  it("records a failed job and rethrows, rather than failing silently", async () => {
    const account = await seedAccount()
    const fetchImpl = vi.fn(async () => new Response(null, { status: 400 }))

    await expect(
      syncAccount(account.id, { fetchImpl: fetchImpl as never }),
    ).rejects.toBeInstanceOf(Error)

    const job = await prisma.importJob.findFirstOrThrow({ where: { accountId: account.id } })
    expect(job.status).toBe("failed")
    expect(job.attempts).toBe(1)
    expect(job.lastError).toBeTruthy()
  })

  it("refuses to run on an expired token and says why", async () => {
    const account = await seedAccount(-1)

    await expect(
      syncAccount(account.id, { fetchImpl: vi.fn() as never }),
    ).rejects.toThrow(/expired/i)

    const updated = await prisma.instagramAccount.findUniqueOrThrow({ where: { id: account.id } })
    expect(updated.disabledReason).toMatch(/Reconnect/)
  })

  it("refreshes a token inside the margin before importing", async () => {
    const account = await seedAccount(3) // inside the 7-day margin
    const calls: string[] = []

    const fetchImpl = vi.fn(async (url: string) => {
      calls.push(url)
      if (url.includes("refresh_access_token")) {
        return Response.json({ access_token: "fresh-token", expires_in: 5_184_000 })
      }
      return Response.json({ data: [media("m1")], paging: { cursors: { after: "c1" } } })
    })

    const result = await syncAccount(account.id, { fetchImpl: fetchImpl as never })

    expect(result.tokenRefreshed).toBe(true)
    expect(calls[0]).toContain("refresh_access_token")

    const updated = await prisma.instagramAccount.findUniqueOrThrow({ where: { id: account.id } })
    expect(updated.accessToken).toBe("fresh-token")
  })
})
