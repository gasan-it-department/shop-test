// serves a post image out of the database.
//
// public on purpose: these are forum pictures on a public storefront, and the
// id is a cuid, so there is nothing to gate. no shopify api involved, which is
// the entire point — uploads work regardless of scopes or app review state.

import type { LoaderFunctionArgs } from "react-router"

import prisma from "../db.server"

export async function loader({ params }: LoaderFunctionArgs) {
  const image = await prisma.postImage.findUnique({
    where: { id: params.id ?? "" },
    select: { data: true, contentType: true },
  })

  if (!image?.data) return new Response("Not found", { status: 404 })

  return new Response(Buffer.from(image.data), {
    headers: {
      "content-type": image.contentType ?? "application/octet-stream",
      // the bytes for an id never change, so this can be cached hard. it is
      // the closest thing to a cdn this arrangement gets.
      "cache-control": "public, max-age=31536000, immutable",
      "content-length": String(image.data.byteLength),
      // never let a browser sniff an uploaded file into something executable
      "x-content-type-options": "nosniff",
    },
  })
}
