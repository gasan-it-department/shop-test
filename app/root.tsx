import {
  Links,
  Meta,
  Outlet,
  Scripts,
  ScrollRestoration,
  isRouteErrorResponse,
  useRouteError,
} from "react-router"

export default function App() {
  return (
    <html lang="en">
      <head>
        <meta charSet="utf-8" />
        <meta name="viewport" content="width=device-width,initial-scale=1" />
        <link rel="preconnect" href="https://cdn.shopify.com/" />
        <link
          rel="stylesheet"
          href="https://cdn.shopify.com/static/fonts/inter/v4/styles.css"
        />
        <Meta />
        <Links />
      </head>
      <body>
        <Outlet />
        <ScrollRestoration />
        <Scripts />
      </body>
    </html>
  )
}

// without this react router renders a bare "Application Error" with no detail,
// which inside the admin iframe means a blank page and a trip to the server
// logs for every mistake. show the message instead.
export function ErrorBoundary() {
  const error = useRouteError()

  let heading = "Application error"
  let detail: string | undefined

  if (isRouteErrorResponse(error)) {
    heading = `${error.status} ${error.statusText}`
    detail = typeof error.data === "string" ? error.data : JSON.stringify(error.data, null, 2)
  } else if (error instanceof Error) {
    heading = error.message
    // stack only outside production — it names internal paths
    detail = process.env.NODE_ENV === "production" ? undefined : error.stack
  }

  return (
    <html lang="en">
      <head>
        <meta charSet="utf-8" />
        <meta name="viewport" content="width=device-width,initial-scale=1" />
        <title>{heading}</title>
        <Meta />
        <Links />
      </head>
      <body
        style={{
          margin: 0,
          padding: "32px 24px",
          font: "400 14px/1.55 Inter, system-ui, -apple-system, sans-serif",
          color: "#1a1a1a",
          background: "#fcfcfc",
        }}
      >
        <h1 style={{ fontSize: 18, fontWeight: 600, margin: "0 0 8px" }}>{heading}</h1>
        <p style={{ color: "#6b6b6b", margin: "0 0 16px" }}>
          The full stack trace is in the server logs.
        </p>
        {detail ? (
          <pre
            style={{
              background: "#fff",
              border: "1px solid #e8e8e8",
              borderRadius: 8,
              padding: 16,
              overflowX: "auto",
              font: "12px/1.5 ui-monospace, Consolas, monospace",
              whiteSpace: "pre-wrap",
            }}
          >
            {detail}
          </pre>
        ) : null}
        <Scripts />
      </body>
    </html>
  )
}
