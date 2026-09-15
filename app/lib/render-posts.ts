// shared by the signed proxy route and the /dev harness so there's only one
// copy of the escaping

import { cleanDisplayName, escapeHtml, html } from "./escape"

export interface RenderablePost {
  id: string
  title: string
  authorName: string | null
  categoryTitle: string
  commentCount: number
}

export function renderPostList(posts: RenderablePost[], shop: string): string {
  const items = posts
    .map(
      (post) => html`
        <li class="ic-post">
          <a class="ic-post__link" href="/apps/forum/posts/${post.id}">
            <h3 class="ic-post__title">${post.title}</h3>
          </a>
          <p class="ic-post__meta">
            ${cleanDisplayName(post.authorName ?? "Member")} ·
            ${post.categoryTitle} · ${post.commentCount} comments
          </p>
        </li>
      `,
    )
    .join("")

  return `<ul class="ic-posts" data-shop="${escapeHtml(shop)}">${items}</ul>`
}
