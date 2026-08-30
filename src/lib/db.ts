import { PrismaClient } from '@prisma/client'

/**
 * Prisma-Singleton. Im Dev-Modus wird die Instanz am globalThis gecached,
 * damit Hot Reloads nicht bei jedem Rebuild neue Verbindungen oeffnen.
 */
const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient }

export const prisma =
  globalForPrisma.prisma ??
  new PrismaClient({
    log: process.env.NODE_ENV === 'development' ? ['warn', 'error'] : ['error'],
  })

if (process.env.NODE_ENV !== 'production') {
  globalForPrisma.prisma = prisma
}

export type { Prisma } from '@prisma/client'
