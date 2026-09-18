// shared by the signed proxy route and the /dev harness so there's only one
// copy of the escaping

import { cleanDisplayName, escapeHtml, html, safeUrl } from "./escape"

/** One line of the comment preview under a card. */
export interface RenderableCommentPreview {
  authorName: string | null
  body: string
}

export interface RenderablePost {
  id: string
  title: string
  authorName: string | null
  categoryTitle: string
  commentCount: number
  /** first attached image, absolute — this markup renders on the shop's domain */
  imageUrl?: string | null
  /** first line or two of the body, so a card reads like a post and not a link */
  excerpt?: string | null
  likeCount?: number
  /** whether the shopper reading this page left one of those likes */
  liked?: boolean
  /** oldest-first, already trimmed to the two or three the card shows */
  comments?: RenderableCommentPreview[]
}

/** "12 likes", "1 like", and nothing at all for none. */
export function likeLabel(count: number): string {
  if (count <= 0) return ""
  return count === 1 ? "1 like" : `${count} likes`
}

/**
 * Cut a body down to a card-sized preview.
 *
 * Breaks on a word so the tail isn't a severed word, and only appends the
 * ellipsis when something was actually removed.
 */
export function excerptOf(body: string, limit = 180): string {
  const flat = body.replace(/\s+/g, " ").trim()
  if (flat.length <= limit) return flat

  const cut = flat.slice(0, limit)
  const lastSpace = cut.lastIndexOf(" ")
  // a body with no spaces at all (one long url) still has to be cut somewhere
  return `${(lastSpace > limit * 0.6 ? cut.slice(0, lastSpace) : cut).trimEnd()}…`
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

// a card is only as tall as its photo lets it be. these live inline rather
// than in the stylesheet because the fragment ships from the app and the
// stylesheet ships with the theme extension, on separate deploys — a photo
// that arrives before its css must not render at its full natural size.
const PHOTO_STYLE =
  "display:block;width:100%;aspect-ratio:4/3;max-height:420px;object-fit:cover"

// one path, filled or not depending on aria-pressed. two icons swapped by js
// would leave the wrong one visible for the moment the stylesheet is late.
const HEART_SVG =
  `<svg class="ic-heart" viewBox="0 0 24 24" fill="none" stroke="currentColor" ` +
  `stroke-width="1.7" stroke-linejoin="round" aria-hidden="true" focusable="false">` +
  `<path d="M12 20.7 4.55 13.2a4.6 4.6 0 0 1 6.5-6.5l.95.95.95-.95a4.6 4.6 0 0 1 6.5 6.5Z"/></svg>`

/**
 * The like control for one post.
 *
 * A real form posting to a real endpoint, not a bare button: the storefront
 * widget enhances it into an optimistic toggle, and the same markup on the
 * post page still works if that script never runs.
 *
 * A shopper who isn't signed in gets a link to the post instead, where the
 * sign-in prompt already lives. Showing them a button that can only answer
 * 401 is a worse answer than not showing them a button.
 */
function likeControl(
  post: { id: string; liked?: boolean; likeCount?: number },
  canLike: boolean,
): string {
  const id = escapeHtml(post.id)
  const liked = Boolean(post.liked)
  const count = post.likeCount ?? 0

  const button = canLike
    ? `<form class="ic-like" method="post" action="/apps/forum/posts/${id}/like" data-like-form>` +
      `<button class="ic-like__btn" type="submit" aria-pressed="${liked}" aria-label="Like this post">` +
      `${HEART_SVG}</button></form>`
    : `<a class="ic-like__btn ic-like__btn--guest" href="/apps/forum/posts/${id}" aria-label="Sign in to like this post">${HEART_SVG}</a>`

  // the count element is always present, even at zero, so the script has
  // something to write into without having to build markup of its own
  return (
    `${button}<span class="ic-like__count" data-like-count>${escapeHtml(likeLabel(count))}</span>`
  )
}

/**
 * The last couple of comments, the way a social feed shows them: who said it
 * in bold, then what they said, one line each.
 */
function commentPreview(post: RenderablePost): string {
  const comments = post.comments ?? []
  if (comments.length === 0) return ""

  const id = escapeHtml(post.id)
  // only offer "view all" when there is actually more than what is shown
  const viewAll =
    post.commentCount > comments.length
      ? html`<a class="ic-card__viewall" href="/apps/forum/posts/${post.id}"
          >View all ${String(post.commentCount)} comments</a
        >`
      : ""

  const lines = comments
    .map((comment) => {
      const who = cleanDisplayName(comment.authorName ?? "Member")
      return html`<p class="ic-card__comment">
        <span class="ic-card__comment-who">${who}</span> ${comment.body}
      </p>`
    })
    .join("")

  return `<div class="ic-card__preview" data-post-id="${id}">${viewAll}${lines}</div>`
}

export function renderPostList(
  posts: RenderablePost[],
  shop: string,
  canLike = false,
): string {
  const items = posts
    .map((post) => {
      const author = cleanDisplayName(post.authorName ?? "Member")
      const replies = post.commentCount === 1 ? "1 reply" : `${post.commentCount} replies`

      const photoSrc = post.imageUrl ? attrUrl(post.imageUrl) : ""
      const media = photoSrc
        ? `<span class="ic-card__media"><img class="ic-card__photo" src="${photoSrc}" alt="" loading="lazy" decoding="async" style="${PHOTO_STYLE}"></span>`
        : ""

      const excerpt = post.excerpt?.trim()
        ? html`<p class="ic-card__excerpt">${post.excerpt}</p>`
        : ""

      // escaped content and raw markup kept apart: every value below goes
      // through the tagged template, `media` and `excerpt` are markup we built
      const head = html`
        <span class="ic-card__head">
          <span class="ic-avatar" data-tint="${tintIndex(author)}" aria-hidden="true"
            >${initials(author)}</span
          >
          <span class="ic-card__who">
            <span class="ic-card__author">${author}</span>
            <span class="ic-card__where"><span class="ic-chip">${post.categoryTitle}</span></span>
          </span>
        </span>
        <h3 class="ic-card__title">${post.title}</h3>
      `

      // the footer sits outside the anchor on purpose. a <button> or a nested
      // <a> inside an <a> is invalid html, and browsers recover from it by
      // closing the outer anchor early — the like button would either not be
      // clickable or would navigate to the post instead of toggling.
      const foot =
        `<div class="ic-card__foot">${likeControl(post, canLike)}` +
        html`<a class="ic-card__replies" href="/apps/forum/posts/${post.id}">${replies}</a>` +
        `</div>`

      return (
        `<li class="ic-card" data-post-id="${escapeHtml(post.id)}">` +
        `<a class="ic-card__link" href="/apps/forum/posts/${escapeHtml(post.id)}">` +
        `${head}${excerpt}${media}</a>${foot}${commentPreview(post)}</li>`
      )
    })
    .join("")

  return `<ul class="ic-posts" data-shop="${escapeHtml(shop)}">${items}</ul>`
}

export interface RenderableComment {
  id: string
  body: string
  authorName: string | null
  createdAt: string
  parentId?: string | null
}

/** A top-level comment and the replies hanging off it, flattened to one level. */
export interface CommentThread {
  comment: RenderableComment
  replies: Array<RenderableComment & { replyingTo: string | null }>
}

/**
 * Group comments into top-level ones and their replies.
 *
 * Two display levels, not unlimited nesting. The post page is a 40rem column
 * on a phone; a reply indented six deep is a column two words wide. So a reply
 * to a reply is shown alongside its siblings under the same top-level comment,
 * and carries "Replying to X" instead of another indent — which is the shape
 * Facebook and Instagram settled on for the same reason.
 *
 * The stored parentId is left alone. Collapsing is a rendering decision, and
 * throwing away who actually replied to whom would make it permanent.
 */
export function threadComments(comments: RenderableComment[]): CommentThread[] {
  const byId = new Map(comments.map((comment) => [comment.id, comment]))

  // a parentId pointing outside this list — a comment that was deleted, or one
  // that simply is not on this page — makes the child a root rather than
  // vanishing it
  const rootOf = (comment: RenderableComment): RenderableComment => {
    let current = comment
    // depth cap rather than a visited set: the action only accepts a parent
    // that already exists so a cycle cannot be created through it, but a loop
    // here would hang the request and this costs nothing
    for (let hops = 0; hops < 50; hops++) {
      const parentId = current.parentId
      if (!parentId) return current
      const parent = byId.get(parentId)
      if (!parent || parent.id === current.id) return current
      current = parent
    }
    return current
  }

  const threads = new Map<string, CommentThread>()
  const order: string[] = []

  for (const comment of comments) {
    const root = rootOf(comment)
    if (!threads.has(root.id)) {
      threads.set(root.id, { comment: root, replies: [] })
      order.push(root.id)
    }
    if (comment.id === root.id) continue

    // only name the parent when it is not the root — "replying to" the comment
    // directly above adds nothing
    const parent = comment.parentId ? byId.get(comment.parentId) : undefined
    const replyingTo =
      parent && parent.id !== root.id ? cleanDisplayName(parent.authorName ?? "Member") : null

    threads.get(root.id)!.replies.push({ ...comment, replyingTo })
  }

  return order.map((id) => threads.get(id)!)
}

export interface RenderableImage {
  url: string
  width: number | null
  height: number | null
  alt: string | null
  /**
   * true only for a cdn that resizes from the url (Shopify Files).
   *
   * Images served from this app's own /images route have no resizer, so a
   * srcset there would make the browser choose between three urls that return
   * identical bytes, and `?width=` would be noise in every request.
   */
  resizable?: boolean
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
  likeCount?: number
  liked?: boolean
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
  /* one measure for the whole page. 40rem lands around 70 characters at this
     size, where 48rem ran to 85 and the eye lost the line it was on. */
  .ic-page { --ic-line: rgba(128,128,128,.22);
             --ic-soft: rgba(128,128,128,.085);
             --ic-softer: rgba(128,128,128,.045);
             max-width: 40rem; margin: 0 auto; padding: 2rem 1.25rem 5rem;
             font-size: 17px; line-height: 1.6; }

  /* a pill, not floating grey text. it is the only way back out of this page
     and it was previously the faintest thing on it. */
  .ic-back { display: inline-flex; align-items: center; gap: .45em;
             margin-bottom: 2rem; padding: .4em .9em .4em .75em; border-radius: 99px;
             background: var(--ic-soft); font-size: .8125rem; font-weight: 550;
             text-decoration: none; color: inherit;
             transition: background .15s ease; }
  .ic-back:hover { background: var(--ic-line); }
  .ic-back__arrow { transition: transform .15s ease; }
  .ic-back:hover .ic-back__arrow { transform: translateX(-2px); }

  .ic-post__head { display: flex; align-items: center; gap: .75rem; margin-bottom: 1.5rem; }
  .ic-avatar { flex: 0 0 auto; width: 44px; height: 44px; border-radius: 50%;
               display: grid; place-items: center; font-size: .8125rem; font-weight: 650;
               letter-spacing: .02em; user-select: none;
               background: var(--ic-soft); }
  .ic-avatar--sm { width: 32px; height: 32px; font-size: .6875rem; }
  .ic-avatar[data-tint='0'] { background: rgba(88,124,212,.16); color: #3f5ea8; }
  .ic-avatar[data-tint='1'] { background: rgba(58,160,120,.16); color: #2b7a58; }
  .ic-avatar[data-tint='2'] { background: rgba(206,130,52,.17); color: #97590f; }
  .ic-avatar[data-tint='3'] { background: rgba(170,96,196,.16); color: #7c4292; }
  .ic-avatar[data-tint='4'] { background: rgba(198,86,96,.16); color: #9c3b45; }
  .ic-avatar[data-tint='5'] { background: rgba(70,150,168,.17); color: #2f6f7e; }

  .ic-post__who { min-width: 0; }
  .ic-post__author { font-size: 1rem; font-weight: 650; line-height: 1.3; }
  /* the category used to sit on a line of its own above the title, which read
     as a stray label. it belongs to the byline — it says where this was
     posted, the same way the name says who posted it. */
  .ic-post__sub { display: flex; align-items: center; gap: .5rem; margin-top: .25rem;
                  font-size: .8125rem; }
  .ic-post__when { opacity: .55; }
  .ic-chip { display: inline-block; font-size: .6875rem; font-weight: 600;
             text-transform: uppercase; letter-spacing: .05em; padding: .3em .75em;
             border-radius: 99px; background: var(--ic-soft); }

  /* themes set enormous h1 scales for hero sections. cap it, or a three-word
     post title dwarfs the thread underneath it. */
  .ic-post__title { margin: 0 0 1.25rem; font-size: clamp(1.7rem, 3.4vw, 2.25rem);
                    line-height: 1.15; letter-spacing: -.025em; font-weight: 700; }
  .ic-post__body { line-height: 1.75; white-space: pre-wrap; word-break: break-word;
                   font-size: 1.0625rem; }
  .ic-post__body > * { font-size: inherit; }

  .ic-figure { margin: 1.75rem 0 0; }
  /* a border, because a photo with a white or near-white edge dissolves into
     a light theme and the post looks like it lost its layout */
  .ic-figure__img { display: block; width: 100%; height: auto; border-radius: .875rem;
                    border: 1px solid var(--ic-line); }
  .ic-figure + .ic-figure { margin-top: .75rem; }

  /* --- like ---
     the heart is the one place this page uses a colour of its own. everything
     else inherits the theme, but an unfilled and a filled heart have to be
     told apart at a glance and "slightly darker than the theme" is not that. */
  /* hairlines above and below: this bar is the seam between the post and the
     conversation about it, and with only a rule on top it read as a footer
     stuck to the photo */
  .ic-actions { display: flex; align-items: center; gap: .5rem;
                margin-top: 2rem; padding: .375rem 0;
                border-top: 1px solid var(--ic-line);
                border-bottom: 1px solid var(--ic-line); }
  .ic-like { margin: 0; display: inline-flex; }
  .ic-like__btn { display: inline-flex; align-items: center; justify-content: center;
                  width: 2.5rem; height: 2.5rem; padding: 0; border: 0; border-radius: 50%;
                  background: transparent; color: inherit; cursor: pointer;
                  text-decoration: none; -webkit-tap-highlight-color: transparent; }
  .ic-like__btn:hover { background: var(--ic-soft); }
  .ic-like__btn:focus-visible { outline: 2px solid currentColor; outline-offset: 2px; }
  .ic-heart { width: 1.5rem; height: 1.5rem; display: block;
              transition: transform .18s ease, fill .18s ease, stroke .18s ease; }
  .ic-like__btn[aria-pressed='true'] .ic-heart { fill: #ed4956; stroke: #ed4956; }
  .ic-like__count { font-size: .875rem; font-weight: 600; }
  .ic-like__count:empty { display: none; }
  /* the pop is added by script on toggle and removed when it ends */
  .ic-like__btn[data-pop] .ic-heart { animation: ic-pop .3s ease; }
  @keyframes ic-pop { 0% { transform: scale(1) } 35% { transform: scale(1.28) }
                      65% { transform: scale(.92) } 100% { transform: scale(1) } }
  @media (prefers-reduced-motion: reduce) {
    .ic-heart { transition: none; }
    .ic-like__btn[data-pop] .ic-heart { animation: none; }
  }

  /* --- the thread --- */
  .ic-thread { margin-top: 2.5rem; }
  .ic-thread__title { margin: 0 0 1rem; font-size: .9375rem; font-weight: 650;
                      letter-spacing: -.01em; }
  .ic-thread__empty { margin: 0; padding: .25rem 0 1.25rem; font-size: .9375rem;
                      opacity: .55; }

  .ic-comments { list-style: none; margin: 0; padding: 0; display: grid; gap: .75rem; }
  /* replies are bubbles rather than hairline-separated rows. a row of text
     under a rule looks like more of the article; a filled shape reads as
     somebody else talking, which is what a reply is. */
  .ic-comment { display: flex; gap: .625rem; align-items: flex-start; }
  .ic-comment__bubble { min-width: 0; flex: 1 1 auto; padding: .75rem .9375rem;
                        border-radius: .875rem; background: var(--ic-soft); }
  .ic-comment__main { min-width: 0; flex: 1 1 auto; }
  .ic-comment__meta { display: flex; align-items: baseline; gap: .5rem;
                      margin: 0 0 .2rem; font-size: .8125rem; }
  .ic-comment__who { font-weight: 650; }
  .ic-comment__when { font-size: .75rem; opacity: .5; }
  /* who a reply was aimed at, since replies are shown one level deep rather
     than indented under each other */
  .ic-comment__to { display: block; margin-bottom: .2rem; font-size: .75rem;
                    opacity: .55; }

  /* one indent, never two. the children list is a bare li so the nested ul
     inherits the thread's own spacing instead of the browser's list defaults */
  .ic-comment__children { display: block; margin: .75rem 0 0 2.25rem; }
  .ic-comment__children > .ic-comments { gap: .625rem; }

  .ic-comment__reply { display: inline-block; margin: .375rem 0 0 .9375rem;
                       font-size: .8125rem; font-weight: 600; opacity: .6;
                       text-decoration: none; color: inherit; }
  .ic-comment__reply:hover { opacity: 1; text-decoration: underline; }

  .ic-comment__box { display: block; }
  .ic-reply--inline { margin-top: .25rem; }
  .ic-reply__cancel { align-self: center; margin-right: .875rem; font-size: .875rem;
                      opacity: .6; color: inherit; }
  .ic-reply__cancel:hover { opacity: 1; }
  /* explicitly smaller than the post body — a reply outweighing the thread it
     hangs off is the theme's paragraph styles winning, not a design choice */
  .ic-comment__body { margin: 0; font-size: .9375rem; line-height: 1.6;
                      white-space: pre-wrap; word-break: break-word; }

  .ic-reply { margin-top: 1.75rem; }
  .ic-reply__label { display: block; font-size: .875rem; font-weight: 650;
                     margin-bottom: .5rem; }
  /* a tinted field, so an empty textarea is visible as somewhere to type
     rather than as a rectangle of theme background */
  .ic-reply__input { width: 100%; min-height: 6.5rem; padding: .875rem 1rem; font: inherit;
                     font-size: .9375rem; line-height: 1.6;
                     border: 1px solid var(--ic-line); border-radius: .875rem;
                     background: var(--ic-softer); color: inherit; resize: vertical;
                     transition: border-color .15s ease, background .15s ease; }
  .ic-reply__input::placeholder { opacity: .45; }
  .ic-reply__input:focus { outline: none; border-color: currentColor; background: transparent; }
  .ic-reply__actions { display: flex; justify-content: flex-end; margin-top: .75rem; }
  /* outlined, not filled. filling needs two colours — one for the fill and one
     for the label — and this page only ever knows one, the theme's text
     colour. The previous version filled with currentColor and set the label to
     the css system colour Canvas, which tracks the browser's colour-scheme
     rather than the merchant's stylesheet: on a dark theme that resolved to
     white text on a white button. An outline needs only the colour we have.
     color:inherit matters here — a button does not inherit colour on its own,
     so without it currentColor is the browser's button text, not the theme's. */
  .ic-reply__button { padding: .65rem 1.5rem; font: inherit; font-size: .9375rem;
                      font-weight: 650; cursor: pointer; color: inherit;
                      border: 1.5px solid currentColor; border-radius: .75rem;
                      background: transparent; transition: background .15s ease; }
  .ic-reply__button:hover { background: var(--ic-soft); }
  .ic-reply__button:focus-visible { outline: 2px solid currentColor; outline-offset: 2px; }

  .ic-signin { margin-top: 1.5rem; padding: 1rem 1.25rem; border-radius: .875rem;
               background: var(--ic-soft); font-size: .9375rem; opacity: .8; }
  .ic-error { margin-top: 1.25rem; padding: .8rem 1.0625rem; border-radius: .75rem;
              background: rgba(200,60,60,.1); border: 1px solid rgba(200,60,60,.25);
              font-size: .875rem; }

  @media (max-width: 480px) {
    .ic-page { padding: 1.5rem 1rem 4rem; }
    .ic-post__body { font-size: 1rem; }
    /* :not(--sm) because this rule sits after the modifier in the sheet and
       would otherwise win on specificity ties and inflate the comment
       avatars to the post author's size */
    .ic-avatar:not(.ic-avatar--sm) { width: 38px; height: 38px; }
    /* a 2.25rem indent on a 375px screen costs a sixth of the reply's width */
    .ic-comment__children { margin-left: 1.25rem; }
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
  /** id of the comment being replied to, from ?reply= on the url */
  replyTo?: string | null,
): string {
  // the reply form is a link away, not a script away: ?reply=<id> re-renders
  // this page with the form moved under that comment. no javascript runs on
  // this page at all, and adding some just to show a textarea would be the
  // only reason it needed any.
  const replyForm = (parentId: string) =>
    canComment
      ? html`
          <form
            class="ic-reply ic-reply--inline"
            id="ic-reply"
            method="post"
            action="/apps/forum/posts/${post.id}"
          >
            <input type="hidden" name="parentId" value="${parentId}" />
            <label class="ic-reply__label" for="ic-body-${parentId}">Write a reply</label>
            <textarea
              class="ic-reply__input"
              id="ic-body-${parentId}"
              name="body"
              required
              maxlength="5000"
              placeholder="Share your thoughts…"
            ></textarea>
            <div class="ic-reply__actions">
              <a class="ic-reply__cancel" href="/apps/forum/posts/${post.id}">Cancel</a>
              <button class="ic-reply__button" type="submit">Post reply</button>
            </div>
          </form>
        `
      : `<p class="ic-signin">Sign in to your account to reply.</p>`

  const renderComment = (
    comment: RenderableComment & { replyingTo?: string | null },
    isReply: boolean,
  ) => {
    const who = cleanDisplayName(comment.authorName ?? "Member")
    const replying = comment.replyingTo
      ? html`<span class="ic-comment__to">Replying to ${comment.replyingTo}</span>`
      : ""

    // the link only. the form is placed by the thread, after the replies,
    // because a box wedged between a comment and the answers to it makes the
    // answers look like they came after something that has not been sent yet.
    const action = canComment
      ? html`<a class="ic-comment__reply" href="/apps/forum/posts/${post.id}?reply=${comment.id}#ic-reply"
          >Reply</a
        >`
      : ""

    // built in pieces rather than one template: `replying` and `action` are
    // markup we generated, everything else is author input that has to go
    // through the tagged template. mixing the two in one literal is how an
    // escape gets skipped.
    const avatar = html`<span
      class="ic-avatar ic-avatar--sm"
      data-tint="${tintIndex(who)}"
      aria-hidden="true"
      >${initials(who)}</span
    >`
    const meta = html`<p class="ic-comment__meta">
      <span class="ic-comment__who">${who}</span>
      <span class="ic-comment__when">${comment.createdAt}</span>
    </p>`
    const body = html`<p class="ic-comment__body">${comment.body}</p>`

    return (
      `<li class="ic-comment${isReply ? " ic-comment--reply" : ""}">` +
      avatar +
      `<div class="ic-comment__main">` +
      `<div class="ic-comment__bubble">${meta}${replying}${body}</div>` +
      action +
      `</div></li>`
    )
  }

  const comments = threadComments(post.comments)
    .map((thread) => {
      // the box belongs to the thread, wherever in it the merchant clicked —
      // replying to a reply still adds to this same conversation
      const openHere =
        replyTo != null &&
        (thread.comment.id === replyTo || thread.replies.some((reply) => reply.id === replyTo))

      const children =
        thread.replies.length > 0 || openHere
          ? `<li class="ic-comment__children"><ul class="ic-comments">` +
            thread.replies.map((reply) => renderComment(reply, true)).join("") +
            (openHere ? `<li class="ic-comment__box">${replyForm(replyTo)}</li>` : "") +
            `</ul></li>`
          : ""

      return renderComment(thread.comment, false) + children
    })
    .join("")

  // when a reply box is open under a comment there must not be a second form
  // at the bottom: they would share the ic-reply id and the anchor would jump
  // to whichever came first
  const replyOpen = Boolean(replyTo) && post.comments.some((comment) => comment.id === replyTo)

  const form = replyOpen
    ? ""
    : canComment
      ? html`
          <form class="ic-reply" id="ic-reply" method="post" action="/apps/forum/posts/${post.id}">
            <label class="ic-reply__label" for="ic-body">Join the conversation</label>
            <textarea
              class="ic-reply__input"
              id="ic-body"
              name="body"
              required
              maxlength="5000"
              placeholder="Share your thoughts…"
            ></textarea>
            <div class="ic-reply__actions">
              <button class="ic-reply__button" type="submit">Post comment</button>
            </div>
          </form>
        `
      : `<p class="ic-signin">Sign in to your account to join the conversation.</p>`

  const banner = error ? html`<p class="ic-error">${error}</p>` : ""

  // srcset so a phone doesn't download the full-size original. width/height
  // are set where known so the page doesn't reflow as images arrive.
  const images = (post.images ?? [])
    .map((image) => {
      const src = attrUrl(image.resizable ? cdnResize(image.url, 1200) : image.url)
      // a url safeUrl rejects renders nothing rather than a broken image
      if (!src) return ""

      const srcset = image.resizable
        ? ` srcset="${[600, 1200, 1800]
            .map((w) => `${attrUrl(cdnResize(image.url, w))} ${w}w`)
            .join(", ")}" sizes="(max-width: 48rem) 100vw, 48rem"`
        : ""

      // only claim dimensions we actually know — a guessed width/height
      // reserves the wrong shape and the page jumps when the real image lands
      const dims =
        image.width && image.height ? ` width="${image.width}" height="${image.height}"` : ""

      // alt is merchant input and goes through the aggressive escape; the url
      // is ours and goes through the attribute-safe one
      return `<figure class="ic-figure"><img class="ic-figure__img" src="${src}"${srcset} alt="${escapeHtml(image.alt ?? "")}" loading="lazy" decoding="async"${dims}></figure>`
    })
    .join("")

  const author = cleanDisplayName(post.authorName ?? "Member")
  const replyCount = post.comments.length
  const replies =
    replyCount === 0 ? "No replies yet" : replyCount === 1 ? "1 reply" : `${replyCount} replies`

  const article = html`
    <article class="ic-post-detail" data-post-id="${post.id}">
      <header class="ic-post__head">
        <span class="ic-avatar" data-tint="${tintIndex(author)}" aria-hidden="true"
          >${initials(author)}</span
        >
        <div class="ic-post__who">
          <div class="ic-post__author">${author}</div>
          <div class="ic-post__sub">
            <span class="ic-post__when">${post.publishedAt}</span>
            <span class="ic-chip">${post.categoryTitle}</span>
          </div>
        </div>
      </header>
      <h1 class="ic-post__title">${post.title}</h1>
      <div class="ic-post__body">${post.body}</div>
    </article>
  `.concat(images)

  // the same control the feed uses, so a heart tapped on one is already
  // filled on the other — there is one endpoint and one piece of state
  // the heart alone. the reply count used to sit on the right of this bar as
  // well as on the thread heading right below it, which read as a stutter —
  // the same two words twice, a centimetre apart.
  const actions = `<div class="ic-actions">${likeControl(post, canComment)}</div>`

  // an empty thread said nothing at all before: no heading, and a list rule
  // hiding itself. a post with no replies should still look like it is
  // waiting for one.
  const thread =
    `<section class="ic-thread">` +
    `<h2 class="ic-thread__title">${escapeHtml(replies)}</h2>` +
    (replyCount === 0
      ? `<p class="ic-thread__empty">Be the first to reply.</p>`
      : `<ul class="ic-comments">${comments}</ul>`) +
    `${banner}${form}</section>`

  return [
    `<style>${DETAIL_STYLES}</style>`,
    `<div class="ic-page">`,
    // back to wherever the widget is embedded. the merchant chooses that page,
    // so the store root is the only link that is always correct — but the
    // label should name where it goes, which is the forum, not the shop.
    `<a class="ic-back" href="/"><span class="ic-back__arrow" aria-hidden="true">&larr;</span> Back to Community</a>`,
    article,
    actions,
    thread,
    `</div>`,
  ].join("")
}
