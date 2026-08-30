import type { Metadata } from 'next'
import Link from 'next/link'
import { MessageSquare } from 'lucide-react'
import { prisma } from '@/lib/db'
import { requirePermission } from '@/lib/server/auth'
import { formatNumber } from '@/lib/money'
import { formatDateTime, formatRelative } from '@/lib/utils/text'
import { AdminPageHeader } from '@/components/admin/page-header'
import { RatingModeration } from '@/components/admin/rating-moderation'
import { RatingStars } from '@/components/ui/rating'
import { Badge } from '@/components/ui/badge'
import { Card, CardBody } from '@/components/ui/card'
import { EmptyState } from '@/components/ui/states'

export const metadata: Metadata = { title: 'Bewertungen', robots: { index: false, follow: false } }
export const dynamic = 'force-dynamic'

const PAGE_SIZE = 30

/**
 * Sichtung eingereichter Rezeptkommentare.
 *
 * Kommentare erscheinen im Shop erst nach Freigabe. Ohne diese Seite waere die
 * Zurueckhaltung eine Sackgasse: eingereichte Texte laegen in der Datenbank
 * und wuerden nie sichtbar.
 *
 * Gezeigt werden ausschliesslich Bewertungen mit Text. Reine Sternwertungen
 * brauchen keine Entscheidung — sie zaehlen sofort.
 */

interface PageProps {
  searchParams: Promise<Record<string, string | string[] | undefined>>
}

function single(value: string | string[] | undefined): string {
  return (Array.isArray(value) ? value[0] : value)?.trim() ?? ''
}

export default async function RatingModerationPage({ searchParams }: PageProps) {
  await requirePermission('content:write')
  const sp = await searchParams

  // „offen“ ist der Arbeitsvorrat und deshalb die Voreinstellung.
  const filter = single(sp.filter) === 'freigegeben' ? 'freigegeben' : 'offen'
  const where = { comment: { not: null }, commentApproved: filter === 'freigegeben' }

  const [total, open, released, ratings] = await Promise.all([
    prisma.recipeRating.count({ where: { comment: { not: null } } }),
    prisma.recipeRating.count({ where: { comment: { not: null }, commentApproved: false } }),
    prisma.recipeRating.count({ where: { comment: { not: null }, commentApproved: true } }),
    prisma.recipeRating.findMany({
      where,
      // Aelteste zuerst: Wer am laengsten wartet, kommt zuerst dran.
      orderBy: { createdAt: filter === 'offen' ? 'asc' : 'desc' },
      take: PAGE_SIZE,
      select: {
        id: true,
        stars: true,
        comment: true,
        authorName: true,
        createdAt: true,
        recipe: { select: { slug: true, title: true } },
      },
    }),
  ])

  const tabs = [
    { key: 'offen', label: 'Zu sichten', count: open },
    { key: 'freigegeben', label: 'Freigegeben', count: released },
  ] as const

  return (
    <>
      <AdminPageHeader
        title="Bewertungen"
        description="Sterne zählen sofort. Kommentare erscheinen im Shop erst nach einer Sichtung — damit kein anonym eingereichter Text ungeprüft auf einer öffentlichen Seite steht."
        count={total}
        countLabel="Kommentare insgesamt"
      />

      <nav aria-label="Filter" className="mb-5 flex flex-wrap gap-2">
        {tabs.map((tab) => (
          <Link
            key={tab.key}
            href={tab.key === 'offen' ? '/admin/bewertungen' : `/admin/bewertungen?filter=${tab.key}`}
            aria-current={filter === tab.key ? 'page' : undefined}
            className={
              filter === tab.key
                ? 'inline-flex items-center gap-2 rounded-full bg-[var(--accent)] px-4 py-1.5 text-sm font-medium text-white'
                : 'inline-flex items-center gap-2 rounded-full border border-[var(--border-default)] px-4 py-1.5 text-sm font-medium text-ink-soft hover:border-[var(--accent)] hover:text-[var(--accent)]'
            }
          >
            {tab.label}
            <span className="tabular text-xs opacity-80">{formatNumber(tab.count)}</span>
          </Link>
        ))}
      </nav>

      {ratings.length === 0 ? (
        <EmptyState
          icon={<MessageSquare className="size-5" aria-hidden="true" />}
          headingLevel="h2"
          title={filter === 'offen' ? 'Nichts zu sichten' : 'Noch nichts freigegeben'}
          description={
            filter === 'offen'
              ? 'Sobald jemand eine Bewertung mit Kommentar abgibt, erscheint der Text hier zur Entscheidung.'
              : 'Freigegebene Kommentare stehen unter dem jeweiligen Rezept und erscheinen zusätzlich in dieser Liste.'
          }
        />
      ) : (
        <ul className="space-y-4">
          {ratings.map((rating) => (
            <li key={rating.id}>
              <Card>
                <CardBody>
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <Link
                        href={`/rezepte/${rating.recipe.slug}`}
                        className="font-display text-base font-semibold underline-offset-4 hover:underline"
                      >
                        {rating.recipe.title}
                      </Link>
                      <p className="mt-1 flex flex-wrap items-center gap-2 text-xs text-ink-muted">
                        <RatingStars value={rating.stars} size="sm" />
                        <span>{rating.authorName ?? 'Anonym'}</span>
                        <span aria-hidden="true">·</span>
                        <time dateTime={rating.createdAt.toISOString()} title={formatDateTime(rating.createdAt)}>
                          {formatRelative(rating.createdAt)}
                        </time>
                      </p>
                    </div>
                    {filter === 'freigegeben' && (
                      <Badge tone="success">Steht im Shop</Badge>
                    )}
                  </div>

                  <p className="mt-3 rounded-lg bg-paper-sunken/70 px-4 py-3 text-sm leading-relaxed whitespace-pre-line text-ink-soft">
                    {rating.comment}
                  </p>

                  <div className="mt-4">
                    <RatingModeration ratingId={rating.id} recipeTitle={rating.recipe.title} />
                  </div>
                </CardBody>
              </Card>
            </li>
          ))}
        </ul>
      )}

      {ratings.length === PAGE_SIZE && (
        <p className="mt-6 text-sm text-ink-muted">
          Es werden {formatNumber(PAGE_SIZE)} Einträge auf einmal gezeigt. Nach der Bearbeitung
          rücken die nächsten nach.
        </p>
      )}
    </>
  )
}
