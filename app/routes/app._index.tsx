import { Link, useLoaderData } from "react-router"
import type { LoaderFunctionArgs } from "react-router"

import { Badge, Card, EmptyState, PageHeader, formatDate } from "../components/ui"
import { requireShop, shopOverview } from "../lib/forum.server"
import { describeAdminError } from "../lib/shopify-files.server"
import { authenticate } from "../shopify.server"

interface ShopInfo {
  name: string
  ianaTimezone: string
}

/**
 * Shop name and timezone from the Admin API. Returns null on any failure —
 * the client throws on a non-2xx, so checking the body alone isn't enough.
 * Nothing on this page is worth a 500; the domain is already in the session.
 */
async function fetchShopInfo(
  admin: Awaited<ReturnType<typeof authenticate.admin>>["admin"],
): Promise<{ info: ShopInfo | null; diagnostic: string | null }> {
  try {
    const response = await admin.graphql(`#graphql
      query ShopInfo {
        shop {
          name
          ianaTimezone
        }
      }
    `)
    const body = (await response.json()) as { data?: { shop?: ShopInfo }; errors?: unknown }
    if (!body.data?.shop) {
      const detail = JSON.stringify(body.errors ?? body)
      console.error("[app] ShopInfo returned no data:", detail)
      return { info: null, diagnostic: detail.slice(0, 300) }
    }
    return { info: body.data.shop, diagnostic: null }
  } catch (error) {
    const detail = await describeAdminError(error)
    console.error("[app] ShopInfo request failed:", detail)
    return { info: null, diagnostic: detail.slice(0, 300) }
  }
}

export async function loader({ request }: LoaderFunctionArgs) {
  const { session, admin } = await authenticate.admin(request)

  const shop = await requireShop(session.shop)
  const [shopInfo, overview] = await Promise.all([fetchShopInfo(admin), shopOverview(shop.id)])
  const info = shopInfo.info

  return {
    shopName: info?.name ?? session.shop.replace(".myshopify.com", ""),
    timezone: info?.ianaTimezone ?? shop.timezone,
    adminApiOk: info !== null,
    // what the token ACTUALLY carries, which is the only way to tell whether a
    // scope change reached the installed app or just the config file
    grantedScopes: session.scope ?? "(none recorded)",
    apiDiagnostic: shopInfo.diagnostic,
    storefrontUrl: `https://${session.shop}`,
    counts: overview.counts,
    recent: overview.recent.map((post) => ({
      id: post.id,
      title: post.title,
      category: post.category.title,
      author: post.author?.displayName ?? "Member",
      comments: post._count.comments,
      likes: post._count.reactions,
      publishedAt: post.publishedAt.toISOString(),
    })),
  }
}

export default function Overview() {
  const {
    shopName,
    timezone,
    adminApiOk,
    storefrontUrl,
    counts,
    recent,
    grantedScopes,
    apiDiagnostic,
  } = useLoaderData<typeof loader>()

  return (
    <div className="page">
      <PageHeader
        title={shopName}
        subtitle="Community forum"
        action={
          <Link to="/app/posts/new" className="btn btn--primary">
            New post
          </Link>
        }
      />

      <Card title="At a glance">
        <dl className="stats">
          <Stat label="Posts" value={counts.posts} />
          <Stat label="Comments" value={counts.comments} />
          <Stat label="Likes" value={counts.likes} />
          <Stat label="Members" value={counts.members} />
          <Stat label="Categories" value={counts.categories} />
        </dl>
        <div className="inline" style={{ marginTop: 20 }}>
          <span className="cell-muted">Timezone</span>
          {adminApiOk ? (
            <Badge>{timezone}</Badge>
          ) : (
            <Badge tone="warning">{timezone} · Admin API unavailable</Badge>
          )}
        </div>
        <p className="field__hint" style={{ marginTop: 12 }}>
          Storefront: <code>{storefrontUrl}/apps/forum</code>
        </p>
      </Card>

      {!adminApiOk ? (
        <Card title="Admin API diagnostic">
          <p style={{ marginTop: 0 }}>
            Scopes this shop&rsquo;s token actually carries:
          </p>
          <p>
            <code>{grantedScopes}</code>
          </p>
          <p className="cell-muted">
            If that list differs from the SCOPES variable, the app was reinstalled without the
            change taking, or not reinstalled at all — a token keeps whatever scopes it was
            issued with.
          </p>
          {apiDiagnostic ? (
            <>
              <p style={{ marginBottom: 4 }}>Shopify&rsquo;s response:</p>
              <pre
                style={{
                  background: "#fff",
                  border: "1px solid var(--border)",
                  borderRadius: 8,
                  padding: 12,
                  overflowX: "auto",
                  font: "12px/1.5 ui-monospace, Consolas, monospace",
                  whiteSpace: "pre-wrap",
                }}
              >
                {apiDiagnostic}
              </pre>
            </>
          ) : null}
          <p className="cell-muted" style={{ marginBottom: 0 }}>
            This is one call and whatever it returned. <Link to="/app/diagnostics">Diagnostics</Link>{" "}
            runs five, ordered so each failure narrows the cause — and captures the request ids,
            which are the only thing a 403 with an empty body leaves to go on.
          </p>
        </Card>
      ) : null}

      <Card
        title="Recent posts"
        flush
        action={
          <Link to="/app/posts" className="btn btn--sm">
            View all
          </Link>
        }
      >
        {recent.length === 0 ? (
          <EmptyState
            title="No posts yet"
            action={
              <Link to="/app/posts/new" className="btn btn--primary">
                Write the first post
              </Link>
            }
          >
            Posts created here and from the storefront both appear in this list.
          </EmptyState>
        ) : (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Title</th>
                  <th>Category</th>
                  <th>Author</th>
                  <th>Comments</th>
                  <th>Likes</th>
                  <th>Published</th>
                </tr>
              </thead>
              <tbody>
                {recent.map((post) => (
                  <tr key={post.id}>
                    <td>
                      <Link to={`/app/posts/${post.id}`} className="cell-title">
                        {post.title}
                      </Link>
                    </td>
                    <td className="cell-muted">{post.category}</td>
                    <td className="cell-muted">{post.author}</td>
                    <td className="cell-muted">{post.comments}</td>
                    <td className="cell-muted">{post.likes}</td>
                    <td className="cell-muted">{formatDate(post.publishedAt, timezone)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </div>
  )
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div>
      <dd className="stat__value" style={{ margin: 0 }}>
        {value}
      </dd>
      <dt className="stat__label">{label}</dt>
    </div>
  )
}
