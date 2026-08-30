import { SITE, absoluteUrl } from '@/lib/seo/site'
import type { Crumb } from '@/components/ui/breadcrumbs'

/**
 * Strukturierte Daten (schema.org, JSON-LD).
 *
 * Grundsatz: Es wird ausschliesslich ausgezeichnet, was auf der Seite auch
 * sichtbar steht. Alle Bausteine bekommen deshalb genau die Werte uebergeben,
 * die die Seite selbst rendert — keine getrennte Datenquelle.
 */

export type JsonLd = Record<string, unknown>

export function organizationJsonLd(): JsonLd {
  return {
    '@context': 'https://schema.org',
    '@type': 'Organization',
    '@id': `${SITE.url}/#organization`,
    name: SITE.name,
    url: SITE.url,
    description: SITE.description,
    email: SITE.contact.email,
    logo: {
      '@type': 'ImageObject',
      url: absoluteUrl('/logo.svg'),
    },
  }
}

export function websiteJsonLd(): JsonLd {
  return {
    '@context': 'https://schema.org',
    '@type': 'WebSite',
    '@id': `${SITE.url}/#website`,
    url: SITE.url,
    name: SITE.name,
    description: SITE.description,
    inLanguage: SITE.language,
    publisher: { '@id': `${SITE.url}/#organization` },
    potentialAction: {
      '@type': 'SearchAction',
      target: {
        '@type': 'EntryPoint',
        urlTemplate: `${SITE.url}/suche?q={search_term_string}`,
      },
      'query-input': 'required name=search_term_string',
    },
  }
}

export function breadcrumbJsonLd(items: Crumb[]): JsonLd {
  return {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: items.map((item, index) => ({
      '@type': 'ListItem',
      position: index + 1,
      name: item.label,
      ...(item.href ? { item: absoluteUrl(item.href) } : {}),
    })),
  }
}

export interface ProductJsonLdInput {
  name: string
  description: string
  sku: string
  articleNumber: string
  slug: string
  imageUrls: string[]
  priceCents: number
  /** Verfuegbarkeit exakt so, wie sie auf der Seite steht. */
  inStock: boolean
  material: string | null
  categoryName: string
  weightGrams: number | null
  /** Aktionsende, falls ein Aktionspreis ausgezeichnet wird. */
  priceValidUntil?: Date | null
}

export function productJsonLd(input: ProductJsonLdInput): JsonLd {
  return {
    '@context': 'https://schema.org',
    '@type': 'Product',
    name: input.name,
    description: input.description,
    sku: input.sku,
    mpn: input.articleNumber,
    category: input.categoryName,
    ...(input.material ? { material: input.material } : {}),
    ...(input.weightGrams
      ? { weight: { '@type': 'QuantitativeValue', value: input.weightGrams, unitCode: 'GRM' } }
      : {}),
    image: input.imageUrls.map((url) => (url.startsWith('http') ? url : absoluteUrl(url))),
    brand: { '@type': 'Brand', name: SITE.name },
    offers: {
      '@type': 'Offer',
      url: absoluteUrl(`/produkt/${input.slug}`),
      priceCurrency: SITE.currency,
      price: (input.priceCents / 100).toFixed(2),
      availability: input.inStock
        ? 'https://schema.org/InStock'
        : 'https://schema.org/OutOfStock',
      itemCondition: 'https://schema.org/NewCondition',
      seller: { '@id': `${SITE.url}/#organization` },
      ...(input.priceValidUntil
        ? { priceValidUntil: input.priceValidUntil.toISOString().slice(0, 10) }
        : {}),
    },
  }
}

export interface RecipeJsonLdInput {
  name: string
  description: string
  slug: string
  imageUrl: string | null
  prepMinutes: number
  smokeMinutes: number
  servings: number
  ingredients: string[]
  steps: Array<{ title: string; body: string }>
  ratingValue: number | null
  ratingCount: number
  datePublished: Date
}

export function recipeJsonLd(input: RecipeJsonLdInput): JsonLd {
  return {
    '@context': 'https://schema.org',
    '@type': 'Recipe',
    name: input.name,
    description: input.description,
    url: absoluteUrl(`/rezepte/${input.slug}`),
    ...(input.imageUrl ? { image: [absoluteUrl(input.imageUrl)] } : {}),
    author: { '@type': 'Organization', name: SITE.name },
    datePublished: input.datePublished.toISOString().slice(0, 10),
    prepTime: `PT${input.prepMinutes}M`,
    cookTime: `PT${input.smokeMinutes}M`,
    totalTime: `PT${input.prepMinutes + input.smokeMinutes}M`,
    recipeYield: `${input.servings} Portionen`,
    recipeCategory: 'Räuchern',
    recipeIngredient: input.ingredients,
    recipeInstructions: input.steps.map((step, index) => ({
      '@type': 'HowToStep',
      position: index + 1,
      name: step.title,
      text: step.body,
    })),
    // Bewertungen nur auszeichnen, wenn tatsaechlich welche vorliegen.
    ...(input.ratingValue !== null && input.ratingCount > 0
      ? {
          aggregateRating: {
            '@type': 'AggregateRating',
            ratingValue: input.ratingValue.toFixed(1),
            reviewCount: input.ratingCount,
            bestRating: 5,
            worstRating: 1,
          },
        }
      : {}),
  }
}

export function faqJsonLd(items: Array<{ question: string; answer: string }>): JsonLd | null {
  if (items.length === 0) return null
  return {
    '@context': 'https://schema.org',
    '@type': 'FAQPage',
    mainEntity: items.map((item) => ({
      '@type': 'Question',
      name: item.question,
      acceptedAnswer: { '@type': 'Answer', text: item.answer },
    })),
  }
}

export function articleJsonLd(input: {
  title: string
  description: string
  slug: string
  datePublished: Date
  dateModified?: Date
}): JsonLd {
  return {
    '@context': 'https://schema.org',
    '@type': 'Article',
    headline: input.title,
    description: input.description,
    url: absoluteUrl(`/wissen/${input.slug}`),
    inLanguage: SITE.language,
    datePublished: input.datePublished.toISOString(),
    dateModified: (input.dateModified ?? input.datePublished).toISOString(),
    author: { '@type': 'Organization', name: SITE.name },
    publisher: { '@id': `${SITE.url}/#organization` },
  }
}

export function itemListJsonLd(items: Array<{ name: string; url: string }>): JsonLd {
  return {
    '@context': 'https://schema.org',
    '@type': 'ItemList',
    itemListElement: items.map((item, index) => ({
      '@type': 'ListItem',
      position: index + 1,
      name: item.name,
      url: absoluteUrl(item.url),
    })),
  }
}
