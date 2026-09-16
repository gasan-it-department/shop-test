import type { Config } from "@react-router/dev/config"

export default {
  // embedded apps need html back on first paint and the session token bounce
  // happens server-side
  ssr: true,

  // React Router 7.18 rejects any action whose `Origin` header doesn't match
  // the request host, with a bare 400 "Bad Request" and no explanation. An
  // embedded Shopify app is served in an iframe on admin.shopify.com, so every
  // admin form POST is cross-origin by definition and gets blocked — loaders
  // are unaffected, which is why pages load and saving does not.
  //
  // App Proxy requests arrive server-to-server from Shopify and usually carry
  // no Origin at all (the check is skipped when it's absent), but *.myshopify.com
  // is listed for the cases where one is forwarded. Those routes verify
  // Shopify's HMAC signature regardless, which is stronger than an origin
  // check.
  //
  // *.up.railway.app is a safety net, not the fix. The real cause of the 400
  // was the host's own origin failing the comparison because express reported
  // http behind Railway's TLS termination — server.mjs sets `trust proxy` to
  // correct that. This entry means a misconfigured proxy degrades to a working
  // app rather than a dead one, and it costs little: every admin action is
  // still gated by a Shopify session token that a third-party page cannot
  // forge.
  allowedActionOrigins: ["admin.shopify.com", "*.myshopify.com", "*.up.railway.app"],
} satisfies Config
