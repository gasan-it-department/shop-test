import { NavMenu } from "@shopify/app-bridge-react"
import { AppProvider } from "@shopify/shopify-app-react-router/react"
import { boundary } from "@shopify/shopify-app-react-router/server"
import { Link, Outlet, useLoaderData, useRouteError } from "react-router"
import type { HeadersFunction, LoaderFunctionArgs } from "react-router"

import { authenticate } from "../shopify.server"

export async function loader({ request }: LoaderFunctionArgs) {
  await authenticate.admin(request)
  return { apiKey: process.env.SHOPIFY_API_KEY || "" }
}

export default function App() {
  const { apiKey } = useLoaderData<typeof loader>()

  // no isEmbeddedApp prop in v2, and this pulls in Polaris web components
  // rather than the deprecated Polaris React package
  return (
    <AppProvider apiKey={apiKey}>
      {/* renders into the admin's left nav, outside the iframe */}
      <NavMenu>
        <Link to="/app" rel="home">
          Forum
        </Link>
        <Link to="/app/instagram">Instagram</Link>
        <Link to="/app/billing">Plan</Link>
      </NavMenu>
      <Outlet />
    </AppProvider>
  )
}

// re-auth arrives as a thrown Response, boundary.error re-throws it instead of
// rendering an error page over it
export function ErrorBoundary() {
  return boundary.error(useRouteError())
}

export const headers: HeadersFunction = (headersArgs) => boundary.headers(headersArgs)
