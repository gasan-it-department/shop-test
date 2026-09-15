import type { Config } from "@react-router/dev/config"

export default {
  // embedded apps need html back on first paint and the session token bounce
  // happens server-side
  ssr: true,
} satisfies Config
