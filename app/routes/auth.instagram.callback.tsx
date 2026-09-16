// Instagram sends the merchant back here after consent. There is no Shopify
// session on this request — it comes from instagram.com — so the shop travels
// in the signed `state` param and is verified before anything is written.

import { redirect } from "react-router"
import type { LoaderFunctionArgs } from "react-router"

import prisma from "../db.server"
import {
  exchangeCodeForToken,
  exchangeForLongLivedToken,
  fetchProfile,
  readOAuthConfig,
  verifyState,
} from "../lib/instagram-oauth.server"
import { appUrl } from "../shopify.server"

function back(shop: string, params: Record<string, string>) {
  const search = new URLSearchParams({ shop, ...params })
  return redirect(`/app/instagram?${search.toString()}`)
}

export async function loader({ request }: LoaderFunctionArgs) {
  const url = new URL(request.url)
  const config = readOAuthConfig(appUrl)
  if (!config) throw new Response("Instagram is not configured", { status: 503 })

  const secret = process.env.SHOPIFY_API_SECRET || ""
  const state = url.searchParams.get("state") ?? ""
  const shop = verifyState(state, secret)

  // an unverifiable state means someone else built this url — refuse before
  // touching the database
  if (!shop) throw new Response("Invalid state", { status: 400 })

  // the merchant can decline, in which case there is no code
  const error = url.searchParams.get("error_description") ?? url.searchParams.get("error")
  if (error) return back(shop, { ig_error: error.slice(0, 200) })

  const code = url.searchParams.get("code")
  if (!code) return back(shop, { ig_error: "No authorization code returned" })

  try {
    const shortLived = await exchangeCodeForToken(config, code)
    const longLived = await exchangeForLongLivedToken(config, shortLived.accessToken)
    const profile = await fetchProfile(longLived.accessToken)

    const shopRow = await prisma.shop.upsert({
      where: { domain: shop },
      update: {},
      create: { domain: shop },
    })

    // one account per shop; reconnecting replaces the token and clears any
    // previous disabled reason, but keeps the cursor so a reconnect doesn't
    // re-walk the whole history
    await prisma.instagramAccount.upsert({
      where: { shopId: shopRow.id },
      update: {
        igUserId: profile.id,
        username: profile.username,
        accessToken: longLived.accessToken,
        tokenExpiresAt: longLived.expiresAt,
        disabledReason: null,
      },
      create: {
        shopId: shopRow.id,
        igUserId: profile.id,
        username: profile.username,
        accessToken: longLived.accessToken,
        tokenExpiresAt: longLived.expiresAt,
      },
    })

    return back(shop, { ig_connected: profile.username })
  } catch (caught) {
    const message = caught instanceof Error ? caught.message : String(caught)
    console.error("[instagram] connect failed:", message)
    return back(shop, { ig_error: message.slice(0, 200) })
  }
}
