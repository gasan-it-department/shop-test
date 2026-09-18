import { describe, expect, it, vi } from "vitest"

import { describeToken, probeAdminApi, summarise, type ProbeResult } from "../app/lib/admin-probe.server"

const SHOP = "example.myshopify.com"

// Deliberately NOT shaped like a real token. A real one is shpat_ followed by
// 32 hex characters, and a literal of that shape in a test file is
// indistinguishable from a live credential to a secret scanner — GitHub push
// protection rejects the whole push over it. The letters below are outside
// hex on purpose, which is enough to break the match while still exercising
// the prefix handling this file is about.
const TOKEN = "shpat_exampleonly_not_a_real_token_xyz"

/** a fetch that answers each call from a queue, and records what it was sent */
function fakeFetch(answers: Array<{ status: number; body?: string; headers?: Record<string, string> }>) {
  const calls: Array<{ url: string; method: string; headers: Record<string, string>; body: string | null }> = []
  let i = 0

  const impl = vi.fn(async (url: string | URL | Request, init?: RequestInit) => {
    calls.push({
      url: String(url),
      method: init?.method ?? "GET",
      headers: (init?.headers ?? {}) as Record<string, string>,
      body: (init?.body as string) ?? null,
    })
    const answer = answers[Math.min(i++, answers.length - 1)]
    return new Response(answer.body ?? "", {
      status: answer.status,
      headers: answer.headers ?? {},
    })
  })

  return { impl: impl as unknown as typeof fetch, calls }
}

const ok = { status: 200, body: '{"data":{"shop":{"name":"x"}}}' }
const forbidden = { status: 403, body: "" }

describe("describeToken", () => {
  it("shows the prefix and length, never the token", () => {
    const described = describeToken(TOKEN)
    expect(described).toContain("shpat_")
    // the part after the prefix is the secret half and must never survive
    expect(described).not.toContain("exampleonly")
    expect(described).not.toContain(TOKEN)
    expect(described).toContain(String(TOKEN.length))
  })

  it("names the different credential kinds by their prefix", () => {
    expect(describeToken("shpca_abc123")).toContain("shpca_")
    expect(describeToken("shpua_abc123")).toContain("shpua_")
  })

  it("says so when there is no token at all", () => {
    expect(describeToken(undefined)).toContain("no access token")
    expect(describeToken("")).toContain("no access token")
  })

  it("does not echo a token of unexpected shape", () => {
    const weird = "thisisnotashopifytokenatall"
    const described = describeToken(weird)
    expect(described).not.toContain(weird)
    expect(described).toContain("unrecognised")
  })
})

describe("probeAdminApi", () => {
  it("sends the token as a header and never in the url", async () => {
    const { impl, calls } = fakeFetch([ok])
    await probeAdminApi(SHOP, TOKEN, "2026-07", impl)

    expect(calls).toHaveLength(5)
    for (const call of calls) {
      expect(call.headers["X-Shopify-Access-Token"]).toBe(TOKEN)
      expect(call.url).not.toContain(TOKEN)
    }
  })

  it("starts with an unversioned endpoint, so a bad version cannot mask a bad token", async () => {
    const { impl, calls } = fakeFetch([ok])
    await probeAdminApi(SHOP, TOKEN, "2026-07", impl)

    expect(calls[0].url).toBe(`https://${SHOP}/admin/oauth/access_scopes.json`)
    expect(calls[0].url).not.toContain("2026-07")
  })

  it("probes the version it was given", async () => {
    const { impl, calls } = fakeFetch([ok])
    await probeAdminApi(SHOP, TOKEN, "2099-01", impl)
    expect(calls[1].url).toContain("/admin/api/2099-01/shop.json")
  })

  it("asks for currentAppInstallation, which needs no scope", async () => {
    const { impl, calls } = fakeFetch([ok])
    await probeAdminApi(SHOP, TOKEN, "2026-07", impl)
    expect(calls.some((c) => c.body?.includes("currentAppInstallation"))).toBe(true)
  })

  it("keeps the request id, which is all a body-less 403 leaves behind", async () => {
    const { impl } = fakeFetch([
      { status: 403, body: "", headers: { "x-request-id": "abc-123" } },
    ])
    const results = await probeAdminApi(SHOP, TOKEN, "2026-07", impl)

    expect(results[0].requestId).toBe("abc-123")
    expect(results[0].ok).toBe(false)
    expect(results[0].status).toBe(403)
  })

  it("says the body was empty rather than showing nothing", async () => {
    const { impl } = fakeFetch([forbidden])
    const results = await probeAdminApi(SHOP, TOKEN, "2026-07", impl)
    expect(results[0].detail).toContain("empty body")
  })

  it("treats a 200 carrying graphql errors as a failure", async () => {
    // graphql answers 200 for things rest would answer 4xx for, so status
    // alone would report this as working
    const { impl } = fakeFetch([
      { status: 200, body: '{"errors":[{"message":"Access denied"}]}' },
    ])
    const results = await probeAdminApi(SHOP, TOKEN, "2026-07", impl)
    expect(results[0].status).toBe(200)
    expect(results[0].ok).toBe(false)
  })

  it("records a thrown request instead of failing the page", async () => {
    const impl = vi.fn(async () => {
      throw new Error("getaddrinfo ENOTFOUND")
    }) as unknown as typeof fetch

    const results = await probeAdminApi(SHOP, TOKEN, "2026-07", impl)
    expect(results).toHaveLength(5)
    expect(results[0].error).toContain("ENOTFOUND")
    expect(results[0].ok).toBe(false)
  })

  it("makes no request at all when the session has no token", async () => {
    const { impl, calls } = fakeFetch([ok])
    const results = await probeAdminApi(SHOP, undefined, "2026-07", impl)

    expect(calls).toHaveLength(0)
    expect(results).toHaveLength(1)
    expect(results[0].error).toBe("missing token")
  })

  it("truncates a long body rather than rendering a wall of it", async () => {
    const { impl } = fakeFetch([{ status: 500, body: "x".repeat(5000) }])
    const results = await probeAdminApi(SHOP, TOKEN, "2026-07", impl)
    expect(results[0].detail.length).toBeLessThan(600)
  })
})

describe("summarise", () => {
  const result = (label: string, ok: boolean): ProbeResult => ({
    label,
    method: "GET",
    path: "/",
    tells: "",
    status: ok ? 200 : 403,
    ok,
    requestId: null,
    detail: "",
    error: null,
  })

  it("reports success when everything passes", () => {
    const summary = summarise([result("Token is alive (unversioned)", true), result("REST shop", true)])
    expect(summary).toContain("Every probe passed")
  })

  it("blames the install when even the unversioned check fails", () => {
    const summary = summarise([
      result("Token is alive (unversioned)", false),
      result("GraphQL currentAppInstallation", false),
    ])
    expect(summary).toContain("not about scopes")
    expect(summary).toContain("Reinstalling")
  })

  it("rules out scopes when a no-scope query is refused with a valid token", () => {
    const summary = summarise([
      result("Token is alive (unversioned)", true),
      result("REST shop", false),
      result("GraphQL currentAppInstallation", false),
    ])
    expect(summary).toContain("rules out scopes")
  })

  it("calls out graphql specifically when rest works and graphql does not", () => {
    const summary = summarise([
      result("Token is alive (unversioned)", true),
      result("REST shop", true),
      result("GraphQL currentAppInstallation", false),
    ])
    expect(summary).toContain("GraphQL-specific")
  })
})
