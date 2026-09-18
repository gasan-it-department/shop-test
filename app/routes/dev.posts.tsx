// dev-only twin of /proxy/posts. same rendering code, no signature check,
// because there's no shopify to sign the request locally.

import type { LoaderFunctionArgs } from "react-router"

import prisma from "../db.server"
import { assertDevHarness } from "../lib/dev-mode.server"
import { imageSrc, likeSummary } from "../lib/forum.server"
import { excerptOf, renderPostList } from "../lib/render-posts"

export async function loader({ request }: LoaderFunctionArgs) {
  assertDevHarness()

  const shop = await prisma.shop.findFirst({ orderBy: { createdAt: "asc" } })
  if (!shop) {
    return new Response(`<ul class="ic-posts"></ul>`, {
      headers: { "content-type": "text/html; charset=utf-8" },
    })
  }

  const posts = await prisma.post.findMany({
    where:   { shopId: shop.id, category: { isPrivate: false } },
    orderBy: { publishedAt: "desc" },
    take:    20,
    include: {
      author: true,
      category: true,
      images: { orderBy: { position: "asc" }, take: 1 },
      comments: { orderBy: { createdAt: "desc" }, take: 2, include: { author: true } },
      _count: { select: { comments: true } },
    },
  })

  // no signed proxy request here, so there is no shopper: the harness renders
  // the signed-out feed unless ?member=<id> names one to preview as
  const memberId = new URL(request.url).searchParams.get("member")
  const likes = await likeSummary(
    posts.map((post) => post.id),
    memberId,
  )

  const markup = renderPostList(
    posts.map((post) => {
      const like = likes.get(post.id)
      return {
        id: post.id,
        title: post.title,
        authorName: post.author?.displayName ?? null,
        categoryTitle: post.category.title,
        commentCount: post._count.comments,
        excerpt: excerptOf(post.body),
        likeCount: like?.count ?? 0,
        liked: like?.liked ?? false,
        comments: post.comments
          .slice()
          .reverse()
          .map((comment) => ({
            authorName: comment.author?.displayName ?? null,
            body: comment.body,
          })),
        // relative here: the harness serves from this app's own origin
        imageUrl: post.images[0] ? imageSrc(post.images[0]) : null,
      }
    }),
    shop.domain,
    // the harness has no customer, so preview the signed-in control explicitly
    new URL(request.url).searchParams.get("signedin") === "1",
  )

  return new Response(markup, {
    headers: { "content-type": "text/html; charset=utf-8", "cache-control": "no-store" },
  })
}
