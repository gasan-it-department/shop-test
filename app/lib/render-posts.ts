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

export interface RenderableComment {
  id: string
  body: string
  authorName: string | null
  createdAt: string
}

export interface RenderablePostDetail {
  id: string
  title: string
  body: string
  authorName: string | null
  categoryTitle: string
  publishedAt: string
  comments: RenderableComment[]
}

/**
 * Single post with its comments, for /apps/forum/posts/<id>.
 *
 * Same rule as the list: static markup is trusted, every interpolation goes
 * through the tagged template. The comment form posts back to the same proxy
 * path, so it stays same-origin and Shopify signs it.
 */
export function renderPostDetail(post: RenderablePostDetail, canComment: boolean): string {
  const comments = post.comments
    .map(
      (comment) => html`
        <li class="ic-comment">
          <p class="ic-comment__meta">
            ${cleanDisplayName(comment.authorName ?? "Member")} · ${comment.createdAt}
          </p>
          <p class="ic-comment__body">${comment.body}</p>
        </li>
      `,
    )
    .join("")

  const form = canComment
    ? html`
        <form class="ic-reply" method="post" action="/apps/forum/posts/${post.id}">
          <label class="ic-reply__label" for="ic-body">Add a comment</label>
          <textarea class="ic-reply__input" id="ic-body" name="body" required maxlength="5000"></textarea>
          <button class="ic-reply__button" type="submit">Post comment</button>
        </form>
      `
    : `<p class="ic-signin">Sign in to your account to join the conversation.</p>`

  return html`
      <article class="ic-post-detail" data-post-id="${post.id}">
        <p class="ic-post__meta">
          ${post.categoryTitle} · ${cleanDisplayName(post.authorName ?? "Member")} ·
          ${post.publishedAt}
        </p>
        <h2 class="ic-post__title">${post.title}</h2>
        <div class="ic-post__body">${post.body}</div>
      </article>
    `
    .concat(`<ul class="ic-comments">${comments}</ul>`)
    .concat(form)
}
