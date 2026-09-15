import { describe, expect, it, vi } from "vitest"

import {
  TOKEN_REFRESH_MARGIN_MS,
  fetchMediaPage,
  isUnrecoverable,
  mediaToPost,
  needsRefresh,
  type InstagramMedia,
} from "../app/lib/instagram.server"

const noSleep = async () => {}

function media(overrides: Partial<InstagramMedia> = {}): InstagramMedia {
  return {
    id: "17895695668004550",
    caption: "First line of the caption\nand the rest of it",
    media_type: "IMAGE",
    media_url: "https://scontent.cdninstagram.com/a.jpg",
    permalink: "https://www.instagram.com/p/abc/",
    timestamp: "2026-02-01T10:00:00+0000",
    ...overrides,
  }
}

describe("token lifecycle", () => {
  const now = new Date("2026-03-01T00:00:00Z")

  it("does not refresh a token with plenty of life left", () => {
    const expires = new Date(now.getTime() + TOKEN_REFRESH_MARGIN_MS + 60_000)
    expect(needsRefresh(expires, now)).toBe(false)
  })

  it("refreshes once inside the margin", () => {
    const expires = new Date(now.getTime() + TOKEN_REFRESH_MARGIN_MS - 60_000)
    expect(needsRefresh(expires, now)).toBe(true)
  })

  it("treats the margin boundary as due, not as safe", () => {
    const expires = new Date(now.getTime() + TOKEN_REFRESH_MARGIN_MS)
    expect(needsRefresh(expires, now)).toBe(true)
  })

  it("flags an already-expired token as unrecoverable — refresh will not save it", () => {
    expect(isUnrecoverable(new Date(now.getTime() - 1), now)).toBe(true)
    expect(isUnrecoverable(new Date(now.getTime() + 1), now)).toBe(false)
  })
})

describe("mediaToPost", () => {
  it("uses the first caption line as the title", () => {
    const post = mediaToPost(media(), "shop_1", "cat_1")
    expect(post.title).toBe("First line of the caption")
    expect(post.body).toContain("and the rest of it")
  })

  it("truncates a long first line to the column limit", () => {
    const post = mediaToPost(media({ caption: "x".repeat(400) }), "shop_1", "cat_1")
    expect(post.title).toHaveLength(120)
  })

  it("falls back to a placeholder title for a caption-less post", () => {
    expect(mediaToPost(media({ caption: undefined }), "shop_1", "cat_1").title).toBe(
      "Instagram post",
    )
  })

  it("carries the media id as the idempotency key, so a re-import cannot duplicate", () => {
    const post = mediaToPost(media(), "shop_1", "cat_1")
    expect(post.source).toBe("instagram")
    expect(post.externalId).toBe("17895695668004550")
  })

  it("parses the Instagram timestamp into a real Date", () => {
    const post = mediaToPost(media(), "shop_1", "cat_1")
    expect(post.publishedAt.toISOString()).toBe("2026-02-01T10:00:00.000Z")
  })
})

describe("fetchMediaPage", () => {
  it("returns a cursor only when Meta says another page exists", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(
      Response.json({
        data: [media()],
        paging: { cursors: { after: "CURSOR_A" }, next: "https://graph.instagram.com/next" },
      }),
    )

    const page = await fetchMediaPage("token", null, {
      fetchImpl: fetchImpl as unknown as typeof fetch,
      sleep: noSleep,
    })

    expect(page.media).toHaveLength(1)
    expect(page.nextCursor).toBe("CURSOR_A")
  })

  it("returns a null cursor on the last page, so the next sync starts fresh", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(
      // meta still sends cursors.after on the final page
      Response.json({ data: [media()], paging: { cursors: { after: "CURSOR_END" } } }),
    )

    const page = await fetchMediaPage("token", "CURSOR_PREV", {
      fetchImpl: fetchImpl as unknown as typeof fetch,
      sleep: noSleep,
    })

    expect(page.nextCursor).toBeNull()
  })

  it("passes the cursor through as the `after` parameter", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(Response.json({ data: [] }))

    await fetchMediaPage("token", "CURSOR_X", {
      fetchImpl: fetchImpl as unknown as typeof fetch,
      sleep: noSleep,
    })

    const calledUrl = new URL(fetchImpl.mock.calls[0][0] as string)
    expect(calledUrl.searchParams.get("after")).toBe("CURSOR_X")
    expect(calledUrl.searchParams.get("access_token")).toBe("token")
  })

  it("retries a rate-limited request and honours Retry-After", async () => {
    const delays: number[] = []
    const fetchImpl = vi
      .fn()
      .mockResolvedValueOnce(
        new Response(null, { status: 429, headers: { "retry-after": "3" } }),
      )
      .mockResolvedValue(Response.json({ data: [media()] }))

    const page = await fetchMediaPage("token", null, {
      fetchImpl: fetchImpl as unknown as typeof fetch,
      sleep: async (ms) => {
        delays.push(ms)
      },
    })

    expect(fetchImpl).toHaveBeenCalledTimes(2)
    expect(delays).toEqual([3_000])
    expect(page.media).toHaveLength(1)
  })

  it("does not retry a revoked token — that is a 400, and repeating it is pointless", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(new Response(null, { status: 400 }))

    await expect(
      fetchMediaPage("dead-token", null, {
        fetchImpl: fetchImpl as unknown as typeof fetch,
        sleep: noSleep,
      }),
    ).rejects.toThrow(/400/)

    expect(fetchImpl).toHaveBeenCalledTimes(1)
  })

  it("tolerates a response with no data array", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(Response.json({}))

    const page = await fetchMediaPage("token", null, {
      fetchImpl: fetchImpl as unknown as typeof fetch,
      sleep: noSleep,
    })

    expect(page.media).toEqual([])
    expect(page.nextCursor).toBeNull()
  })
})
