// npm run app:url https://my-app.up.railway.app [-- --config local]
//
// application_url, the [auth] redirect_urls and the [app_proxy] url all have
// to agree. Editing one by hand and missing another gives you
// "redirect_uri is not whitelisted" or a 404 on the proxy, neither of which
// says which file is wrong. This rewrites all three from one value.

import { readFile, writeFile } from "node:fs/promises"
import path from "node:path"

const args = process.argv.slice(2).filter((a) => a !== "--")

let configName = null
let rawUrl = null
for (let i = 0; i < args.length; i++) {
  if (args[i] === "--config") {
    configName = args[++i]
  } else if (rawUrl === null) {
    rawUrl = args[i]
  }
}

if (!rawUrl) {
  console.error("usage: npm run app:url <https://your-domain> [-- --config local]")
  process.exit(1)
}

let url
try {
  url = new URL(rawUrl)
} catch {
  console.error(`not a url: ${rawUrl}`)
  process.exit(1)
}

// shopify only accepts https, except for localhost during development
if (url.protocol !== "https:" && url.hostname !== "localhost") {
  console.error(`shopify requires https (got ${url.protocol}//)`)
  process.exit(1)
}

const base = url.origin
const file = path.resolve(
  configName ? `shopify.app.${configName}.toml` : "shopify.app.toml",
)

const raw = await readFile(file, "utf8")
const eol = raw.includes("\r\n") ? "\r\n" : "\n"
const lines = raw.split(/\r?\n/)

const out = []
let section = ""
let skippingRedirects = false
const changed = []

for (const line of lines) {
  if (skippingRedirects) {
    // drop the old array body, the closing bracket ends it
    if (line.trim().startsWith("]")) skippingRedirects = false
    continue
  }

  const header = line.match(/^\s*\[+([^\]]+)\]+\s*$/)
  if (header) {
    section = header[1]
    out.push(line)
    continue
  }

  if (section === "" && /^\s*application_url\s*=/.test(line)) {
    out.push(`application_url = "${base}"`)
    changed.push("application_url")
    continue
  }

  if (section === "auth" && /^\s*redirect_urls\s*=\s*\[/.test(line)) {
    out.push("redirect_urls = [")
    out.push(`  "${base}/auth/callback"`)
    out.push("]")
    changed.push("redirect_urls")
    // a single-line array ends on the same line
    if (!line.includes("]")) skippingRedirects = true
    continue
  }

  if (section === "app_proxy" && /^\s*url\s*=/.test(line)) {
    out.push(`url = "${base}/proxy"`)
    changed.push("app_proxy.url")
    continue
  }

  out.push(line)
}

const missing = ["application_url", "redirect_urls", "app_proxy.url"].filter(
  (key) => !changed.includes(key),
)
if (missing.length) {
  console.error(`could not find in ${path.basename(file)}: ${missing.join(", ")}`)
  process.exit(1)
}

await writeFile(file, out.join(eol), "utf8")

console.log(`[app:url] ${path.basename(file)} -> ${base}`)
console.log(`  application_url  ${base}`)
console.log(`  redirect_urls    ${base}/auth/callback`)
console.log(`  app_proxy.url    ${base}/proxy`)
console.log(`\nset SHOPIFY_APP_URL to the same value, then: shopify app deploy`)
