// Every comment on the forum, newest first.
//
// Comment moderation already existed on the post page, but only there — which
// works when you already know which post the problem is on. This is the view
// for the question a merchant actually has: what has just been said anywhere
// on my community.

import { Form, Link, useLoaderData, useNavigation, useSearchParams } from "react-router"
import { redirect } from "react-router"
import type { ActionFunctionArgs, LoaderFunctionArgs } from "react-router"

import { Badge, Card, EmptyState, PageHeader, formatDate } from "../components/ui"
import { deleteComment, listComments, requireShop } from "../lib/forum.server"
import { authenticate } from "../shopify.server"

const PAGE_SIZE = 25

export async function loader({ request }: LoaderFunctionArgs) {
  const { session } = await authenticate.admin(request)
  const shop = await requireShop(session.shop)

  const url = new URL(request.url)
  const search = url.searchParams.get("q")?.trim() || undefined
  const postId = url.searchParams.get("post") || undefined
  const page = Math.max(1, Number(url.searchParams.get("page") ?? 1) || 1)

  const { items, total } = await listComments(shop.id, {
    search,
    postId,
    take: PAGE_SIZE,
    skip: (page - 1) * PAGE_SIZE,
  })

  return {
    timezone: shop.timezone,
    page,
    pageCount: Math.max(1, Math.ceil(total / PAGE_SIZE)),
    total,
    comments: items.map((comment) => ({
      id: comment.id,
      body: comment.body,
      authorId: comment.authorId,
      author: comment.author?.displayName ?? "Member",
      anonymised: comment.author?.anonymisedAt != null,
      isReply: comment.parentId !== null,
      postId: comment.post.id,
      postTitle: comment.post.title,
      createdAt: comment.createdAt.toISOString(),
    })),
  }
}

export async function action({ request }: ActionFunctionArgs) {
  const { session } = await authenticate.admin(request)
  const shop = await requireShop(session.shop)

  const formData = await request.formData()
  if (formData.get("intent") === "delete") {
    // scoped on shopId — a guessed id from another shop deletes nothing
    await deleteComment(shop.id, String(formData.get("id") ?? ""))
  }

  return redirect(String(formData.get("redirectTo") || "/app/comments"))
}

export default function Comments() {
  const { comments, timezone, page, pageCount, total } = useLoaderData<typeof loader>()
  const [searchParams] = useSearchParams()
  const navigation = useNavigation()
  const busy = navigation.state !== "idle"

  const currentQuery = searchParams.get("q") ?? ""
  const currentPost = searchParams.get("post") ?? ""
  const filtered = Boolean(currentQuery || currentPost)
  const redirectTo = `/app/comments?${searchParams.toString()}`

  return (
    <div className="page">
      <PageHeader title="Comments" subtitle={`${total} comment${total === 1 ? "" : "s"}`} />

      <Card>
        <Form method="get" className="inline">
          <input
            type="text"
            name="q"
            placeholder="Search comment text"
            defaultValue={currentQuery}
            style={{ maxWidth: 320 }}
          />
          {/* carried through so "comments on this post" keeps its filter when
              the merchant searches within it */}
          {currentPost ? <input type="hidden" name="post" value={currentPost} /> : null}
          <button type="submit" className="btn" disabled={busy}>
            Search
          </button>
          {filtered ? (
            <Link to="/app/comments" className="btn-link">
              Clear
            </Link>
          ) : null}
        </Form>
      </Card>

      <Card title="Newest first" flush>
        {comments.length === 0 ? (
          <EmptyState title={filtered ? "No comments match" : "No comments yet"}>
            {filtered
              ? "Try a different search."
              : "Comments left by shoppers on the storefront appear here."}
          </EmptyState>
        ) : (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Comment</th>
                  <th>Author</th>
                  <th>On</th>
                  <th>Posted</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {comments.map((comment) => (
                  <tr key={comment.id}>
                    <td>
                      {comment.body}{" "}
                      {comment.isReply ? <Badge tone="neutral">Reply</Badge> : null}
                    </td>
                    <td>
                      {comment.authorId ? (
                        <Link to={`/app/members/${comment.authorId}`} className="cell-title">
                          {comment.author}
                        </Link>
                      ) : (
                        <span className="cell-muted">{comment.author}</span>
                      )}{" "}
                      {comment.anonymised ? <Badge tone="neutral">Redacted</Badge> : null}
                    </td>
                    <td>
                      <Link to={`/app/posts/${comment.postId}`} className="cell-title">
                        {comment.postTitle}
                      </Link>
                    </td>
                    <td className="cell-muted">{formatDate(comment.createdAt, timezone)}</td>
                    <td className="actions">
                      <Form
                        method="post"
                        style={{ display: "inline" }}
                        onSubmit={(event) => {
                          if (!confirm("Delete this comment? This cannot be undone.")) {
                            event.preventDefault()
                          }
                        }}
                      >
                        <input type="hidden" name="intent" value="delete" />
                        <input type="hidden" name="id" value={comment.id} />
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
    <Link to={`/app/comments?${next.toString()}`} className="btn btn--sm">
      {children}
    </Link>
  )
}
