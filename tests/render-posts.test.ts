import { describe, expect, it } from "vitest"

import {
  excerptOf,
  likeLabel,
  renderPostDetail,
  renderPostList,
  threadComments,
  type RenderableComment,
  type RenderablePost,
  type RenderablePostDetail,
} from "../app/lib/render-posts"

function post(overrides: Partial<RenderablePost> = {}): RenderablePost {
  return {
    id: "post_1",
    title: "Which grind for a V60?",
    authorName: "Ana",
    categoryTitle: "Brewing",
    commentCount: 4,
    ...overrides,
  }
}

describe("renderPostList", () => {
  it("renders one card per post", () => {
    const markup = renderPostList([post({ id: "a" }), post({ id: "b" })], "shop.myshopify.com")
    expect(markup.match(/class="ic-card"/g)).toHaveLength(2)
  })

  it("renders an empty but valid list when there are no posts", () => {
    const markup = renderPostList([], "shop.myshopify.com")
    expect(markup).toBe(`<ul class="ic-posts" data-shop="shop.myshopify.com"></ul>`)
  })

  it("escapes a hostile post title", () => {
    const markup = renderPostList(
      [post({ title: `</h3><script>alert(1)</script>` })],
      "shop.myshopify.com",
    )
    expect(markup).not.toContain("<script>")
    expect(markup).toContain("&lt;script&gt;")
  })

  it("escapes a hostile author name", () => {
    const markup = renderPostList(
      [post({ authorName: `" onmouseover="alert(1)` })],
      "shop.myshopify.com",
    )
    expect(markup).not.toContain(`onmouseover="alert`)
  })

  it("escapes the shop attribute", () => {
    const markup = renderPostList([], `x" onload="alert(1)`)
    expect(markup).not.toContain(`onload="alert`)
  })

  it("falls back to Member for a missing author", () => {
    expect(renderPostList([post({ authorName: null })], "s")).toContain("Member")
  })

  it("keeps the post id in the link", () => {
    expect(renderPostList([post({ id: "abc123" })], "s")).toContain("/apps/forum/posts/abc123")
  })

  it("shows the photo when the post has an image", () => {
    const markup = renderPostList(
      [post({ imageUrl: "https://app.example/images/img1" })],
      "shop.myshopify.com",
    )
    expect(markup).toContain("ic-card__photo")
    expect(markup).toContain("https://app.example/images/img1")
  })

  it("sizes the photo inline, so a stale stylesheet can't make it full-bleed", () => {
    // the fragment ships from the app, the stylesheet ships with the theme
    // extension, and they deploy separately — the markup has to stand alone
    const markup = renderPostList([post({ imageUrl: "https://app.example/i" })], "s")
    expect(markup).toContain("aspect-ratio:4/3")
    expect(markup).toContain("max-height:420px")
    expect(markup).toContain("object-fit:cover")
  })

  it("renders a card with no media block when there is no image", () => {
    const markup = renderPostList([post()], "shop.myshopify.com")
    expect(markup).toContain("ic-card")
    expect(markup).not.toContain("ic-card__media")
  })

  it("renders no photo for an unsafe image url", () => {
    const markup = renderPostList([post({ imageUrl: "javascript:alert(1)" })], "s")
    expect(markup).not.toContain("ic-card__photo")
  })

  it("keeps escaping the title when a photo is present", () => {
    const markup = renderPostList(
      [post({ title: `<script>alert(1)</script>`, imageUrl: "https://app.example/i" })],
      "s",
    )
    expect(markup).not.toContain("<script>")
  })

  it("renders the excerpt when there is one", () => {
    const markup = renderPostList([post({ excerpt: "Going finer tastes bitter." })], "s")
    expect(markup).toContain("ic-card__excerpt")
    expect(markup).toContain("Going finer tastes bitter.")
  })

  it("omits the excerpt element when the body is blank", () => {
    expect(renderPostList([post({ excerpt: "   " })], "s")).not.toContain("ic-card__excerpt")
    expect(renderPostList([post()], "s")).not.toContain("ic-card__excerpt")
  })

  it("escapes a hostile excerpt", () => {
    const markup = renderPostList([post({ excerpt: `<img src=x onerror=alert(1)>` })], "s")
    expect(markup).not.toContain("<img src=x")
  })
})

