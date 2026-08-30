import Link from 'next/link'
import { Mail, ShieldCheck, Truck, Wrench } from 'lucide-react'
import { CATALOG_NAV, CONTENT_NAV, LEGAL_NAV, SERVICE_NAV } from '@/lib/navigation'
import { SITE } from '@/lib/seo/site'
import { Logo } from '@/components/layout/logo'

/** Fusszeile mit Sortiment, Beratung, Service und Rechtlichem. */
export function Footer() {
  const year = new Date().getFullYear()

  return (
    <footer className="mt-20 border-t border-[var(--border-subtle)] bg-paper-sunken">
      <div className="container-page">
        {/* Leistungsversprechen — bewusst sachlich, keine Zusicherungen */}
        <ul className="grid gap-6 border-b border-[var(--border-subtle)] py-10 sm:grid-cols-2 lg:grid-cols-4">
          <Promise
            icon={<Wrench className="size-4.5" aria-hidden="true" />}
            title="Fertigung nach Maß"
            text="Sonderformen und Prototypen nach Zeichnung – vom Einzelstück bis zur Serie."
          />
          <Promise
            icon={<ShieldCheck className="size-4.5" aria-hidden="true" />}
            title="Edelstahl V2A und V4A"
            text="Werkstoff und Ausführung stehen bei jedem Artikel in den technischen Daten."
          />
          <Promise
            icon={<Truck className="size-4.5" aria-hidden="true" />}
            title="Versandkostenfrei ab 79 €"
            text="Innerhalb Deutschlands. Lieferzeiten stehen auf jeder Produktseite."
          />
          <Promise
            icon={<Mail className="size-4.5" aria-hidden="true" />}
            title="Beratung durch Praktiker"
            text="Fragen zu Haken, Lake oder Holzart? Wir antworten fachlich und konkret."
          />
        </ul>

        <div className="grid gap-10 py-12 sm:grid-cols-2 lg:grid-cols-5">
          <div className="lg:col-span-2">
            <Logo className="h-8 w-auto" />
            <p className="mt-4 max-w-xs text-sm leading-relaxed text-ink-muted">{SITE.description}</p>
            <a
              href={`mailto:${SITE.contact.email}`}
              className="mt-4 inline-flex items-center gap-2 text-sm font-medium text-ink-soft underline underline-offset-4 hover:text-[var(--accent)]"
            >
              <Mail className="size-4" aria-hidden="true" />
              {SITE.contact.email}
            </a>
          </div>

          <FooterColumn title="Sortiment" links={CATALOG_NAV.map((g) => ({ label: g.label, href: g.href }))} />
          <FooterColumn title="Beratung" links={CONTENT_NAV.map((g) => ({ label: g.label, href: g.href }))} />
          <FooterColumn title="Service" links={SERVICE_NAV} />
        </div>

        <div className="flex flex-col gap-4 border-t border-[var(--border-subtle)] py-6 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-xs text-ink-faint">
            © {year} {SITE.name}. Alle Preise inkl. gesetzlicher Umsatzsteuer, zzgl.{' '}
            <Link href="/versand" className="underline underline-offset-2 hover:text-ink-muted">
              Versandkosten
            </Link>
            .
          </p>
          <ul className="flex flex-wrap gap-x-5 gap-y-2">
            {LEGAL_NAV.map((link) => (
              <li key={link.href}>
                <Link href={link.href} className="text-xs text-ink-muted transition-colors hover:text-ink">
                  {link.label}
                </Link>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </footer>
  )
}

function Promise({ icon, title, text }: { icon: React.ReactNode; title: string; text: string }) {
  return (
    <li className="flex gap-3">
      <span className="mt-0.5 flex size-9 shrink-0 items-center justify-center rounded-full bg-[var(--surface-raised)] text-[var(--accent)] shadow-[var(--shadow-subtle)]">
        {icon}
      </span>
      <span>
        <span className="block text-sm font-semibold text-ink">{title}</span>
        <span className="mt-0.5 block text-xs leading-relaxed text-ink-muted">{text}</span>
      </span>
    </li>
  )
}

function FooterColumn({ title, links }: { title: string; links: Array<{ label: string; href: string }> }) {
  return (
    <div>
      <h2 className="font-display text-sm font-semibold text-ink">{title}</h2>
      <ul className="mt-3 space-y-2">
        {links.map((link) => (
          <li key={link.href}>
            <Link href={link.href} className="text-sm text-ink-muted transition-colors hover:text-[var(--accent)]">
              {link.label}
            </Link>
          </li>
        ))}
      </ul>
    </div>
  )
}
