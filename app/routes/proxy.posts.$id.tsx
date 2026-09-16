// --- app proxy: https://<shop>/apps/forum/posts/<id> ------------------------
// single post with its comments (GET) and add a comment (POST).
// same signature check as the list route — without it anyone can post here.

import type { ActionFunctionArgs, LoaderFunctionArgs } from "react-router"

import prisma from "../db.server"
import { cleanDisplayName } from "../lib/escape"
import { shopperHash } from "../lib/privacy.server"
import { renderPostDetail } from "../lib/render-posts"
import { commentSchema, parseForm } from "../lib/validation"
import { authenticate } from "../shopify.server"

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
      comments: post.comments.map((comment) => ({
        id: comment.id,
        body: comment.body,
        authorName: comment.author?.displayName ?? null,
        createdAt: comment.createdAt.toISOString().slice(0, 10),
      })),
    },
    Boolean(customerId),
  )

  return liquid(markup, { layout: false, headers: { "cache-control": "no-store" } })
}

export async function action({ request, params }: ActionFunctionArgs) {
  const { session } = await authenticate.public.appProxy(request)
  if (!session) return new Response("Not found", { status: 404 })

  const url = new URL(request.url)
  // the only identity signal we can trust here — a body field can't be
  const customerId = url.searchParams.get("logged_in_customer_id")
  if (!customerId) {
    return Response.json({ error: "Sign in to comment" }, { status: 401 })
  }

  const formData = await request.formData()
  const parsed = parseForm(commentSchema, formData)
  if (!parsed.ok) {
    return Response.json({ errors: parsed.errors }, { status: 422 })
  }

  const shop = await prisma.shop.findUnique({ where: { domain: session.shop } })
  if (!shop) return new Response("Not found", { status: 404 })

  const post = await prisma.post.findFirst({
    where: { id: params.id ?? "", shopId: shop.id, category: { isPrivate: false } },
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

  return Response.json({ id: comment.id }, { status: 201 })
}
