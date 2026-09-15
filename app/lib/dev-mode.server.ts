// /dev and /dev/posts are development-only by default. ENABLE_DEV_HARNESS=1
// turns them on in a deployed build so a demo URL shows the storefront widget
// without the viewer needing a Shopify store.
//
// leave it unset on anything real: /dev/posts serves the fragment without the
// app proxy signature check.

export function devHarnessEnabled(): boolean {
  if (process.env.NODE_ENV !== "production") return true
  return process.env.ENABLE_DEV_HARNESS === "1"
}

export function assertDevHarness(): void {
  if (!devHarnessEnabled()) {
    throw new Response("Not found", { status: 404 })
  }
}
