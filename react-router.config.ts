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
  allowedActionOrigins: ["admin.shopify.com", "*.myshopify.com"],
} satisfies Config