describe("the like control", () => {
  it("renders a form posting to the like endpoint for a signed-in shopper", () => {
    const markup = renderPostList([post({ id: "p1" })], "s", true)
    expect(markup).toContain('action="/apps/forum/posts/p1/like"')
    expect(markup).toContain('method="post"')
    expect(markup).toContain("data-like-form")
  })

  it("starts unpressed, and pressed when the shopper already liked it", () => {
    expect(renderPostList([post()], "s", true)).toContain('aria-pressed="false"')
    expect(renderPostList([post({ liked: true })], "s", true)).toContain('aria-pressed="true"')
  })

  it("gives a signed-out visitor a link to the post, not a button that can only 401", () => {
    const markup = renderPostList([post({ id: "p1" })], "s", false)
    expect(markup).not.toContain("data-like-form")
    expect(markup).not.toContain("<button")
    expect(markup).toContain('href="/apps/forum/posts/p1"')
    expect(markup).toContain("ic-like__btn--guest")
  })

  it("keeps the like form outside the card anchor", () => {
    // a form or button inside an <a> is invalid html: browsers close the
    // anchor early and the control stops toggling
    const markup = renderPostList([post()], "s", true)
    const anchorEnd = markup.indexOf("</a>")
    expect(markup.indexOf("data-like-form")).toBeGreaterThan(anchorEnd)
  })

  it("always renders the count element, so the script has somewhere to write", () => {
    expect(renderPostList([post({ likeCount: 0 })], "s", true)).toContain("data-like-count")
  })

  it("labels the count and says nothing at zero", () => {
    expect(renderPostList([post({ likeCount: 3 })], "s", true)).toContain("3 likes")
    expect(renderPostList([post({ likeCount: 1 })], "s", true)).toContain("1 like")
    expect(renderPostList([post({ likeCount: 0 })], "s", true)).toContain(
      '<span class="ic-like__count" data-like-count></span>',
    )
  })

  it("puts the heart on the post page too, sharing one control", () => {
    const markup = renderPostDetail(detail({ liked: true, likeCount: 2 }), true)
    expect(markup).toContain('aria-pressed="true"')
    expect(markup).toContain("2 likes")
    expect(markup).toContain("/like")
  })

  it("shows a signed-out reader on the post page a link instead of a form", () => {
    const markup = renderPostDetail(detail(), false)
    expect(markup).not.toContain("data-like-form")
    expect(markup).toContain("ic-like__btn--guest")
  })
})

describe("likeLabel", () => {
  it("is empty at zero and below", () => {
    expect(likeLabel(0)).toBe("")
    expect(likeLabel(-1)).toBe("")
  })

  it("is singular at one", () => {
    expect(likeLabel(1)).toBe("1 like")
  })

  it("is plural above one", () => {
    expect(likeLabel(2)).toBe("2 likes")
  })
})

describe("the comment preview", () => {
  const two = [
    { authorName: "Ana", body: "Try one click coarser." },
    { authorName: "Bruno", body: "Seconded." },
  ]

  it("renders a line per previewed comment", () => {
    const markup = renderPostList([post({ commentCount: 2, comments: two })], "s")
    expect(markup.match(/class="ic-card__comment"/g)).toHaveLength(2)
    expect(markup).toContain("Try one click coarser.")
    expect(markup).toContain("Ana")
  })

  it("offers view-all only when there are more than it shows", () => {
    expect(
      renderPostList([post({ commentCount: 9, comments: two })], "s"),
    ).toContain("View all 9 comments")
    expect(
      renderPostList([post({ commentCount: 2, comments: two })], "s"),
    ).not.toContain("View all")
  })

  it("renders nothing at all when there are no comments", () => {
    expect(renderPostList([post({ commentCount: 0, comments: [] })], "s")).not.toContain(
      "ic-card__preview",
    )
    expect(renderPostList([post()], "s")).not.toContain("ic-card__preview")
  })

  it("escapes a hostile comment body and author", () => {
    const markup = renderPostList(
      [
        post({
          commentCount: 1,
          comments: [{ authorName: `" onload="x`, body: `<script>alert(1)</script>` }],
        }),
      ],
      "s",
    )
    expect(markup).not.toContain("<script>")
    expect(markup).not.toContain(`onload="x`)
  })

  it("falls back to Member for a missing comment author", () => {
    const markup = renderPostList(
      [post({ commentCount: 1, comments: [{ authorName: null, body: "hi" }] })],
      "s",
    )
    expect(markup).toContain("Member")
  })
})

