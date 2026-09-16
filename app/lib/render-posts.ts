// shared by the signed proxy route and the /dev harness so there's only one
// copy of the escaping

import { cleanDisplayName, escapeHtml, html, safeUrl } from "./escape"

export interface RenderablePost {
  id: string
  title: string
  authorName: string | null
  categoryTitle: string
  commentCount: number
}

/** "Ana Reyes" -> "AR", "thatone" -> "TH". Never empty. */
export function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean)
  if (parts.length === 0) return "?"
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase()
  return `${parts[0][0]}${parts[parts.length - 1][0]}`.toUpperCase()
}

/**
 * Stable tint index for an avatar, 0-5.
 *
 * Derived from the name so the same person keeps the same colour between page
 * loads — a shuffling avatar palette looks like a bug even when nobody can say
 * why.
 */
export function tintIndex(name: string, buckets = 6): number {
  let hash = 0
  for (let i = 0; i < name.length; i++) {
    hash = (hash * 31 + name.charCodeAt(i)) >>> 0
  }
  return hash % buckets
}

export function renderPostList(posts: RenderablePost[], shop: string): string {
  const items = posts
    .map((post) => {
      const author = cleanDisplayName(post.authorName ?? "Member")
      const replies = post.commentCount === 1 ? "1 reply" : `${post.commentCount} replies`

      return html`
        <li class="ic-post">
          <a class="ic-post__link" href="/apps/forum/posts/${post.id}">
            <span class="ic-avatar" data-tint="${tintIndex(author)}" aria-hidden="true"
              >${initials(author)}</span
            >
            <span class="ic-post__main">
              <span class="ic-post__title">${post.title}</span>
              <span class="ic-post__meta">
                <span class="ic-chip">${post.categoryTitle}</span>
                <span class="ic-post__author">${author}</span>
                <span class="ic-post__replies">${replies}</span>
              </span>
            </span>
            <span class="ic-post__chevron" aria-hidden="true">&rsaquo;</span>
          </a>
        </li>
      `
    })
    .join("")

  return `<ul class="ic-posts" data-shop="${escapeHtml(shop)}">${items}</ul>`
}

export interface RenderableComment {
  id: string
  body: string
  authorName: string | null
  createdAt: string
}

export interface RenderableImage {
  url: string
  width: number | null
  height: number | null
  alt: string | null
}

export interface RenderablePostDetail {
  id: string
  title: string
  body: string
  authorName: string | null
  categoryTitle: string
  publishedAt: string
  images?: RenderableImage[]
  comments: RenderableComment[]
}

/**
 * Shopify's cdn resizes from the url, so a post page never has to serve a
 * 4000px original to a phone.
 */
export function cdnResize(url: string, width: number): string {
  return `${url}${url.includes("?") ? "&" : "?"}width=${width}`
}

/**
 * Escape a url for a quoted attribute.
 *
 * escapeHtml also escapes `/` and `=`, which turns every url into entity soup
 * — browsers decode it so it renders, but it is unreadable in view-source and
 * impossible to debug. Only `&`, quotes and angle brackets can break out of a
 * quoted attribute, so only those are escaped, and safeUrl rejects
 * `javascript:` before any of it.
 */
