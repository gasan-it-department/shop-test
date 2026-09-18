// --- app proxy: https://<shop>/apps/forum/posts/<id>/like -------------------
// toggle this shopper's heart on a post.
//
// POST only. A like changes state, so a GET that did it would be fired by
// every link prefetcher and crawler that touches the page.

import type { ActionFunctionArgs } from "react-router"

import prisma from "../db.server"
import { cleanDisplayName } from "../lib/escape"
import { toggleLike } from "../lib/forum.server"
import { shopperHash } from "../lib/privacy.server"
import { authenticate } from "../shopify.server"

/**
 * Answer a fetch with json and a plain form submission with a redirect back
 * to the post.
 *
 * The widget always uses fetch. The redirect is what makes the same markup
 * work on the post page when the script hasn't run — the browser posts the
 * form, lands back on the post, and the heart is filled because the server
 * rendered it that way.
 */
function respond(request: Request, postId: string, payload: unknown, status: number) {
  const wantsHtml = request.headers.get("accept")?.includes("text/html")
  if (!wantsHtml) return Response.json(payload, { status })

  return new Response(null, {
    status: 303,
    headers: { location: `/apps/forum/posts/${encodeURIComponent(postId)}` },
  })
}

export async function action({ request, params }: ActionFunctionArgs) {
  if (request.method !== "POST") {
    return new Response("Method not allowed", { status: 405, headers: { allow: "POST" } })
  }

  const { session } = await authenticate.public.appProxy(request)
  if (!session) return new Response("Not found", { status: 404 })

  const postId = params.id ?? ""
  const url = new URL(request.url)
  // shopify appends this to the signed request. the only identity signal we
  // can trust — a body field could say anything.
  const customerId = url.searchParams.get("logged_in_customer_id")
  if (!customerId) {
    return respond(request, postId, { error: "Sign in to like this post" }, 401)
  }

  const shop = await prisma.shop.findUnique({ where: { domain: session.shop } })
  if (!shop) return new Response("Not found", { status: 404 })

  // a shopper who has only ever liked things still needs a member row, and
  // upsert is what makes the first like work without a prior post or comment.
  // no display name to set: liking is anonymous until they write something.
  const hash = shopperHash(session.shop, customerId)
  const member = await prisma.member.upsert({
    where:  { shopId_shopperHash: { shopId: shop.id, shopperHash: hash } },
    update: {},
    create: { shopId: shop.id, shopperHash: hash, displayName: cleanDisplayName(null) },
  })

  const state = await toggleLike(shop.id, postId, member.id)
  // null means the post isn't this shop's or sits in a private category —
  // same answer either way, so a guessed id reveals nothing
  if (!state) return new Response("Not found", { status: 404 })

  return respond(request, postId, state, 200)
}

/**
 * A GET here is someone typing the url or a crawler following it. Send them
 * to the post rather than answering 405 with a blank page.
 */
export async function loader({ params }: ActionFunctionArgs) {
  return new Response(null, {
    status: 303,
    headers: { location: `/apps/forum/posts/${encodeURIComponent(params.id ?? "")}` },
  })
}
