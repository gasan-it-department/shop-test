// dev-only preview of the single-post page. the real route needs a signed app
// proxy request, so without this the detail design can only be looked at on a
// live storefront — which is a slow way to iterate on css.
//
// renders the same markup renderPostDetail produces, wrapped in a bare
// document instead of the merchant's theme layout.

import type { LoaderFunctionArgs } from "react-router"

import prisma from "../db.server"
import { assertDevHarness } from "../lib/dev-mode.server"
import { imageSrc } from "../lib/forum.server"
import { renderPostDetail } from "../lib/render-posts"

export async function loader({ params, request }: LoaderFunctionArgs) {
  assertDevHarness()

  const url = new URL(request.url)
  const post = await prisma.post.findFirst({
    where: { id: params.id ?? "", category: { isPrivate: false } },
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
      // relative: the harness serves from this app's own origin
      images: post.images.map((image) => ({
        url: imageSrc(image),
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
    // ?signedin=1 previews the comment form, which a shopper only sees when
    // shopify puts logged_in_customer_id on the proxied request
    url.searchParams.get("signedin") === "1",
    url.searchParams.get("error"),
  )

  // a minimal stand-in for the theme layout: a font and a background, nothing
  // that would flatter the design into looking better than it will in a shop
  const page = `<!doctype html><html lang="en"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>${post.title.replace(/[<>&]/g, "")}</title>
<style>body{margin:0;background:#fff;color:#16181d;
font:400 16px/1.5 -apple-system,BlinkMacSystemFont,'Segoe UI',Inter,Roboto,sans-serif}</style>
</head><body>${markup}</body></html>`

  return new Response(page, {
    headers: { "content-type": "text/html; charset=utf-8", "cache-control": "no-store" },
  })
}
