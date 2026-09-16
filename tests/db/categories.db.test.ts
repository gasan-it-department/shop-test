// integration tests against a real postgres. these drive the route actions
// exactly as react router does, so a failure here is the failure the admin
// shows — no guessing from a status code.
//
//   npm run db:local        # embedded postgres on 5433, no docker needed
//   DATABASE_URL="postgresql://postgres:postgres@127.0.0.1:5433/postgres?pgbouncer=true&connection_limit=1"
//   SHOPPER_HASH_SECRET=test-secret
//   npm run test:db
//
// pgbouncer=true is required against the embedded server: it keeps one
// session, so prisma's prepared statements collide on reconnect.
//
// two tests fail against the embedded server and pass against a real one —
// it does not round-trip a unique-constraint error over the wire protocol
// ("unexpected message from server"), which wedges the connection for the
// test after it. run these against the Railway database before trusting the
// duplicate-handle path.

import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest"

const SHOP = "integration-test.myshopify.com"

vi.mock("../../app/shopify.server", () => ({
  authenticate: {
    admin: vi.fn(async () => ({
      session: { shop: SHOP },
      admin: {
        graphql: vi.fn(async () => {
          throw new Response(null, { status: 403 })
        }),
      },
      billing: {},
    })),
  },
  appUrl: "https://example.test",
}))

const { default: prisma } = await import("../../app/db.server")
const categories = await import("../../app/routes/app.categories")
const categoryDetail = await import("../../app/routes/app.categories.$id")
const posts = await import("../../app/routes/app.posts")
const postNew = await import("../../app/routes/app.posts.new")
const postDetail = await import("../../app/routes/app.posts.$id")

type Args = Parameters<typeof categories.action>[0]

function postRequest(url: string, fields: Record<string, string>) {
  const body = new FormData()
  for (const [k, v] of Object.entries(fields)) body.append(k, v)
  return new Request(`http://localhost${url}`, { method: "POST", body })
}

function args(request: Request, params: Record<string, string> = {}): Args {
  return { request, params, context: {} } as unknown as Args
}

async function cleanShop() {
  const shop = await prisma.shop.findUnique({ where: { domain: SHOP } })
  if (shop) await prisma.shop.delete({ where: { id: shop.id } })
}

beforeAll(cleanShop)
afterAll(async () => {
  await cleanShop()
  await prisma.$disconnect()
})
beforeEach(cleanShop)

describe("categories action", () => {
  it("creates a category and redirects", async () => {
    const response = await categories.action(
      args(postRequest("/app/categories", { title: "Brewing", handle: "brewing" })),
    )

    expect(response).toBeInstanceOf(Response)
    expect((response as Response).status).toBe(302)

    const row = await prisma.category.findFirst({ where: { handle: "brewing" } })
    expect(row?.title).toBe("Brewing")
    expect(row?.isPrivate).toBe(false)
  })

  it("derives the handle from the title when left blank", async () => {
    await categories.action(
      args(postRequest("/app/categories", { title: "Gear & Kit", handle: "" })),
    )
    expect(await prisma.category.findFirst({ where: { handle: "gear-kit" } })).toBeTruthy()
  })

  it("stores isPrivate when the checkbox is ticked", async () => {
    await categories.action(
      args(postRequest("/app/categories", { title: "VIP", handle: "vip", isPrivate: "true" })),
    )
    const row = await prisma.category.findFirst({ where: { handle: "vip" } })
    expect(row?.isPrivate).toBe(true)
  })

  it("returns field errors rather than throwing on invalid input", async () => {
    const result = await categories.action(
      args(postRequest("/app/categories", { title: "x", handle: "Bad Handle" })),
    )
    // data() returns a plain object with the payload, not a Response
    expect(result).not.toBeInstanceOf(Response)
    expect(JSON.stringify(result)).toContain("handle")
  })

  it("rejects a duplicate handle with a field error, not a 500", async () => {
    await categories.action(args(postRequest("/app/categories", { title: "Gear", handle: "gear" })))
    const result = await categories.action(
      args(postRequest("/app/categories", { title: "Gear again", handle: "gear" })),
    )
    expect(JSON.stringify(result)).toContain("already exists")
  })

  it("deletes a category", async () => {
    await categories.action(args(postRequest("/app/categories", { title: "Temp", handle: "temp" })))
    const row = await prisma.category.findFirstOrThrow({ where: { handle: "temp" } })

    await categories.action(
      args(postRequest("/app/categories", { intent: "delete", id: row.id })),
    )
    expect(await prisma.category.findUnique({ where: { id: row.id } })).toBeNull()
  })
})

describe("categories loader", () => {
  it("returns the shop's categories with post counts", async () => {
    await categories.action(args(postRequest("/app/categories", { title: "Gear", handle: "gear" })))
    const result = await categories.loader(
      args(new Request("http://localhost/app/categories")),
    )
    expect(result.categories).toHaveLength(1)
    expect(result.categories[0]).toMatchObject({ handle: "gear", postCount: 0 })
  })
})