export function attrUrl(raw: string): string {
  const safe = safeUrl(raw)
  if (!safe) return ""
  return safe
    .replace(/&/g, "&amp;")
    .replace(/"/g, "&quot;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
}

// Styles for the standalone post page. Unlike the list widget there is no
// shadow root here — this renders inside the merchant's theme layout, so the
// rules deliberately inherit the theme's font and colour and only handle
// spacing and structure. Fighting the theme's typography on its own page
// would make the forum look bolted on, which is exactly what it is not
// supposed to look like.
const DETAIL_STYLES = `
  /* every size below is explicit rather than inherited. themes style p, h1 and
     div differently, and inheriting gave the odd result of a reply rendering
     larger than the post it replied to. */
  .ic-page { --ic-line: rgba(128,128,128,.22);
             --ic-soft: rgba(128,128,128,.09);
             max-width: 48rem; margin: 0 auto; padding: 2.5rem 1.5rem 5rem;
             font-size: 17px; line-height: 1.6; }

  .ic-back { display: inline-flex; align-items: center; gap: .4em; margin-bottom: 1.75rem;
             font-size: .875rem; opacity: .6; text-decoration: none; color: inherit; }
  .ic-back:hover { opacity: 1; }

  .ic-byline { display: flex; align-items: center; gap: .625rem; margin-bottom: 1rem; }
  .ic-avatar { flex: 0 0 auto; width: 34px; height: 34px; border-radius: 50%;
               display: grid; place-items: center; font-size: .75rem; font-weight: 650;
               background: var(--ic-soft); }
  .ic-avatar[data-tint='0'] { background: rgba(88,124,212,.16); color: #3f5ea8; }
  .ic-avatar[data-tint='1'] { background: rgba(58,160,120,.16); color: #2b7a58; }
  .ic-avatar[data-tint='2'] { background: rgba(206,130,52,.17); color: #97590f; }
  .ic-avatar[data-tint='3'] { background: rgba(170,96,196,.16); color: #7c4292; }
  .ic-avatar[data-tint='4'] { background: rgba(198,86,96,.16); color: #9c3b45; }
  .ic-avatar[data-tint='5'] { background: rgba(70,150,168,.17); color: #2f6f7e; }

  .ic-byline__who { font-size: 1rem; font-weight: 600; line-height: 1.3; }
  .ic-byline__when { font-size: .8125rem; opacity: .6; }
  .ic-chip { display: inline-block; font-size: .75rem; font-weight: 550; padding: .15em .7em;
             border-radius: 99px; background: var(--ic-soft); margin-right: .5rem; }

  .ic-post__category { margin: 0 0 .625rem; }
  /* themes set enormous h1 scales for hero sections. cap it, or a three-word
     post title dwarfs the thread underneath it. */
  .ic-post__title { margin: 0 0 1.125rem; font-size: clamp(1.75rem, 3.6vw, 2.375rem);
                    line-height: 1.18; letter-spacing: -.022em; font-weight: 650; }
  .ic-post__body { line-height: 1.75; white-space: pre-wrap; word-break: break-word;
                   font-size: 1.125rem; }
  .ic-post__body > * { font-size: inherit; }

  .ic-figure { margin: 1.5rem 0 0; }
  .ic-figure__img { display: block; width: 100%; height: auto; border-radius: .75rem; }

  .ic-comments { list-style: none; margin: 3rem 0 0; padding: 0; }
  .ic-comments:empty { display: none; }
  .ic-comments-title { margin: 3rem 0 .5rem; font-size: .8125rem; font-weight: 650;
                       letter-spacing: .06em; text-transform: uppercase; opacity: .55; }
  .ic-comment { display: flex; gap: .75rem; padding: 1.125rem 0;
                border-top: 1px solid var(--ic-line); }
  .ic-comment__body-wrap { min-width: 0; flex: 1 1 auto; }
  .ic-comment__meta { font-size: .8125rem; opacity: .6; margin: 0 0 .25rem; font-weight: 500; }
  /* explicitly smaller than the post body — a reply outweighing the thread it
     hangs off is the theme's paragraph styles winning, not a design choice */
  .ic-comment__body { margin: 0; font-size: 1rem; line-height: 1.65;
                      white-space: pre-wrap; word-break: break-word; }

  .ic-reply { margin-top: 2.5rem; padding-top: 2rem; border-top: 1px solid var(--ic-line); }
  .ic-reply__label { display: block; font-size: .875rem; font-weight: 600; margin-bottom: .625rem; }
  .ic-reply__input { width: 100%; min-height: 7.5rem; padding: .875rem 1rem; font: inherit;
                     line-height: 1.65; border: 1px solid var(--ic-line); border-radius: .75rem;
                     background: transparent; color: inherit; resize: vertical; }
  .ic-reply__input:focus { outline: none; border-color: currentColor; }
  .ic-reply__button { margin-top: .875rem; padding: .7rem 1.5rem; font: inherit;
                      font-size: .9375rem; font-weight: 600; cursor: pointer; border: 0;
                      border-radius: .625rem; background: currentColor; }
  .ic-reply__button > span { color: Canvas; }

  .ic-signin { margin-top: 2.5rem; padding: 1.25rem 1.5rem; border-radius: .75rem;
               background: var(--ic-soft); font-size: .9375rem; opacity: .85; }
  .ic-error { margin-top: 1.5rem; padding: .875rem 1.125rem; border-radius: .75rem;
              background: rgba(200,60,60,.1); font-size: .875rem; }

  @media (max-width: 480px) {
    .ic-page { padding: 1.75rem 1rem 4rem; }
    .ic-post__body { font-size: 1rem; }
  }
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
    .map((comment) => {
      const who = cleanDisplayName(comment.authorName ?? "Member")
      return html`
        <li class="ic-comment">
          <span class="ic-avatar" data-tint="${tintIndex(who)}" aria-hidden="true"
            >${initials(who)}</span
          >
          <div class="ic-comment__body-wrap">
            <p class="ic-comment__meta">${who} · ${comment.createdAt}</p>
            <p class="ic-comment__body">${comment.body}</p>
          </div>
        </li>
      `
    })
    .join("")

  const form = canComment
    ? html`
        <form class="ic-reply" method="post" action="/apps/forum/posts/${post.id}">
          <label class="ic-reply__label" for="ic-body">Join the conversation</label>
          <textarea
            class="ic-reply__input"
            id="ic-body"
            name="body"
            required
            maxlength="5000"
            placeholder="Share your thoughts…"
          ></textarea>
          <button class="ic-reply__button" type="submit"><span>Post comment</span></button>
        </form>
      `
    : `<p class="ic-signin">Sign in to your account to join the conversation.</p>`

  const banner = error ? html`<p class="ic-error">${error}</p>` : ""

  // srcset so a phone doesn't download the full-size original. width/height
  // are set where known so the page doesn't reflow as images arrive.
  const images = (post.images ?? [])
    .map((image) => {
      const src = attrUrl(cdnResize(image.url, 1200))
      // a url safeUrl rejects renders nothing rather than a broken image
      if (!src) return ""

      const srcset = [600, 1200, 1800]
        .map((w) => `${attrUrl(cdnResize(image.url, w))} ${w}w`)
        .join(", ")

      // alt is merchant input and goes through the aggressive escape; the url
      // is ours and goes through the attribute-safe one
      return `<figure class="ic-figure"><img class="ic-figure__img" src="${src}" srcset="${srcset}" sizes="(max-width: 48rem) 100vw, 48rem" alt="${escapeHtml(image.alt ?? "")}" loading="lazy" decoding="async" width="${image.width ?? 1200}" height="${image.height ?? 800}"></figure>`
    })
    .join("")

  const author = cleanDisplayName(post.authorName ?? "Member")
  const heading =
    post.comments.length === 0
      ? ""
      : `<p class="ic-comments-title">${
          post.comments.length === 1 ? "1 reply" : `${post.comments.length} replies`
        }</p>`

  const article = html`
    <article class="ic-post-detail" data-post-id="${post.id}">
      <div class="ic-byline">
        <span class="ic-avatar" data-tint="${tintIndex(author)}" aria-hidden="true"
          >${initials(author)}</span
        >
        <div>
          <div class="ic-byline__who">${author}</div>
          <div class="ic-byline__when">${post.publishedAt}</div>
        </div>
      </div>
      <p class="ic-post__category"><span class="ic-chip">${post.categoryTitle}</span></p>
      <h1 class="ic-post__title">${post.title}</h1>
      <div class="ic-post__body">${post.body}</div>
    </article>
  `.concat(images)

  return [
    `<style>${DETAIL_STYLES}</style>`,
    `<div class="ic-page">`,
    // back to wherever the widget is embedded. the merchant chooses that page,
    // so the store root is the only link that is always correct.
    `<a class="ic-back" href="/"><span aria-hidden="true">&larr;</span> Back to the store</a>`,
    article,
    heading,
    `<ul class="ic-comments">${comments}</ul>`,
    banner,
    form,
    `</div>`,
  ].join("")
}
