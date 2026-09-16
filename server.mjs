// Production server.
//
// Replaces `react-router-serve` for one reason: it never calls
// `app.set("trust proxy")`.
//
// Railway (like Fly, Render, and every other PaaS) terminates TLS at its edge
// and forwards plain http to the container. Without trust proxy, express
// reports `req.protocol === "http"`, and @react-router/express builds
// `request.url` from it. React Router 7.18's action CSRF check then compares
// that url's origin against the browser's `Origin` header:
//
//   Origin header : https://app.up.railway.app
//   request.url   : http://app.up.railway.app     <- same host, wrong scheme
//
// They don't match, so every form POST is rejected with a bare
// `400 Bad Request` from singleFetchAction, while every GET keeps working.
//
// Trusting the proxy makes req.protocol honour X-Forwarded-Proto, the origins
// match, and actions work.

import { createRequestHandler } from "@react-router/express"
import compression from "compression"
import express from "express"
import morgan from "morgan"

const build = await import("./build/server/index.js")

const app = express()

// the whole point of this file
app.set("trust proxy", true)
app.disable("x-powered-by")

app.use(compression())

// hashed filenames, safe to cache forever
app.use(
  "/assets",
  express.static("build/client/assets", { immutable: true, maxAge: "1y" }),
)
app.use(express.static("build/client", { maxAge: "1h" }))

app.use(morgan("tiny"))

app.all("*", createRequestHandler({ build, mode: process.env.NODE_ENV }))

const port = Number(process.env.PORT || 3000)
app.listen(port, "0.0.0.0", () => {
  console.log(`[server] listening on 0.0.0.0:${port} (trust proxy on)`)
})
