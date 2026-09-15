import type { LoaderFunctionArgs } from "react-router"

import { authenticate } from "../shopify.server"

// /auth/login, /auth/callback, /auth/session-token.
// authenticate.admin always throws here, redirect or error, nothing to return.
export async function loader({ request }: LoaderFunctionArgs) {
  await authenticate.admin(request)
  return null
}
