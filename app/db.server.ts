import { PrismaClient } from "@prisma/client"

declare global {
  // eslint-disable-next-line no-var
  var prismaGlobal: PrismaClient | undefined
}

// vite re-evaluates modules on every change, without this each reload opens a
// new pool and sqlite starts throwing SQLITE_BUSY
const prisma = global.prismaGlobal ?? new PrismaClient()

if (process.env.NODE_ENV !== "production") {
  global.prismaGlobal = prisma
}

export default prisma
