import { Form, useActionData, useLoaderData } from "react-router"
import type { ActionFunctionArgs, LoaderFunctionArgs } from "react-router"

import { login } from "../shopify.server"

export async function loader({ request }: LoaderFunctionArgs) {
  const errors = await login(request)
  return { errors, polarisTranslations: null }
}

export async function action({ request }: ActionFunctionArgs) {
  const errors = await login(request)
  return { errors }
}

export default function Auth() {
  const loaderData = useLoaderData<typeof loader>()
  const actionData = useActionData<typeof action>()
  const errors = actionData?.errors ?? loaderData.errors

  return (
    <main style={{ fontFamily: "Inter, system-ui, sans-serif", padding: "3rem", maxWidth: 420 }}>
      <Form method="post">
        <h1 style={{ fontSize: "1.25rem", fontWeight: 600 }}>Log in</h1>
        <label htmlFor="shop" style={{ display: "block", marginTop: "1rem" }}>
          Shop domain
        </label>
        <input
          id="shop"
          type="text"
          name="shop"
          placeholder="my-shop.myshopify.com"
          style={{ width: "100%", padding: "0.5rem", marginTop: "0.25rem" }}
        />
        {errors?.shop ? (
          <p style={{ color: "#c62828", marginTop: "0.5rem" }}>{errors.shop}</p>
        ) : null}
        <button type="submit" style={{ marginTop: "1rem", padding: "0.5rem 1rem" }}>
          Log in
        </button>
      </Form>
    </main>
  )
}
