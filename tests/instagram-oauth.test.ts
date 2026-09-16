import { describe, expect, it, vi } from "vitest"

import {
  buildAuthorizeUrl,
  exchangeCodeForToken,
  exchangeForLongLivedToken,
  fetchProfile,
  signState,
  verifyState,
  type OAuthConfig,
} from "../app/lib/instagram-oauth.server"

const config: OAuthConfig = {
  appId: "app-123",
  appSecret: "secret-456",
  redirectUri: "https://example.test/auth/instagram/callback",
}

const SECRET = "shopify-api-secret"

describe("state signing", () => {
  it("round-trips the shop", () => {
    const state = signState("shop.myshopify.com", SECRET)
    expect(verifyState(state, SECRET)).toBe("shop.myshopify.com")
  })

  it("rejects a state signed with a different secret", () => {
    const state = signState("shop.myshopify.com", "other-secret")
    expect(verifyState(state, SECRET)).toBeNull()
  })

  it("rejects a tampered shop", () => {
    const state = signState("shop.myshopify.com", SECRET)
    const [, mac] = state.split(".")
    const forged = `${Buffer.from("evil.myshopify.com:1").toString("base64url")}.${mac}`
    expect(verifyState(forged, SECRET)).toBeNull()
  })

  it("rejects an expired state, so a captured url cannot be replayed", () => {
    const issued = Date.now() - 20 * 60 * 1000
    const state = signState("shop.myshopify.com", SECRET, issued)
    expect(verifyState(state, SECRET)).toBeNull()
  })

  it("accepts a state inside the window", () => {
    const issued = Date.now() - 60 * 1000
    const state = signState("shop.myshopify.com", SECRET, issued)
    expect(verifyState(state, SECRET)).toBe("shop.myshopify.com")
  })

  it.each(["", "garbage", "a.b", "...."])("rejects malformed state %j", (state) => {
    expect(verifyState(state, SECRET)).toBeNull()
  })

  it("handles a shop domain containing a colon without losing it", () => {
    const state = signState("localhost:5182", SECRET)
    expect(verifyState(state, SECRET)).toBe("localhost:5182")
  })
})

describe("buildAuthorizeUrl", () => {
  it("includes everything Meta requires", () => {
    const url = new URL(buildAuthorizeUrl(config, "state-abc"))
    expect(url.origin + url.pathname).toBe("https://www.instagram.com/oauth/authorize")
    expect(url.searchParams.get("client_id")).toBe("app-123")
    expect(url.searchParams.get("redirect_uri")).toBe(config.redirectUri)
    expect(url.searchParams.get("response_type")).toBe("code")
    expect(url.searchParams.get("state")).toBe("state-abc")
    expect(url.searchParams.get("scope")).toContain("instagram_business_basic")
  })

  it("never leaks the app secret into the url", () => {
    expect(buildAuthorizeUrl(config, "s")).not.toContain("secret-456")
  })
})

describe("exchangeCodeForToken", () => {
  it("posts the code and returns the short-lived token", async () => {
    const fetchImpl = vi
      .fn()
      .mockResolvedValue(Response.json({ access_token: "short-token", user_id: 42 }))

    const result = await exchangeCodeForToken(config, "the-code", fetchImpl as never)

    expect(result).toEqual({ accessToken: "short-token", userId: "42" })
    const [url, init] = fetchImpl.mock.calls[0]
    expect(url).toBe("https://api.instagram.com/oauth/access_token")
    expect((init as RequestInit).method).toBe("POST")
  })

  it("strips the #_ instagram appends to the code", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(Response.json({ access_token: "t", user_id: 1 }))
    await exchangeCodeForToken(config, "abc123#_", fetchImpl as never)

    const body = (fetchImpl.mock.calls[0][1] as RequestInit).body as URLSearchParams
    expect(body.get("code")).toBe("abc123")
  })

  it("throws with Meta's message when the exchange fails", async () => {
    const fetchImpl = vi
      .fn()
      .mockResolvedValue(
        new Response(JSON.stringify({ error_message: "Invalid authorization code" }), {
          status: 400,
          headers: { "content-type": "application/json" },
        }),
      )

    await expect(exchangeCodeForToken(config, "bad", fetchImpl as never)).rejects.toThrow(
      /Invalid authorization code/,
    )
  })
})

describe("exchangeForLongLivedToken", () => {
  it("returns the token and computes the expiry", async () => {
    const now = Date.parse("2026-03-01T00:00:00Z")
    const fetchImpl = vi
      .fn()
      .mockResolvedValue(Response.json({ access_token: "long-token", expires_in: 5_184_000 }))

    const result = await exchangeForLongLivedToken(config, "short", fetchImpl as never, now)

    expect(result.accessToken).toBe("long-token")
    expect(result.expiresAt.toISOString()).toBe("2026-04-30T00:00:00.000Z")
  })

  it("defaults to 60 days when Meta omits expires_in", async () => {
    const now = Date.parse("2026-03-01T00:00:00Z")
    const fetchImpl = vi.fn().mockResolvedValue(Response.json({ access_token: "t" }))

    const result = await exchangeForLongLivedToken(config, "short", fetchImpl as never, now)
    expect(result.expiresAt.getTime() - now).toBe(60 * 24 * 60 * 60 * 1000)
  })

  it("sends the app secret as a query param, as Meta requires here", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(Response.json({ access_token: "t", expires_in: 1 }))
    await exchangeForLongLivedToken(config, "short", fetchImpl as never)

    const url = new URL(fetchImpl.mock.calls[0][0] as string)
    expect(url.searchParams.get("grant_type")).toBe("ig_exchange_token")
    expect(url.searchParams.get("client_secret")).toBe("secret-456")
  })
})

describe("fetchProfile", () => {
  it("returns id and username", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(Response.json({ id: "77", username: "thatone" }))
    await expect(fetchProfile("token", fetchImpl as never)).resolves.toEqual({
      id: "77",
      username: "thatone",
    })
  })

  it("falls back to the id when username is absent", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(Response.json({ id: "77" }))
    await expect(fetchProfile("token", fetchImpl as never)).resolves.toEqual({
      id: "77",
      username: "77",
    })
  })

  it("throws on an error response", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ error: { message: "Invalid OAuth access token" } }), {
        status: 401,
        headers: { "content-type": "application/json" },
      }),
    )
    await expect(fetchProfile("bad", fetchImpl as never)).rejects.toThrow(/Invalid OAuth/)
  })
})
