import { type RouteConfig, index, route } from "@react-router/dev/routes"

// explicit rather than file-convention: the proxy and webhook paths also live
// in shopify.app.toml, so they should be readable in one place

export default [
  index("routes/_index.tsx"),

  route("app", "routes/app.tsx", [
    index("routes/app._index.tsx"),
    route("billing", "routes/app.billing.tsx"),
    route("instagram", "routes/app.instagram.tsx"),
  ]),

  route("auth/*", "routes/auth.$.tsx"),
  route("auth/login", "routes/auth.login.tsx"),

  // storefront, via the app proxy
  route("proxy/posts", "routes/proxy.posts.tsx"),

  route("webhooks/app/uninstalled", "routes/webhooks.app.uninstalled.tsx"),
  route("webhooks/app/scopes-update", "routes/webhooks.app.scopes-update.tsx"),
  route("webhooks/compliance", "routes/webhooks.compliance.tsx"),

  route("sante", "routes/sante.tsx"),

  // 404 in production unless ENABLE_DEV_HARNESS=1
  route("dev", "routes/dev.tsx"),
  route("dev/posts", "routes/dev.posts.tsx"),
] satisfies RouteConfig
