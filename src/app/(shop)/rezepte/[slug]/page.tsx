import { notFound } from 'next/navigation'
import type { Metadata } from 'next'
import Image from 'next/image'
import Link from 'next/link'
import { Clock, Droplets, Flame, GraduationCap, Users } from 'lucide-react'
import { prisma } from '@/lib/db'
import { buildMetadata } from '@/lib/seo/metadata'
import { breadcrumbJsonLd, recipeJsonLd } from '@/lib/seo/structured-data'
import { JsonLdScript } from '@/components/seo/json-ld'
import { absoluteUrl } from '@/lib/seo/site'
import { Badge } from '@/components/ui/badge'
import { Breadcrumbs, type Crumb } from '@/components/ui/breadcrumbs'
import { RatingStars } from '@/components/ui/rating'
import { ShareButtons } from '@/components/ui/share'
import { ProductCard } from '@/components/product/product-card'
import { RecipeRating } from '@/components/recipe/recipe-rating'
import { formatDuration, totalRecipeMinutes } from '@/components/recipe/recipe-card'
import { getProductsBySlugs } from '@/lib/server/catalog'
import { formatDate, truncate } from '@/lib/utils/text'
import {
  DIFFICULTY_LABELS,
  FLAVOR_LABELS,
  FOOD_TYPE_LABELS,
  SMOKE_METHOD_LABELS,
  WOOD_TYPE_LABELS,
} from '@/lib/domain/enums'

/**
 * Rezeptdetailseite.
 *
 * Bewusst bei jedem Aufruf frisch gerendert: Bewertungen aendern sich durch
 * Besucher, und der Durchschnitt steht sowohl sichtbar im Kopf als auch in den
 * strukturierten Daten. Eine zwischengespeicherte Seite wuerde beides
 * auseinanderlaufen lassen — genau das, was Suchmaschinen als irrefuehrende
 * Auszeichnung werten.
 */
export const dynamic = 'force-dynamic'

type PageProps = { params: Promise<{ slug: string }> }

async function loadRecipe(slug: string) {
  return prisma.recipe.findFirst({
    where: { slug, published: true },
    include: {
      ingredients: { orderBy: { sortOrder: 'asc' } },
      steps: { orderBy: { position: 'asc' } },
      products: { orderBy: { sortOrder: 'asc' } },
      ratings: {
        where: { comment: { not: null } },
        orderBy: { createdAt: 'desc' },
        take: 12,
        select: { id: true, stars: true, comment: true, authorName: true, createdAt: true },
      },
    },
  })
}

type Recipe = NonNullable<Awaited<ReturnType<typeof loadRecipe>>>

/** Zutat so, wie sie auf der Seite steht — dieselbe Zeichenkette geht in die strukturierten Daten. */
function ingredientLine(ingredient: { amount: string | null; label: string }): string {
  return ingredient.amount ? `${ingredient.amount} ${ingredient.label}` : ingredient.label
}

/** Zutaten nach Gruppe, in der Reihenfolge ihres ersten Auftretens. */
function groupIngredients(recipe: Recipe): Array<{ group: string; items: Recipe['ingredients'] }> {
  const groups: Array<{ group: string; items: Recipe['ingredients'] }> = []
  for (const ingredient of recipe.ingredients) {
    const existing = groups.find((entry) => entry.group === ingredient.group)
    if (existing) existing.items.push(ingredient)
    else groups.push({ group: ingredient.group, items: [ingredient] })
  }
  return groups
}

