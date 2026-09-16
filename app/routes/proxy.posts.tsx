// --- app proxy: https://<shop>/apps/forum/posts -----------------------------
// shopify signs the request and forwards it here, so it's same-origin to the
// shopper. authenticate.public.appProxy is what verifies that signature —
// without it anyone can POST here directly.

import type { ActionFunctionArgs, LoaderFunctionArgs } from "react-router"

import prisma from "../db.server"
import { cleanDisplayName, safeUrl } from "../lib/escape"
import { imageSrc } from "../lib/forum.server"
import { shopperHash } from "../lib/privacy.server"
import { renderPostList } from "../lib/render-posts"
import { appUrl, authenticate } from "../shopify.server"

export async function loader({ request }: LoaderFunctionArgs) {
  const { session, liquid } = await authenticate.public.appProxy(request)

  // no session = app not installed on the shop that proxied this
  if (!session) {
    return new Response("Not found", { status: 404 })
  }

  const url = new URL(request.url)
  const category = url.searchParams.get("category")

  const posts = await prisma.post.findMany({
    where: {
      shop: { domain: session.shop },
      // private categories never leave the db on a public endpoint
      category: { isPrivate: false, ...(category ? { handle: category } : {}) },
    },
    orderBy: { publishedAt: "desc" },
    take: 20,
    include: {
      author: true,
      category: true,
      images: { orderBy: { position: "asc" }, take: 1 },
      _count: { select: { comments: true } },
    },
  })

  const markup = renderPostList(
    posts.map((post) => ({
      id: post.id,
      title: post.title,
      authorName: post.author?.displayName ?? null,
      categoryTitle: post.category.title,
      commentCount: post._count.comments,
      // absolute: this fragment is injected into a page on the shop's domain,
      // so a relative /images/... path would resolve against the shop
      imageUrl: post.images[0] ? imageSrc(post.images[0], appUrl) : null,
    })),
    session.shop,
  )

  // layout: false returns the fragment alone. with the theme layout we'd nest
  // a whole page inside the merchant's page.
  return liquid(markup, {
    layout: false,
    headers: { "cache-control": "no-store" },
  })
}

export async function action({ request }: ActionFunctionArgs) {
  const { session } = await authenticate.public.appProxy(request)
  if (!session) return new Response("Not found", { status: 404 })

  const url = new URL(request.url)
  // shopify appends this to proxied requests. only identity signal we can
  // trust here — a body field can't be.
  const customerId = url.searchParams.get("logged_in_customer_id")
  if (!customerId) {
    return Response.json({ error: "Sign in to post" }, { status: 401 })
  }

  const form = await request.formData()
  const title = String(form.get("title") ?? "").trim()
  const body = String(form.get("body") ?? "").trim()
  const categoryHandle = String(form.get("category") ?? "")
  const avatar = safeUrl(form.get("avatar"))

  if (title.length < 3 || title.length > 120) {
    return Response.json({ error: "Title must be 3–120 characters" }, { status: 422 })
  }
  if (body.length === 0 || body.length > 10_000) {
    return Response.json({ error: "Body must be 1–10,000 characters" }, { status: 422 })
  }

  const shop = await prisma.shop.findUnique({ where: { domain: session.shop } })
  if (!shop) return new Response("Not found", { status: 404 })

  const category = await prisma.category.findUnique({
    where: { shopId_handle: { shopId: shop.id, handle: categoryHandle } },
  })
  if (!category || category.isPrivate) {
    return Response.json({ error: "Unknown category" }, { status: 422 })
  }

  const hash = shopperHash(session.shop, customerId)
  const member = await prisma.member.upsert({
    where:  { shopId_shopperHash: { shopId: shop.id, shopperHash: hash } },
    update: { avatarUrl: avatar },
    create: {
      shopId: shop.id,
      shopperHash: hash,
      displayName: cleanDisplayName(form.get("displayName")),
      avatarUrl: avatar,
    },
  })

  const post = await prisma.post.create({
    data: {
      shopId: shop.id,
      categoryId: category.id,
      authorId: member.id,
      // stored raw, escaped at render. storing pre-escaped double-escapes as
      // soon as anything else reads it.
      title,
      body,
    },
  })

  return Response.json({ id: post.id }, { status: 201 })
}