describe("threadComments", () => {
  const c = (id: string, parentId: string | null = null, authorName = "Ana"): RenderableComment => ({
    id,
    body: `body ${id}`,
    authorName,
    createdAt: "2026-02-01",
    parentId,
  })

  it("keeps top-level comments in order, with no replies", () => {
    const threads = threadComments([c("a"), c("b")])
    expect(threads.map((t) => t.comment.id)).toEqual(["a", "b"])
    expect(threads.every((t) => t.replies.length === 0)).toBe(true)
  })

  it("hangs a reply off its parent instead of listing it as a comment", () => {
    const threads = threadComments([c("a"), c("a1", "a"), c("b")])
    expect(threads.map((t) => t.comment.id)).toEqual(["a", "b"])
    expect(threads[0].replies.map((r) => r.id)).toEqual(["a1"])
  })

  it("flattens a reply to a reply onto the same level", () => {
    // two display levels, never three: an indent per generation makes a
    // phone-width column unreadable by the third one
    const threads = threadComments([c("a"), c("a1", "a"), c("a1a", "a1")])
    expect(threads).toHaveLength(1)
    expect(threads[0].replies.map((r) => r.id)).toEqual(["a1", "a1a"])
  })

  it("names who a deep reply was aimed at, since the indent no longer says", () => {
    const threads = threadComments([c("a", null, "Ana"), c("a1", "a", "Bruno"), c("a1a", "a1", "Cara")])
    const [first, second] = threads[0].replies
    // a1 replies to the root, so naming it would be noise
    expect(first.replyingTo).toBeNull()
    expect(second.replyingTo).toBe("Bruno")
  })

  it("treats a reply whose parent is missing as a top-level comment", () => {
    // the parent may have been deleted, or simply not be on this page —
    // either way the reply must not disappear
    const threads = threadComments([c("orphan", "gone")])
    expect(threads.map((t) => t.comment.id)).toEqual(["orphan"])
    expect(threads[0].replies).toHaveLength(0)
  })

  it("does not hang on a comment that is its own parent", () => {
    const threads = threadComments([c("loop", "loop")])
    expect(threads.map((t) => t.comment.id)).toEqual(["loop"])
  })

  it("does not hang on a cycle between two comments", () => {
    const threads = threadComments([c("x", "y"), c("y", "x")])
    expect(threads.length).toBeGreaterThan(0)
  })

  it("handles an empty thread", () => {
    expect(threadComments([])).toEqual([])
  })
})

