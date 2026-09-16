import { Form, Link, useActionData, useLoaderData, useNavigation } from "react-router"
import { data, redirect } from "react-router"
import type { ActionFunctionArgs, LoaderFunctionArgs } from "react-router"

import { Badge, Banner, Card, Field, PageHeader, formatDate } from "../components/ui"
import {
  createComment,
  deleteComment,
  deletePost,
  getPost,
  listCategories,
  requireShop,
  updatePost,
} from "../lib/forum.server"
import { commentSchema, parseForm, postSchema, type FieldErrors } from "../lib/validation"
import { authenticate } from "../shopify.server"

// one shape for every failure branch, so useActionData isn't a union the
// component has to narrow before it can read a field
interface ActionErrors {
  errors?: FieldErrors
  commentErrors?: FieldErrors
}

export async function loader({ request, params }: LoaderFunctionArgs) {
  const { session } = await authenticate.admin(request)
  const shop = await requireShop(session.shop)

  const post = await getPost(shop.id, params.id ?? "")
  if (!post) throw new Response("Post not found", { status: 404 })

  const categories = await listCategories(shop.id)

  return {
    timezone: shop.timezone,
    categories: categories.map((c) => ({ id: c.id, title: c.title, isPrivate: c.isPrivate })),
    post: {
      id: post.id,
      title: post.title,
      body: post.body,
      categoryId: post.categoryId,
      source: post.source,
      externalId: post.externalId,
      author: post.author?.displayName ?? null,
      anonymised: post.author?.anonymisedAt !== null && post.author?.anonymisedAt !== undefined,
      publishedAt: post.publishedAt.toISOString(),
      updatedAt: post.updatedAt.toISOString(),
      comments: post.comments.map((comment) => ({
        id: comment.id,
        body: comment.body,
        parentId: comment.parentId,
        author: comment.author?.displayName ?? "Member",
        createdAt: comment.createdAt.toISOString(),
      })),
    },
  }
}

export async function action({ request, params }: ActionFunctionArgs) {
  const { session } = await authenticate.admin(request)
  const shop = await requireShop(session.shop)
  const id = params.id ?? ""

  const formData = await request.formData()
  const intent = formData.get("intent")

  if (intent === "delete-post") {
    await deletePost(shop.id, id)
    return redirect("/app/posts")
  }

  if (intent === "delete-comment") {
    await deleteComment(shop.id, String(formData.get("commentId") ?? ""))
    return redirect(`/app/posts/${id}`)
  }

  if (intent === "add-comment") {
    const parsed = parseForm(commentSchema, formData)
    if (!parsed.ok) {
      return data<ActionErrors>({ commentErrors: parsed.errors }, { status: 422 })
    }

    await createComment(shop.id, {
      postId: id,
      body: parsed.data.body,
      parentId: parsed.data.parentId ?? null,
      // authorId null: a reply written in the admin is the merchant's
      authorId: null,
    })
    return redirect(`/app/posts/${id}`)
  }

  const parsed = parseForm(postSchema, formData)
  if (!parsed.ok) return data<ActionErrors>({ errors: parsed.errors }, { status: 422 })

  const categories = await listCategories(shop.id)
  if (!categories.some((c) => c.id === parsed.data.categoryId)) {
    return data<ActionErrors>({ errors: { categoryId: "Unknown category" } }, { status: 422 })
  }

  await updatePost(shop.id, id, parsed.data)
  return redirect(`/app/posts/${id}`)
}

