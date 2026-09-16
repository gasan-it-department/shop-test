import { Form, Link, useActionData, useLoaderData, useNavigation } from "react-router"
import { data, redirect } from "react-router"
import type { ActionFunctionArgs, LoaderFunctionArgs } from "react-router"

import { Badge, Banner, Card, EmptyState, Field, PageHeader } from "../components/ui"
import {
  createCategory,
  deleteCategory,
  listCategories,
  requireShop,
} from "../lib/forum.server"
import { categorySchema, parseForm, slugify, type FieldErrors } from "../lib/validation"
import { authenticate } from "../shopify.server"

export async function loader({ request }: LoaderFunctionArgs) {
  const { session } = await authenticate.admin(request)
  const shop = await requireShop(session.shop)
  const categories = await listCategories(shop.id)

  return {
    categories: categories.map((category) => ({
      id: category.id,
      title: category.title,
      handle: category.handle,
      isPrivate: category.isPrivate,
      position: category.position,
      postCount: category._count.posts,
    })),
  }
}

export async function action({ request }: ActionFunctionArgs) {
  const { session } = await authenticate.admin(request)
  const shop = await requireShop(session.shop)

  const formData = await request.formData()
  const intent = formData.get("intent")

  if (intent === "delete") {
    const id = String(formData.get("id") ?? "")
    await deleteCategory(shop.id, id)
    return redirect("/app/categories")
  }

  // blank handle is a convenience, not an error — derive it from the title
  if (!String(formData.get("handle") ?? "").trim()) {
    formData.set("handle", slugify(String(formData.get("title") ?? "")))
  }

  const parsed = parseForm(categorySchema, formData)
  if (!parsed.ok) {
    return data({ errors: parsed.errors }, { status: 422 })
  }

  try {
    await createCategory(shop.id, parsed.data)
  } catch (error) {
    // @@unique([shopId, handle]) — prisma raises P2002 on a duplicate
    if (isUniqueViolation(error)) {
      return data(
        { errors: { handle: "A category with this handle already exists" } as FieldErrors },
        { status: 422 },
      )
    }
    throw error
  }

  return redirect("/app/categories")
}

function isUniqueViolation(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    (error as { code?: string }).code === "P2002"
  )
}

export default function Categories() {
  const { categories } = useLoaderData<typeof loader>()
  const actionData = useActionData<typeof action>()
  const navigation = useNavigation()
  const errors = actionData?.errors ?? {}
  const busy = navigation.state !== "idle"

  return (
    <div className="page">
      <PageHeader
        title="Categories"
        subtitle="Private categories never appear on the storefront."
      />

      <Card title="Categories" flush>
        {categories.length === 0 ? (
          <EmptyState title="No categories yet">
            A post needs a category, so create one before writing posts.
          </EmptyState>
        ) : (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Title</th>
                  <th>Handle</th>
                  <th>Visibility</th>
                  <th>Position</th>
                  <th>Posts</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {categories.map((category) => (
                  <tr key={category.id}>
                    <td>
                      <Link to={`/app/categories/${category.id}`} className="cell-title">
                        {category.title}
                      </Link>
                    </td>
                    <td>
                      <code>{category.handle}</code>
                    </td>
                    <td>
                      {category.isPrivate ? (
                        <Badge tone="warning">Private</Badge>
                      ) : (
                        <Badge tone="success">Public</Badge>
                      )}
                    </td>
                    <td className="cell-muted">{category.position}</td>
                    <td className="cell-muted">{category.postCount}</td>
                    <td className="actions">
                      <Form method="post" style={{ display: "inline" }}>
                        <input type="hidden" name="intent" value="delete" />
                        <input type="hidden" name="id" value={category.id} />
                        <button
                          type="submit"
                          className="btn btn--sm btn--danger"
                          disabled={busy}
                          onClick={(event) => {
                            if (
                              category.postCount > 0 &&
                              !confirm(
                                `Delete "${category.title}" and its ${category.postCount} post(s)? This cannot be undone.`,
                              )
                            ) {
                              event.preventDefault()
                            }
                          }}
                        >
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

      <Card title="Add a category">
        {errors.form ? <Banner tone="critical">{errors.form}</Banner> : null}
        <Form method="post" replace>
          <div className="form-row">
            <Field label="Title" name="title" error={errors.title}>
              <input
                id="title"
                name="title"
                type="text"
                required
                maxLength={80}
                aria-invalid={errors.title ? true : undefined}
                placeholder="Brewing"
              />
            </Field>
            <Field
              label="Handle"
              name="handle"
              error={errors.handle}
              hint="Used in the storefront URL. Leave blank to generate from the title."
            >
              <input
                id="handle"
                name="handle"
                type="text"
                maxLength={60}
                aria-invalid={errors.handle ? true : undefined}
                placeholder="brewing"
              />
            </Field>
          </div>

          <div className="form-row">
            <Field label="Position" name="position" error={errors.position} hint="Lower sorts first.">
              <input id="position" name="position" type="number" min={0} max={999} defaultValue={0} />
            </Field>
            <div className="field">
              <span className="field__label">Visibility</span>
              <label className="checkbox">
                <input type="checkbox" name="isPrivate" value="true" />
                <span>
                  Private — hidden from the storefront and from the public App Proxy endpoint
                </span>
              </label>
            </div>
          </div>

          <div className="form-actions">
            <button type="submit" className="btn btn--primary" disabled={busy}>
              {busy ? "Saving…" : "Add category"}
            </button>
          </div>
        </Form>
      </Card>
    </div>
  )
}
