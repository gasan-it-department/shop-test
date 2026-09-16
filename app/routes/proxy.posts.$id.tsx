// --- app proxy: https://<shop>/apps/forum/posts/<id> ------------------------
// single post with its comments (GET) and add a comment (POST).
// same signature check as the list route — without it anyone can post here.

import type { ActionFunctionArgs, LoaderFunctionArgs } from "react-router"

import prisma from "../db.server"
import { cleanDisplayName } from "../lib/escape"
import { imageSrc } from "../lib/forum.server"
import { shopperHash } from "../lib/privacy.server"
import { renderPostDetail } from "../lib/render-posts"
import { commentSchema, parseForm } from "../lib/validation"
import { appUrl, authenticate } from "../shopify.server"

export async function loader({ request, params }: LoaderFunctionArgs) {
  const { session, liquid } = await authenticate.public.appProxy(request)
  if (!session) return new Response("Not found", { status: 404 })

  const url = new URL(request.url)
  const customerId = url.searchParams.get("logged_in_customer_id")

  const post = await prisma.post.findFirst({
    where: {
      id: params.id ?? "",
      shop: { domain: session.shop },
      // a private category must not be reachable by guessing a post id
      category: { isPrivate: false },
    },
    include: {
      category: true,
      author: true,
      images: { orderBy: { position: "asc" } },
      comments: { orderBy: { createdAt: "asc" }, include: { author: true } },
    },
  })

  if (!post) return new Response("Not found", { status: 404 })

  const markup = renderPostDetail(
    {
      id: post.id,
      title: post.title,
      body: post.body,
      authorName: post.author?.displayName ?? null,
      categoryTitle: post.category.title,
      publishedAt: post.publishedAt.toISOString().slice(0, 10),
      // absolute: this markup renders on the shop's domain, so a relative
      // /images/... path would resolve against the shop and 404
      images: post.images.map((image) => ({
        url: imageSrc(image, appUrl),
        width: image.width,
        height: image.height,
        alt: image.alt,
        // only a shopify cdn url resizes from the query string
        resizable: Boolean(image.url),
      })),
      comments: post.comments.map((comment) => ({
        id: comment.id,
        body: comment.body,
        authorName: comment.author?.displayName ?? null,
        createdAt: comment.createdAt.toISOString().slice(0, 10),
      })),
    },
    Boolean(customerId),
    url.searchParams.get("error"),
  )

  // WITH the theme layout, unlike the list fragment. this is a full page the
  // shopper navigated to, so it should carry the merchant's header, footer and
  // styles — `layout: false` here renders bare unstyled html on their domain.
  return liquid(markup, { headers: { "cache-control": "no-store" } })
}

/**
 * The comment form in the theme extension is a plain <form>, so a JSON body
 * would be rendered as raw text in the shopper's browser. Answer HTML
 * submissions with a redirect back to the post (post/redirect/get) and keep
 * JSON for anything calling this with fetch.
 */
function respond(request: Request, postId: string, payload: unknown, status: number) {
  const wantsHtml = request.headers.get("accept")?.includes("text/html")
  if (!wantsHtml) return Response.json(payload, { status })

  const target = new URL(`/apps/forum/posts/${postId}`, "https://placeholder.invalid")
  if (status >= 400 && typeof payload === "object" && payload !== null) {
    const message =
      "error" in payload
        ? String((payload as { error: unknown }).error)
        : Object.values((payload as { errors?: Record<string, string> }).errors ?? {})[0]
    if (message) target.searchParams.set("error", message)
  }

  return new Response(null, {
    status: 303,
    headers: { location: `${target.pathname}${target.search}` },
  })
}

export async function action({ request, params }: ActionFunctionArgs) {
  const { session } = await authenticate.public.appProxy(request)
  if (!session) return new Response("Not found", { status: 404 })

  const postId = params.id ?? ""
  const url = new URL(request.url)
  // the only identity signal we can trust here — a body field can't be
  const customerId = url.searchParams.get("logged_in_customer_id")
  if (!customerId) {
    return respond(request, postId, { error: "Sign in to comment" }, 401)
  }

  const formData = await request.formData()
  const parsed = parseForm(commentSchema, formData)
  if (!parsed.ok) {
    return respond(request, postId, { errors: parsed.errors }, 422)
  }

  const shop = await prisma.shop.findUnique({ where: { domain: session.shop } })
  if (!shop) return new Response("Not found", { status: 404 })

  const post = await prisma.post.findFirst({
    where: { id: postId, shopId: shop.id, category: { isPrivate: false } },
  })
  if (!post) return new Response("Not found", { status: 404 })

  const hash = shopperHash(session.shop, customerId)
  const member = await prisma.member.upsert({
    where:  { shopId_shopperHash: { shopId: shop.id, shopperHash: hash } },
    update: {},
    create: {
      shopId: shop.id,
      shopperHash: hash,
      displayName: cleanDisplayName(formData.get("displayName")),
    },
  })

  // a reply's parent must live on this same post, otherwise a guessed id
  // could graft a comment onto another thread
  let parentId: string | null = null
  if (parsed.data.parentId) {
    const parent = await prisma.comment.findFirst({
      where: { id: parsed.data.parentId, postId: post.id, shopId: shop.id },
    })
    parentId = parent?.id ?? null
  }

  const comment = await prisma.comment.create({
    data: {
      shopId: shop.id,
      postId: post.id,
      authorId: member.id,
      // stored raw, escaped at render
      body: parsed.data.body,
      parentId,
    },
  })

  return respond(request, postId, { id: comment.id }, 201)
}
