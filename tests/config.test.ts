import { describe, expect, it } from "vitest"

import config from "../react-router.config"

// react router 7.18 rejects cross-origin action requests with a bare 400 and
// no explanation. an embedded shopify app is always cross-origin — it runs in
// an iframe on admin.shopify.com — so dropping these entries silently breaks
// every form in the admin while every page still loads fine.
describe("allowedActionOrigins", () => {
  it("is configured at all", () => {
    expect(Array.isArray(config.allowedActionOrigins)).toBe(true)
  })

  it("allows the embedded admin", () => {
    expect(config.allowedActionOrigins).toContain("admin.shopify.com")
  })

  it("allows shop domains for proxied form posts", () => {
    expect(config.allowedActionOrigins).toContain("*.myshopify.com")
  })

  it("keeps the host's own domain as a safety net for a misconfigured proxy", () => {
    expect(config.allowedActionOrigins).toContain("*.up.railway.app")
  })

  it("does not allow everything", () => {
    expect(config.allowedActionOrigins).not.toContain("*")
  })
})

describe("ssr", () => {
  it("stays on — embedded apps need html on first paint and a server-side token bounce", () => {
    expect(config.ssr).toBe(true)
  })
})
