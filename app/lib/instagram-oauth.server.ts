// --- instagram oauth (Instagram API with Instagram Login) -------------------
//
// three-legged and easy to get subtly wrong:
//   1. send the merchant to instagram.com/oauth/authorize
//   2. exchange the returned ?code for a SHORT-lived token (1 hour)
//   3. immediately exchange that for a LONG-lived token (60 days)
//
// step 3 is not optional. a short-lived token expires while the merchant is
// still looking at the success screen.
//
// NOTE: meta renamed these scopes when Basic Display was retired in 2024, and
// renames them again from time to time. if authorize returns
// "Invalid scope", check the current names in the Instagram platform docs
// rather than assuming these are still right.

import { createHmac, timingSafeEqual } from "node:crypto"

const AUTHORIZE_URL = "https://www.instagram.com/oauth/authorize"
const TOKEN_URL = "https://api.instagram.com/oauth/access_token"
const GRAPH_URL = "https://graph.instagram.com"

/** read-only: profile plus the media edge. no publishing, no comments write. */
export const SCOPES = ["instagram_business_basic"]

export interface OAuthConfig {
  appId: string
  appSecret: string
  redirectUri: string
}

export function readOAuthConfig(appUrl: string): OAuthConfig | null {
  const appId = process.env.META_APP_ID
  const appSecret = process.env.META_APP_SECRET
  if (!appId || !appSecret) return null

  return {
    appId,
    appSecret,
    // must match what's registered in the meta app, byte for byte
    redirectUri: `${appUrl}/auth/instagram/callback`,
  }
}

// --- state ------------------------------------------------------------------
// the callback arrives with no shopify session, so the shop has to travel in
// the state param. signed, because an unsigned state means anyone can make our
// callback attach their instagram account to someone else's shop.

export function signState(shop: string, secret: string, issuedAt = Date.now()): string {
  const payload = `${shop}:${issuedAt}`
  const mac = createHmac("sha256", secret).update(payload).digest("hex")
  return `${Buffer.from(payload).toString("base64url")}.${mac}`
}

export function verifyState(
  state: string,
  secret: string,
  maxAgeMs = 10 * 60 * 1000,
  now = Date.now(),
): string | null {
  const [encoded, mac] = state.split(".")
  if (!encoded || !mac) return null

  let payload: string
  try {
    payload = Buffer.from(encoded, "base64url").toString("utf8")
  } catch {
    return null
  }

  const expected = createHmac("sha256", secret).update(payload).digest("hex")
  const a = Buffer.from(mac, "utf8")
  const b = Buffer.from(expected, "utf8")
  if (a.length !== b.length || !timingSafeEqual(a, b)) return null

  const separator = payload.lastIndexOf(":")
  const shop = payload.slice(0, separator)
  const issuedAt = Number(payload.slice(separator + 1))
  if (!shop || !Number.isFinite(issuedAt)) return null

  // a state that never expires is a replay waiting to happen
  if (now - issuedAt > maxAgeMs) return null

  return shop
}

// --- the three legs ---------------------------------------------------------

export function buildAuthorizeUrl(config: OAuthConfig, state: string): string {
  const url = new URL(AUTHORIZE_URL)
  url.searchParams.set("client_id", config.appId)
  url.searchParams.set("redirect_uri", config.redirectUri)
  url.searchParams.set("scope", SCOPES.join(","))
  url.searchParams.set("response_type", "code")
  url.searchParams.set("state", state)
  return url.toString()
}

export interface ShortLivedToken {
  accessToken: string
  userId: string
}

export async function exchangeCodeForToken(
  config: OAuthConfig,
  code: string,
  fetchImpl: typeof fetch = fetch,
): Promise<ShortLivedToken> {
  const body = new URLSearchParams({
    client_id: config.appId,
    client_secret: config.appSecret,
    grant_type: "authorization_code",
    redirect_uri: config.redirectUri,
    // instagram appends #_ to the code in the redirect; sending it back
    // unstripped fails with a useless "Invalid authorization code"
    code: code.replace(/#_$/, ""),
  })

  const response = await fetchImpl(TOKEN_URL, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body,
  })

  const json = (await response.json()) as {
    access_token?: string
    user_id?: string | number
    error_message?: string
  }

  if (!response.ok || !json.access_token) {
    throw new Error(`Instagram code exchange failed: ${json.error_message ?? response.status}`)
  }

  return { accessToken: json.access_token, userId: String(json.user_id ?? "") }
}

export interface LongLivedToken {
  accessToken: string
  expiresAt: Date
}

export async function exchangeForLongLivedToken(
  config: OAuthConfig,
  shortLivedToken: string,
  fetchImpl: typeof fetch = fetch,
  now: number = Date.now(),
): Promise<LongLivedToken> {
  const url = new URL(`${GRAPH_URL}/access_token`)
  url.searchParams.set("grant_type", "ig_exchange_token")
  url.searchParams.set("client_secret", config.appSecret)
  url.searchParams.set("access_token", shortLivedToken)

  const response = await fetchImpl(url.toString())
  const json = (await response.json()) as {
    access_token?: string
    expires_in?: number
    error?: { message?: string }
  }

  if (!response.ok || !json.access_token) {
    throw new Error(`Instagram token exchange failed: ${json.error?.message ?? response.status}`)
  }

  return {
    accessToken: json.access_token,
    expiresAt: new Date(now + (json.expires_in ?? 60 * 24 * 60 * 60) * 1000),
  }
}

export interface InstagramProfile {
  id: string
  username: string
}

export async function fetchProfile(
  accessToken: string,
  fetchImpl: typeof fetch = fetch,
): Promise<InstagramProfile> {
  const url = new URL(`${GRAPH_URL}/me`)
  url.searchParams.set("fields", "id,username")
  url.searchParams.set("access_token", accessToken)

  const response = await fetchImpl(url.toString())
  const json = (await response.json()) as {
    id?: string
    username?: string
    error?: { message?: string }
  }

  if (!response.ok || !json.id) {
    throw new Error(`Instagram profile fetch failed: ${json.error?.message ?? response.status}`)
  }

  return { id: json.id, username: json.username ?? json.id }
}
