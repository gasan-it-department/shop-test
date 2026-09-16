import { Form, Link, useActionData, useLoaderData, useNavigation } from "react-router"
import { data, redirect } from "react-router"
import type { ActionFunctionArgs, LoaderFunctionArgs } from "react-router"

import { Banner, Card, Field, PageHeader } from "../components/ui"
import {
  deleteCategory,
  getCategory,
  requireShop,
  updateCategory,
} from "../lib/forum.server"
import { categorySchema, parseForm, type FieldErrors } from "../lib/validation"
import { authenticate } from "../shopify.server"

export async function loader({ request, params }: LoaderFunctionArgs) {
  const { session } = await authenticate.admin(request)
  const shop = await requireShop(session.shop)

  const category = await getCategory(shop.id, params.id ?? "")
  if (!category) throw new Response("Category not found", { status: 404 })

  return {
    category: {
      id: category.id,
      title: category.title,
      handle: category.handle,
      isPrivate: category.isPrivate,
      position: category.position,
    },
  }
}

export async function action({ request, params }: ActionFunctionArgs) {
  const { session } = await authenticate.admin(request)
  const shop = await requireShop(session.shop)
  const id = params.id ?? ""

  const formData = await request.formData()

  if (formData.get("intent") === "delete") {
    await deleteCategory(shop.id, id)
    return redirect("/app/categories")
  }

  const parsed = parseForm(categorySchema, formData)
  if (!parsed.ok) return data({ errors: parsed.errors }, { status: 422 })

  try {
    await updateCategory(shop.id, id, parsed.data)
  } catch (error) {
    if (
      typeof error === "object" &&
      error !== null &&
      (error as { code?: string }).code === "P2002"
    ) {
      return data(
        { errors: { handle: "A category with this handle already exists" } as FieldErrors },
        { status: 422 },
      )
    }
    throw error
  }

  return redirect("/app/categories")
}

export default function EditCategory() {
  const { category } = useLoaderData<typeof loader>()
  const actionData = useActionData<typeof action>()
  const navigation = useNavigation()
  const errors = actionData?.errors ?? {}
  const busy = navigation.state !== "idle"

  return (
    <div className="page">
      <PageHeader
        title="Edit category"
        action={
          <Link to="/app/categories" className="btn">
            Back
          </Link>
        }
      />

      <Card>
        {errors.form ? <Banner tone="critical">{errors.form}</Banner> : null}
        <Form method="post" key={category.id}>
          <div className="form-row">
            <Field label="Title" name="title" error={errors.title}>
              <input
                id="title"
                name="title"
                type="text"
                required
                maxLength={80}
                defaultValue={category.title}
                aria-invalid={errors.title ? true : undefined}
              />
            </Field>
            <Field
              label="Handle"
              name="handle"
              error={errors.handle}
              hint="Changing this changes the storefront URL for the category."
            >
              <input
                id="handle"
                name="handle"
                type="text"
                required
                maxLength={60}
                defaultValue={category.handle}
                aria-invalid={errors.handle ? true : undefined}
              />
            </Field>
          </div>

          <div className="form-row">
            <Field label="Position" name="position" error={errors.position} hint="Lower sorts first.">
              <input
                id="position"
                name="position"
                type="number"
                min={0}
                max={999}
                defaultValue={category.position}
              />
            </Field>
            <div className="field">
              <span className="field__label">Visibility</span>
              <label className="checkbox">
                <input
                  type="checkbox"
                  name="isPrivate"
                  value="true"
                  defaultChecked={category.isPrivate}
                />
                <span>Private — hidden from the storefront</span>
              </label>
            </div>
          </div>

          <div className="form-actions">
            <button type="submit" className="btn btn--primary" disabled={busy}>
              {busy ? "Saving…" : "Save"}
            </button>
            <Link to="/app/categories" className="btn">
              Cancel
            </Link>
          </div>
        </Form>
      </Card>

      <Card title="Danger zone">
        <Form
          method="post"
          onSubmit={(event) => {
            if (!confirm("Delete this category and every post in it? This cannot be undone.")) {
              event.preventDefault()
            }
          }}
        >
          <input type="hidden" name="intent" value="delete" />
          <p className="cell-muted" style={{ marginTop: 0 }}>
            Deleting a category also deletes its posts and their comments.
          </p>
          <button type="submit" className="btn btn--danger" disabled={busy}>
            Delete category
          </button>
        </Form>
      </Card>
    </div>
  )
}
