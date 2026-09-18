// Why the Admin API is refusing us.
//
// The Overview page reports "Admin API unavailable" and a truncated error with
// an empty body, which is not enough to act on. This page calls Shopify
// directly with the stored token and shows the raw status, the x-request-id
// and the headers for each probe, ordered so that the failures narrow the
// cause rather than just confirming it.

import { Link, useLoaderData } from "react-router"
import type { LoaderFunctionArgs } from "react-router"

import { Badge, Banner, Card, PageHeader } from "../components/ui"
import { describeToken, probeAdminApi, summarise } from "../lib/admin-probe.server"
import { apiVersion, authenticate } from "../shopify.server"

export async function loader({ request }: LoaderFunctionArgs) {
  const { session } = await authenticate.admin(request)

  const results = await probeAdminApi(session.shop, session.accessToken, apiVersion)

  return {
    shop: session.shop,
    apiVersion,
    // never the token itself — only the prefix, which identifies the kind of
    // credential and is the part that actually helps
    token: describeToken(session.accessToken),
    scopes: session.scope || "(none recorded on the session)",
    isOnline: session.isOnline,
    expires: session.expires ? new Date(session.expires).toISOString() : null,
    summary: summarise(results),
    allOk: results.every((r) => r.ok),
    results,
  }
}

export default function Diagnostics() {
  const { shop, apiVersion, token, scopes, isOnline, expires, summary, allOk, results } =
    useLoaderData<typeof loader>()

  return (
    <div className="page">
      <PageHeader
        title="Diagnostics"
        subtitle="What Shopify actually answers when this app calls the Admin API"
        action={
          <Link to="/app" className="btn">
            Back to overview
          </Link>
        }
      />

      <Banner tone={allOk ? "success" : "critical"} title="Summary">
        {summary}
      </Banner>

      <Card title="This install">
        <div className="table-wrap">
          <table>
            <tbody>
              <Row label="Shop" value={shop} />
              <Row label="API version" value={apiVersion} />
              <Row label="Access token" value={token} />
              <Row label="Scopes on the token" value={scopes} />
              <Row label="Session type" value={isOnline ? "online (per-user)" : "offline (app)"} />
              <Row label="Token expires" value={expires ?? "does not expire"} />
            </tbody>
          </table>
        </div>
        <p className="cell-muted" style={{ marginBottom: 0 }}>
          The token is never shown in full. The prefix is enough to tell an app install token
          apart from a custom-app or per-user one, which is the part that matters here.
        </p>
      </Card>

      <Card title="Probes" flush>
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Probe</th>
                <th>Result</th>
                <th>Request id</th>
              </tr>
            </thead>
            <tbody>
              {results.map((result) => (
                <tr key={result.label}>
                  <td>
                    <div className="cell-title">{result.label}</div>
                    <div className="cell-muted">
                      <code>
                        {result.method} {result.path}
                      </code>
                    </div>
                    <div className="cell-muted">{result.tells}</div>
                  </td>
                  <td>
                    {result.error ? (
                      <Badge tone="critical">request failed</Badge>
                    ) : result.ok ? (
                      <Badge tone="success">{result.status} OK</Badge>
                    ) : (
                      <Badge tone="critical">{result.status ?? "—"}</Badge>
                    )}
                    <div className="cell-muted" style={{ marginTop: 6, wordBreak: "break-word" }}>
                      {result.error ?? result.detail}
                    </div>
                  </td>
                  <td className="cell-muted">
                    {result.requestId ? <code>{result.requestId}</code> : "—"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>

      <Card title="If the token is valid but everything is still refused">
        <p className="cell-muted" style={{ marginTop: 0 }}>
          That combination — an unversioned call succeeding while a query needing no scope is
          refused — cannot be explained by scopes, by the API version, or by the credential. What
          is left is the app&rsquo;s own standing with Shopify, which is not something this app can
          read or change from here.
        </p>
        <p className="cell-muted">
          The request ids above are the useful thing to hand to Shopify Partner support: they can
          look up an individual refusal and say why. Failing that, the escape hatch is a new app
          created with custom distribution and installed on this one store, which skips the
          review-gated states entirely.
        </p>
        <p className="cell-muted" style={{ marginBottom: 0 }}>
          Nothing the storefront does depends on the Admin API. Posts, comments, likes, images and
          the forum widget all work while this is failing — what degrades is the shop name and
          timezone on the overview, and the billing check on the plan page.
        </p>
      </Card>
    </div>
  )
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <tr>
      <td style={{ width: "13rem" }}>{label}</td>
      <td>
        <code style={{ wordBreak: "break-all" }}>{value}</code>
      </td>
    </tr>
  )
}
