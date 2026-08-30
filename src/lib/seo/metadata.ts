import type { Metadata } from 'next'
import { SITE, absoluteUrl } from '@/lib/seo/site'
import { truncate } from '@/lib/utils/text'

/**
 * Erzeugt vollstaendige Metadaten fuer eine Seite: Title, Description,
 * Canonical, Open Graph und Twitter Card aus einer einzigen Quelle.
 */
export interface PageMetaInput {
  title: string
  description: string
  path: string
  /** Bildpfad relativ zur Domain; faellt auf das Standard-OG-Bild zurueck. */
  image?: string | null
  imageAlt?: string
  /** 'website' fuer Uebersichten, 'article' fuer Rezepte und Wissen. */
  type?: 'website' | 'article'
  /** Seite von der Indexierung ausnehmen (Warenkorb, Checkout, Admin). */
  noIndex?: boolean
  publishedTime?: string
  modifiedTime?: string
}

export function buildMetadata(input: PageMetaInput): Metadata {
  const canonical = absoluteUrl(input.path)
  const description = truncate(input.description.replace(/\s+/g, ' ').trim(), 158)
  const image = input.image ?? '/og/standard.svg'

  return {
    title: input.title,
    description,
    alternates: { canonical },
    robots: input.noIndex
      ? { index: false, follow: false, nocache: true }
      : { index: true, follow: true, 'max-image-preview': 'large', 'max-snippet': -1 },
    openGraph: {
      type: input.type ?? 'website',
      siteName: SITE.name,
      locale: SITE.locale,
      title: input.title,
      description,
      url: canonical,
      images: [{ url: absoluteUrl(image), width: 1200, height: 630, alt: input.imageAlt ?? input.title }],
      ...(input.publishedTime ? { publishedTime: input.publishedTime } : {}),
      ...(input.modifiedTime ? { modifiedTime: input.modifiedTime } : {}),
    },
    twitter: {
      card: 'summary_large_image',
      title: input.title,
      description,
      images: [absoluteUrl(image)],
    },
  }
}

/** Titelvorlage: "Seitentitel | Räucherhaken24". */
export function pageTitle(title: string): string {
  return `${title} | ${SITE.name}`
}
