import Link from 'next/link'
import Image from 'next/image'
import type { Metadata } from 'next'
import { ArrowRight, Compass, Flame, Ruler, Sparkles } from 'lucide-react'
import { prisma } from '@/lib/db'
import { buildMetadata } from '@/lib/seo/metadata'
import { SITE } from '@/lib/seo/site'
import { getBestsellers, getPromotedProducts } from '@/lib/server/catalog'
import { ProductRow } from '@/components/product/product-row'
import { SectionHeading, Section } from '@/components/ui/section'
import { ButtonLink } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { RecentlyViewedRow } from '@/components/product/recently-viewed-row'
import { CategoryIcon } from '@/components/layout/category-icon'
import { formatNumber } from '@/lib/money'
import { SMOKE_METHOD_LABELS, FOOD_TYPE_LABELS } from '@/lib/domain/enums'

export const revalidate = 300

export const metadata: Metadata = buildMetadata({
  title: SITE.tagline,
  description: SITE.description,
  path: '/',
})

export default async function HomePage() {
  const [bestsellers, promoted, categories, recipes, productCount, articleCount] = await Promise.all([
    getBestsellers(8),
    getPromotedProducts(4),
    prisma.category.findMany({
      where: { active: true, parentId: null },
      orderBy: { sortOrder: 'asc' },
      select: {
        slug: true,
        name: true,
        teaser: true,
        icon: true,
        _count: { select: { products: true } },
        children: { where: { active: true }, select: { _count: { select: { products: true } } } },
      },
    }),
    prisma.recipe.findMany({
      where: { published: true },
      orderBy: [{ ratingCount: 'desc' }, { createdAt: 'desc' }],
      take: 3,
      select: {
        slug: true,
        title: true,
        teaser: true,
        method: true,
        foodType: true,
        smokeMinutes: true,
        imageUrl: true,
        ratingSum: true,
        ratingCount: true,
      },
    }),
    prisma.product.count({ where: { active: true, visible: true } }),
    prisma.recipe.count({ where: { published: true } }),
  ])

  return (
    <>
      <Hero productCount={productCount} recipeCount={articleCount} />

      <div className="container-page">
        {/* Kategorien */}
        <Section aria-labelledby="sortiment">
          <SectionHeading
            as="h2"
            eyebrow="Sortiment"
            title="Alles für den Rauch"
            description="Vier Bereiche, aufeinander abgestimmt: das Aufhängen, das Räuchern, das Vorbereiten und das Würzen."
            action={{ label: 'Gesamtes Sortiment', href: '/kategorie' }}
          />
          <ul className="mt-9 grid gap-4 sm:grid-cols-2 lg:grid-cols-4" data-reveal="">
            {categories.map((category) => {
              const total =
                category._count.products + category.children.reduce((s, c) => s + c._count.products, 0)
              return (
                <li key={category.slug}>
                  <Link
                    href={`/kategorie/${category.slug}`}
                    className="group flex h-full flex-col rounded-xl border border-[var(--border-subtle)] bg-[var(--surface-raised)] p-5 transition-all duration-300 [transition-timing-function:var(--ease-out-soft)] hover:-translate-y-0.5 hover:border-[var(--border-default)] hover:shadow-[var(--shadow-card)]"
                  >
                    <span className="flex size-10 items-center justify-center rounded-lg bg-[var(--accent-soft)] text-[var(--accent)]">
                      <CategoryIcon name={category.icon} />
                    </span>
                    <h3 className="mt-4 font-display text-lg font-semibold">{category.name}</h3>
                    {category.teaser && (
                      <p className="mt-2 flex-1 text-sm leading-relaxed text-ink-muted">{category.teaser}</p>
                    )}
                    <span className="mt-4 flex items-center gap-1.5 text-sm font-medium text-[var(--accent)]">
                      {formatNumber(total)} Artikel
                      <ArrowRight
                        className="size-3.5 transition-transform duration-300 group-hover:translate-x-0.5"
                        aria-hidden="true"
                      />
                    </span>
                  </Link>
                </li>
              )
            })}
          </ul>
        </Section>

        {bestsellers.length > 0 && (
          <ProductRow
            eyebrow="Meistgekauft"
            title="Worauf unsere Kunden zurückkommen"
            description="Artikel, die in Fischräuchereien, Fleischereien und ambitionierten Privatküchen im Dauereinsatz sind."
            action={{ label: 'Alle Bestseller', href: '/kategorie?sort=bestseller' }}
            products={bestsellers}
            className="pb-14 sm:pb-20"
          />
        )}

        {/* Konfigurator und Beratung */}
        <Section aria-labelledby="beratung">
          <div className="grid gap-4 lg:grid-cols-2">
            <FeatureCard
              icon={<Ruler className="size-5" aria-hidden="true" />}
              eyebrow="Konfigurator"
              title="Haken nach Ihren Maßen"
              description="Modell, Länge, Werkstoff, Spitzenausführung und Bearbeitung wählen — Preis und Mengenstaffel rechnen sich live mit. Jede Variante liegt einzeln im Warenkorb."
              href="/konfigurator"
              cta="Haken konfigurieren"
            />
            <FeatureCard
              icon={<Compass className="size-5" aria-hidden="true" />}
              eyebrow="Kaufberatung"
              title="Unsicher, was Sie brauchen?"
              description="Fünf Fragen zu Räuchergut, Methode, Geschmack, Menge und Erfahrung — am Ende steht eine konkrete Empfehlung aus dem tatsächlichen Sortiment."
              href="/beratung"
              cta="Beratung starten"
              tone="steel"
            />
          </div>
        </Section>

        {promoted.length > 0 && (
          <ProductRow
            eyebrow="Aktuelle Aktionen"
            title="Zeitlich begrenzt reduziert"
            action={{ label: 'Alle Angebote', href: '/kategorie?aktion=1' }}
            products={promoted}
            className="pb-14 sm:pb-20"
          />
        )}

        {/* Rezepte */}
        {recipes.length > 0 && (
          <Section aria-labelledby="rezepte">
            <SectionHeading
              as="h2"
              eyebrow="Aus der Räucherkammer"
              title="Rezepte, die funktionieren"
              description="Erprobte Anleitungen mit Mengen, Zeiten und Temperaturen — inklusive der Artikel, die dafür gebraucht werden."
              action={{ label: 'Alle Rezepte', href: '/rezepte' }}
            />
            <ul className="mt-9 grid gap-5 sm:grid-cols-2 lg:grid-cols-3" data-reveal="">
              {recipes.map((recipe) => (
                <li key={recipe.slug}>
                  <Link
                    href={`/rezepte/${recipe.slug}`}
                    className="group flex h-full flex-col overflow-hidden rounded-xl border border-[var(--border-subtle)] bg-[var(--surface-raised)] transition-all duration-300 hover:-translate-y-0.5 hover:shadow-[var(--shadow-card)]"
                  >
                    <span className="relative block aspect-[16/10] overflow-hidden bg-paper-sunken">
                      {recipe.imageUrl && (
                        <Image
                          src={recipe.imageUrl}
                          alt=""
                          width={640}
                          height={400}
                          sizes="(max-width: 640px) 92vw, 30vw"
                          className="size-full object-cover transition-transform duration-500 group-hover:scale-[1.04]"
                        />
                      )}
                    </span>
                    <span className="flex flex-1 flex-col p-5">
                      <span className="flex flex-wrap gap-1.5">
                        <Badge tone="accent">{SMOKE_METHOD_LABELS[recipe.method as keyof typeof SMOKE_METHOD_LABELS]}</Badge>
                        <Badge tone="outline">{FOOD_TYPE_LABELS[recipe.foodType as keyof typeof FOOD_TYPE_LABELS]}</Badge>
                      </span>
                      <span className="mt-3 block font-display text-lg leading-snug font-semibold">
                        {recipe.title}
                      </span>
                      <span className="mt-2 flex-1 text-sm leading-relaxed text-ink-muted">{recipe.teaser}</span>
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          </Section>
        )}

        {/* Sonderanfertigung */}
        <Section>
          <div
            className="relative overflow-hidden rounded-2xl px-6 py-12 sm:px-12 sm:py-16"
            style={{ backgroundColor: 'var(--surface-inverted)' }}
          >
            <div
              className="animate-smoke pointer-events-none absolute inset-0 opacity-40"
              style={{
                background:
                  'radial-gradient(60% 80% at 82% 12%, rgb(200 90 41 / 0.22), transparent 64%), radial-gradient(50% 70% at 12% 88%, rgb(255 255 255 / 0.07), transparent 60%)',
              }}
              aria-hidden="true"
            />
            <div className="relative max-w-2xl">
              <p className="text-2xs font-semibold tracking-[0.14em] uppercase" style={{ color: 'var(--banner-accent)' }}>
                Sonderanfertigung
              </p>
              <h2 className="mt-3 font-display text-3xl font-semibold text-steel-50 sm:text-4xl">
                Wenn es den Haken noch nicht gibt, bauen wir ihn
              </h2>
              <p className="mt-4 text-base leading-relaxed text-steel-200">
                Vom Prototyp für einen einzelnen Betrieb bis zur wiederkehrenden Serie: Sie geben Maße,
                Werkstoff und Belastung vor, wir setzen es um. Aus Ihren Angaben entsteht automatisch ein
                strukturierter Projektentwurf, den Sie ausdrucken und intern abstimmen können.
              </p>
              <div className="mt-7 flex flex-wrap gap-3">
                <ButtonLink href="/sonderanfertigung" variant="inverted" size="lg">
                  Projekt beschreiben
                </ButtonLink>
                <ButtonLink href="/kontakt" variant="ghost" size="lg" className="text-steel-100 hover:bg-white/10 hover:text-white">
                  Erst beraten lassen
                </ButtonLink>
              </div>
            </div>
          </div>
        </Section>

        <RecentlyViewedRow />
      </div>
    </>
  )
}

function Hero({ productCount, recipeCount }: { productCount: number; recipeCount: number }) {
  return (
    <section className="relative overflow-hidden border-b border-[var(--border-subtle)]">
      <div
        className="pointer-events-none absolute inset-0"
        style={{ background: 'var(--season-hero-tint)' }}
        aria-hidden="true"
      />
      <div
        className="animate-smoke pointer-events-none absolute inset-0 opacity-70"
        style={{
          background:
            'radial-gradient(46% 58% at 74% 8%, rgb(200 90 41 / 0.09), transparent 62%), radial-gradient(38% 46% at 14% 92%, rgb(107 118 129 / 0.10), transparent 60%)',
        }}
        aria-hidden="true"
      />

      <div className="container-page relative grid items-center gap-10 py-14 sm:py-20 lg:grid-cols-[1.05fr_0.95fr] lg:py-24">
        <div className="animate-fade-up max-w-xl">
          <p className="flex items-center gap-2 text-2xs font-semibold tracking-[0.14em] text-[var(--accent)] uppercase">
            <Flame className="size-3.5" aria-hidden="true" />
            Räucherbedarf seit dem ersten Rauch
          </p>
          <h1 className="mt-4 font-display text-4xl leading-[1.08] font-semibold sm:text-5xl lg:text-6xl">
            Werkzeug, das dem
            <span className="text-[var(--accent)]"> Feuer standhält</span>
          </h1>
          <p className="mt-5 text-lg leading-relaxed text-ink-muted">
            Räucherhaken aus V2A und V4A, Räuchermehl in Räucherqualität, abgestimmte Laugen und über
            einhundert Naturgewürze. Für Fischräuchereien, Fleischereien und alle, die es genauso
            genau nehmen.
          </p>

          <div className="mt-8 flex flex-wrap gap-3">
            <ButtonLink href="/kategorie/raeucherhaken" size="lg">
              Räucherhaken ansehen
            </ButtonLink>
            <ButtonLink href="/konfigurator" variant="outline" size="lg">
              <Sparkles className="size-4.5" aria-hidden="true" />
              Haken konfigurieren
            </ButtonLink>
          </div>

          <dl className="mt-10 flex flex-wrap gap-x-10 gap-y-4 border-t border-[var(--border-subtle)] pt-6">
            <Stat value={formatNumber(productCount)} label="Artikel im Sortiment" />
            <Stat value="V2A · V4A" label="Werkstoffe je Artikel ausgewiesen" />
            <Stat value={formatNumber(recipeCount)} label="Rezepte mit Zeiten und Mengen" />
          </dl>
        </div>

        <div className="relative hidden lg:block" aria-hidden="true">
          <div className="grid grid-cols-2 gap-4">
            <Image
              src="/produkte/muster-hook-s.svg"
              alt=""
              width={520}
              height={520}
              priority
              className="aspect-square rounded-xl border border-[var(--border-subtle)] object-cover shadow-[var(--shadow-card)]"
            />
            <Image
              src="/produkte/muster-hook-four.svg"
              alt=""
              width={520}
              height={520}
              priority
              className="mt-8 aspect-square rounded-xl border border-[var(--border-subtle)] object-cover shadow-[var(--shadow-card)]"
            />
            <Image
              src="/produkte/muster-meal.svg"
              alt=""
              width={520}
              height={520}
              className="-mt-4 aspect-square rounded-xl border border-[var(--border-subtle)] object-cover shadow-[var(--shadow-card)]"
            />
            <Image
              src="/produkte/muster-spice-whole.svg"
              alt=""
              width={520}
              height={520}
              className="mt-4 aspect-square rounded-xl border border-[var(--border-subtle)] object-cover shadow-[var(--shadow-card)]"
            />
          </div>
        </div>
      </div>
    </section>
  )
}

function Stat({ value, label }: { value: string; label: string }) {
  return (
    <div>
      <dt className="sr-only">{label}</dt>
      <dd>
        <span className="tabular block font-display text-2xl font-semibold">{value}</span>
        <span className="mt-0.5 block max-w-[14rem] text-xs leading-relaxed text-ink-muted">{label}</span>
      </dd>
    </div>
  )
}

function FeatureCard({
  icon,
  eyebrow,
  title,
  description,
  href,
  cta,
  tone = 'accent',
}: {
  icon: React.ReactNode
  eyebrow: string
  title: string
  description: string
  href: string
  cta: string
  tone?: 'accent' | 'steel'
}) {
  return (
    <Link
      href={href}
      className="group flex flex-col rounded-xl border border-[var(--border-subtle)] bg-[var(--surface-raised)] p-6 transition-all duration-300 [transition-timing-function:var(--ease-out-soft)] hover:-translate-y-0.5 hover:shadow-[var(--shadow-card)] sm:p-8"
      data-reveal=""
    >
      <span
        className={
          tone === 'accent'
            ? 'flex size-11 items-center justify-center rounded-lg bg-[var(--accent-soft)] text-[var(--accent)]'
            : 'flex size-11 items-center justify-center rounded-lg bg-steel-100 text-steel-700'
        }
      >
        {icon}
      </span>
      <p className="mt-5 text-2xs font-semibold tracking-[0.14em] text-ink-faint uppercase">{eyebrow}</p>
      <h3 className="mt-1.5 font-display text-2xl font-semibold">{title}</h3>
      <p className="mt-3 flex-1 text-sm leading-relaxed text-ink-muted">{description}</p>
      <span className="mt-6 flex items-center gap-1.5 text-sm font-medium text-[var(--accent)]">
        {cta}
        <ArrowRight className="size-4 transition-transform duration-300 group-hover:translate-x-0.5" aria-hidden="true" />
      </span>
    </Link>
  )
}
