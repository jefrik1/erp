// @ts-ignore - optional, only when `npm i` + `prisma generate` done
let prisma: any = null
try {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { PrismaClient } = require("@prisma/client")
  const g = globalThis as unknown as { prisma?: any }
  prisma = g.prisma ?? new PrismaClient()
  if (process.env.NODE_ENV !== "production") g.prisma = prisma
} catch {}
export { prisma }