describe("replies in the post page", () => {
  const withReplies = () =>
    detail({
      comments: [
        { id: "c1", body: "top level", authorName: "Ana", createdAt: "2026-02-01" },
        { id: "c2", body: "a reply", authorName: "Bruno", createdAt: "2026-02-02", parentId: "c1" },
      ],
    })

  it("nests the reply rather than listing it alongside the comment", () => {
    const markup = renderPostDetail(withReplies(), true)
    expect(markup).toContain("ic-comment__children")
    expect(markup).toContain("ic-comment--reply")
  })

  it("offers a reply link per comment when the shopper can comment", () => {
    const markup = renderPostDetail(withReplies(), true)
    expect(markup).toContain("?reply=c1#ic-reply")
  })

  it("offers no reply link to a signed-out reader", () => {
    // the class name is in the stylesheet either way, so assert on the element
    expect(renderPostDetail(withReplies(), false)).not.toContain('<a class="ic-comment__reply"')
    expect(renderPostDetail(withReplies(), false)).not.toContain("?reply=")
  })

  it("opens the inline form under the comment named by the url", () => {
    const markup = renderPostDetail(withReplies(), true, null, "c1")
    expect(markup).toContain("ic-reply--inline")
    expect(markup).toContain('name="parentId" value="c1"')
  })

  it("renders only one comment form when a reply box is open", () => {
    // two would share the ic-reply id and the anchor would jump to whichever
    // came first. counting every <form> would also catch the like form, which
    // is a different thing entirely.
    const markup = renderPostDetail(withReplies(), true, null, "c1")
    expect(markup.match(/id="ic-reply"/g)).toHaveLength(1)
    expect(markup.match(/class="ic-reply[ "]/g)).toHaveLength(1)
  })

  it("falls back to the bottom form when the url names a comment that is gone", () => {
    const markup = renderPostDetail(withReplies(), true, null, "deleted")
    expect(markup).not.toContain('class="ic-reply ic-reply--inline"')
    expect(markup).toContain("Join the conversation")
  })

  it("carries no parentId on the bottom form", () => {
    expect(renderPostDetail(withReplies(), true)).not.toContain('name="parentId"')
  })

  it("escapes a hostile author name in the replying-to line", () => {
    const markup = renderPostDetail(
      detail({
        comments: [
          { id: "c1", body: "root", authorName: "Ana", createdAt: "2026-02-01" },
          {
            id: "c2",
            body: "mid",
            authorName: `" onload="alert(1)`,
            createdAt: "2026-02-02",
            parentId: "c1",
          },
          { id: "c3", body: "deep", authorName: "Cara", createdAt: "2026-02-03", parentId: "c2" },
        ],
      }),
      true,
    )
    expect(markup).not.toContain(`onload="alert`)
  })
})

describe("excerptOf", () => {
  it("leaves a short body alone, with no ellipsis", () => {
    expect(excerptOf("Short and sweet.")).toBe("Short and sweet.")
  })

  it("collapses newlines and runs of whitespace", () => {
    expect(excerptOf("one\n\n  two\t three")).toBe("one two three")
  })

  it("cuts on a word boundary and marks the cut", () => {
    const out = excerptOf("alpha bravo charlie delta echo foxtrot", 20)
    expect(out.endsWith("…")).toBe(true)
    // no severed word before the ellipsis
    expect(out.slice(0, -1).split(" ").pop()).toBe("charlie")
  })

  it("still cuts a body with no spaces in it", () => {
    const out = excerptOf("x".repeat(400), 50)
    expect(out).toHaveLength(51)
  })

  it("does not leave a space before the ellipsis", () => {
    expect(excerptOf("alpha bravo charlie delta", 12)).not.toContain(" …")
  })
})

function detail(overrides: Partial<RenderablePostDetail> = {}): RenderablePostDetail {
  return {
    id: "post_1",
    title: "Which grind for a V60?",
    body: "Going finer than table salt tastes bitter.",
    authorName: "Ana",
    categoryTitle: "Brewing",
    publishedAt: "2026-02-01",
    comments: [],
    ...overrides,
  }
}

