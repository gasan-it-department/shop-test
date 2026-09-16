import "@shopify/shopify-app-react-router/adapters/node"
import {
  ApiVersion,
  AppDistribution,
  BillingInterval,
  shopifyApp,
} from "@shopify/shopify-app-react-router/server"
import { PrismaSessionStorage } from "@shopify/shopify-app-session-storage-prisma"

import prisma from "./db.server"
import { PRO_PLAN } from "./lib/plans"

// hosting dashboards show domains without a scheme, and pasting one verbatim
// gets you "Invalid appUrl configuration" from deep inside the library with no
// mention of which variable is wrong. normalise it, and fail with something
// actionable if it's still not a url.
function resolveAppUrl(): string {
  const raw = process.env.SHOPIFY_APP_URL?.trim()

  if (!raw) {
    throw new Error(
      "SHOPIFY_APP_URL is not set. It must be the app's public https url, " +
        "e.g. https://your-app.up.railway.app",
    )
  }

  const withScheme = /^https?:\/\//i.test(raw) ? raw : `https://${raw}`
  if (withScheme !== raw) {
    console.warn(`[shopify] SHOPIFY_APP_URL had no scheme, using ${withScheme}`)
  }

  let parsed: URL
  try {
    parsed = new URL(withScheme)
  } catch {
    throw new Error(
      `SHOPIFY_APP_URL is not a valid url: ${JSON.stringify(raw)}. ` +
        "Expected something like https://your-app.up.railway.app",
    )
  }

  // trailing slashes end up doubled in redirect urls, which then no longer
  // match what's registered in shopify.app.toml
  return parsed.origin
}

export const appUrl = resolveAppUrl()

const shopify = shopifyApp({
  apiKey:         process.env.SHOPIFY_API_KEY || "",
  apiSecretKey:   process.env.SHOPIFY_API_SECRET || "",
  apiVersion:     ApiVersion.July26,
  scopes:         process.env.SCOPES?.split(","),
  appUrl,
  authPathPrefix: "/auth",
  sessionStorage: new PrismaSessionStorage(prisma),
  // SingleMerchant = custom distribution: installed on one nominated store,
  // no App Store review, no review-pending state that can gate the Admin API.
  distribution:   AppDistribution.SingleMerchant,

  // declared here, checked per request with billing.require()
  billing: {
    [PRO_PLAN]: {
      lineItems: [
        {
          amount: 9.99,
          currencyCode: "USD",
          interval: BillingInterval.Every30Days,
        },
      ],
    },
  },

  hooks: {
    // no registerWebhooks() here. the subscriptions are declared in
    // shopify.app.toml and pushed by `shopify app deploy` — that's the
    // declarative path, and calling the api registration on top of it has no
    // webhook config in code to work from, throws, and 500s the install.
    afterAuth: async ({ session }) => {
      try {
        await prisma.shop.upsert({
          where:  { domain: session.shop },
          update: { installed: true },
          create: { domain: session.shop },
        })
      } catch (error) {
        // bookkeeping, not the critical path. failing the whole install over
        // it leaves the merchant staring at a 500 with the app half-connected.
        console.error("[afterAuth] shop upsert failed:", error)
      }
    },
  },

  future: {
    // TODO: turn on once the import worker handles a token going stale mid-job
    expiringOfflineAccessTokens: false,
  },

  ...(process.env.SHOP_CUSTOM_DOMAIN
    ? { customShopDomains: [process.env.SHOP_CUSTOM_DOMAIN] }
    : {}),
})

export default shopify
export const apiVersion = ApiVersion.July26
export const addDocumentResponseHeaders = shopify.addDocumentResponseHeaders
export const authenticate = shopify.authenticate
export const unauthenticated = shopify.unauthenticated
export const login = shopify.login
export const registerWebhooks = shopify.registerWebhooks
export const sessionStorage = shopify.sessionStorage
