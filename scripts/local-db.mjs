// embedded postgres for local development, over the real wire protocol, so
// prisma connects to it exactly as it would to a server. no docker, no install.
//
//   node scripts/local-db.mjs
//   DATABASE_URL="postgresql://postgres:postgres@localhost:5432/postgres"
//
// data lives in .pglite/ and is gitignored. this is a dev convenience only —
// production is a real postgres.

import { PGlite } from "@electric-sql/pglite"
import { PGLiteSocketServer } from "@electric-sql/pglite-socket"

const PORT = Number(process.env.LOCAL_DB_PORT || 5432)

const db = await PGlite.create({ dataDir: "./.pglite" })
const server = new PGLiteSocketServer({ db, port: PORT, host: "127.0.0.1" })

await server.start()
console.log(`[local-db] postgres on 127.0.0.1:${PORT} (data in ./.pglite)`)

const shutdown = async () => {
  await server.stop()
  await db.close()
  process.exit(0)
}

process.on("SIGINT", shutdown)
process.on("SIGTERM", shutdown)
