import { Form, Link, useActionData, useLoaderData, useNavigation } from "react-router"
import { data, redirect } from "react-router"
import type { ActionFunctionArgs, LoaderFunctionArgs } from "react-router"

import { Banner, Card, EmptyState, Field, PageHeader } from "../components/ui"
import { createPost, listCategories, requireShop } from "../lib/forum.server"
import { parseForm, postSchema, type FieldErrors } from "../lib/validation"
import { authenticate } from "../shopify.server"

export async function loader({ request }: LoaderFunctionArgs) {
  const { session } = await authenticate.admin(request)
  const shop = await requireShop(session.shop)
  const categories = await listCategories(shop.id)

  return {
    categories: categories.map((c) => ({ id: c.id, title: c.title, isPrivate: c.isPrivate })),
  }
}

export async function action({ request }: ActionFunctionArgs) {
  const { session } = await authenticate.admin(request)
  const shop = await requireShop(session.shop)

  const parsed = parseForm(postSchema, await request.formData())
  if (!parsed.ok) return data({ errors: parsed.errors as FieldErrors }, { status: 422 })

  // the category has to belong to this shop — the select is populated from
  // the shop's own categories, but a posted id is user input either way
  const categories = await listCategories(shop.id)
  if (!categories.some((c) => c.id === parsed.data.categoryId)) {
    return data({ errors: { categoryId: "Unknown category" } as FieldErrors }, { status: 422 })
  }

  // authorId stays null: posts written in the admin are the merchant's, not a
  // forum member's
  const post = await createPost(shop.id, { ...parsed.data, authorId: null })
  return redirect(`/app/posts/${post.id}`)
}

export default function NewPost() {
  const { categories } = useLoaderData<typeof loader>()
  const actionData = useActionData<typeof action>()
  const navigation = useNavigation()
  const errors = actionData?.errors ?? {}
  const busy = navigation.state !== "idle"

  return (
    <div className="page">
      <PageHeader
        title="New post"
        action={
          <Link to="/app/posts" className="btn">
            Back
          </Link>
        }
      />

      {categories.length === 0 ? (
        <Card>
          <EmptyState
            title="Create a category first"
            action={
              <Link to="/app/categories" className="btn btn--primary">
                Go to categories
              </Link>
            }
          >
            Every post belongs to a category.
          </EmptyState>
        </Card>
      ) : (
        <Card>
          {errors.form ? <Banner tone="critical">{errors.form}</Banner> : null}
          <Form method="post">
            <Field label="Title" name="title" error={errors.title}>
              <input
                id="title"
                name="title"
                type="text"
                required
                maxLength={120}
                aria-invalid={errors.title ? true : undefined}
              />
            </Field>

            <Field label="Category" name="categoryId" error={errors.categoryId}>
              <select id="categoryId" name="categoryId" required defaultValue="">
                <option value="" disabled>
                  Choose a category
                </option>
                {categories.map((category) => (
                  <option key={category.id} value={category.id}>
                    {category.title}
                    {category.isPrivate ? " (private)" : ""}
                  </option>
                ))}
              </select>
            </Field>

            <Field
              label="Body"
              name="body"
              error={errors.body}
              hint="Stored exactly as written and escaped when rendered, so markup is shown as text."
            >
              <textarea
                id="body"
                name="body"
                required
                maxLength={10000}
                aria-invalid={errors.body ? true : undefined}
              />
            </Field>

            <div className="form-actions">
              <button type="submit" className="btn btn--primary" disabled={busy}>
                {busy ? "Publishing…" : "Publish post"}
              </button>
              <Link to="/app/posts" className="btn">
                Cancel
              </Link>
            </div>
          </Form>
        </Card>
      )}
    </div>
  )
}
