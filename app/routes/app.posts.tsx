import { Form, Link, useLoaderData, useNavigation, useSearchParams } from "react-router"
import { redirect } from "react-router"
import type { ActionFunctionArgs, LoaderFunctionArgs } from "react-router"

import { Badge, Card, EmptyState, PageHeader, formatDate } from "../components/ui"
import { deletePost, listCategories, listPosts, requireShop } from "../lib/forum.server"
import { authenticate } from "../shopify.server"

const PAGE_SIZE = 25

export async function loader({ request }: LoaderFunctionArgs) {
  const { session } = await authenticate.admin(request)
  const shop = await requireShop(session.shop)

  const url = new URL(request.url)
  const search = url.searchParams.get("q")?.trim() || undefined
  const categoryId = url.searchParams.get("category") || undefined
  const page = Math.max(1, Number(url.searchParams.get("page") ?? 1) || 1)

  const [{ items, total }, categories] = await Promise.all([
    listPosts(shop.id, { search, categoryId, take: PAGE_SIZE, skip: (page - 1) * PAGE_SIZE }),
    listCategories(shop.id),
  ])

  return {
    timezone: shop.timezone,
    page,
    pageCount: Math.max(1, Math.ceil(total / PAGE_SIZE)),
    total,
    categories: categories.map((c) => ({ id: c.id, title: c.title })),
    posts: items.map((post) => ({
      id: post.id,
      title: post.title,
      category: post.category.title,
      isPrivate: post.category.isPrivate,
      author: post.author?.displayName ?? "Member",
      source: post.source,
      comments: post._count.comments,
      publishedAt: post.publishedAt.toISOString(),
    })),
  }
}

export async function action({ request }: ActionFunctionArgs) {
  const { session } = await authenticate.admin(request)
  const shop = await requireShop(session.shop)

  const formData = await request.formData()
  if (formData.get("intent") === "delete") {
    await deletePost(shop.id, String(formData.get("id") ?? ""))
  }

  // keep the filters the user was looking at
  const redirectTo = String(formData.get("redirectTo") || "/app/posts")
  return redirect(redirectTo)
}

export default function Posts() {
  const { posts, categories, timezone, page, pageCount, total } = useLoaderData<typeof loader>()
  const [searchParams] = useSearchParams()
  const navigation = useNavigation()
  const busy = navigation.state !== "idle"

  const currentQuery = searchParams.get("q") ?? ""
  const currentCategory = searchParams.get("category") ?? ""
  const redirectTo = `/app/posts?${searchParams.toString()}`

  return (
    <div className="page">
      <PageHeader
        title="Posts"
        subtitle={`${total} post${total === 1 ? "" : "s"}`}
        action={
          <Link to="/app/posts/new" className="btn btn--primary">
            New post
          </Link>
        }
      />

      <Card>
        <Form method="get" className="inline">
          <input
            type="text"
            name="q"
            placeholder="Search titles and bodies"
            defaultValue={currentQuery}
            style={{ maxWidth: 280 }}
          />
          <select name="category" defaultValue={currentCategory} style={{ maxWidth: 200 }}>
            <option value="">All categories</option>
            {categories.map((category) => (
              <option key={category.id} value={category.id}>
                {category.title}
              </option>
            ))}
          </select>
          <button type="submit" className="btn" disabled={busy}>
            Filter
          </button>
          {currentQuery || currentCategory ? (
            <Link to="/app/posts" className="btn-link">
              Clear
            </Link>
          ) : null}
        </Form>
      </Card>

      <Card title="All posts" flush>
        {posts.length === 0 ? (
          <EmptyState
            title={currentQuery || currentCategory ? "No posts match" : "No posts yet"}
            action={
              <Link to="/app/posts/new" className="btn btn--primary">
                New post
              </Link>
            }
          >
            {currentQuery || currentCategory
              ? "Try a different search or category."
              : "Posts written here and from the storefront both appear in this list."}
          </EmptyState>
        ) : (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Title</th>
                  <th>Category</th>
                  <th>Author</th>
                  <th>Source</th>
                  <th>Comments</th>
                  <th>Published</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {posts.map((post) => (
                  <tr key={post.id}>
                    <td>
                      <Link to={`/app/posts/${post.id}`} className="cell-title">
                        {post.title}
                      </Link>
                    </td>
                    <td>
                      <span className="cell-muted">{post.category}</span>{" "}
                      {post.isPrivate ? <Badge tone="warning">Private</Badge> : null}
                    </td>
                    <td className="cell-muted">{post.author}</td>
                    <td>
                      <Badge tone="neutral">{post.source}</Badge>
                    </td>
                    <td className="cell-muted">{post.comments}</td>
                    <td className="cell-muted">{formatDate(post.publishedAt, timezone)}</td>
                    <td className="actions">
                      <Form
                        method="post"
                        style={{ display: "inline" }}
                        onSubmit={(event) => {
                          if (!confirm(`Delete "${post.title}"? This cannot be undone.`)) {
                            event.preventDefault()
                          }
                        }}
                      >
                        <input type="hidden" name="intent" value="delete" />
                        <input type="hidden" name="id" value={post.id} />
                        <input type="hidden" name="redirectTo" value={redirectTo} />
                        <button type="submit" className="btn btn--sm btn--danger" disabled={busy}>
                          Delete
                        </button>
                      </Form>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      {pageCount > 1 ? (
        <div className="inline" style={{ marginTop: 16, justifyContent: "center" }}>
          <PageLink page={page - 1} disabled={page <= 1} params={searchParams}>
            Previous
          </PageLink>
          <span className="cell-muted">
            Page {page} of {pageCount}
          </span>
          <PageLink page={page + 1} disabled={page >= pageCount} params={searchParams}>
            Next
          </PageLink>
        </div>
      ) : null}
    </div>
  )
}

function PageLink({
  page,
  disabled,
  params,
  children,
}: {
  page: number
  disabled: boolean
  params: URLSearchParams
  children: string
}) {
  if (disabled) {
    return (
      <span className="btn btn--sm" aria-disabled="true" style={{ opacity: 0.5 }}>
        {children}
      </span>
    )
  }
  const next = new URLSearchParams(params)
  next.set("page", String(page))
  return (
    <Link to={`/app/posts?${next.toString()}`} className="btn btn--sm">
      {children}
    </Link>
  )
}
