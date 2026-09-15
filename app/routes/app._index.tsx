import { useLoaderData } from "react-router"
import type { LoaderFunctionArgs } from "react-router"

import prisma from "../db.server"
import { authenticate } from "../shopify.server"

export async function loader({ request }: LoaderFunctionArgs) {
  const { session, admin } = await authenticate.admin(request)

  // one round trip. admin api calls cost points against a leaky bucket, so
  // batch fields rather than firing several queries.
  const response = await admin.graphql(`#graphql
    query ShopOverview {
      shop {
        name
        ianaTimezone
        primaryDomain { url }
      }
    }
  `)

  // never assume the query succeeded. a throttle, a missing scope or a field
  // that moved between api versions all come back as a 200 with errors and a
  // null data — and `data.shop.name` on that is a TypeError, which renders as
  // a blank "Application Error" inside the admin iframe with nothing to go on.
  const body = (await response.json()) as {
    data?: {
      shop?: { name: string; ianaTimezone: string; primaryDomain?: { url: string } }
    }
    errors?: unknown
  }

  if (!body.data?.shop) {
    console.error("[app] ShopOverview query failed:", JSON.stringify(body.errors ?? body))
  }

  const shopData = body.data?.shop

  const shop = await prisma.shop.findUnique({
    where: { domain: session.shop },
    include: { _count: { select: { posts: true, members: true, comments: true } } },
  })

  return {
    shopName: shopData?.name ?? session.shop,
    // from shopify, never hard-coded. falls back to UTC rather than to a
    // guess, since a wrong timezone is worse than an obviously neutral one.
    timezone: shopData?.ianaTimezone ?? "UTC",
    storefrontUrl: shopData?.primaryDomain?.url ?? `https://${session.shop}`,
    counts: shop?._count ?? { posts: 0, members: 0, comments: 0 },
  }
}

export default function Index() {
  const { shopName, timezone, storefrontUrl, counts } = useLoaderData<typeof loader>()

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
            <s-badge tone="info">{timezone}</s-badge>
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
