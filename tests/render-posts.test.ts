import { describe, expect, it } from "vitest"

import { renderPostList, type RenderablePost } from "../app/lib/render-posts"

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