describe("posts", () => {
  async function seedCategory() {
    await categories.action(
      args(postRequest("/app/categories", { title: "Brewing", handle: "brewing" })),
    )
    return prisma.category.findFirstOrThrow({ where: { handle: "brewing" } })
  }

  it("creates a post and redirects to it", async () => {
    const category = await seedCategory()
    const response = await postNew.action(
      args(
        postRequest("/app/posts/new", {
          title: "Which grind for a V60?",
          body: "Finer than salt tastes bitter.",
          categoryId: category.id,
        }),
      ),
    )
    expect((response as Response).status).toBe(302)
    expect(await prisma.post.count()).toBe(1)
  })

  it("refuses a category belonging to another shop", async () => {
    const other = await prisma.shop.create({ data: { domain: "other.myshopify.com" } })
    const foreign = await prisma.category.create({
      data: { shopId: other.id, title: "Theirs", handle: "theirs" },
    })

    const result = await postNew.action(
      args(
        postRequest("/app/posts/new", {
          title: "Cross tenant",
          body: "should not work",
          categoryId: foreign.id,
        }),
      ),
    )

    expect(JSON.stringify(result)).toContain("Unknown category")
    expect(await prisma.post.count({ where: { shopId: other.id } })).toBe(0)
    await prisma.shop.delete({ where: { id: other.id } })
  })

  it("edits a post", async () => {
    const category = await seedCategory()
    await postNew.action(
      args(
        postRequest("/app/posts/new", {
          title: "Original",
          body: "body",
          categoryId: category.id,
        }),
      ),
    )
    const post = await prisma.post.findFirstOrThrow()

    await postDetail.action(
      args(
        postRequest(`/app/posts/${post.id}`, {
          title: "Edited title",
          body: "new body",
          categoryId: category.id,
        }),
        { id: post.id },
      ),
    )

    const updated = await prisma.post.findUniqueOrThrow({ where: { id: post.id } })
    expect(updated.title).toBe("Edited title")
  })

  it("adds and deletes a comment", async () => {
    const category = await seedCategory()
    await postNew.action(
      args(postRequest("/app/posts/new", { title: "Thread", body: "b", categoryId: category.id })),
    )
    const post = await prisma.post.findFirstOrThrow()

    await postDetail.action(
      args(
        postRequest(`/app/posts/${post.id}`, { intent: "add-comment", body: "A reply" }),
        { id: post.id },
      ),
    )
    const comment = await prisma.comment.findFirstOrThrow()
    expect(comment.body).toBe("A reply")

    await postDetail.action(
      args(
        postRequest(`/app/posts/${post.id}`, {
          intent: "delete-comment",
          commentId: comment.id,
        }),
        { id: post.id },
      ),
    )
    expect(await prisma.comment.count()).toBe(0)
  })

  it("deletes a post and its comments", async () => {
    const category = await seedCategory()
    await postNew.action(
      args(postRequest("/app/posts/new", { title: "Doomed", body: "b", categoryId: category.id })),
    )
    const post = await prisma.post.findFirstOrThrow()

    await postDetail.action(
      args(postRequest(`/app/posts/${post.id}`, { intent: "add-comment", body: "hi" }), {
        id: post.id,
      }),
    )
    await postDetail.action(
      args(postRequest(`/app/posts/${post.id}`, { intent: "delete-post" }), { id: post.id }),
    )

    expect(await prisma.post.count()).toBe(0)
    expect(await prisma.comment.count()).toBe(0)
  })

  it("lists and filters posts", async () => {
    const category = await seedCategory()
    for (const title of ["Grind size", "Water hardness", "Gear advice"]) {
      await postNew.action(
        args(postRequest("/app/posts/new", { title, body: "b", categoryId: category.id })),
      )
    }

    const all = await posts.loader(args(new Request("http://localhost/app/posts")))
    expect(all.total).toBe(3)

    const filtered = await posts.loader(
      args(new Request("http://localhost/app/posts?q=water")),
    )
    expect(filtered.total).toBe(1)
    expect(filtered.posts[0].title).toBe("Water hardness")
  })
})

describe("category detail", () => {
  it("404s for a category from another shop", async () => {
    const other = await prisma.shop.create({ data: { domain: "other2.myshopify.com" } })
    const foreign = await prisma.category.create({
      data: { shopId: other.id, title: "Theirs", handle: "theirs" },
    })

    await expect(
      categoryDetail.loader(
        args(new Request("http://localhost/app/categories/x"), { id: foreign.id }),
      ),
    ).rejects.toBeInstanceOf(Response)

    await prisma.shop.delete({ where: { id: other.id } })
  })
})
