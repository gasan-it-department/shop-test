import { reactRouter } from "@react-router/dev/vite"
import { defineConfig } from "vite"
import tsconfigPaths from "vite-tsconfig-paths"

// the cli tunnels a public https host to this dev server. without the hmr
// block below the browser tries to open a ws to localhost from inside the
// admin iframe and hot reload dies.
//
// this only matters to the dev server, so a missing or malformed
// SHOPIFY_APP_URL falls back instead of throwing — an unparseable value used
// to kill `react-router build` with a bare "Invalid URL" and no mention of
// which variable was at fault.
function appHost(): string {
  const raw = process.env.SHOPIFY_APP_URL
  if (!raw) return "localhost"
  try {
    return new URL(raw).hostname
  } catch {
    console.warn(`[vite] SHOPIFY_APP_URL is not a url (${raw}), using localhost`)
    return "localhost"
  }
}

const host = appHost()

const hmrConfig =
  host === "localhost"
    ? { protocol: "ws", host: "localhost", port: 64999, clientPort: 64999 }
    : { protocol: "wss", host, port: 443, clientPort: 443 }

export default defineConfig({
  server: {
    allowedHosts: [host],
    port: Number(process.env.PORT || 3000),
    hmr: hmrConfig,
    fs: {
      allow: ["app", "node_modules"],
    },
  },
  plugins: [reactRouter(), tsconfigPaths()],
  build: {
    assetsInlineLimit: 0,
  },
  optimizeDeps: {
    include: ["@shopify/app-bridge-react"],
  },
})