function ratingAverage(recipe: { ratingSum: number; ratingCount: number }): number | null {
  return recipe.ratingCount > 0 ? Math.round((recipe.ratingSum / recipe.ratingCount) * 10) / 10 : null
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { slug } = await params
  const recipe = await loadRecipe(slug)
  if (!recipe) {
    return buildMetadata({
      title: 'Rezept nicht gefunden',
      description: '',
      path: `/rezepte/${slug}`,
      noIndex: true,
    })
  }

  return buildMetadata({
    title: recipe.metaTitle ?? recipe.title,
    description: recipe.metaDescription ?? truncate(recipe.teaser.replace(/\s+/g, ' '), 155),
    path: `/rezepte/${slug}`,
    image: recipe.imageUrl,
    imageAlt: recipe.imageAlt ?? recipe.title,
    type: 'article',
    publishedTime: recipe.createdAt.toISOString(),
    modifiedTime: recipe.updatedAt.toISOString(),
  })
}

export default async function RecipeDetailPage({ params }: PageProps) {
  const { slug } = await params
  const recipe = await loadRecipe(slug)
  if (!recipe) notFound()

  const products = await getProductsBySlugs(recipe.products.map((entry) => entry.productSlug))
  const notesBySlug = new Map(recipe.products.map((entry) => [entry.productSlug, entry.note]))

  const average = ratingAverage(recipe)
  const total = totalRecipeMinutes(recipe)
  const groups = groupIngredients(recipe)

  const methodLabel = SMOKE_METHOD_LABELS[recipe.method as keyof typeof SMOKE_METHOD_LABELS] ?? recipe.method
  const foodLabel = FOOD_TYPE_LABELS[recipe.foodType as keyof typeof FOOD_TYPE_LABELS] ?? recipe.foodType
  const flavorLabel = FLAVOR_LABELS[recipe.flavor as keyof typeof FLAVOR_LABELS] ?? recipe.flavor
  const woodLabel = WOOD_TYPE_LABELS[recipe.woodType as keyof typeof WOOD_TYPE_LABELS] ?? recipe.woodType
  const difficultyLabel =
    DIFFICULTY_LABELS[recipe.difficulty as keyof typeof DIFFICULTY_LABELS] ?? recipe.difficulty

  const crumbs: Crumb[] = [
    { label: 'Start', href: '/' },
    { label: 'Rezepte', href: '/rezepte' },
    { label: recipe.title },
  ]

  // Ein Aenderungsdatum wird nur genannt, wenn es sich vom Erscheinungstag
  // unterscheidet — zweimal dasselbe Datum sagt nichts aus.
  const publishedOn = formatDate(recipe.createdAt)
  const updatedOn = formatDate(recipe.updatedAt)

  const keyFigures = [
    { label: 'Vorbereitung', value: formatDuration(recipe.prepMinutes), icon: Clock },
    {
      label: 'In der Lake',
      value: recipe.brineHours > 0 ? formatDuration(recipe.brineHours * 60) : 'Ohne Lake',
      icon: Droplets,
    },
    { label: 'Räucherdauer', value: formatDuration(recipe.smokeMinutes), icon: Flame },
    { label: 'Portionen', value: `${recipe.servings}`, icon: Users },
    { label: 'Schwierigkeit', value: difficultyLabel, icon: GraduationCap },
  ]

  return (
    <>
      <div className="container-page py-6 sm:py-8">
        <Breadcrumbs items={crumbs} className="mb-6" />

        <article>
          <header className="grid gap-8 lg:grid-cols-2 lg:gap-12">
            <div className="relative aspect-[4/3] overflow-hidden rounded-xl bg-paper-sunken">
              {recipe.imageUrl ? (
                <Image
                  src={recipe.imageUrl}
                  alt={recipe.imageAlt ?? recipe.title}
                  width={1200}
                  height={900}
                  priority
                  sizes="(max-width: 1024px) 92vw, 46vw"
                  className="size-full object-cover"
                />
              ) : (
                <span className="flex size-full items-center justify-center text-ink-faint">
                  <Flame className="size-10" aria-hidden="true" />
                </span>
              )}
            </div>

            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <Badge tone="accent">{methodLabel}</Badge>
                <Badge tone="neutral">{foodLabel}</Badge>
                <Badge tone="outline">{woodLabel}</Badge>
                <Badge tone="outline">{flavorLabel}</Badge>
              </div>

              <h1 className="mt-4 font-display text-3xl leading-tight font-semibold sm:text-4xl">
                {recipe.title}
              </h1>
              <p className="mt-3 text-lg leading-relaxed text-ink-muted">{recipe.teaser}</p>

              <div className="mt-4 flex flex-wrap items-center gap-x-4 gap-y-2 text-sm text-ink-muted">
                {average !== null ? (
                  <RatingStars value={average} count={recipe.ratingCount} size="md" showValue />
                ) : (
                  <span className="text-ink-faint">Noch nicht bewertet</span>
                )}
                <span className="tabular">Gesamtdauer {formatDuration(total)}</span>
                {recipe.authorName && <span>von {recipe.authorName}</span>}
              </div>

              <dl className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-3">
                {keyFigures.map((figure) => (
                  <div
                    key={figure.label}
                    className="rounded-lg border border-[var(--border-subtle)] bg-paper-sunken/60 px-3 py-2.5"
                  >
                    <dt className="flex items-center gap-1.5 text-2xs font-semibold tracking-wide text-ink-faint uppercase">
                      <figure.icon className="size-3.5 shrink-0" aria-hidden="true" />
                      {figure.label}
                    </dt>
                    <dd className="tabular mt-1 text-sm font-medium text-ink">{figure.value}</dd>
                  </div>
                ))}
              </dl>

              <div className="mt-6 flex flex-wrap items-center justify-between gap-3 border-t border-[var(--border-subtle)] pt-4">
                <p className="text-xs text-ink-faint">
                  Veröffentlicht am {publishedOn}
                  {updatedOn !== publishedOn && ` · aktualisiert am ${updatedOn}`}
                </p>
                <ShareButtons
                  url={absoluteUrl(`/rezepte/${recipe.slug}`)}
                  title={recipe.title}
                  text={recipe.teaser}
                />
              </div>
            </div>
          </header>

          <div className="mt-12 grid gap-10 lg:grid-cols-[minmax(0,1fr)_20rem] lg:gap-14">
            <div className="min-w-0">
              <section aria-labelledby="einleitung">
                <h2 id="einleitung" className="font-display text-2xl font-semibold">
                  Darum gelingt dieses Rezept
                </h2>
                <div className="mt-3 space-y-3 leading-relaxed whitespace-pre-line text-ink-soft">
                  {recipe.intro}
                </div>
              </section>

              <section aria-labelledby="arbeitsschritte" className="mt-12">
                <h2 id="arbeitsschritte" className="font-display text-2xl font-semibold">
                  Arbeitsschritte
                </h2>
                <ol className="mt-5 space-y-6">
                  {recipe.steps.map((step) => (
                    <li key={step.id} className="flex gap-4">
                      <span
                        aria-hidden="true"
                        className="tabular flex size-9 shrink-0 items-center justify-center rounded-full bg-[var(--accent-soft)] text-sm font-semibold text-[var(--accent-hover)]"
                      >
                        {step.position}
                      </span>
                      <div className="min-w-0 flex-1">
                        <h3 className="font-display text-base font-semibold">
                          <span className="sr-only">Schritt {step.position}: </span>
                          {step.title}
                        </h3>
                        {step.durationMinutes !== null && (
                          <p className="tabular mt-1 inline-flex items-center gap-1.5 text-xs font-medium text-ink-muted">
                            <Clock className="size-3.5 shrink-0 text-ink-faint" aria-hidden="true" />
                            {formatDuration(step.durationMinutes)}
                          </p>
                        )}
                        <p className="mt-1.5 leading-relaxed whitespace-pre-line text-ink-soft">{step.body}</p>
                      </div>
                    </li>
                  ))}
                </ol>
              </section>

              {recipe.ratings.length > 0 && (
                <section aria-labelledby="erfahrungen" className="mt-12">
                  <h2 id="erfahrungen" className="font-display text-2xl font-semibold">
                    Erfahrungen anderer
                  </h2>
                  <ul className="mt-5 space-y-5">
                    {recipe.ratings.map((rating) => (
                      <li
                        key={rating.id}
                        className="rounded-xl border border-[var(--border-subtle)] bg-[var(--surface-raised)] px-4 py-3.5"
                      >
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <RatingStars value={rating.stars} size="sm" />
                          <p className="text-xs text-ink-faint">
                            {rating.authorName ?? 'Anonym'} · {formatDate(rating.createdAt)}
                          </p>
                        </div>
                        <p className="mt-2 text-sm leading-relaxed whitespace-pre-line text-ink-soft">
                          {rating.comment}
                        </p>
                      </li>
                    ))}
                  </ul>
                </section>
              )}

              <section className="mt-12">
                <RecipeRating slug={recipe.slug} />
              </section>
            </div>

            <aside className="min-w-0 lg:sticky lg:top-24 lg:self-start">
              <h2 className="font-display text-lg font-semibold">Zutaten</h2>
              <p className="mt-1 text-sm text-ink-muted">Für {recipe.servings} Portionen</p>

              <div className="mt-4 space-y-6">
                {groups.map((group) => (
                  <div key={group.group}>
                    <h3 className="text-xs font-semibold tracking-wide text-ink uppercase">{group.group}</h3>
                    <ul className="mt-2 divide-y divide-[var(--border-subtle)]">
                      {group.items.map((ingredient) => (
                        <li key={ingredient.id} className="flex items-baseline justify-between gap-3 py-2">
                          <span className="text-sm text-ink-soft">{ingredient.label}</span>
                          {ingredient.amount && (
                            <span className="tabular shrink-0 text-sm font-medium text-ink">
                              {ingredient.amount}
                            </span>
                          )}
                        </li>
                      ))}
                    </ul>
                  </div>
                ))}
              </div>

              <p className="mt-6 rounded-lg bg-paper-sunken/70 px-3.5 py-3 text-xs leading-relaxed text-ink-muted">
                Eigene Abwandlung im Kopf? Halten Sie sie in Ihrem{' '}
                <Link href="/rezepte/eigene" className="font-medium underline underline-offset-2 hover:text-ink">
                  persönlichen Rezeptbuch
                </Link>{' '}
                fest.
              </p>
            </aside>
          </div>

          {products.length > 0 && (
            <section aria-labelledby="ausstattung" className="mt-16 border-t border-[var(--border-subtle)] pt-10">
              <h2 id="ausstattung" className="font-display text-2xl font-semibold">
                Passende Ausstattung
              </h2>
              <p className="mt-2 max-w-2xl text-sm leading-relaxed text-ink-muted">
                Diese Artikel aus unserem Sortiment sind auf dieses Rezept abgestimmt.
              </p>
              <ul className="mt-7 grid grid-cols-2 gap-x-4 gap-y-9 sm:gap-x-6 lg:grid-cols-4">
                {products.map((product) => {
                  const note = notesBySlug.get(product.slug)
                  return (
                    <li key={product.slug}>
                      <ProductCard product={product} />
                      {note && <p className="mt-2 text-xs leading-relaxed text-ink-muted">{note}</p>}
                    </li>
                  )
                })}
              </ul>
            </section>
          )}
        </article>
      </div>

      <JsonLdScript
        data={[
          breadcrumbJsonLd(crumbs),
          recipeJsonLd({
            name: recipe.title,
            description: recipe.teaser,
            slug: recipe.slug,
            imageUrl: recipe.imageUrl,
            prepMinutes: recipe.prepMinutes,
            smokeMinutes: recipe.smokeMinutes,
            servings: recipe.servings,
            ingredients: recipe.ingredients.map(ingredientLine),
            steps: recipe.steps.map((step) => ({ title: step.title, body: step.body })),
            ratingValue: average,
            ratingCount: recipe.ratingCount,
            datePublished: recipe.createdAt,
          }),
        ]}
      />
    </>
  )
}
