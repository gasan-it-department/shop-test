// One member: who they are to this shop, and what they have actually written.
//
// The list page answers "who is here". This answers "what has this person
// done", which is the question a merchant is really asking before they
// moderate someone.

import { Form, Link, useLoaderData, useNavigation } from "react-router"
import { redirect } from "react-router"
import type { ActionFunctionArgs, LoaderFunctionArgs } from "react-router"

import { Badge, Banner, Card, EmptyState, PageHeader, formatDate } from "../components/ui"
import {
  anonymiseMemberById,
  deleteComment,
  deletePost,
  getMember,
  requireShop,
} from "../lib/forum.server"
import { authenticate } from "../shopify.server"

export async function loader({ request, params }: LoaderFunctionArgs) {
  const { session } = await authenticate.admin(request)
  const shop = await requireShop(session.shop)

  const member = await getMember(shop.id, params.id ?? "")
  // scoped by shopId inside getMember, so a guessed id from another shop is a
  // 404 here rather than someone else's member
  if (!member) throw new Response("Not found", { status: 404 })

  return {
    timezone: shop.timezone,
    member: {
      id: member.id,
      displayName: member.displayName,
      hashPreview: member.shopperHash.slice(0, 12),
      anonymised: member.anonymisedAt !== null,
      anonymisedAt: member.anonymisedAt?.toISOString() ?? null,
      createdAt: member.createdAt.toISOString(),
      counts: {
        posts: member._count.posts,
        comments: member._count.comments,
        likes: member._count.reactions,
      },
      posts: member.posts.map((post) => ({
        id: post.id,
        title: post.title,
        category: post.category.title,
        comments: post._count.comments,
        publishedAt: post.publishedAt.toISOString(),
      })),
      comments: member.comments.map((comment) => ({
        id: comment.id,
        body: comment.body,
        postId: comment.post.id,
        postTitle: comment.post.title,
        createdAt: comment.createdAt.toISOString(),
      })),
    },
  }
}

export async function action({ request, params }: ActionFunctionArgs) {
  const { session } = await authenticate.admin(request)
  const shop = await requireShop(session.shop)
  const memberId = params.id ?? ""

  const formData = await request.formData()
  const intent = formData.get("intent")

  if (intent === "anonymise") {
    await anonymiseMemberById(shop.id, memberId)
  } else if (intent === "delete-post") {
    // deletePost filters on shopId, so a post id from another shop deletes
    // nothing rather than throwing
    await deletePost(shop.id, String(formData.get("id") ?? ""))
  } else if (intent === "delete-comment") {
    await deleteComment(shop.id, String(formData.get("id") ?? ""))
  }

  return redirect(`/app/members/${memberId}`)
}

export default function MemberDetail() {
  const { member, timezone } = useLoaderData<typeof loader>()
  const navigation = useNavigation()
  const busy = navigation.state !== "idle"

  return (
    <div className="page">
      <PageHeader
        title={member.displayName}
        subtitle={`Joined ${formatDate(member.createdAt, timezone)}`}
        action={
          <Link to="/app/members" className="btn">
            Back to members
          </Link>
        }
      />

      {member.anonymised ? (
        <Banner tone="neutral" title="This member has been redacted">
          {member.anonymisedAt
            ? `Anonymised on ${formatDate(member.anonymisedAt, timezone)}. `
            : ""}
          Their posts and comments are still on the forum, but nothing here identifies the
          shopper and a later sign-in cannot re-attach to this row.
        </Banner>
      ) : null}

      <Card title="Activity">
        <dl className="stats">
          <Stat label="Posts" value={member.counts.posts} />
          <Stat label="Comments" value={member.counts.comments} />
          <Stat label="Likes given" value={member.counts.likes} />
        </dl>
        <p className="cell-muted" style={{ marginBottom: 0 }}>
          Key <code>{member.hashPreview}…</code> — an HMAC of the Shopify customer id scoped to
          this shop. The customer id itself is never stored.
        </p>
      </Card>

      <Card title={`Posts (${member.counts.posts})`} flush>
        {member.posts.length === 0 ? (
          <EmptyState title="No posts">This member has not written a post.</EmptyState>
        ) : (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Title</th>
                  <th>Category</th>
                  <th>Comments</th>
                  <th>Published</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {member.posts.map((post) => (
                  <tr key={post.id}>
                    <td>
                      <Link to={`/app/posts/${post.id}`} className="cell-title">
                        {post.title}
                      </Link>
                    </td>
                    <td className="cell-muted">{post.category}</td>
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
                        <input type="hidden" name="intent" value="delete-post" />
                        <input type="hidden" name="id" value={post.id} />
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
        {member.counts.posts > member.posts.length ? (
          <p className="cell-muted">
            Showing the {member.posts.length} most recent of {member.counts.posts}.
          </p>
        ) : null}
      </Card>

      <Card title={`Comments (${member.counts.comments})`} flush>
        {member.comments.length === 0 ? (
          <EmptyState title="No comments">This member has not replied to anything.</EmptyState>
        ) : (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Comment</th>
                  <th>On</th>
                  <th>Posted</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {member.comments.map((comment) => (
                  <tr key={comment.id}>
                    <td>{comment.body}</td>
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
                        <input type="hidden" name="intent" value="delete-comment" />
                        <input type="hidden" name="id" value={comment.id} />
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
        {member.counts.comments > member.comments.length ? (
          <p className="cell-muted">
            Showing the {member.comments.length} most recent of {member.counts.comments}.
          </p>
        ) : null}
      </Card>

      {member.anonymised ? null : (
        <Card title="Anonymise">
          <p className="cell-muted" style={{ marginTop: 0 }}>
            Runs the same code as the <code>customers/redact</code> webhook. The display name and
            stored key are replaced; posts, comments and likes stay where they are.
          </p>
          <Form
            method="post"
            onSubmit={(event) => {
              if (
                !confirm(
                  `Anonymise ${member.displayName}? This cannot be undone and cannot be re-attached.`,
                )
              ) {
                event.preventDefault()
              }
            }}
          >
            <input type="hidden" name="intent" value="anonymise" />
            <button type="submit" className="btn btn--danger" disabled={busy}>
              Anonymise this member
            </button>
          </Form>
        </Card>
      )}
    </div>
  )
}

// same shape as the one on the overview page — a description list, so the
// number and its label are associated rather than just adjacent
function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div>
      <dd className="stat__value" style={{ margin: 0 }}>
        {value}
      </dd>
      <dt className="stat__label">{label}</dt>
    </div>
  )
}
