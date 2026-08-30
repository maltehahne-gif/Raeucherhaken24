import type { MetadataRoute } from 'next'
import { prisma } from '@/lib/db'
import { absoluteUrl } from '@/lib/seo/site'
import { STATIC_ROUTES } from '@/lib/navigation'

export const revalidate = 3600

/**
 * XML-Sitemap.
 *
 * Enthält ausschließlich indexierbare Seiten: keine gefilterten Katalogansichten,
 * kein Warenkorb, keine Kasse, kein Verwaltungsbereich. Die Änderungsdaten
 * stammen aus der Datenbank, damit sie der Wirklichkeit entsprechen.
 */
export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const [products, categories, recipes, articles] = await Promise.all([
    prisma.product.findMany({
      where: { active: true, visible: true },
      select: { slug: true, updatedAt: true },
      orderBy: { updatedAt: 'desc' },
    }),
    prisma.category.findMany({
      where: { active: true },
      select: { slug: true, updatedAt: true },
    }),
    prisma.recipe.findMany({
      where: { published: true },
      select: { slug: true, updatedAt: true },
    }),
    prisma.setting.findMany({ where: { key: { startsWith: 'article:' } }, select: { key: true, updatedAt: true } }),
  ])

  const now = new Date()

  return [
    ...STATIC_ROUTES.map((route) => ({
      url: absoluteUrl(route.path),
      lastModified: now,
      changeFrequency: route.changeFrequency,
      priority: route.priority,
    })),
    ...categories.map((category) => ({
      url: absoluteUrl(`/kategorie/${category.slug}`),
      lastModified: category.updatedAt,
      changeFrequency: 'daily' as const,
      priority: 0.8,
    })),
    ...products.map((product) => ({
      url: absoluteUrl(`/produkt/${product.slug}`),
      lastModified: product.updatedAt,
      changeFrequency: 'weekly' as const,
      priority: 0.7,
    })),
    ...recipes.map((recipe) => ({
      url: absoluteUrl(`/rezepte/${recipe.slug}`),
      lastModified: recipe.updatedAt,
      changeFrequency: 'monthly' as const,
      priority: 0.6,
    })),
    ...articles.map((article) => ({
      url: absoluteUrl(`/wissen/${article.key.replace(/^article:/, '')}`),
      lastModified: article.updatedAt,
      changeFrequency: 'monthly' as const,
      priority: 0.6,
    })),
  ]
}
