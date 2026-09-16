import { defineConfig } from "vitest/config"
import tsconfigPaths from "vite-tsconfig-paths"

// no react router plugin here on purpose, these are unit tests over plain
// modules and the framework plugin would pull the whole route graph in
export default defineConfig({
  plugins: [tsconfigPaths()],
  test: {
    environment: "node",
    include: ["tests/**/*.test.ts", "tests/**/*.test.tsx"],
    globals: false,
  },
  esbuild: { jsx: "automatic" },
})
