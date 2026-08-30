import { notFound } from 'next/navigation'
import type { Metadata } from 'next'
import Link from 'next/link'
import { ArrowRight, BookOpen, Clock, FolderOpen, HelpCircle } from 'lucide-react'
import { buildMetadata } from '@/lib/seo/metadata'
import { absoluteUrl } from '@/lib/seo/site'
import { articleJsonLd, breadcrumbJsonLd, faqJsonLd } from '@/lib/seo/structured-data'
import { JsonLdScript } from '@/components/seo/json-ld'
import { Breadcrumbs, type Crumb } from '@/components/ui/breadcrumbs'
import { Badge } from '@/components/ui/badge'
import { Disclosure } from '@/components/ui/disclosure'
import { ShareButtons } from '@/components/ui/share'
import { ArticleToc, type TocItem } from '@/components/content/article-toc'
import { ReadingProgress } from '@/components/content/reading-progress'
import { formatDate } from '@/lib/utils/text'
import {
  articleGroupKey,
  articleGroupTitle,
  getArticle,
  getArticleReferences,
  listArticles,
  relatedArticles,
} from '@/lib/server/articles'

/**
 * Artikelseite des Wissensbereichs.
 *
 * Die Beitraege sind Redaktionsinhalt und aendern sich selten. Sie werden
 * deshalb zur Bauzeit erzeugt (generateStaticParams) und danach stuendlich
 * erneuert — so wirkt eine Korrektur zeitnah, ohne dass jeder Aufruf die
 * Datenbank belastet.
 */
export const revalidate = 3600

const FAQ_ID = 'haeufige-fragen'

type PageProps = { params: Promise<{ slug: string }> }

export async function generateStaticParams(): Promise<Array<{ slug: string }>> {
  const articles = await listArticles()
  return articles.map((article) => ({ slug: article.slug }))
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { slug } = await params
  const article = await getArticle(slug)

  if (!article) {
    return buildMetadata({
      title: 'Beitrag nicht gefunden',
      description: '',
      path: `/wissen/${slug}`,
      noIndex: true,
    })
  }

  return buildMetadata({
    title: article.title,
    description: article.metaDescription,
    path: `/wissen/${article.slug}`,
    type: 'article',
    modifiedTime: article.updatedAt.toISOString(),
  })
}

