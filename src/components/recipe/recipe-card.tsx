import Image from 'next/image'
import Link from 'next/link'
import { Clock, Flame, Users } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { RatingStars } from '@/components/ui/rating'
import { cn } from '@/lib/utils/cn'
import {
  DIFFICULTY_LABELS,
  FOOD_TYPE_LABELS,
  SMOKE_METHOD_LABELS,
} from '@/lib/domain/enums'

/**
 * Rezeptkarte.
 *
 * Server Component ohne eigenen Zustand — die Rezeptuebersicht kommt damit
 * ohne Client-JavaScript aus. Der Titel-Link spannt sich ueber die gesamte
 * Karte, das Bild ist bewusst kein zweiter Link auf dasselbe Ziel.
 */

export interface RecipeCardData {
  slug: string
  title: string
  teaser: string
  imageUrl: string | null
  imageAlt: string | null
  /** Werte aus SMOKE_METHODS / FOOD_TYPES / DIFFICULTIES. */
  method: string
  foodType: string
  difficulty: string
  prepMinutes: number
  brineHours: number
  smokeMinutes: number
  servings: number
  /** Durchschnitt in Sternen; null, wenn noch niemand bewertet hat. */
  ratingAverage: number | null
  ratingCount: number
}

/**
 * Gesamtdauer eines Rezeptes in Minuten.
 * Die Lake laeuft in Stunden und wiegt in der Praxis am schwersten — sie
 * gehoert deshalb in die Gesamtdauer, sonst wirkt ein Kaltrauch-Rezept
 * kuerzer als es ist.
 */
export function totalRecipeMinutes(recipe: {
  prepMinutes: number
  brineHours: number
  smokeMinutes: number
}): number {
  return recipe.prepMinutes + recipe.brineHours * 60 + recipe.smokeMinutes
}

/** Dauer in deutscher Schreibweise: "45 Min.", "3 Std. 20 Min.", "2 Tage 6 Std." */
export function formatDuration(minutes: number): string {
  if (minutes <= 0) return '—'
  if (minutes < 60) return `${minutes} Min.`

  const days = Math.floor(minutes / 1440)
  const hours = Math.floor((minutes % 1440) / 60)
  const rest = minutes % 60

  if (days > 0) {
    const dayLabel = days === 1 ? '1 Tag' : `${days} Tage`
    return hours > 0 ? `${dayLabel} ${hours} Std.` : dayLabel
  }
  return rest > 0 ? `${hours} Std. ${rest} Min.` : `${hours} Std.`
}

export function RecipeCard({
  recipe,
  priority = false,
  className,
}: {
  recipe: RecipeCardData
  /** Fuer die ersten sichtbaren Karten, damit das LCP-Bild frueh laedt. */
  priority?: boolean
  className?: string
}) {
  const total = totalRecipeMinutes(recipe)
  const methodLabel = SMOKE_METHOD_LABELS[recipe.method as keyof typeof SMOKE_METHOD_LABELS] ?? recipe.method
  const foodLabel = FOOD_TYPE_LABELS[recipe.foodType as keyof typeof FOOD_TYPE_LABELS] ?? recipe.foodType
  const difficultyLabel =
    DIFFICULTY_LABELS[recipe.difficulty as keyof typeof DIFFICULTY_LABELS] ?? recipe.difficulty

  return (
    <article className={cn('group relative flex h-full flex-col', className)}>
      <div className="relative aspect-[4/3] overflow-hidden rounded-lg bg-paper-sunken">
        {recipe.imageUrl ? (
          <Image
            src={recipe.imageUrl}
            alt={recipe.imageAlt ?? recipe.title}
            width={800}
            height={600}
            priority={priority}
            loading={priority ? undefined : 'lazy'}
            sizes="(max-width: 640px) 92vw, (max-width: 1024px) 46vw, 30vw"
            className="size-full object-cover transition-transform duration-500 [transition-timing-function:var(--ease-out-soft)] group-hover:scale-[1.035]"
          />
        ) : (
          <span className="flex size-full items-center justify-center text-ink-faint">
            <Flame className="size-8" aria-hidden="true" />
          </span>
        )}

        <div className="pointer-events-none absolute inset-x-2.5 top-2.5 flex flex-wrap gap-1.5">
          <Badge tone="accent">{methodLabel}</Badge>
          <Badge tone="neutral">{foodLabel}</Badge>
        </div>
      </div>

      <div className="mt-3.5 flex flex-1 flex-col">
        <p className="text-2xs font-medium tracking-wide text-ink-faint uppercase">{difficultyLabel}</p>
        <h3 className="mt-1 font-display text-base leading-snug font-semibold">
          <Link href={`/rezepte/${recipe.slug}`} className="after:absolute after:inset-0 after:content-['']">
            {recipe.title}
          </Link>
        </h3>
        <p className="mt-1.5 line-clamp-3 text-sm leading-relaxed text-ink-muted">{recipe.teaser}</p>

        <div className="mt-auto pt-3.5">
          <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-ink-muted">
            <span className="inline-flex items-center gap-1.5">
              <Clock className="size-3.5 shrink-0 text-ink-faint" aria-hidden="true" />
              <span className="tabular">{formatDuration(total)}</span>
              <span className="sr-only">Gesamtdauer</span>
            </span>
            <span className="inline-flex items-center gap-1.5">
              <Users className="size-3.5 shrink-0 text-ink-faint" aria-hidden="true" />
              <span className="tabular">{recipe.servings}</span>
              <span className="sr-only">Portionen</span>
            </span>
          </div>

          <div className="mt-2">
            {recipe.ratingAverage !== null && recipe.ratingCount > 0 ? (
              <RatingStars value={recipe.ratingAverage} count={recipe.ratingCount} showValue />
            ) : (
              <span className="text-xs text-ink-faint">Noch nicht bewertet</span>
            )}
          </div>
        </div>
      </div>
    </article>
  )
}
