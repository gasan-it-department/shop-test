import { PassThrough } from "node:stream"

import { createReadableStreamFromReadable } from "@react-router/node"
import { isbot } from "isbot"
import { renderToPipeableStream } from "react-dom/server"
import { ServerRouter, type EntryContext } from "react-router"

import shopify from "./shopify.server"

export const streamTimeout = 5000

export default function handleRequest(
  request: Request,
  responseStatusCode: number,
  responseHeaders: Headers,
  routerContext: EntryContext,
): Promise<Response> {
  // sets CSP frame-ancestors for the calling shop, the admin iframe won't
  // render without it
  shopify.addDocumentResponseHeaders(request, responseHeaders)

  const userAgent = request.headers.get("user-agent")
  const isBotRequest = isbot(userAgent ?? "")

  return new Promise<Response>((resolve, reject) => {
    let shellRendered = false

    const { pipe, abort } = renderToPipeableStream(
      <ServerRouter context={routerContext} url={request.url} />,
      {
        // crawlers get the whole document, everyone else streams
        [isBotRequest ? "onAllReady" : "onShellReady"]() {
          shellRendered = true
          const body = new PassThrough()
          const stream = createReadableStreamFromReadable(body)

          responseHeaders.set("Content-Type", "text/html")
          resolve(
            new Response(stream, {
              headers: responseHeaders,
              status: responseStatusCode,
            }),
          )
          pipe(body)
        },
        onShellError(error: unknown) {
          reject(error)
        },
        onError(error: unknown) {
          responseStatusCode = 500
          // too late to change the status once the shell flushed
          if (shellRendered) console.error(error)
        },
      },
    )

    setTimeout(abort, streamTimeout + 1000)
  })
}