export default async function ArticlePage({ params }: PageProps) {
  const { slug } = await params
  const article = await getArticle(slug)
  if (!article) notFound()

  const all = await listArticles()
  const related = relatedArticles(all, article, 3)
  const references = (await getArticleReferences([article.slug])).get(article.slug)

  const groupTitle = articleGroupTitle(articleGroupKey(article.slug))
  const hasFaq = article.faq.length > 0

  const tocItems: TocItem[] = [
    ...article.sections.map((section) => ({ id: section.id, label: section.heading })),
    ...(hasFaq ? [{ id: FAQ_ID, label: 'Häufige Fragen' }] : []),
  ]

  const crumbs: Crumb[] = [
    { label: 'Start', href: '/' },
    { label: 'Wissen', href: '/wissen' },
    { label: article.title },
  ]

  const categories = references?.categories ?? []
  const recipes = references?.recipes ?? []

  return (
    <>
      <ReadingProgress targetId="artikel" />

      <div className="container-page py-6 sm:py-8">
        <Breadcrumbs items={crumbs} className="mb-6" />

        <article id="artikel">
          {/*
            Zweispaltiges Raster statt zweier verschachtelter Spalten: So steht
            das Inhaltsverzeichnis auf schmalen Bildschirmen direkt unter der
            Einleitung und auf breiten neben dem Text — ohne es doppelt in das
            Markup zu schreiben.
          */}
          <div className="grid gap-x-12 gap-y-8 lg:grid-cols-[15rem_minmax(0,var(--container-prose))] lg:justify-center">
            <header className="mx-auto w-full max-w-[var(--container-prose)] lg:col-start-2 lg:row-start-1">
              <div className="flex flex-wrap items-center gap-2">
                <Badge tone="accent">Wissen</Badge>
                <Badge tone="outline">{groupTitle}</Badge>
              </div>

              <h1 className="mt-4 font-display text-3xl leading-tight font-semibold sm:text-4xl">
                {article.title}
              </h1>
              <p className="mt-4 text-lg leading-relaxed text-ink-muted">{article.teaser}</p>

              <div className="mt-5 flex flex-wrap items-center justify-between gap-x-5 gap-y-3 border-t border-[var(--border-subtle)] pt-4">
                <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-ink-muted">
                  <span className="tabular inline-flex items-center gap-1.5">
                    <Clock className="size-3.5 shrink-0 text-ink-faint" aria-hidden="true" />
                    {article.readMinutes} Minuten Lesezeit
                  </span>
                  <span className="tabular">Stand: {formatDate(article.updatedAt)}</span>
                </div>
                <ShareButtons
                  className="no-print"
                  url={absoluteUrl(`/wissen/${article.slug}`)}
                  title={article.title}
                  text={article.teaser}
                />
              </div>
            </header>

            <div className="mx-auto w-full max-w-[var(--container-prose)] lg:col-start-1 lg:row-start-2 lg:max-w-none lg:self-start lg:sticky lg:top-24">
              <ArticleToc items={tocItems} />
            </div>

            <div className="mx-auto w-full min-w-0 max-w-[var(--container-prose)] lg:col-start-2 lg:row-start-2">
              {article.sections.map((section) => (
                <section key={section.id} className="mt-10 first:mt-0">
                  <h2
                    id={section.id}
                    className="scroll-mt-24 font-display text-2xl leading-snug font-semibold"
                  >
                    {section.heading}
                  </h2>
                  <div className="mt-3 space-y-4">
                    {section.paragraphs.map((paragraph, index) => (
                      <p key={index} className="leading-relaxed text-ink-soft">
                        {paragraph}
                      </p>
                    ))}
                  </div>
                  {section.bullets.length > 0 && (
                    <ul className="mt-4 space-y-2.5 rounded-lg bg-paper-sunken/70 px-4 py-4 sm:px-5">
                      {section.bullets.map((bullet, index) => (
                        <li key={index} className="flex gap-3 text-sm leading-relaxed text-ink-soft">
                          <span
                            aria-hidden="true"
                            className="mt-2 size-1.5 shrink-0 rounded-full bg-[var(--accent)]"
                          />
                          <span className="min-w-0">{bullet}</span>
                        </li>
                      ))}
                    </ul>
                  )}
                </section>
              ))}

              {hasFaq && (
                <section className="mt-14">
                  <h2
                    id={FAQ_ID}
                    className="scroll-mt-24 flex items-center gap-2.5 font-display text-2xl font-semibold"
                  >
                    <HelpCircle className="size-5 shrink-0 text-[var(--accent)]" aria-hidden="true" />
                    Häufige Fragen
                  </h2>
                  <div className="mt-4 rounded-xl border border-[var(--border-subtle)] bg-[var(--surface-raised)] px-4 sm:px-5">
                    {article.faq.map((entry) => (
                      <Disclosure key={entry.question} title={entry.question}>
                        <p className="leading-relaxed">{entry.answer}</p>
                      </Disclosure>
                    ))}
                  </div>
                </section>
              )}

              {(categories.length > 0 || recipes.length > 0) && (
                <section className="mt-14" aria-labelledby="weiterlesen-praxis">
                  <h2 id="weiterlesen-praxis" className="font-display text-2xl font-semibold">
                    Passend zu diesem Beitrag
                  </h2>
                  <div className="mt-5 grid gap-4 sm:grid-cols-2">
                    {categories.length > 0 && (
                      <LinkPanel
                        icon={<FolderOpen className="size-4 shrink-0" aria-hidden="true" />}
                        title="Aus dem Sortiment"
                        links={categories}
                      />
                    )}
                    {recipes.length > 0 && (
                      <LinkPanel
                        icon={<BookOpen className="size-4 shrink-0" aria-hidden="true" />}
                        title="Rezepte zum Nachmachen"
                        links={recipes}
                      />
                    )}
                  </div>
                </section>
              )}

              <section className="mt-14 rounded-xl border border-[var(--border-subtle)] bg-paper-sunken/60 px-5 py-5">
                <h2 className="font-display text-lg font-semibold">Frage offen geblieben?</h2>
                <p className="mt-2 text-sm leading-relaxed text-ink-muted">
                  Schreiben Sie uns, was in Ihrem Fall nicht passt – zum Räuchergut, zur Menge oder zum
                  Ofen. Wir antworten mit einer konkreten Empfehlung statt mit einem Textbaustein.
                </p>
                <Link
                  href="/kontakt"
                  className="mt-4 inline-flex min-h-10 items-center gap-1.5 text-sm font-medium text-[var(--accent)] underline underline-offset-4 hover:text-[var(--accent-hover)]"
                >
                  Zum Kontaktformular
                  <ArrowRight className="size-4" aria-hidden="true" />
                </Link>
              </section>

              {related.length > 0 && (
                <section className="mt-14 border-t border-[var(--border-subtle)] pt-8" aria-labelledby="verwandt">
                  <h2 id="verwandt" className="font-display text-2xl font-semibold">
                    Weitere Beiträge
                  </h2>
                  <ul className="mt-5 space-y-3">
                    {related.map((entry) => (
                      <li key={entry.slug}>
                        <Link
                          href={`/wissen/${entry.slug}`}
                          className="group flex items-start justify-between gap-4 rounded-lg border border-[var(--border-subtle)] bg-[var(--surface-raised)] px-4 py-3.5 transition-colors hover:border-[var(--border-strong)]"
                        >
                          <span className="min-w-0">
                            <span className="block font-display text-base font-semibold text-ink group-hover:text-[var(--accent)]">
                              {entry.title}
                            </span>
                            <span className="tabular mt-1 block text-xs text-ink-muted">
                              {articleGroupTitle(articleGroupKey(entry.slug))} · {entry.readMinutes} Min.
                            </span>
                          </span>
                          <ArrowRight
                            className="mt-1 size-4 shrink-0 text-ink-faint transition-transform duration-300 group-hover:translate-x-0.5 [transition-timing-function:var(--ease-out-soft)]"
                            aria-hidden="true"
                          />
                        </Link>
                      </li>
                    ))}
                  </ul>
                </section>
              )}
            </div>
          </div>
        </article>
      </div>

      <JsonLdScript
        data={[
          breadcrumbJsonLd(crumbs),
          articleJsonLd({
            title: article.title,
            description: article.metaDescription,
            slug: article.slug,
            /*
             * Der Redaktionsspeicher fuehrt nur den Zeitpunkt der letzten
             * Aenderung. Genau dieses Datum steht auch sichtbar im Kopf des
             * Beitrags — ausgezeichnet wird also nichts, was die Seite nicht
             * selbst nennt.
             */
            datePublished: article.updatedAt,
          }),
          // FAQ-Auszeichnung nur, wenn die Fragen samt Antworten sichtbar auf
          // der Seite stehen. Ohne sichtbare Entsprechung waere sie eine
          // irrefuehrende Angabe.
          ...(hasFaq ? [faqJsonLd(article.faq)].filter((entry) => entry !== null) : []),
        ]}
      />
    </>
  )
}

function LinkPanel({
  icon,
  title,
  links,
}: {
  icon: React.ReactNode
  title: string
  links: Array<{ label: string; href: string }>
}) {
  return (
    <div className="rounded-xl border border-[var(--border-subtle)] bg-[var(--surface-raised)] px-4 py-4">
      <p className="flex items-center gap-2 text-xs font-semibold tracking-wide text-ink uppercase">
        <span className="text-[var(--accent)]">{icon}</span>
        {title}
      </p>
      <ul className="mt-2.5 space-y-0.5">
        {links.map((link) => (
          <li key={link.href}>
            <Link
              href={link.href}
              className="flex min-h-10 items-center gap-2 rounded-md px-1 py-2 text-sm text-ink-soft transition-colors hover:text-[var(--accent)]"
            >
              <ArrowRight className="size-3.5 shrink-0 text-ink-faint" aria-hidden="true" />
              <span className="min-w-0">{link.label}</span>
            </Link>
          </li>
        ))}
      </ul>
    </div>
  )
}
