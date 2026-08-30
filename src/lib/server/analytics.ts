import { prisma } from '@/lib/db'
import { ORDER_OPEN_STATUSES } from '@/lib/domain/enums'

/**
 * Kennzahlen für das Verwaltungs-Dashboard.
 *
 * Grundsatz: Es werden nur Zahlen gezeigt, die eine Entscheidung stützen.
 * Umsätze zählen ausschließlich nicht stornierte Bestellungen und sind um
 * bereits erstattete Beträge bereinigt — sonst zeigt das Dashboard Geld an,
 * das den Betrieb nie erreicht hat.
 */

export interface RevenuePoint {
  /** ISO-Datum (YYYY-MM-DD) */
  date: string
  label: string
  revenueCents: number
  orderCount: number
}

export interface PeriodComparison {
  currentCents: number
  previousCents: number
  currentOrders: number
  previousOrders: number
  /** Veränderung in Prozent; null, wenn die Vorperiode leer war. */
  changePercent: number | null
}

export interface DashboardData {
  today: PeriodComparison
  last7Days: PeriodComparison
  last30Days: PeriodComparison
  chart: RevenuePoint[]
  openOrders: number
  unpaidOrders: number
  newSupportRequests: number
  newProjects: number
  newCustomers30d: number
  lowStock: Array<{
    id: string
    slug: string
    name: string
    stock: number
    lowStockThreshold: number
    sku: string
  }>
  recentOrders: Array<{
    id: string
    orderNumber: string
    createdAt: Date
    firstName: string
    lastName: string
    company: string | null
    totalCents: number
    status: string
    paymentStatus: string
    itemCount: number
  }>
  bestsellers: Array<{
    productId: string
    name: string
    slug: string | null
    quantity: number
    revenueCents: number
  }>
}

function startOfDay(date: Date): Date {
  const copy = new Date(date)
  copy.setHours(0, 0, 0, 0)
  return copy
}

function addDays(date: Date, days: number): Date {
  return new Date(date.getTime() + days * 24 * 60 * 60 * 1000)
}

/** Umsatz und Bestellanzahl in einem Zeitraum. Stornos bleiben außen vor. */
async function revenueBetween(from: Date, to: Date): Promise<{ cents: number; orders: number }> {
  const result = await prisma.order.aggregate({
    where: {
      createdAt: { gte: from, lt: to },
      status: { not: 'cancelled' },
    },
    _sum: { totalCents: true, refundedCents: true },
    _count: { _all: true },
  })
  const gross = result._sum.totalCents ?? 0
  const refunded = result._sum.refundedCents ?? 0
  return { cents: Math.max(0, gross - refunded), orders: result._count._all }
}

function compare(
  current: { cents: number; orders: number },
  previous: { cents: number; orders: number },
): PeriodComparison {
  const changePercent =
    previous.cents > 0 ? ((current.cents - previous.cents) / previous.cents) * 100 : null
  return {
    currentCents: current.cents,
    previousCents: previous.cents,
    currentOrders: current.orders,
    previousOrders: previous.orders,
    changePercent,
  }
}

