import { useLoaderData } from "react-router"
import type { LoaderFunctionArgs } from "react-router"

import prisma from "../db.server"
import { authenticate } from "../shopify.server"

interface ShopOverview {
  name: string
  ianaTimezone: string
}

/**
 * Shop name and timezone from the Admin API.
 *
 * Returns null on any failure instead of throwing. The admin client throws on
 * a non-2xx (403 when scopes or protected-customer-data approval don't cover
 * the query), so checking the response body alone isn't enough — the throw
 * happens before there is a body to check.
 *
 * Nothing on this page is worth a 500. The shop domain is already in the
 * session, so a failed call costs polish, not function.
 */
async function fetchShopOverview(
  admin: Awaited<ReturnType<typeof authenticate.admin>>["admin"],
): Promise<ShopOverview | null> {
  try {
    // primaryDomain is deliberately not requested — it is the field most
    // likely to be scope-gated, and the storefront url is derivable from the
    // shop domain anyway.
    const response = await admin.graphql(`#graphql
      query ShopOverview {
        shop {
          name
          ianaTimezone
        }
      }
    `)

    const body = (await response.json()) as {
      data?: { shop?: ShopOverview }
      errors?: unknown
    }

    if (!body.data?.shop) {
      console.error("[app] ShopOverview returned no data:", JSON.stringify(body.errors ?? body))
      return null
    }

    return body.data.shop
  } catch (error) {
    console.error("[app] ShopOverview request failed:", error)
    return null
  }
}

export async function loader({ request }: LoaderFunctionArgs) {
  const { session, admin } = await authenticate.admin(request)

  const [shopData, shop] = await Promise.all([
    fetchShopOverview(admin),
    prisma.shop.findUnique({
      where: { domain: session.shop },
      include: { _count: { select: { posts: true, members: true, comments: true } } },
    }),
  ])

  return {
    shopName: shopData?.name ?? session.shop.replace(".myshopify.com", ""),
    // from shopify, never hard-coded. falls back to UTC rather than a guess,
    // since a wrong timezone is worse than an obviously neutral one.
    timezone: shopData?.ianaTimezone ?? "UTC",
    storefrontUrl: `https://${session.shop}`,
    counts: shop?._count ?? { posts: 0, members: 0, comments: 0 },
    // surfaced in the ui so a degraded page says so instead of quietly lying
    adminApiOk: shopData !== null,
  }
}

export default function Index() {
  const { shopName, timezone, storefrontUrl, counts, adminApiOk } =
    useLoaderData<typeof loader>()

  return (
    <s-page heading={shopName}>
      <s-section heading="Forum">
        <s-stack direction="block" gap="base">
          <s-stack direction="inline" gap="large">
            <Stat label="Posts" value={counts.posts} />
            <Stat label="Comments" value={counts.comments} />
            <Stat label="Members" value={counts.members} />
          </s-stack>

          <s-stack direction="inline" gap="small">
            <s-text>Shop timezone</s-text>
            <s-badge tone={adminApiOk ? "info" : "warning"}>
              {adminApiOk ? timezone : `${timezone} (Admin API unavailable)`}
            </s-badge>
          </s-stack>

          <s-paragraph tone="neutral">
            Storefront: <s-link href={`${storefrontUrl}/apps/forum`}>{`${storefrontUrl}/apps/forum`}</s-link>
          </s-paragraph>
        </s-stack>
      </s-section>
    </s-page>
  )
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <s-stack direction="block" gap="none">
      <s-heading>{value}</s-heading>
      <s-text tone="neutral">{label}</s-text>
    </s-stack>
  )
}
