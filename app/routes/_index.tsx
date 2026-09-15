import { redirect, type LoaderFunctionArgs } from "react-router"

export async function loader({ request }: LoaderFunctionArgs) {
  const url = new URL(request.url)

  // shopify always arrives with ?shop=
  if (url.searchParams.get("shop")) {
    throw redirect(`/app?${url.searchParams.toString()}`)
  }

  return null
}

// careful: only loader/action/middleware/headers get their server code
// stripped. re-exporting anything else from a .server module drags the whole
// server graph into the client bundle and fails the build.

export default function Index() {
  return (
    <main style={{ fontFamily: "Inter, system-ui, sans-serif", padding: "3rem", maxWidth: 560 }}>
      <h1 style={{ fontSize: "1.5rem", fontWeight: 600 }}>shopify-practice</h1>
      <p style={{ color: "#616161", lineHeight: 1.6 }}>
        Install this on a development store from the Partner dashboard. This
        page is only seen by someone hitting the app URL directly.
      </p>
    </main>
  )
}
