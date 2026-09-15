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

  const { data } = (await response.json()) as {
    data: { shop: { name: string; ianaTimezone: string; primaryDomain: { url: string } } }
  }

  const shop = await prisma.shop.findUnique({
    where: { domain: session.shop },
    include: { _count: { select: { posts: true, members: true, comments: true } } },
  })

  return {
    shopName: data.shop.name,
    // from shopify, never hard-coded
    timezone: data.shop.ianaTimezone,
    storefrontUrl: data.shop.primaryDomain.url,
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
