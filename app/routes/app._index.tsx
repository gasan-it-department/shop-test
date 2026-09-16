import { Link, useLoaderData } from "react-router"
import type { LoaderFunctionArgs } from "react-router"

import { Badge, Card, EmptyState, PageHeader, formatDate } from "../components/ui"
import { requireShop, shopOverview } from "../lib/forum.server"
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
): Promise<ShopInfo | null> {
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
      console.error("[app] ShopInfo returned no data:", JSON.stringify(body.errors ?? body))
      return null
    }
    return body.data.shop
  } catch (error) {
    console.error("[app] ShopInfo request failed:", error)
    return null
  }
}

export async function loader({ request }: LoaderFunctionArgs) {
  const { session, admin } = await authenticate.admin(request)

  const shop = await requireShop(session.shop)
  const [info, overview] = await Promise.all([fetchShopInfo(admin), shopOverview(shop.id)])

  return {
    shopName: info?.name ?? session.shop.replace(".myshopify.com", ""),
    timezone: info?.ianaTimezone ?? shop.timezone,
    adminApiOk: info !== null,
    storefrontUrl: `https://${session.shop}`,
    counts: overview.counts,
    recent: overview.recent.map((post) => ({
      id: post.id,
      title: post.title,
      category: post.category.title,
      author: post.author?.displayName ?? "Member",
      comments: post._count.comments,
      publishedAt: post.publishedAt.toISOString(),
    })),
  }
}

export default function Overview() {
  const { shopName, timezone, adminApiOk, storefrontUrl, counts, recent } =
    useLoaderData<typeof loader>()

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
