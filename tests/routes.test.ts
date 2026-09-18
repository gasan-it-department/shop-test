// This project configures routes explicitly in app/routes.ts rather than by
// file convention, which means dropping a file into app/routes does nothing on
// its own. Nothing else catches the omission: typecheck passes because the
// file is valid, the build passes because an unreferenced module is simply not
// bundled, and the missing route only shows up as a 404 at runtime — on the
// storefront, where it looked like a like button that unliked itself.

import { readdirSync, readFileSync } from "node:fs"
import { join } from "node:path"

import { describe, expect, it } from "vitest"

const ROUTES_DIR = join(process.cwd(), "app", "routes")
const CONFIG = readFileSync(join(process.cwd(), "app", "routes.ts"), "utf8")

const routeFiles = readdirSync(ROUTES_DIR)
  .filter((name) => name.endsWith(".tsx") || name.endsWith(".ts"))
  .sort()

describe("app/routes.ts", () => {
  it("finds route files to check", () => {
    // a guard on the guard: if the glob ever breaks, this suite would pass by
    // checking nothing at all
    expect(routeFiles.length).toBeGreaterThan(15)
  })

  it.each(routeFiles)("registers %s", (file) => {
    const id = `routes/${file}`
    expect(
      CONFIG.includes(id),
      `${file} exists in app/routes but is not referenced in app/routes.ts, so it is not a route and any request to it 404s`,
    ).toBe(true)
  })

  it("references no route file that does not exist", () => {
    const referenced = [...CONFIG.matchAll(/"routes\/([^"]+)"/g)].map((match) => match[1])
    expect(referenced.length).toBeGreaterThan(15)

    const missing = referenced.filter((name) => !routeFiles.includes(name))
    expect(missing, `referenced in routes.ts but not present in app/routes: ${missing.join(", ")}`)
      .toEqual([])
  })

  it("registers the app proxy endpoints the storefront calls", () => {
    // these are the ones a shopper hits, so a missing registration is a
    // customer-visible failure rather than an admin inconvenience
    expect(CONFIG).toContain('route("proxy/posts"')
    expect(CONFIG).toContain('route("proxy/posts/:id"')
    expect(CONFIG).toContain('route("proxy/posts/:id/like"')
  })
})
