// --- gdpr / compliance webhooks ---------------------------------------------
// app review fires real payloads at this endpoint and expects 200 within 5s,
// so anything slow belongs in a queue, not here

import type { ActionFunctionArgs } from "react-router"

import prisma from "../db.server"
import { anonymiseMember, emptyDataExport, shopperHash } from "../lib/privacy.server"
import { authenticate } from "../shopify.server"

interface CustomerPayload {
  shop_domain: string
  customer?: { id: number | string }
}

export async function action({ request }: ActionFunctionArgs) {
  const { topic, shop, payload } = await authenticate.webhook(request)
  console.log(`[compliance] ${topic} ${shop}`)

  switch (topic) {
    case "CUSTOMERS_DATA_REQUEST": {
      const body = payload as CustomerPayload
      if (!body.customer) break

      const hash = shopperHash(shop, body.customer.id)
      const member = await prisma.member.findFirst({
        where:   { shopperHash: hash, shop: { domain: shop } },
        include: { posts: true, comments: true },
      })

      // TODO: hand this to the merchant by email or download. shopify
      // discards the webhook response body.
      const exported = member
        ? {
            shop,
            member: { displayName: member.displayName, joinedAt: member.createdAt.toISOString() },
            posts: member.posts.map((p) => ({
              title: p.title,
              body: p.body,
              publishedAt: p.publishedAt.toISOString(),
            })),
            comments: member.comments.map((c) => ({
              body: c.body,
              createdAt: c.createdAt.toISOString(),
            })),
            note: "This app stores no IP addresses and no passwords.",
          }
        : emptyDataExport(shop)

      console.log(`[compliance] data request prepared: ${exported.posts.length} posts`)
      break
    }

    case "CUSTOMERS_REDACT": {
      const body = payload as CustomerPayload
      if (!body.customer) break

      const hash = shopperHash(shop, body.customer.id)
      const member = await prisma.member.findFirst({
        where: { shopperHash: hash, shop: { domain: shop } },
      })
      if (!member) break

      // threads stay readable, the author becomes unidentifiable. deleting
      // the posts would gut conversations other shoppers are mid-way through.
      await prisma.member.update({
        where: { id: member.id },
        data:  anonymiseMember(member.id),
      })
      break
    }

    case "SHOP_REDACT": {
      // fires 48h after uninstall. the cascade on Shop takes members, posts,
      // comments and jobs with it.
      await prisma.shop.deleteMany({ where: { domain: shop } })
      await prisma.session.deleteMany({ where: { shop } })
      break
    }

    default:
      // unknown topic = deploy skew, not a client error
      console.warn(`[compliance] unhandled topic ${topic}`)
  }

  return new Response()
}
