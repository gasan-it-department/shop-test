import { describe, expect, it } from "vitest"

import {
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
  it("renders one list item per post", () => {
    const markup = renderPostList([post({ id: "a" }), post({ id: "b" })], "shop.myshopify.com")
    expect(markup.match(/class="ic-post"/g)).toHaveLength(2)
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
