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

// Styles for the standalone post page. Unlike the list widget there is no
// shadow root here — this renders inside the merchant's theme layout, so the
// rules deliberately inherit the theme's font and colour and only handle
// spacing and structure. Fighting the theme's typography on its own page
// would make the forum look bolted on, which is exactly what it is not
// supposed to look like.
const DETAIL_STYLES = `
  .ic-page { max-width: 46rem; margin: 0 auto; padding: 2rem 1.25rem 4rem; }
  .ic-back { display: inline-block; margin-bottom: 1.5rem; font-size: .875rem; opacity: .7; }
  .ic-post__meta { font-size: .8125rem; opacity: .65; margin: 0 0 .5rem; }
  .ic-post__title { margin: 0 0 1rem; line-height: 1.25; }
  .ic-post__body { line-height: 1.7; white-space: pre-wrap; word-break: break-word; }
  .ic-comments { list-style: none; margin: 2.5rem 0 0; padding: 2rem 0 0;
                 border-top: 1px solid currentColor; border-color: rgba(128,128,128,.25); }
  .ic-comments:empty { display: none; }
  .ic-comment { padding: 1rem 0; border-bottom: 1px solid rgba(128,128,128,.18); }
  .ic-comment:last-child { border-bottom: 0; }
  .ic-comment__meta { font-size: .8125rem; opacity: .65; margin: 0 0 .25rem; }
  .ic-comment__body { margin: 0; line-height: 1.6; white-space: pre-wrap; word-break: break-word; }
  .ic-reply { margin-top: 2rem; }
  .ic-reply__label { display: block; font-size: .875rem; margin-bottom: .5rem; }
  .ic-reply__input { width: 100%; min-height: 7rem; padding: .625rem .75rem; font: inherit;
                     line-height: 1.6; border: 1px solid rgba(128,128,128,.4); border-radius: .375rem;
                     background: transparent; color: inherit; }
  .ic-reply__button { margin-top: .75rem; padding: .625rem 1.25rem; font: inherit;
                      font-size: .9375rem; cursor: pointer; border: 1px solid currentColor;
                      border-radius: .375rem; background: transparent; color: inherit; }
  .ic-signin { margin-top: 2rem; font-size: .9375rem; opacity: .7; }
  .ic-error { margin-top: 1rem; padding: .75rem 1rem; border-radius: .375rem;
              background: rgba(200,60,60,.1); font-size: .875rem; }
`

/**
 * Single post with its comments, for /apps/forum/posts/<id>.
 *
 * Same rule as the list: static markup is trusted, every interpolation goes
 * through the tagged template. The comment form posts back to the same proxy
 * path, so it stays same-origin and Shopify signs it.
 *
 * `error` is the message carried back by the post/redirect/get after a failed
 * submission — there is no session to flash it through, so it travels in the
 * query string.
 */
export function renderPostDetail(
  post: RenderablePostDetail,
  canComment: boolean,
  error?: string | null,
): string {
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

  const banner = error ? html`<p class="ic-error">${error}</p>` : ""

  const article = html`
    <article class="ic-post-detail" data-post-id="${post.id}">
      <p class="ic-post__meta">
        ${post.categoryTitle} · ${cleanDisplayName(post.authorName ?? "Member")} ·
        ${post.publishedAt}
      </p>
      <h1 class="ic-post__title">${post.title}</h1>
      <div class="ic-post__body">${post.body}</div>
    </article>
  `

  return [
    `<style>${DETAIL_STYLES}</style>`,
    `<div class="ic-page">`,
    // back to wherever the widget is embedded. the merchant chooses that page,
    // so the store root is the only link that is always correct.
    `<a class="ic-back" href="/">&larr; Back to the store</a>`,
    article,
    `<ul class="ic-comments">${comments}</ul>`,
    banner,
    form,
    `</div>`,
  ].join("")
}