/** Lädt alle Dashboard-Kennzahlen. */
export async function getDashboardData(now: Date = new Date()): Promise<DashboardData> {
  const todayStart = startOfDay(now)
  const tomorrowStart = addDays(todayStart, 1)

  const [
    todayCurrent,
    todayPrevious,
    week,
    weekPrevious,
    month,
    monthPrevious,
    chart,
    openOrders,
    unpaidOrders,
    newSupportRequests,
    newProjects,
    newCustomers30d,
    lowStock,
    recentOrders,
    bestsellerRows,
  ] = await Promise.all([
    revenueBetween(todayStart, tomorrowStart),
    revenueBetween(addDays(todayStart, -1), todayStart),
    revenueBetween(addDays(todayStart, -6), tomorrowStart),
    revenueBetween(addDays(todayStart, -13), addDays(todayStart, -6)),
    revenueBetween(addDays(todayStart, -29), tomorrowStart),
    revenueBetween(addDays(todayStart, -59), addDays(todayStart, -29)),
    buildChart(todayStart),
    prisma.order.count({ where: { status: { in: [...ORDER_OPEN_STATUSES] } } }),
    prisma.order.count({ where: { paymentStatus: 'pending', status: { not: 'cancelled' } } }),
    prisma.supportRequest.count({ where: { status: 'new' } }),
    prisma.customProject.count({ where: { status: 'new' } }),
    prisma.customer.count({ where: { createdAt: { gte: addDays(todayStart, -29) } } }),
    prisma.$queryRaw<
      Array<{ id: string; slug: string; name: string; stock: number; lowStockThreshold: number; sku: string }>
    >`
      SELECT id, slug, name, stock, lowStockThreshold, sku
      FROM Product
      WHERE active = 1 AND allowBackorder = 0 AND stock <= lowStockThreshold
      ORDER BY stock ASC, name ASC
      LIMIT 12
    `,
    prisma.order.findMany({
      orderBy: { createdAt: 'desc' },
      take: 8,
      select: {
        id: true,
        orderNumber: true,
        createdAt: true,
        firstName: true,
        lastName: true,
        company: true,
        totalCents: true,
        status: true,
        paymentStatus: true,
        _count: { select: { items: true } },
      },
    }),
    prisma.orderItem.groupBy({
      by: ['productId', 'name'],
      where: {
        productId: { not: null },
        order: { createdAt: { gte: addDays(todayStart, -29) }, status: { not: 'cancelled' } },
      },
      _sum: { quantity: true, lineTotalCents: true },
      orderBy: { _sum: { quantity: 'desc' } },
      take: 6,
    }),
  ])

  // Slugs für die Bestseller nachladen, damit die Liste verlinkbar ist.
  const bestsellerIds = bestsellerRows
    .map((row) => row.productId)
    .filter((id): id is string => id !== null)
  const slugRows =
    bestsellerIds.length > 0
      ? await prisma.product.findMany({
          where: { id: { in: bestsellerIds } },
          select: { id: true, slug: true },
        })
      : []
  const slugById = new Map(slugRows.map((row) => [row.id, row.slug]))

  return {
    today: compare(todayCurrent, todayPrevious),
    last7Days: compare(week, weekPrevious),
    last30Days: compare(month, monthPrevious),
    chart,
    openOrders,
    unpaidOrders,
    newSupportRequests,
    newProjects,
    newCustomers30d,
    lowStock,
    recentOrders: recentOrders.map((order) => ({
      id: order.id,
      orderNumber: order.orderNumber,
      createdAt: order.createdAt,
      firstName: order.firstName,
      lastName: order.lastName,
      company: order.company,
      totalCents: order.totalCents,
      status: order.status,
      paymentStatus: order.paymentStatus,
      itemCount: order._count.items,
    })),
    bestsellers: bestsellerRows.map((row) => ({
      productId: row.productId ?? '',
      name: row.name,
      slug: row.productId ? (slugById.get(row.productId) ?? null) : null,
      quantity: row._sum.quantity ?? 0,
      revenueCents: row._sum.lineTotalCents ?? 0,
    })),
  }
}

/** Tagesumsätze der letzten 30 Tage für das Diagramm. */
async function buildChart(todayStart: Date): Promise<RevenuePoint[]> {
  const from = addDays(todayStart, -29)
  const orders = await prisma.order.findMany({
    where: { createdAt: { gte: from }, status: { not: 'cancelled' } },
    select: { createdAt: true, totalCents: true, refundedCents: true },
  })

  const buckets = new Map<string, { revenueCents: number; orderCount: number }>()
  for (let i = 0; i < 30; i += 1) {
    const day = addDays(from, i)
    buckets.set(isoDate(day), { revenueCents: 0, orderCount: 0 })
  }

  for (const order of orders) {
    const key = isoDate(order.createdAt)
    const bucket = buckets.get(key)
    if (!bucket) continue
    bucket.revenueCents += Math.max(0, order.totalCents - order.refundedCents)
    bucket.orderCount += 1
  }

  const formatter = new Intl.DateTimeFormat('de-DE', { day: '2-digit', month: '2-digit' })
  return [...buckets.entries()].map(([date, value]) => ({
    date,
    label: formatter.format(new Date(`${date}T12:00:00`)),
    revenueCents: value.revenueCents,
    orderCount: value.orderCount,
  }))
}

function isoDate(date: Date): string {
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}
