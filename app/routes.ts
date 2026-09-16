import { type RouteConfig, index, route } from "@react-router/dev/routes"

// explicit rather than file-convention: the proxy and webhook paths also live
// in shopify.app.toml, so they should be readable in one place

export default [
  index("routes/_index.tsx"),

  route("app", "routes/app.tsx", [
    index("routes/app._index.tsx"),
    route("posts", "routes/app.posts.tsx"),
    route("posts/new", "routes/app.posts.new.tsx"),
    route("posts/:id", "routes/app.posts.$id.tsx"),
    route("categories", "routes/app.categories.tsx"),
    route("categories/:id", "routes/app.categories.$id.tsx"),
    route("members", "routes/app.members.tsx"),
    route("instagram", "routes/app.instagram.tsx"),
    route("billing", "routes/app.billing.tsx"),
  ]),

  // more specific than auth/* so it isn't swallowed by the shopify catch-all
  route("auth/instagram/callback", "routes/auth.instagram.callback.tsx"),
  route("auth/login", "routes/auth.login.tsx"),
  route("auth/*", "routes/auth.$.tsx"),

  // storefront, via the app proxy
  route("proxy/posts", "routes/proxy.posts.tsx"),
  route("proxy/posts/:id", "routes/proxy.posts.$id.tsx"),

  route("webhooks/app/uninstalled", "routes/webhooks.app.uninstalled.tsx"),
  route("webhooks/app/scopes-update", "routes/webhooks.app.scopes-update.tsx"),
  route("webhooks/compliance", "routes/webhooks.compliance.tsx"),

  // public: post images stored in the database
  route("images/:id", "routes/images.$id.tsx"),

  route("sante", "routes/sante.tsx"),

  // 404 in production unless ENABLE_DEV_HARNESS=1
  route("dev", "routes/dev.tsx"),
  route("dev/posts", "routes/dev.posts.tsx"),
  route("dev/posts/:id", "routes/dev.posts.$id.tsx"),
] satisfies RouteConfig
