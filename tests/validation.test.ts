import { describe, expect, it } from "vitest"

import {
  categorySchema,
  commentSchema,
  parseForm,
  postSchema,
  slugify,
} from "../app/lib/validation"

function form(fields: Record<string, string>): FormData {
  const data = new FormData()
  for (const [key, value] of Object.entries(fields)) data.append(key, value)
  return data
}

describe("categorySchema", () => {
  it("accepts a valid category", () => {
    const result = parseForm(categorySchema, form({ title: "Brewing", handle: "brewing" }))
    expect(result).toEqual({
      ok: true,
      data: { title: "Brewing", handle: "brewing", isPrivate: false, position: 0 },
    })
  })

  it("trims the title before checking length", () => {
    const result = parseForm(categorySchema, form({ title: "  Gear  ", handle: "gear" }))
    expect(result.ok && result.data.title).toBe("Gear")
  })

  it("rejects a title that is only whitespace", () => {
    const result = parseForm(categorySchema, form({ title: "   ", handle: "gear" }))
    expect(result.ok).toBe(false)
  })

  it("lowercases the handle", () => {
    const result = parseForm(categorySchema, form({ title: "Gear", handle: "GEAR" }))
    expect(result.ok && result.data.handle).toBe("gear")
  })

  it.each(["has space", "Trailing-", "-leading", "double--hyphen", "sym!bol", "a"])(
    "rejects handle %j",
    (handle) => {
      const result = parseForm(categorySchema, form({ title: "Gear", handle }))
      expect(result.ok).toBe(false)
      expect(result.ok === false && result.errors.handle).toBeTruthy()
    },
  )

  it("treats an unticked checkbox as false", () => {
    // unticked checkboxes are absent from FormData entirely
    const result = parseForm(categorySchema, form({ title: "Gear", handle: "gear" }))
    expect(result.ok && result.data.isPrivate).toBe(false)
  })

  it("treats a ticked checkbox as true", () => {
    const result = parseForm(
      categorySchema,
      form({ title: "Gear", handle: "gear", isPrivate: "true" }),
    )
    expect(result.ok && result.data.isPrivate).toBe(true)
  })

  it("coerces position to a number", () => {
    const result = parseForm(
      categorySchema,
      form({ title: "Gear", handle: "gear", position: "3" }),
    )
    expect(result.ok && result.data.position).toBe(3)
  })
})

describe("postSchema", () => {
  it("accepts a valid post", () => {
    const result = parseForm(
      postSchema,
      form({ title: "V60 grind", body: "Going finer tastes bitter.", categoryId: "cat_1" }),
    )
    expect(result.ok).toBe(true)
  })

  it("rejects a title under 3 characters", () => {
    const result = parseForm(postSchema, form({ title: "ab", body: "x", categoryId: "c" }))
    expect(result.ok === false && result.errors.title).toBeTruthy()
  })

  it("rejects a body over the limit", () => {
    const result = parseForm(
      postSchema,
      form({ title: "Fine", body: "x".repeat(10_001), categoryId: "c" }),
    )
    expect(result.ok === false && result.errors.body).toBeTruthy()
  })

  it("requires a category", () => {
    const result = parseForm(postSchema, form({ title: "Fine", body: "x" }))
    expect(result.ok === false && result.errors.categoryId).toBeTruthy()
  })

  it("keeps hostile markup intact — escaping is a render concern, not a write one", () => {
    const payload = `</h3><script>alert(1)</script>`
    const result = parseForm(
      postSchema,
      form({ title: payload, body: payload, categoryId: "c" }),
    )
    expect(result.ok && result.data.body).toBe(payload)
  })

  it("reports one error per field, not a list", () => {
    const result = parseForm(postSchema, form({ title: "", body: "", categoryId: "" }))
    expect(result.ok).toBe(false)
    if (!result.ok) {
      for (const message of Object.values(result.errors)) {
        expect(typeof message).toBe("string")
      }
    }
  })
})

describe("commentSchema", () => {
  it("accepts a comment", () => {
    expect(parseForm(commentSchema, form({ body: "Try one notch coarser." })).ok).toBe(true)
  })

  it("rejects an empty comment", () => {
    expect(parseForm(commentSchema, form({ body: "   " })).ok).toBe(false)
  })

  it("carries an optional parentId through", () => {
    const result = parseForm(commentSchema, form({ body: "Agreed", parentId: "cmt_1" }))
    expect(result.ok && result.data.parentId).toBe("cmt_1")
  })
})

describe("slugify", () => {
  it.each([
    ["Brewing", "brewing"],
    ["VIP Lounge", "vip-lounge"],
    ["  Gear & Kit  ", "gear-kit"],
    ["Café Crème", "cafe-creme"],
    ["!!!", ""],
  ])("%j -> %j", (input, expected) => {
    expect(slugify(input)).toBe(expected)
  })

  it("caps the length at the handle limit", () => {
    expect(slugify("a".repeat(200))).toHaveLength(60)
  })

  it("produces handles the schema accepts", () => {
    const result = parseForm(
      categorySchema,
      form({ title: "Gear & Kit", handle: slugify("Gear & Kit") }),
    )
    expect(result.ok).toBe(true)
  })
})
