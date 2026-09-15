// dev-only twin of /proxy/posts. same rendering code, no signature check,
// because there's no shopify to sign the request locally.

import prisma from "../db.server"
import { assertDevHarness } from "../lib/dev-mode.server"
import { renderPostList } from "../lib/render-posts"

export async function loader() {
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
    include: { author: true, category: true, _count: { select: { comments: true } } },
  })

  const markup = renderPostList(
    posts.map((post) => ({
      id: post.id,
      title: post.title,
      authorName: post.author?.displayName ?? null,
      categoryTitle: post.category.title,
      commentCount: post._count.comments,
    })),
    shop.domain,
  )

  return new Response(markup, {
    headers: { "content-type": "text/html; charset=utf-8", "cache-control": "no-store" },
  })
}
