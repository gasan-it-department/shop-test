import { NavMenu } from "@shopify/app-bridge-react"
import { AppProvider } from "@shopify/shopify-app-react-router/react"
import { boundary } from "@shopify/shopify-app-react-router/server"
import { Link, Outlet, useLoaderData, useRouteError } from "react-router"
import type { HeadersFunction, LoaderFunctionArgs } from "react-router"

import adminStyles from "../styles/admin.css?url"
import { authenticate } from "../shopify.server"

export const links = () => [{ rel: "stylesheet", href: adminStyles }]

export async function loader({ request }: LoaderFunctionArgs) {
  await authenticate.admin(request)
  return { apiKey: process.env.SHOPIFY_API_KEY || "" }
}

export default function App() {
  const { apiKey } = useLoaderData<typeof loader>()

  return (
    <AppProvider apiKey={apiKey}>
      {/* renders into the admin's left nav, outside the iframe */}
      <NavMenu>
        <Link to="/app" rel="home">
          Overview
        </Link>
        <Link to="/app/posts">Posts</Link>
        <Link to="/app/comments">Comments</Link>
        <Link to="/app/categories">Categories</Link>
        <Link to="/app/members">Members</Link>
        <Link to="/app/instagram">Instagram</Link>
        <Link to="/app/billing">Plan</Link>
        <Link to="/app/diagnostics">Diagnostics</Link>
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