describe("renderPostDetail", () => {
  it("renders the post body", () => {
    expect(renderPostDetail(detail(), false)).toContain("tastes bitter")
  })

  it("escapes a hostile body", () => {
    const markup = renderPostDetail(
      detail({ body: `<img src=x onerror=alert(1)>` }),
      false,
    )
    expect(markup).not.toContain("<img src=x")
    expect(markup).toContain("&lt;img")
  })

  it("escapes a hostile comment body", () => {
    const markup = renderPostDetail(
      detail({
        comments: [
          {
            id: "c1",
            body: `</p><script>alert(1)</script>`,
            authorName: "Bruno",
            createdAt: "2026-02-02",
          },
        ],
      }),
      false,
    )
    expect(markup).not.toContain("<script>")
  })

  it("shows the comment form only to a signed-in shopper", () => {
    expect(renderPostDetail(detail(), true)).toContain("<form")
    expect(renderPostDetail(detail(), false)).not.toContain("<form")
  })

  it("prompts an anonymous visitor to sign in", () => {
    expect(renderPostDetail(detail(), false)).toContain("Sign in")
  })

  it("posts the comment form back to the same proxy path", () => {
    expect(renderPostDetail(detail({ id: "xyz" }), true)).toContain(
      'action="/apps/forum/posts/xyz"',
    )
  })

  it("ships its own styles, since there is no shadow root on a full page", () => {
    const markup = renderPostDetail(detail(), false)
    expect(markup).toContain("<style>")
    expect(markup).toContain(".ic-post__title")
  })

  it("shows an error passed back by the post/redirect/get", () => {
    expect(renderPostDetail(detail(), true, "Comment must not be empty")).toContain(
      "Comment must not be empty",
    )
  })

  it("escapes an error message from the query string", () => {
    const markup = renderPostDetail(detail(), true, `<img src=x onerror=alert(1)>`)
    expect(markup).not.toContain("<img src=x")
  })

  it("omits the error element when there is no error", () => {
    // the class name is always present in the stylesheet, so assert on the
    // element rather than the substring
    expect(renderPostDetail(detail(), true)).not.toContain(`class="ic-error"`)
    expect(renderPostDetail(detail(), true, "boom")).toContain(`class="ic-error"`)
  })

  it("renders a resizable cdn image with a responsive srcset", () => {
    const markup = renderPostDetail(
      detail({
        images: [
          {
            url: "https://cdn.shopify.com/a.jpg",
            width: 1200,
            height: 800,
            alt: "A cup",
            resizable: true,
          },
        ],
      }),
      false,
    )
    expect(markup).toContain("srcset=")
    expect(markup).toContain("width=600")
    expect(markup).toContain('alt="A cup"')
    expect(markup).toContain('loading="lazy"')
    expect(markup).toContain('width="1200" height="800"')
  })

  it("appends the resize param correctly when the url already has a query", () => {
    const markup = renderPostDetail(
      detail({
        images: [
          {
            url: "https://cdn.shopify.com/a.jpg?v=2",
            width: null,
            height: null,
            alt: null,
            resizable: true,
          },
        ],
      }),
      false,
    )
    expect(markup).toContain("v=2&amp;width=1200")
  })

  it("emits no srcset for an image this app serves itself", () => {
    // /images/:id has no resizer, so three urls returning identical bytes
    // would just make the browser choose between them for nothing
    const markup = renderPostDetail(
      detail({
        images: [{ url: "https://app.example/images/abc", width: null, height: null, alt: null }],
      }),
      false,
    )
    expect(markup).not.toContain("srcset=")
    expect(markup).not.toContain("?width=")
    expect(markup).toContain('src="https://app.example/images/abc"')
  })

  it("claims no dimensions it does not know", () => {
    // a guessed width/height reserves the wrong shape and the page jumps
    const markup = renderPostDetail(
      detail({
        images: [{ url: "https://app.example/images/abc", width: null, height: null, alt: null }],
      }),
      false,
    )
    expect(markup).not.toContain('width="1200"')
    expect(markup).not.toContain('height="800"')
  })

  it("escapes a hostile alt attribute", () => {
    const markup = renderPostDetail(
      detail({
        images: [
          { url: "https://cdn.shopify.com/a.jpg", width: 1, height: 1, alt: `" onerror="alert(1)` },
        ],
      }),
      false,
    )
    expect(markup).not.toContain(`onerror="alert`)
  })

  it("renders no figure when there are no images", () => {
    // the class name is always in the stylesheet, so assert on the element
    expect(renderPostDetail(detail(), false)).not.toContain("<figure")
  })

  it("renders nothing for an image url that fails the safety check", () => {
    const markup = renderPostDetail(
      detail({ images: [{ url: "javascript:alert(1)", width: 1, height: 1, alt: "x" }] }),
      false,
    )
    expect(markup).not.toContain("<figure")
  })

  it("renders every comment", () => {
    const markup = renderPostDetail(
      detail({
        comments: [
          { id: "c1", body: "one", authorName: "A", createdAt: "2026-02-02" },
          { id: "c2", body: "two", authorName: "B", createdAt: "2026-02-03" },
        ],
      }),
      false,
    )
    expect(markup.match(/class="ic-comment"/g)).toHaveLength(2)
  })
})