export default function PostDetail() {
  const { post, categories, timezone } = useLoaderData<typeof loader>()
  const actionData = useActionData<typeof action>()
  const navigation = useNavigation()
  const errors = actionData?.errors ?? {}
  const commentErrors = actionData?.commentErrors ?? {}
  const busy = navigation.state !== "idle"

  const roots = post.comments.filter((c) => !c.parentId)
  const repliesOf = (parentId: string) => post.comments.filter((c) => c.parentId === parentId)

  return (
    <div className="page">
      <PageHeader
        title="Edit post"
        subtitle={`Published ${formatDate(post.publishedAt, timezone)}`}
        action={
          <Link to="/app/posts" className="btn">
            Back
          </Link>
        }
      />

      {post.source !== "forum" ? (
        <Banner tone="info" title={`Imported from ${post.source}`}>
          External id <code>{post.externalId}</code>. Edits here are overwritten the next time
          this item is re-imported.
        </Banner>
      ) : null}

      {post.anonymised ? (
        <Banner tone="warning" title="Author anonymised">
          This post&rsquo;s author has been redacted. The post stays so the thread still reads.
        </Banner>
      ) : null}

      <Card title="Post">
        {errors.form ? <Banner tone="critical">{errors.form}</Banner> : null}
        <Form method="post" key={post.updatedAt}>
          <Field label="Title" name="title" error={errors.title}>
            <input
              id="title"
              name="title"
              type="text"
              required
              maxLength={120}
              defaultValue={post.title}
              aria-invalid={errors.title ? true : undefined}
            />
          </Field>

          <Field label="Category" name="categoryId" error={errors.categoryId}>
            <select id="categoryId" name="categoryId" required defaultValue={post.categoryId}>
              {categories.map((category) => (
                <option key={category.id} value={category.id}>
                  {category.title}
                  {category.isPrivate ? " (private)" : ""}
                </option>
              ))}
            </select>
          </Field>

          <Field label="Body" name="body" error={errors.body}>
            <textarea
              id="body"
              name="body"
              required
              maxLength={10000}
              defaultValue={post.body}
              aria-invalid={errors.body ? true : undefined}
            />
          </Field>

          <div className="form-actions">
            <button type="submit" className="btn btn--primary" disabled={busy}>
              {busy ? "Saving…" : "Save changes"}
            </button>
            <span className="cell-muted">
              Author: {post.author ?? "Merchant"} · {post.comments.length} comment
              {post.comments.length === 1 ? "" : "s"}
            </span>
          </div>
        </Form>
      </Card>

      <Card title={`Comments (${post.comments.length})`}>
        {post.comments.length === 0 ? (
          <p className="cell-muted" style={{ margin: 0 }}>
            No comments yet.
          </p>
        ) : (
          <div>
            {roots.map((comment) => (
              <div key={comment.id}>
                <CommentRow comment={comment} timezone={timezone} busy={busy} />
                {repliesOf(comment.id).map((reply) => (
                  <div key={reply.id} className="comment--reply">
                    <CommentRow comment={reply} timezone={timezone} busy={busy} />
                  </div>
                ))}
              </div>
            ))}
          </div>
        )}
      </Card>

      <Card title="Reply as the merchant">
        <Form method="post">
          <input type="hidden" name="intent" value="add-comment" />
          <Field label="Comment" name="body" error={commentErrors.body}>
            <textarea
              id="body"
              name="body"
              required
              maxLength={5000}
              style={{ minHeight: 90 }}
              aria-invalid={commentErrors.body ? true : undefined}
            />
          </Field>
          <div className="form-actions">
            <button type="submit" className="btn btn--primary" disabled={busy}>
              {busy ? "Posting…" : "Post comment"}
            </button>
          </div>
        </Form>
      </Card>

      <Card title="Danger zone">
        <Form
          method="post"
          onSubmit={(event) => {
            if (!confirm("Delete this post and all its comments? This cannot be undone.")) {
              event.preventDefault()
            }
          }}
        >
          <input type="hidden" name="intent" value="delete-post" />
          <p className="cell-muted" style={{ marginTop: 0 }}>
            Deleting a post also deletes its comments and reactions.
          </p>
          <button type="submit" className="btn btn--danger" disabled={busy}>
            Delete post
          </button>
        </Form>
      </Card>
    </div>
  )
}

function CommentRow({
  comment,
  timezone,
  busy,
}: {
  comment: { id: string; body: string; author: string; createdAt: string }
  timezone: string
  busy: boolean
}) {
  return (
    <div className="comment">
      <div className="comment__meta">
        <span>
          <strong style={{ fontWeight: 500 }}>{comment.author}</strong>{" "}
          <Badge tone="neutral">{formatDate(comment.createdAt, timezone)}</Badge>
        </span>
        <Form
          method="post"
          onSubmit={(event) => {
            if (!confirm("Delete this comment?")) event.preventDefault()
          }}
        >
          <input type="hidden" name="intent" value="delete-comment" />
          <input type="hidden" name="commentId" value={comment.id} />
          <button type="submit" className="btn-link" disabled={busy}>
            Delete
          </button>
        </Form>
      </div>
      <div className="prose">{comment.body}</div>
    </div>
  )
}
