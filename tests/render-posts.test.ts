import { describe, expect, it } from "vitest"

import {
  excerptOf,
  renderPostDetail,
  renderPostList,
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
