import { describe, expect, it, vi } from "vitest"

import {
  ImageUploadError,
  MAX_IMAGE_BYTES,
  uploadImageToShopify,
  validateImage,
  type GraphqlFn,
} from "../app/lib/shopify-files.server"

const noSleep = async () => {}

function file(name = "photo.jpg", type = "image/jpeg", bytes = 1024): File {
  return new File([new Uint8Array(bytes)], name, { type })
}

/** a fake admin.graphql that answers each mutation in turn */
function fakeGraphql(responses: unknown[]): GraphqlFn & { calls: string[] } {
  let i = 0
  const calls: string[] = []
  const fn = (async (query: string) => {
    calls.push(query)
    const body = responses[Math.min(i, responses.length - 1)]
    i++
    return Response.json(body)
  }) as GraphqlFn & { calls: string[] }
  fn.calls = calls
  return fn
}

const stagedOk = {
  data: {
    stagedUploadsCreate: {
      stagedTargets: [
        {
          url: "https://storage.example/upload",
          resourceUrl: "https://storage.example/resource/abc",
          parameters: [
            { name: "key", value: "tmp/abc" },
            { name: "policy", value: "signed-policy" },
          ],
        },
      ],
      userErrors: [],
    },
  },
}

const createReady = {
  data: {
    fileCreate: {
      files: [
        {
          id: "gid://shopify/MediaImage/1",
          fileStatus: "READY",
          alt: "A photo",
          image: { url: "https://cdn.shopify.com/x.jpg", width: 1200, height: 800 },
        },
      ],
      userErrors: [],
    },
  },
}

describe("validateImage", () => {
  it("accepts a normal jpeg", () => {
    expect(validateImage({ size: 1024, type: "image/jpeg", name: "a.jpg" })).toBeNull()
  })

  it.each(["image/png", "image/webp", "image/gif"])("accepts %s", (type) => {
    expect(validateImage({ size: 1024, type, name: "a" })).toBeNull()
  })

  it("rejects an empty file", () => {
    expect(validateImage({ size: 0, type: "image/jpeg", name: "a.jpg" })).toMatch(/empty/i)
  })

  it("rejects anything over the size cap", () => {
    expect(
      validateImage({ size: MAX_IMAGE_BYTES + 1, type: "image/jpeg", name: "a.jpg" }),
    ).toMatch(/5MB or smaller/)
  })

  it("accepts a file exactly at the cap", () => {
    expect(validateImage({ size: MAX_IMAGE_BYTES, type: "image/png", name: "a.png" })).toBeNull()
  })

  it.each(["application/pdf", "text/html", "image/svg+xml", ""])(
    "rejects %j — svg in particular can carry script",
    (type) => {
      expect(validateImage({ size: 1024, type, name: "x" })).toMatch(/only jpeg/i)
    },
  )
})

