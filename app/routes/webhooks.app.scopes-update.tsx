import type { ActionFunctionArgs } from "react-router"

import prisma from "../db.server"
import { authenticate } from "../shopify.server"

export async function action({ request }: ActionFunctionArgs) {
  const { payload, session, topic, shop } = await authenticate.webhook(request)
  console.log(`[webhook] ${topic} ${shop}`)

  const current = payload as { current: string[] }

  // authenticate.admin compares against the stored scope to decide whether a
  // re-auth is needed. let it drift and the app either re-prompts forever or
  // calls apis it no longer has access to.
  if (session) {
    await prisma.session.update({
      where: { id: session.id },
      data:  { scope: current.current.toString() },
    })
  }

  return new Response()
}
