import type { ActionFunctionArgs } from "react-router"

import prisma from "../db.server"
import { authenticate } from "../shopify.server"

export async function action({ request }: ActionFunctionArgs) {
  // verifies the hmac. skip this and anyone who knows the url can forge an
  // uninstall.
  const { shop, session, topic } = await authenticate.webhook(request)
  console.log(`[webhook] ${topic} ${shop}`)

  // shopify retries on any non-2xx, so this has to be idempotent
  if (session) {
    await prisma.session.deleteMany({ where: { shop } })
  }

  await prisma.shop.updateMany({
    where: { domain: shop },
    data:  { installed: false },
  })

  return new Response()
}