describe("uploadImageToShopify", () => {
  it("returns the cdn url when the file is ready immediately", async () => {
    const graphql = fakeGraphql([stagedOk, createReady])
    const fetchImpl = vi.fn().mockResolvedValue(new Response(null, { status: 201 }))

    const result = await uploadImageToShopify(graphql, file(), "A photo", {
      fetchImpl: fetchImpl as never,
      sleep: noSleep,
    })

    expect(result).toEqual({
      url: "https://cdn.shopify.com/x.jpg",
      width: 1200,
      height: 800,
      alt: "A photo",
    })
  })

  it("sends the signed parameters BEFORE the file field", async () => {
    // the storage backend validates the signature against field order; putting
    // the file first fails with an opaque 403
    const graphql = fakeGraphql([stagedOk, createReady])
    const fetchImpl = vi.fn().mockResolvedValue(new Response(null, { status: 201 }))

    await uploadImageToShopify(graphql, file(), "alt", {
      fetchImpl: fetchImpl as never,
      sleep: noSleep,
    })

    const body = (fetchImpl.mock.calls[0][1] as RequestInit).body as FormData
    const keys = [...body.keys()]
    expect(keys).toEqual(["key", "policy", "file"])
    expect(keys.indexOf("file")).toBe(keys.length - 1)
  })

  it("posts to the url shopify returned", async () => {
    const graphql = fakeGraphql([stagedOk, createReady])
    const fetchImpl = vi.fn().mockResolvedValue(new Response(null, { status: 201 }))

    await uploadImageToShopify(graphql, file(), "alt", {
      fetchImpl: fetchImpl as never,
      sleep: noSleep,
    })

    expect(fetchImpl.mock.calls[0][0]).toBe("https://storage.example/upload")
    expect((fetchImpl.mock.calls[0][1] as RequestInit).method).toBe("POST")
  })

  it("polls until the file is READY, because fileCreate returns before processing", async () => {
    const processing = {
      data: {
        fileCreate: {
          files: [{ id: "gid://shopify/MediaImage/1", fileStatus: "UPLOADED", alt: null }],
          userErrors: [],
        },
      },
    }
    const pollProcessing = { data: { node: { fileStatus: "PROCESSING", alt: null } } }
    const pollReady = {
      data: {
        node: {
          fileStatus: "READY",
          alt: "alt",
          image: { url: "https://cdn.shopify.com/y.jpg", width: 800, height: 600 },
        },
      },
    }

    const graphql = fakeGraphql([stagedOk, processing, pollProcessing, pollReady])
    const fetchImpl = vi.fn().mockResolvedValue(new Response(null, { status: 201 }))

    const result = await uploadImageToShopify(graphql, file(), "alt", {
      fetchImpl: fetchImpl as never,
      sleep: noSleep,
    })

    expect(result.url).toBe("https://cdn.shopify.com/y.jpg")
  })

  it("throws when shopify reports the file FAILED", async () => {
    const processing = {
      data: {
        fileCreate: {
          files: [{ id: "gid://1", fileStatus: "UPLOADED", alt: null }],
          userErrors: [],
        },
      },
    }
    const graphql = fakeGraphql([stagedOk, processing, { data: { node: { fileStatus: "FAILED" } } }])
    const fetchImpl = vi.fn().mockResolvedValue(new Response(null, { status: 201 }))

    await expect(
      uploadImageToShopify(graphql, file(), "alt", {
        fetchImpl: fetchImpl as never,
        sleep: noSleep,
      }),
    ).rejects.toBeInstanceOf(ImageUploadError)
  })

  it("gives up rather than polling forever", async () => {
    const processing = {
      data: {
        fileCreate: {
          files: [{ id: "gid://1", fileStatus: "UPLOADED", alt: null }],
          userErrors: [],
        },
      },
    }
    const graphql = fakeGraphql([stagedOk, processing, { data: { node: { fileStatus: "PROCESSING" } } }])
    const fetchImpl = vi.fn().mockResolvedValue(new Response(null, { status: 201 }))

    await expect(
      uploadImageToShopify(graphql, file(), "alt", {
        fetchImpl: fetchImpl as never,
        sleep: noSleep,
        pollAttempts: 3,
      }),
    ).rejects.toThrow(/Timed out/)
  })

  it("surfaces a staged upload userError", async () => {
    const graphql = fakeGraphql([
      {
        data: {
          stagedUploadsCreate: {
            stagedTargets: [],
            userErrors: [{ message: "File size exceeds limit" }],
          },
        },
      },
    ])

    await expect(
      uploadImageToShopify(graphql, file(), "alt", { sleep: noSleep }),
    ).rejects.toThrow(/File size exceeds limit/)
  })

  it("throws when the bytes upload is rejected", async () => {
    const graphql = fakeGraphql([stagedOk, createReady])
    const fetchImpl = vi.fn().mockResolvedValue(new Response(null, { status: 403 }))

    await expect(
      uploadImageToShopify(graphql, file(), "alt", {
        fetchImpl: fetchImpl as never,
        sleep: noSleep,
      }),
    ).rejects.toThrow(/403/)
  })

  it("throws when the graphql call itself fails", async () => {
    const graphql = fakeGraphql([{ errors: [{ message: "Access denied for fileCreate" }] }])

    await expect(
      uploadImageToShopify(graphql, file(), "alt", { sleep: noSleep }),
    ).rejects.toThrow(/Access denied/)
  })
})
